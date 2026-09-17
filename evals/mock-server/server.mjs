#!/usr/bin/env node
// Minimal MCP stdio server that serves canned Sealmetrics responses from a
// fixture module, so skills can be exercised deterministically with no account.
//
//   SEAL_FIXTURE=ecommerce-referrer-spike node evals/mock-server/server.mjs
//
// Tool definitions come from the real schema dump, so the model sees exactly
// the tools (and parameters) the production server exposes.
import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, '..', 'mcp-schema.json'), 'utf8'));
const fixtureName = process.env.SEAL_FIXTURE || 'ecommerce-healthy';
const callLog = process.env.SEAL_CALL_LOG || '';

// Which connector to imitate. `remote` is the OAuth server in the plugin's
// .mcp.json — what nearly every user installs — and it does not announce the
// twenty tools whose backend routes need the generic `read` or `write` scope.
// `local` is `npx @sealmetrics/mcp`, which announces all sixty-two.
//
// A skill that plans a step around a tool the connector withheld is a defect
// the single-transport mock could never see, because it served everything.
// `remote` is the default because it is what .mcp.json declares and therefore
// what nearly every user has. Cases that need a tool the remote withholds
// declare `transport: 'local'`. Until 2026-09-17 the default was `local`, so
// three cases out of thirty-five exercised the connector everyone actually runs.
const transport = process.env.SEAL_TRANSPORT || 'remote';
// Generated from the MCP server source; see evals/dump-transport-tools.mjs.
const transports = JSON.parse(readFileSync(join(here, '..', 'remote-tools.json'), 'utf8'));
const withheld = transport === 'remote' ? new Set(transports.hidden_on_remote) : new Set();

const fixture = await import(pathToFileURL(join(here, '..', 'fixtures', `${fixtureName}.mjs`)).href);
const tools = fixture.tools || {};

const toolDefs = Object.entries(schema).filter(([name]) => !withheld.has(name)).map(([name, d]) => ({
  name,
  description: `[mock] ${name}`,
  inputSchema: {
    type: 'object',
    properties: Object.fromEntries(d.params.map(p => [p, d.enums?.[p] ? { type: 'string', enum: d.enums[p] } : {}])),
  },
}));

function respond(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); }
function fail(id, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message } }) + '\n'); }

let buf = '';
process.stdin.on('data', chunk => {
  buf += chunk.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    handle(msg);
  }
});

function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return respond(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'sealmetrics-mock', version: `fixture:${fixtureName}/${transport}` },
    });
  }
  if (method === 'tools/list') return respond(id, { tools: toolDefs });
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};
    if (callLog) appendFileSync(callLog, JSON.stringify({ tool: name, args }) + '\n');
    if (!schema[name] || withheld.has(name)) {
      const m = `Unknown tool: ${name}`;
      if (callLog) appendFileSync(callLog, JSON.stringify({ tool: name, args, rejected: m }) + '\n');
      return fail(id, m);
    }

    // Reject parameters the real server does not accept — this is what turns a
    // wrong call into a visible failure instead of silently wrong data.
    const bad = Object.keys(args).filter(k => !schema[name].params.includes(k));
    if (bad.length) {
      const m = `Invalid parameter(s) for ${name}: ${bad.join(', ')}. Valid: ${schema[name].params.join(', ')}`;
      if (callLog) appendFileSync(callLog, JSON.stringify({ tool: name, args, rejected: m }) + '\n');
      return fail(id, m);
    }
    for (const [k, v] of Object.entries(args)) {
      const en = schema[name].enums?.[k];
      if (en && typeof v === 'string' && !en.includes(v)) {
        const m = `Invalid value for ${name}.${k}: "${v}". Valid: ${en.join(', ')}`;
        if (callLog) appendFileSync(callLog, JSON.stringify({ tool: name, args, rejected: m }) + '\n');
        return fail(id, m);
      }
    }

    const handler = tools[name];
    if (handler === undefined) {
      return respond(id, { content: [{ type: 'text', text: JSON.stringify({ data: [], note: 'no data for this period' }) }] });
    }
    let out;
    try { out = typeof handler === 'function' ? handler(args) : handler; }
    catch (e) { return fail(id, e.message); }
    if (out && out.__error) return fail(id, out.__error);
    // The real server returns failures as ordinary text in a SUCCESSFUL
    // response, so reproduce that rather than a protocol error — a skill that
    // only handles protocol errors must fail here, not pass.
    if (out && out.__textError)
      return respond(id, { content: [{ type: 'text', text: `Error: ${out.__textError}` }] });
    // Log what was SERVED, not only what was asked. Without the response body
    // there is no way to check the plugin's first rule — that every number in
    // an answer came from a tool result — and it had no test at all.
    if (callLog) appendFileSync(callLog, JSON.stringify({ tool: name, args, response: out }) + '\n');
    return respond(id, { content: [{ type: 'text', text: JSON.stringify(out) }] });
  }
  if (method && method.startsWith('notifications/')) return;
  if (id !== undefined) respond(id, {});
}
