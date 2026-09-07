> Reference output. Numbers come from `evals/fixtures/ecommerce-sku-friction.mjs`.
> Note what is labelled directional: everything that came from a sampled raw call.

Analyzed 7 SKUs with ≥30 views over 30 days. Site median view→AtC = **6.39%**.
Champions: 1 · Friction: 1 · Hidden gems: 2 · Dead stock: 1.
(SKU-1007 had 28 views — insufficient sample, re-check next month.)

**Friction — the priority**

| SKU | Views | Carts | View→AtC | vs median | Cause |
|---|---|---|---|---|---|
| SKU-8841 | 4,210 | 31 | 0.74% | 12% of median | Mobile-only (directional) |

SKU-8841 is the second most-viewed product in the catalog and almost nobody
carts it. In a 7-day sample of add-to-cart events it was 16.5% of desktop carts
but 1.1% of mobile carts, against roughly even overall device mix. That points
at the mobile product page, not at the product. Sample size is 190 events, so
treat the device split as directional and confirm by opening the page yourself.

**Hidden gems — demand exists, exposure does not**

| SKU | Views | Carts | View→AtC | vs median | Action |
|---|---|---|---|---|---|
| SKU-1005 | 620 | 96 | 15.48% | 2.4× | Put in the newsletter and on the homepage |
| SKU-1004 | 900 | 118 | 13.11% | 2.1× | Same — it converts, it just is not seen |

**Champions — leave alone:** SKU-1001, 4,800 views at 6.71%.

**Dead stock:** SKU-1006, 140 views at 2.86%. De-prioritize.

**Estimated impact.** If SKU-8841 reached the site median it would produce
about 238 more carts a month. At its measured 9.7% cart→purchase and its €120
price, that is roughly **€2,800/month**. The cart→purchase rate came from a
sample of 102 purchased items, so treat it as an estimate.

**Verify.** Re-run in 2–4 weeks after the mobile page ships. SKU-8841's
view→AtC should move toward 6%, and its mobile share of carts toward its
desktop share.
