# Persistent State

What Seal Copilot remembers about a site between runs. Without it every
scheduled run rediscovers the same facts, every scan re-proposes the same
finding, and no recommendation is ever verified.

**The field names here are checked, not merely documented.** A `PreToolUse`
hook validates every `Write` against a schema and refuses one that does not
match, naming the fields to fix and the field you probably meant; the eval
runner applies the same schemas to whatever a run leaves behind. You never need
to find or read those files — this one is the contract, and the refusal tells
you the rest.

## Where it lives

`<state-dir>/<site_id>/`, where `<state-dir>` is the path the SessionStart hook
announced. **Use that path exactly** — it is `$SEAL_COPILOT_STATE_DIR` when set,
otherwise `~/.seal-copilot`, and the override is what keeps test runs out of a
real account's state. If no directory was announced, fall back to
`~/.seal-copilot`.

Three rules for every write:

- **Read and Write tools, never a shell**, and write each file whole. An `Edit`
  on a state file is refused: it would skip the check.
- **Anything the schema does not name goes under `extra`.** Never invent a
  top-level field.
- **Never write PII.** These files hold site configuration, aggregate metrics
  and recommendation text. Nothing else.

Every read is optional. If a file is missing or the filesystem is not writable,
do the work anyway and say once, in one line, that nothing could be cached.
Never fail a skill because state is unavailable.

**State from an earlier version is history, not instructions.** Older profiles
carry field names this contract no longer uses and notes about tools this plugin
no longer calls — above all bot data, which Sealmetrics does not provide. Use
old state for its facts about the site; never repeat such a note, never let it
add a line to "Not checked", never carry it into a new note.

## The protocol every skill follows

1. **Load** `profile.json`, and check it applies: its `site_id` must be one
   `list_sites` returns for this connection.
2. **Use it** instead of re-discovering. Past its TTL, refresh that value, not
   the whole file.
3. **Write back** anything a later run would otherwise rediscover — but never
   spend a Sealmetrics call just to fill the profile. The analysis owns the
   budget; the profile gets the leftovers.
4. **Log the run** in `runs.jsonl`.

### A cached site belongs to one connection

Everything here is filed by site and records nothing about who authorised the
connection, so two Sealmetrics accounts on one machine share it. **Freshness
proves nothing about ownership.**

1. **Run `list_sites` at the start of every run**, whatever the cache says. It
   is the only thing that knows which sites this connection reaches, and it is
   the one exception to "never spend a call on the profile": it fills nothing,
   it checks that the cache applies.
2. **Cached `site_id` in the list** → use the cache, and do not ask which site
   even when the list has several. The cache is the user's earlier answer.
3. **Not in the list** → that state belongs to another account. Ignore it for
   this run, resolve the site from the list (ask if there are several), run
   discovery, and write new state under the new `site_id`. **Never overwrite or
   delete the other site's directory.**
4. **Say so once**, in one line, in the answer and in the run-log notes.

Do not infer "wrong account" from a refusal: on `remote` some tools are not
announced and on `local` some are refused for every key by design.
`list_sites` is the evidence; a refusal is not.

## The files

| File | Written by | Read by | TTL |
|---|---|---|---|
| `profile.json` | whichever skill runs discovery first | all | 7 days on `discovery_cached_at` |
| `property-map.md` | `property-explorer` only | `product-friction`, `opportunity-scan`, `channel-mix-optimizer`, core | 30 days |
| `watchdog-baseline.json` | `calibrate-watchdog`; status updated by `cart-watchdog` | `cart-watchdog`, `create-alert` | `expires_at`, 30 days |
| `recommendations.jsonl` | any skill that issues a recommendation | `weekly-health-check`, `monday-briefing`, `opportunity-scan` | per-entry `verify_on` |
| `alerts.json` | `create-alert` | `check-alerts`, `monday-briefing`, `setup-audit`, session hook | `expires_at`, 6 months |
| `runs.jsonl` | every skill | `cost-reduction`, the eval suite | — |

**`profile.json`** answers what otherwise costs calls: the timezone, the
vertical, the site's real event names, the product identifier, the currency
every money figure must use, and which connector this is. `thresholds` overrides
the defaults in `methodology.md` per site — write the user's own threshold there
so the next session does not make them repeat it. `targets` holds monthly goals
when they state one; absent means they have not, and never invent one.
`account_id` is not a second identifier: it records whether the configuration
tool family answered for this site, so a later skill knows without spending a
call.

**`property-map.md`** is Markdown, not JSON, because the user is meant to read
and correct it: the inventory table, the top five with reasons, and the
recommended starter analyses. Past 30 days, say it is stale and offer to re-run
`property-explorer` before relying on it.

**No skill forks.** `context: fork` starts a fresh context that never received
the SessionStart hook, so a forked skill cannot learn `<state-dir>` and cannot
read `profile.json` before deciding what to do. Keeping raw JSON out of the main
conversation is not worth a skill that guesses the product identifier instead of
asking for it.

## The ledger is what makes this consulting

### Follow-up — `weekly-health-check` and `monday-briefing`

Before reporting anything new, act on entries where `status` is `open` and
`verify_on` is today or earlier:

1. Re-run the one call that measures `metric` for `subject`.
2. Reached `target` or beyond → `verified`. Moved less than a third of the way,
   or backwards → `failed`. In between → leave `open` and push `verify_on` out
   by two weeks, **once**; a second inconclusive check is `failed`.
3. Report each outcome in one line, above the new findings. Verified
   recommendations are the plugin's track record — show them.
4. Rewrite the file with the updated statuses.

### Repeat suppression — `opportunity-scan`

Do not re-report a pattern with an `open` entry for the same `subject` unless
the recomputed `impact_month` has grown by ≥50%; then report it as an escalation
and name the date it was first flagged. A `discarded` entry suppresses the
pattern for 90 days.

### `alerts.json`

**This file is not what watches them.** `create-alert` saves a rule here and
`check-alerts` runs one when the user asks; Seal Watch evaluates the same
grammar continuously from its own config. Never describe a rule here as being
watched — you cannot see whether Seal Watch has it. When Sealmetrics' native
engine ships, the server becomes the source of truth and this file is
history.

A deleted rule stays in the file with its date, so "did I have an alert on
that?" has an answer. `last_fired` is when a run last found the rule firing: a
rule that fired an hour ago and is still failing is reported as "still open
since", not as a new incident.

The install plan `setup-audit` reads is in `references/install-plan.md`.
