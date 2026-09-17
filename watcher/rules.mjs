#!/usr/bin/env node
/**
 * Put a rule into the watcher, take one out, or look at what it holds.
 *
 * This is the seam between a conversation and the watch. `create-alert` turns a
 * sentence into a rule and prints it; this puts that rule where the watcher
 * reads it. The watcher re-reads its config between passes, so nothing needs a
 * redeploy.
 *
 *   node watcher/rules.mjs list
 *   node watcher/rules.mjs add <site_id> < rule.json     # or paste on stdin
 *   node watcher/rules.mjs pause <site_id> <rule_id>
 *   node watcher/rules.mjs resume <site_id> <rule_id>
 *   node watcher/rules.mjs remove <site_id> <rule_id>
 *   node watcher/rules.mjs check
 *
 * It refuses to write a config the watcher could not load, which is the point:
 * a rule that fails validation here never becomes a rule that silently is not
 * watched.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { validate } from '../seal-copilot/hooks/scripts/lib/validate.mjs';
import { ruleSchema, configProblems } from './watch.mjs';

const PATH = process.env.SEAL_CONFIG_PATH;
const die = (msg) => { console.error(msg); process.exit(1); };

if (!PATH) {
  die('SEAL_CONFIG_PATH is not set.\n' +
      'This command edits the config FILE the watcher reads, so it needs a path.\n' +
      'With the config in SEAL_CONFIG (inline JSON) there is nothing to edit: move it\n' +
      'to a file on the volume and point SEAL_CONFIG_PATH at it.');
}

const read = () => {
  if (!existsSync(PATH)) return { sites: [] };
  try { return JSON.parse(readFileSync(PATH, 'utf8')); }
  catch (e) { die(`${PATH} is not valid JSON: ${e.message}`); }
};

/**
 * Write only if the result is something the watcher can load.
 *
 * The token check is skipped: this command often runs where the client's token
 * is not in the environment, and a missing token is the watcher's problem to
 * report at startup, not a reason to refuse a rule edit.
 */
const write = (cfg) => {
  const problems = configProblems(cfg, new Proxy({}, { get: () => 'present' }));
  if (problems.length) {
    die('Refusing to write: the result would not load.\n' + problems.map((p) => '  · ' + p).join('\n'));
  }
  writeFileSync(PATH, JSON.stringify(cfg, null, 2) + '\n');
};

const site = (cfg, id) => {
  const s = cfg.sites.find((x) => x.site_id === id);
  if (!s) {
    die(`No site ${JSON.stringify(id)} in ${PATH}. Known: ${cfg.sites.map((x) => x.site_id).join(', ') || '(none)'}.\n` +
        'Add the site first, with its token_env, then add rules to it.');
  }
  return s;
};

const readStdin = async () => {
  if (process.stdin.isTTY) {
    die('Nothing on stdin. Pipe the rule JSON in:\n' +
        '  node watcher/rules.mjs add <site_id> < rule.json');
  }
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) die('Nothing on stdin.');
  try { return JSON.parse(raw); }
  catch (e) { die(`stdin is not valid JSON: ${e.message}`); }
};

const [cmd, siteId, ruleId] = process.argv.slice(2);
const cfg = read();

switch (cmd) {
  case 'list': {
    if (!cfg.sites.length) { console.log(`${PATH} holds no sites yet.`); break; }
    for (const s of cfg.sites) {
      const rules = s.rules || [];
      console.log(`${s.site_id} (${rules.length} rule${rules.length === 1 ? '' : 's'}, token in ${s.token_env})`);
      for (const r of rules) {
        const mark = r.status === 'active' ? '●' : '○';
        const cond = r.family === 'silence' ? `${r.condition.hours}h`
          : r.family === 'threshold' ? JSON.stringify(r.condition)
          : `ratio ${r.condition.ratio}`;
        const hours = r.active_hours ? `${r.active_hours.from}-${r.active_hours.to}` : 'always';
        console.log(`  ${mark} ${r.id.padEnd(24)} ${r.family.padEnd(10)} ${String(cond).padEnd(18)} ${hours} ${r.timezone}` +
          (r.expires_at ? `  expires ${r.expires_at}` : ''));
      }
    }
    break;
  }

  case 'add': {
    if (!siteId) die('Which site? node watcher/rules.mjs add <site_id> < rule.json');
    const rule = await readStdin();
    // Validate the rule alone first, so the error names the rule and not the
    // whole config.
    const errs = validate(rule, ruleSchema(), rule.id || 'rule');
    if (errs.length) die(`That is not a usable rule:\n` + errs.map((e) => '  · ' + e).join('\n'));
    const s = site(cfg, siteId);
    s.rules ||= [];
    const existing = s.rules.findIndex((r) => r.id === rule.id);
    if (existing >= 0) {
      s.rules[existing] = rule;
      write(cfg);
      console.log(`Replaced ${rule.id} on ${siteId}. The watcher picks it up on its next pass.`);
    } else {
      s.rules.push(rule);
      write(cfg);
      console.log(`Added ${rule.id} to ${siteId}. The watcher picks it up on its next pass.`);
    }
    break;
  }

  case 'pause':
  case 'resume': {
    if (!siteId || !ruleId) die(`node watcher/rules.mjs ${cmd} <site_id> <rule_id>`);
    const r = (site(cfg, siteId).rules || []).find((x) => x.id === ruleId);
    if (!r) die(`No rule ${ruleId} on ${siteId}.`);
    r.status = cmd === 'pause' ? 'paused' : 'active';
    write(cfg);
    console.log(`${ruleId} on ${siteId} is now ${r.status}.`);
    break;
  }

  case 'remove': {
    if (!siteId || !ruleId) die('node watcher/rules.mjs remove <site_id> <rule_id>');
    const s = site(cfg, siteId);
    const before = (s.rules || []).length;
    // Kept with a date rather than deleted, so "did I have an alert on that?"
    // has an answer — the same rule the plugin's alerts.json follows.
    const r = (s.rules || []).find((x) => x.id === ruleId);
    if (!r) die(`No rule ${ruleId} on ${siteId}.`);
    r.status = 'deleted';
    r.deleted_at = new Date().toISOString().slice(0, 10);
    write(cfg);
    console.log(`${ruleId} on ${siteId} is marked deleted (${before} rule(s) still in the file, kept for the record).`);
    break;
  }

  case 'check': {
    const problems = configProblems(cfg);
    if (problems.length) die('Not usable:\n' + problems.map((p) => '  · ' + p).join('\n'));
    const n = cfg.sites.reduce((a, s) => a + (s.rules || []).filter((r) => r.status === 'active').length, 0);
    console.log(`Usable: ${cfg.sites.length} site(s), ${n} active rule(s). Tokens checked against this environment.`);
    break;
  }

  default:
    die('Commands: list, add <site>, pause <site> <rule>, resume <site> <rule>, remove <site> <rule>, check');
}
