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

// MCP wraps results as content blocks; unwrap the JSON payload.
export function unwrap(result) {
  const text = result?.content?.find(c => c.type === 'text')?.text;
  if (text === undefined) return result;
  try { return JSON.parse(text); } catch { return text; }
}
