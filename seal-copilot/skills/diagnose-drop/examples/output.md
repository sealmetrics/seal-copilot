> Reference output. Numbers come from `evals/fixtures/ecommerce-paid-search-drop.mjs`.
> Note the shape: one cause sentence, then the chain that proves it, then the
> action. Confidence is stated, and the seasonality check is shown, not skipped.

**The drop is isolated to one campaign: `generic-es` went from 230 conversions
to 2 while its traffic held at 8,400 entrances.** Confidence: high — the sample
is large and every other campaign is flat.

**Evidence chain**

1. Site conversions fell 20.9% (1,120 → 886) on flat traffic (46,200 → 45,650).
   Conversion rate went 2.42% → 1.94%. Revenue −18.0% (€83,100 → €68,160).
2. Bots are not the cause: bot share is 7%, unchanged.
3. Only Paid Search moved. Its CR went 2.62% → 1.10%. Organic (430 → 428),
   Direct (168 → 166), Paid Social (88 → 87) and Email (46 → 45) are flat.
4. Inside Paid Search, `brand-es` (142 conversions) and `retarget-es` (16) are
   unchanged. `generic-es` fell from 230 to 2 — a CR of 0.02%.
5. Its landing page `/collections/sale` bounces at 79%, and its top term
   "zapatillas baratas" took 5,200 entrances with zero conversions.
6. Not seasonal: year over year is also down (1,085 → 886).

The pattern — traffic intact, bounce high, conversions near zero — is a broken
or mismatched landing page, not lost demand.

**Action.** Open `/collections/sale` from a `generic-es` ad today. Check that
it loads, that the sale is live, and that stock is not empty. If the page is
fine, the ad-to-landing message match is the problem and "zapatillas baratas"
is buying the wrong intent — make it a negative keyword.

**Impact.** `generic-es` was producing €14,500/month and now produces €160.
Restoring its prior 2.67% CR on current traffic is worth about €14,300/month.

**Verify.** Re-run this diagnosis in 7 days. `generic-es` CR should be back
above 2%; if the landing was the fault it will move within 48 hours.
