> Reference output. Numbers from `evals/fixtures/ecommerce-paid-search-drop.mjs`.
> Three findings maximum, ordered by money. The closing transparency lines
> matter: they show the scan actually ran rather than stopping at the first hit.

**1. Leaky campaign — `generic-es`**
- **Evidence:** 8,400 entrances over 30 days at 0.02% CR (2 conversions),
  against a Paid Search average of 1.10%. Its landing `/collections/sale`
  bounces at 79%. Last month the same campaign ran at 2.67%.
- **Action:** open the landing from a live ad today. If the page is fine, the
  term "zapatillas baratas" (5,200 entrances, zero conversions) is buying the
  wrong intent — negative-match it.
- **Impact:** ≈€14,300/month, assuming it returns to its own prior CR.
- **Verify:** re-check `generic-es` CR in 7 days; a landing fault moves within 48h.

**2. Broken landing — `/collections/sale`**
- **Evidence:** 8,400 paid entrances, 79% bounce against a site average of 52%.
- **Action:** page-speed and message-match audit. Urgent because the traffic is paid.
- **Impact:** counted inside finding 1 — same traffic, do not add them together.
- **Verify:** bounce below 60% after the fix.

**3. Dead keyword — "zapatillas baratas"**
- **Evidence:** 5,200 entrances, 0 conversions, 90 days.
- **Action:** negative keyword. Pull the actual click cost from Google Ads —
  Sealmetrics has no spend data.
- **Impact:** the whole spend on those 5,200 clicks.
- **Verify:** the term disappears from `get_terms` next month.

Checked and did not fire: hidden star, device gap, untapped country, winning
property, channel drift, non-converting referrer, micro→macro break, catalog
friction, RPE gap. No referrer is carrying unusual traffic, so finding 1 is real
demand that stopped converting, not a flood of visits that never could.

Suppressed: none — no open recommendations covered these subjects.
