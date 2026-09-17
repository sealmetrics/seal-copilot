#!/usr/bin/env node
// PreToolUse on Write/Edit/Bash: nothing invalid reaches the state directory.
//
// The state contract was prose until 2026-09-17, and prose did not hold it: in
// certification 9 — thirty of thirty-one cases green — twelve skills wrote
// twelve different profiles and none used `site_name` or `events`, the two
// fields the profile exists to provide. The schemas in ../schemas are now the
// contract, and this hook is what makes them one.
//
// Three rules, in order of how often they fire:
//
// 1. A `Write` of a known state file must validate. A denial hands the model
//    the errors, naming the field it probably meant, and it writes again. Six
//    words of feedback beat a paragraph of documentation.
// 2. `Edit` on a state file is refused whatever its content: an edit bypasses
//    the whole-file validation above, and the contract has always said to Read,
//    add the line, and Write the file back.
// 3. `Bash` that redirects into the state directory is refused. It worked once,
//    on a surface that happened to allow a shell, and silently does nothing on
//    one that does not.
//
// It never denies for its own reasons: an unparseable payload, a missing schema
// directory or an unknown filename all allow. A hook that breaks on a bug of
// its own is worse than no hook.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { validateFile } from './lib/validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const allow = (extra) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', ...(extra || {}) },
  }));
  process.exit(0);
};
const deny = (reason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
  process.exit(0);
};

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(input); } catch { return allow(); }

  const tool = payload.tool_name || '';
  const args = payload.tool_input || {};
  const stateRoot = resolve(process.env.SEAL_COPILOT_STATE_DIR || join(homedir(), '.seal-copilot'));

  const schemasDir = join(here, '..', 'schemas');
  if (!existsSync(schemasDir)) return allow();
  const schemas = {};
  try {
    for (const f of readdirSync(schemasDir)) schemas[f] = JSON.parse(readFileSync(join(schemasDir, f), 'utf8'));
  } catch { return allow(); }

  const underState = (p) => {
    if (typeof p !== 'string' || !p) return false;
    const abs = resolve(p);
    return abs === stateRoot || abs.startsWith(stateRoot + '/');
  };

  if (tool === 'Bash') {
    const cmd = String(args.command || '');
    // Only a command that both names the state directory and writes to it.
    // Reading with cat or ls is harmless and not worth a denial.
    const namesState = cmd.includes(stateRoot) || cmd.includes('.seal-copilot') || cmd.includes('$SEAL_COPILOT_STATE_DIR');
    const writes = /(>>?|\btee\b|\bcp\b|\bmv\b|\brm\b|\bsed\s+-i\b|\btruncate\b|\bdd\b)/.test(cmd);
    if (namesState && writes) {
      return deny(
        'State is written with the Read and Write tools, never a shell. A run once appended its ' +
        'run log with `cat >>`: it worked because that session happened to allow a shell, and on a ' +
        'surface that does not it silently never happens. To append to a .jsonl file, Read it, add ' +
        'your line, and Write the whole file back.');
    }
    return allow();
  }

  if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    const p = args.file_path || args.notebook_path;
    if (underState(p) && schemas[basename(String(p))]) {
      return deny(
        `${basename(String(p))} is a state file: Read it, change it in full, and Write it back. ` +
        'An Edit skips the schema check that keeps the state contract honest, and a partial edit to ' +
        'a .jsonl file is how a run log ends up half in one format and half in another.');
    }
    return allow();
  }

  if (tool !== 'Write') return allow();
  const path = args.file_path;
  if (!underState(path)) return allow();

  const name = basename(String(path));
  const { known, errors } = validateFile(name, String(args.content ?? ''), schemas);
  if (!known || !errors.length) return allow();

  const shown = errors.slice(0, 12);
  const more = errors.length - shown.length;
  return deny(
    `${name} does not match the state contract, so it was not written:\n` +
    shown.map((e) => `  · ${e}`).join('\n') +
    (more > 0 ? `\n  · …and ${more} more` : '') +
    `\n\nThe contract is seal-copilot/hooks/schemas/${name}. Fix the fields and Write again — ` +
    'do not work around it by renaming the file or using a shell. State written under other field ' +
    'names is state no later skill can read: it looks for the contract names, finds nothing, and ' +
    'redoes the work the file exists to save.');
});
