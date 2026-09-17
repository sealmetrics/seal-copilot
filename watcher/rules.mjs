#!/usr/bin/env node
/**
 * Put a rule into the watcher, take one out, or look at what it holds.
 *
 * This is the seam between a conversation and the watch. `create-alert` turns a
 * sentence into a rule and prints it; this puts that rule where the watcher
 * reads it. The watcher re-reads its config between passes, so nothing needs a
 * redeploy.
 *
 *   node watcher/rules.mjs site <site_id> <token_env> [slack_env]
 *        [--webhook-url <url>] [--webhook-secret-env <NAME>]
 *   node watcher/rules.mjs list
 *   node watcher/rules.mjs add <site_id> < rule.json     # or paste on stdin
 *   node watcher/rules.mjs pause <site_id> <rule_id>
 *   node watcher/rules.mjs resume <site_id> <rule_id>
 *   node watcher/rules.mjs remove <site_id> <rule_id>
 *   node watcher/rules.mjs import <site_id> <alerts.json>
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
cfg.sites ||= [];

switch (cmd) {
  case 'site': {
    // Bootstrap. Without this the first step of a deploy is editing JSON by
    // hand, which is exactly where a token ends up in a file by accident.
    const tokenEnv = process.argv[4];
    const flag = (name) => {
      const i = process.argv.indexOf(name);
      return i === -1 ? undefined : process.argv[i + 1];
    };
    const positionalSlack = process.argv[5] && !process.argv[5].startsWith('--') ? process.argv[5] : undefined;
    const slackEnv = positionalSlack || flag('--slack-env');
    const webhookUrl = flag('--webhook-url');
    const secretEnv = flag('--webhook-secret-env');
    if (!siteId || !tokenEnv) {
      die('node watcher/rules.mjs site <site_id> <TOKEN_ENV_NAME> [SLACK_ENV_NAME]\n' +
          '       [--webhook-url <url>] [--webhook-secret-env <NAME>]\n' +
          'The token ENV NAME, not the token: the config is committable and the\n' +
          "variable holds the client's own credential.");
    }
    if (/^sm_/.test(tokenEnv)) {
      die('That looks like a token, not a variable name. Pass the NAME of the\n' +
          'environment variable that holds it, for example SEAL_TOKEN_ACCT_DEMO.');
    }
    // A URL where a URL belongs and a NAME where a name belongs. Mixing them is
    // exactly how a secret ends up inside a committable config file.
    if (webhookUrl !== undefined && !/^https?:\/\//.test(webhookUrl || '')) {
      die('--webhook-url needs a full http or https URL, for example\n' +
          'https://n8n.example.com/webhook/seal-alerts');
    }
    for (const [what, value] of [['--webhook-secret-env', secretEnv], ['the Slack argument', slackEnv]]) {
      if (value && /^(https?:\/\/|sm_|xox)/.test(value)) {
        die(`${what} needs the NAME of an environment variable, not the value.\n` +
            'The config is committable; only the variable holds the secret.');
      }
    }
    cfg.sites ||= [];
    const existing = cfg.sites.find((x) => x.site_id === siteId);
    const entry = existing || { site_id: siteId, rules: [] };
    entry.token_env = tokenEnv;
    if (slackEnv) entry.slack_webhook_env = slackEnv;
    if (webhookUrl) entry.webhook_url = webhookUrl;
    if (secretEnv) entry.webhook_secret_env = secretEnv;
    if (!existing) cfg.sites.push(entry);
    cfg.interval_seconds ??= 300;
    write(cfg);
    // Say what the channels are, and say when one is unsigned. A webhook nobody
    // can verify is a webhook anybody can forge a call into.
    const channels = [];
    if (entry.slack_webhook_env) channels.push(`Slack from ${entry.slack_webhook_env}`);
    if (entry.webhook_url) {
      channels.push(`webhook to ${new URL(entry.webhook_url).host}` +
        (entry.webhook_secret_env ? `, signed with ${entry.webhook_secret_env}` : ', UNSIGNED'));
    }
    console.log(`${existing ? 'Updated' : 'Added'} site ${siteId}, token from ${tokenEnv}` +
      (channels.length ? `, ${channels.join(', ')}` : ', notifications to the log until a channel is set') +
      `.\nProve the channel before trusting it: node watcher/watch.mjs --test-delivery ${siteId}` +
      `\nNow add rules: node watcher/rules.mjs import ${siteId} <alerts.json>`);
    break;
  }

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

  case 'import': {
    // The realistic path: someone ran the plugin, `create-alert` wrote
    // `<state-dir>/<site>/alerts.json`, and that whole file comes across in one
    // command rather than a rule at a time.
    const from = process.argv[4];
    if (!siteId || !from) die('node watcher/rules.mjs import <site_id> <path-to-alerts.json>');
    if (!existsSync(from)) die(`No file at ${from}.`);
    let doc;
    try { doc = JSON.parse(readFileSync(from, 'utf8')); }
    catch (e) { die(`${from} is not valid JSON: ${e.message}`); }
    const incoming = Array.isArray(doc) ? doc : doc.rules;
    if (!Array.isArray(incoming)) {
      die(`${from} has no \`rules\` array. A file written by create-alert is ` +
          '{ "site_id": …, "rules": [ … ] }.');
    }
    const s = site(cfg, siteId);
    s.rules ||= [];
    const schema = ruleSchema();
    const added = [], replaced = [], skipped = [];
    for (const rule of incoming) {
      // Only what is meant to be watched. A paused or deleted rule stays where
      // it is: importing it would quietly re-arm something switched off.
      if (rule.status !== 'active') { skipped.push(`${rule.id} (${rule.status})`); continue; }
      const errs = validate(rule, schema, rule.id || 'rule');
      if (errs.length) { skipped.push(`${rule.id} — ${errs[0]}`); continue; }
      const i = s.rules.findIndex((r) => r.id === rule.id);
      if (i >= 0) { s.rules[i] = rule; replaced.push(rule.id); }
      else { s.rules.push(rule); added.push(rule.id); }
    }
    if (!added.length && !replaced.length) {
      die('Nothing imported.' + (skipped.length ? '\n  skipped: ' + skipped.join('\n  skipped: ') : ''));
    }
    write(cfg);
    if (added.length) console.log(`Added: ${added.join(', ')}`);
    if (replaced.length) console.log(`Replaced: ${replaced.join(', ')}`);
    // Never silent about what did not come across: a rule the operator thinks
    // is watched and is not is the failure this whole service exists to avoid.
    if (skipped.length) console.log(`Skipped:\n  ${skipped.join('\n  ')}`);
    console.log('The watcher picks these up on its next pass.');
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
    die('Commands: site <id> <token_env>, list, add <site>, import <site> <file>,\n' +
        '          pause <site> <rule>, resume <site> <rule>, remove <site> <rule>, check');
}
