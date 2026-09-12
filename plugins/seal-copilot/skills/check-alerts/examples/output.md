> Reference output. Three runs of the same rule: healthy, outside watch hours,
> and firing. The first two are one line each — that is the point of the skill,
> not an abbreviation of it. Only the third is allowed to use space.

**Healthy (the shape of almost every run)**

```
🟢 no-conversions-4h: 6 purchases today, last one 18 minutes ago.
```

**Outside watch hours (zero calls)**

```
🟢 no-conversions-4h: outside watch hours.
```

**Firing**

```
🔴 no-conversions-4h — no purchase since 11:20, four hours and forty minutes ago.

Today: 3 purchases, all before noon, against 14 by this hour last Tuesday.
The gap starts at 11:20 local — that is the timestamp to match against your
deploy log.

Check now: open a product page, add to cart and try to pay. If the payment
goes through, look at anything that shipped after 11:20.

Not checked: traffic quality — this connector does not announce it, so the
drop is real but unvalidated for bots.

Want the full cause hierarchy? Ask me to diagnose the drop.
```

Notes for the model, not part of the output: the healthy line names the figure
and the gap so a reader can tell a working check from a broken one. A firing
answer always carries the incident start time; without it the user cannot act,
and "conversions are down" is something they already knew.
