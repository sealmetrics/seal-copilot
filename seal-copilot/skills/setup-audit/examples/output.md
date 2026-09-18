> Reference output, on the `remote` connector — the default, and what nearly
> every user has. The gap table is ordered by value unlocked, not by effort,
> and every fix names the analysis it makes possible. Note the last line: steps
> that need the local connector are named as unchecked, never scored as passing.

**Score: 6/10** — acquisition is measured well, the commercial funnel is not.
Channel and campaign reporting is trustworthy; anything about products or
carts is currently guesswork.

| Gap | Why it matters | Fix | Effort |
|---|---|---|---|
| No product identifier on `add_to_cart` | `sku` exists on `view_item` and on purchase items but not on add-to-cart, so view→cart cannot be joined. This blocks per-SKU friction analysis entirely | Add `sku` to the add-to-cart event payload, same value as on `view_item` | S |
| Nobody is watching the funnel | No alert rule is registered for this site, so an outage is found by customers before it is found by you. Add-to-cart runs at 140/day, enough signal for a 2-hour silence rule | Ask me to "tell me if add-to-cart goes quiet for 2 hours" | S |
| `begin_checkout` not instrumented | The funnel jumps from cart to purchase, so a checkout fault is invisible until revenue moves | Fire `begin_checkout` when the checkout page loads | M |
| 31% of paid traffic classified as Referral | `get_traffic_mediums` shows `cpc` at 14,200 entrances while Paid Search shows 9,800, so a third of paid spend is being read as Referral and every channel comparison understates paid | Create a channel rule mapping `utm_medium=cpc` to Paid Search, in Settings → Channel rules. Draft below | S |
| No `price_range` or `category` property | Property breakdowns are limited to `sku`, so "which category sells from Instagram" cannot be answered | Add both to purchase and view events | M |

**Copy-pasteable fix for the top gap:**

```js
sealmetrics.micro('add_to_cart', {
  sku: product.sku,          // must match the value sent on view_item
  price: product.price,
  quantity: 1
});
```

**The channel rule to create:** medium matches `cpc`, any source, any
campaign → channel **Paid Search**, priority above the default Referral rule.
I cannot create or dry-run it from here, so add it in the dashboard and the
next audit will confirm the split moved.

**When the site was installed with an approved plan** (step 10), its gaps sit in
the same table, tagged with the plan, and their fix is a planning round, not code:

| Gap | Why it matters | Fix | Effort |
|---|---|---|---|
| Revenue lost on 13% of `purchase` rows — plan `a3f9c21e7b04` | 26 of the last 200 purchases arrived with amount 0, so revenue per channel is understated by at least that share. The plan sends `Number(order.total)`; some checkout path sends the total as a string again | Plan and simulate the checkout change with `seal-install`, then deploy and verify it | S |
| `begin_checkout` planned, not seen — plan `a3f9c21e7b04` | Approved and written, zero events in 30 days: the funnel jumps from cart to purchase | Plan and simulate it again with `seal-install`; the simulation shows whether the call runs | S |

**Not checked:** saved segments and live channel rules need
the local connector, which this session does not have. They are unscored above,
not passing.

**Close:** re-audit once the `sku` fix ships. That one change unlocks
`product-friction`, which on a catalog this size is usually the highest-value
analysis available.
