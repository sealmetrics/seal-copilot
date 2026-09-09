> Reference output. Numbers come from `evals/fixtures/saas-demo-drop.mjs`.
> The lesson in the shape: the weakest *ratio* is not always the weakest *link*.
> The link that changed is the one to act on.

| Stage | Visitors | Step CR | vs previous |
|---|---|---|---|
| Entrance | 12,800 | — | +3% |
| Pricing view | 3,120 | 24.4% | +1% |
| Form view | 611 | 19.6% | −2% |
| Demo request | 41 | 6.7% | **−57%** |

**Weakest link: form view → demo request.** It fell from 15.4% to 6.7% while
every stage above it held. Traffic is fine, intent is fine, and 611 people
still reached the form. Fifty-three of them who would have converted last month
did not.

**Hypotheses, most likely first**

1. **The form itself broke or got harder.** A required field, a failing
   validation, or a third-party script. Nothing upstream moved, which is the
   signature of a last-step fault. Test: submit the form yourself on mobile and
   desktop.
2. **A trust or pricing change on the form page.** If the page was edited in
   the last month, diff it. Test: compare the deploy date against the day the
   ratio broke.
3. **Bot filtering of submissions.** Less likely — bot share is 9% and flat —
   but worth one check if the first two come back clean.

Device is not the split: form views ran 323 desktop to 288 mobile, close to the
site mix.

**Impact.** Restoring the prior 15.4% on current form views is about
**53 demo requests a month**. Multiply by your average value per demo for the
revenue figure — Sealmetrics does not carry it.

**Verify.** Re-run this funnel 7 days after the fix. Form view → demo request
should return above 15%. If it does not, the cause is upstream of the form and
the intent of the traffic changed.
