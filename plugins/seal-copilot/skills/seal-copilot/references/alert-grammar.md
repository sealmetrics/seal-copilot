# Alert Rule Grammar

The shape of a rule this plugin saves, shared by `create-alert` (which writes
one) and `check-alerts` (which evaluates one). The two share this grammar and
nothing else.

**Nothing watches these rules automatically.** `create-alert` saves them and
`check-alerts` runs one when the user asks, until Sealmetrics' own alert engine
watches them. They are unrelated to the account's dashboard alerts, whose tools
the remote connector does not announce; these rules need none of those and work
on every connector.

The file they live in is `<state-dir>/<site_id>/alerts.json`, an object with a
`rules` array, never a bare list — a hook refuses the write otherwise and says
which field is wrong.

## The rule grammar

```json
{
  "id": "no-conversions-4h",
  "site_id": "demo-store",
  "family": "silence",
  "metric": { "kind": "conversion", "type": "purchase" },
  "filter": {},
  "condition": { "hours": 4 },
  "active_hours": { "from": 8, "to": 24, "days": ["mon","tue","wed","thu","fri","sat","sun"] },
  "timezone": "Europe/Madrid",
  "expected": null,
  "deliver": ["app"],
  "created_at": "2026-09-12",
  "expires_at": "2027-03-12",
  "status": "active"
}
```

| Field | Rule |
|---|---|
| `id` | Slug of what is watched plus the condition: `no-conversions-4h`, `atc-half-normal`, `revenue-under-2000`. It is how the user refers to the rule later |
| `family` | One of `silence`, `drop`, `spike`, `threshold`. See the table below |
| `metric.kind` | `conversion`, `microconversion`, `revenue` or `entrances` |
| `metric.type` | The site's **real** event name, from `list_microconversion_types` or `get_conversions`. Never the canonical name, never a guess |
| `filter` | Only filters the tool for that metric actually accepts. A filter the tool does not support is refused at creation, never passed and ignored |
| `condition` | `{ "hours": N }` for `silence`; `{ "ratio": 0.5 }` for `drop` and `spike`; `{ "below": 2000 }` or `{ "above": N }` for `threshold` |
| `active_hours` | **Mandatory for `silence` and `drop`.** Local hours `from`–`to` and the days it applies |
| `expected` | `drop` and `spike` only. The expectation **embedded at creation time**, so the check needs no stored state |
| `deliver` | `["app"]`, or add `"slack"` / `"email"` when the user has that connector and asks for it |
| `expires_at` | Six months out. An alert nobody revisits becomes noise |

## The four families

| Family | The user says | What the check does | Calls |
|---|---|---|---|
| `silence` | "four hours with no conversions", "two hours without add-to-cart on mobile" | Day total, then the timestamp of the most recent event. Fires when the gap reaches `hours` inside active hours | 1–2 |
| `drop` | "less than half of normal by mid-afternoon" | Day-to-date against the `expected` curve for this weekday and hour | 1 |
| `spike` | "if one campaign triples in an hour" | The mirror of `drop` | 1–2 |
| `threshold` | "if revenue does not reach 2,000 today", "if brand-es drops below 10 conversions a day" | One reading against a fixed number | 1 |

Anything else — rules about saved segments, about a metric
that would take more than two calls, or comparing two sites — is out of scope.
Say so plainly and offer the nearest rule that is in scope.
