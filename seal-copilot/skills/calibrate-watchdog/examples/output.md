> Reference output. Under 15 lines. The rhythm summary is the sanity check:
> if the busiest hour looks wrong to the user, the event mapping is wrong.

Watching **add_to_cart**, mode **A (full)** — 3,180 events in 30 days, under
the 4,000 threshold, so the baseline uses all 28 days at hour-of-week detail.

**Rhythm learned**
- Busiest: Thursday 20:00, median 14 add-to-carts/hour
- Quietest: Sunday 04:00, median 0 — the watchdog will not judge this cell
- Weekday evenings run roughly 3× weekday mornings

**Confidence:** 4 full weeks. 31 of 168 cells have a median below 5 events;
those are treated as too quiet to judge rather than as silence.

**Stored** at `~/.seal-copilot/acct_demo/watchdog-baseline.json`. It goes stale
on 7 October, or immediately if you change tracking.

Want me to schedule the hourly check? `/schedule` with
`/seal-copilot:cart-watchdog`, every hour from 08:00 to 24:00 Europe/Madrid.
It is silent when healthy, so it will not become noise.
