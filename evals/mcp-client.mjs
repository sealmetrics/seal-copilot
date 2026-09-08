// Minimal MCP stdio client, shared by the schema-drift and fixture-capture
// scripts. Speaks just enough of the protocol to list and call tools.
import { spawn } from 'node:child_process';

export function connect(command, args, env = {}) {
  const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  let buf = '';
  const pending = new Map();
  let nextId = 1;
  let stderr = '';

  proc.stderr.on('data', d => { stderr += d.toString(); });
  proc.stdout.on('data', d => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
    }
  });

  const send = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (pending.delete(id)) reject(new Error(`timeout on ${method}`)); }, 60000);
  });

  return {
    async init() {
      const r = await send('initialize', { protocolVersion: '2024-11-05', capabilities: {},
                                           clientInfo: { name: 'seal-copilot-evals', version: '1' } });
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      return r;
    },
    listTools: () => send('tools/list'),
    call: (name, args = {}) => send('tools/call', { name, arguments: args }),
    stderr: () => stderr,
    close: () => proc.kill(),
  };
}

// MCP wraps results in content blocks. The payload may be raw JSON, JSON inside
// a fenced code block, or human-readable text — reporting *which* matters more
// than the value, so return both the parsed form and how it arrived.
export function unwrap(result) {
  const block = result?.content?.find(c => c.type === 'text');
  const text = block?.text;
  if (text === undefined) return { format: 'no-text-block', blocks: (result?.content || []).map(c => c.type), value: result };

  const direct = tryParse(text);
  if (direct !== undefined) return { format: 'json', value: direct, raw: text };

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    const inner = tryParse(fence[1]);
    if (inner !== undefined) return { format: 'json-in-fence', value: inner, raw: text };
  }
  // The server reports failures as ordinary text content, not as JSON-RPC
  // errors, so a "successful" call can still be a failure. Detect that before
  // concluding anything about response formats.
  if (/^\s*(error|failed|unauthori[sz]ed|forbidden|not found)\b[: ]/i.test(text))
    return { format: 'error', value: text.trim(), raw: text };

  return { format: looksMarkdown(text) ? 'markdown' : 'text', value: text, raw: text };
}

function tryParse(s) { try { return JSON.parse(String(s).trim()); } catch { return undefined; } }
const looksMarkdown = (s) => /^\s*[#|]|\n\s*\||^\s*[-*]\s/.test(s);

// A structural sketch: layout and field names kept, every figure masked. Enough
// to see the shape of a response without putting anyone's revenue on screen.
export function redact(text, limit = 700) {
  return String(text).slice(0, limit)
    .replace(/\d/g, '#')
    .replace(/[ \t]+/g, ' ');
}
