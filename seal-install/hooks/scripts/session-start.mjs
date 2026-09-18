#!/usr/bin/env node
// SessionStart: announce where install state goes. The skill writes the approved
// install plan, the simulations and the site profile under <state-dir>, and until
// 1.13.0 this plugin had no hook, so the model was never told what <state-dir> is:
// the first eval that asserted on install-plan.json found the directory empty.
// Same resolution as Seal Copilot's hook, so both plugins share one state root.
import { join } from 'node:path';
import { homedir } from 'node:os';

const stateRoot = process.env.SEAL_COPILOT_STATE_DIR || join(homedir(), '.seal-copilot');
const ctx = [
  'Seal Install is installed. It installs Sealmetrics tracking with the local connector.',
  `State directory: ${stateRoot}`,
  'Write install state (install-plan.json, simulations/, profile.json, runs.jsonl) under',
  'that directory, exactly as announced, using the Read and Write tools.',
].join('\n');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx },
}));
