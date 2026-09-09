> Reference output. The gap table is ordered by value unlocked, not by effort,
> and every fix names the analysis it makes possible.

**Score: 6/10** — acquisition is measured well, the commercial funnel is not.
Channel and campaign reporting is trustworthy; anything about products, carts
or traffic quality is currently guesswork.

| Gap | Why it matters | Fix | Effort |
|---|---|---|---|
| No product identifier on `add_to_cart` | `sku` exists on `view_item` and on purchase items but not on add-to-cart, so view→cart cannot be joined. This blocks per-SKU friction analysis entirely | Add `sku` to the add-to-cart event payload, same value as on `view_item` | S |
| Agent analytics disabled | `get_bot_stats` returns nothing, so every anomaly in every report is unvalidated for bots. Bot traffic is the most common false positive there is | Enable agent analytics in account settings | S |
| `start_checkout` not instrumented | The funnel jumps from cart to purchase, so a checkout fault is invisible until revenue moves | Fire `start_checkout` when the checkout page loads | M |
| 31% of paid traffic classified as Referral | `cpc` sessions are landing outside Paid Search, so channel comparisons understate paid | Add a channel rule for the affected sources — I can draft and test it | S |
| No `price_range` or `category` property | Property breakdowns are limited to `sku`, so "which category sells from Instagram" cannot be answered | Add both to purchase and view events | M |

**Copy-pasteable fix for the top gap:**

```js
sm('event', 'add_to_cart', {
  sku: product.sku,          // must match the value sent on view_item
  price: product.price,
  quantity: 1
});
```

On the channel rule: I can propose it and dry-run it with `test_channel_rules`
so you see exactly which sessions reclassify. I will not create or change a rule
without you confirming.

**Close:** re-audit once the `sku` fix ships. That one change unlocks
`product-friction`, which on a catalog this size is usually the highest-value
analysis available.
