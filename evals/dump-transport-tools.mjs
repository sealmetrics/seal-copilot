#!/usr/bin/env node
// What each transport ANNOUNCES, read from the MCP server's own source.
//
// The plugin's whole connector story rests on this list, and until 2026-09-17 it
// was wrong: the skills said twenty tools were withheld and named `get_channels`
// among them, while `src/remote/gate.ts` excludes ten and the channel-groups
// router has accepted `sites:read` since PRD-055. A curl probe cannot settle it
// (the remote demands a Bearer token even for tools/list), so the gate module is
// the evidence.
//
//   node evals/dump-transport-tools.mjs [path-to-mcp-server] [--write]
//
// --write updates evals/remote-tools.json. Without a checkout it exits 2 and
// changes nothing: a missing sibling repo must not fail CI.
import { writeFileSync, existsSync, readFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir, tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const write = argv.includes('--write');
// This repo is often checked out inside a git worktree several levels below
// its own root, so a fixed number of `..` cannot find the sibling checkout.
// Try the candidates in order and take the first that is built.
const built = (p) => existsSync(join(p, 'dist', 'tools', 'index.js'));

/**
 * The published package, which is what users actually run.
 *
 * A local checkout can be ahead of npm or behind it — on 2026-09-17 the
 * checkout was 1.8.2 and npm served 1.9.1 — so the published tarball is the
 * source of truth and the checkout is the fallback for working offline.
 */
function fromNpm() {
  try {
    const dir = mkdtempSync(join(tmpdir(), 'seal-mcp-'));
    execFileSync('npm', ['pack', '@sealmetrics/mcp', '--silent'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] });
    const tgz = readdirSync(dir).find((f) => f.endsWith('.tgz'));
    if (!tgz) return null;
    execFileSync('tar', ['xzf', tgz], { cwd: dir });
    const pkg = join(dir, 'package');
    return built(pkg) ? pkg : null;
  } catch { return null; }
}

const explicit = [argv.find((a) => !a.startsWith('--')), process.env.SEALMETRICS_MCP_SERVER]
  .filter(Boolean).map((p) => resolve(p));
const checkouts = [
  join(here, '..', '..', 'sealmetrics2', 'mcp-server'),
  join(here, '..', '..', '..', 'sealmetrics2', 'mcp-server'),
  join(homedir(), 'code', 'sealmetrics2', 'mcp-server'),
].map((p) => resolve(p));
const candidates = [...explicit, ...checkouts];
// An explicit path wins; otherwise npm, which is what users install; otherwise
// a sibling checkout, so this still works with no network.
const server = explicit.find(built) || (argv.includes('--local') ? null : fromNpm()) || checkouts.find(built) || candidates[0];
const out = join(here, 'remote-tools.json');

const dist = join(server, 'dist');
if (!built(server)) {
  console.error('No built MCP server found. Tried `npm pack @sealmetrics/mcp` and:\n' +
    candidates.map((c) => '  ' + c).join('\n') +
    '\n\nPass a path, or set SEALMETRICS_MCP_SERVER. Nothing was changed.');
  process.exit(2);
}

const load = async (p) => import(pathToFileURL(join(dist, p)).href);
const tools = await load('tools/index.js');
const gate = await load('remote/gate.js');
const names = (list) => list.map((t) => t.name).sort();

const all = names(tools.ALL_TOOLS);
const channelWrite = names(tools.CHANNEL_WRITE_TOOLS);

/**
 * The setup tools, read rather than imported.
 *
 * `createSetupTools` needs a context, and in the published tarball its module
 * imports `@sealmetrics/setup-core`, which `npm pack` does not bring down. So
 * the names come from the file. A regex over source is normally the wrong
 * answer; here it is the only one that works against the package users install,
 * and the check below fails loudly if it finds nothing.
 */
let setup = [];
try {
  const mod = await load('tools/setup.js');
  const stub = { client: { hasApiKey: () => true, setApiKey() {} }, baseUrl: '', provisionKey: '', installSource: '', state: {} };
  setup = names(mod.createSetupTools(stub));
} catch {
  const src = readFileSync(join(dist, 'tools', 'setup.js'), 'utf8');
  setup = [...new Set([...src.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]))].sort();
}
if (!setup.length) {
  console.error('Found no setup tools. The package layout changed; read dist/tools/setup.js and fix this script.');
  process.exit(1);
}
const excluded = [...gate.REMOTE_EXCLUDED_TOOLS].sort();

// remote/app.ts passes omitSetupTools: true and excludeReadOnlyTools: the gate.
// So the remote announces ALL_TOOLS minus the gate, and no setup or write tools.
const remote = all.filter((n) => !excluded.includes(n));
const local = [...new Set([...all, ...channelWrite, ...setup])].sort();
const hiddenOnRemote = local.filter((n) => !remote.includes(n));

const version = JSON.parse(readFileSync(join(server, 'package.json'), 'utf8')).version;
const doc = {
  _why: 'Generated by evals/dump-transport-tools.mjs from the MCP server it will actually talk to: ' +
        'the published @sealmetrics/mcp package, or a local checkout when offline. The remote gate is ' +
        'src/remote/gate.ts; the local entry src/index.ts passes no filter at all, which is why it ' +
        'announces ten tools that always 403 (see docs/mcp-server-local-gate.md).',
  captured: new Date().toISOString().slice(0, 10),
  server_version: version,
  source: server.includes('seal-mcp-') ? 'npm' : 'checkout',
  counts: { local: local.length, remote: remote.length, hidden_on_remote: hiddenOnRemote.length },
  scope_gated: excluded,                    // routers behind require_scope("read")
  setup_and_write: [...setup, ...channelWrite].sort(),   // withheld by omitSetupTools
  hidden_on_remote: hiddenOnRemote,
  remote: remote,
  local: local,
};

if (write) { writeFileSync(out, JSON.stringify(doc, null, 2) + '\n'); console.log(`Wrote ${out}`); }
console.log(`@sealmetrics/mcp ${version}: local announces ${local.length}, remote ${remote.length}, ` +
  `${hiddenOnRemote.length} hidden (${excluded.length} scope-gated + ${setup.length + channelWrite.length} setup/write).`);
if (!write) {
  if (!existsSync(out)) { console.error(`\n${out} does not exist yet. Run with --write.`); process.exit(1); }
  const saved = JSON.parse(readFileSync(out, 'utf8'));
  const diff = (a, b) => a.filter((x) => !b.includes(x));
  const problems = [];
  for (const k of ['scope_gated', 'setup_and_write', 'hidden_on_remote', 'remote', 'local']) {
    for (const n of diff(doc[k], saved[k])) problems.push(`+ ${k}: ${n}`);
    for (const n of diff(saved[k], doc[k])) problems.push(`- ${k}: ${n}`);
  }
  if (problems.length) {
    console.log(`\n${out} is stale:\n` + problems.map((p) => '  ' + p).join('\n') +
      '\n\nRun with --write, then re-run the linter: a tool that moved between\n' +
      'transports changes which steps of a skill can run.');
    process.exit(1);
  }
  console.log('remote-tools.json matches the server source.');
}
