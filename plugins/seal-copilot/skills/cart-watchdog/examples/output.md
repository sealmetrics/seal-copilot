> Reference outputs. A watchdog that talks when nothing is wrong becomes noise
> and gets muted, so the healthy case is deliberately one line.

## Healthy (a scheduled run — this is the entire response)

```
🟢 Healthy — 47 add-to-carts today vs 44 expected by 14:00 on a Tuesday.
```

## Watch

```
⚠️ Watch — 9 add-to-carts today vs 38 expected by 14:00 on a Tuesday (24%).
Last event 41 minutes ago; this cell normally sees one every 12 minutes.
Bot share is normal, so the quiet is real. Not escalating yet: the previous
check was healthy and a single low hour is within noise.
```

## Act now

```
🔴 Act now — 2 add-to-carts today vs 38 expected by 14:00 (5%), second
consecutive low check. Last event 2h 14m ago; activity stopped around 11:45.

Not bots: bot share is 7%, unchanged.
The drop is uniform — mobile and desktop both flat since 11:45, and no single
source accounts for it. That points at the cart or payment flow, not tracking.

Do this now: open a product page and try to add to cart. If it works, check
whether a deploy went out around 11:45.
```

## No baseline

```
No baseline yet — run `calibrate-watchdog` once and I can watch this properly.
```
