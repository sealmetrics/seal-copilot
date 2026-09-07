> Reference output. Discovery, not diagnosis — every high-scoring property ends
> in a pointer to the skill that should analyze it.

**Inventory**

| Property | Table | Appears on | Cardinality | Score |
|---|---|---|---|---|
| `sku` | items, micro | view_item, add_to_cart, purchase | 1,240 | 8/9 |
| `category` | conversions, micro | view_item, purchase | 14 | 7/9 |
| `price_range` | conversions | purchase | 5 | 5/9 |
| `size` | items | purchase | 9 | 3/9 |

**Top properties and why they scored**

1. **`sku` (8/9)** — identifier-like, 1,240 values, present on both the view and
   the cart event. That pairing is what makes per-SKU friction measurable, and
   most accounts do not have it.
2. **`category` (7/9)** — 14 values, and the top 3 carry 68% of revenue. It also
   varies sharply by channel: `footwear` is 41% of Paid Social revenue but 12%
   of Organic. That divergence is strategic — it explains channel performance.
3. **`price_range` (5/9)** — clean 5-bucket split, useful for AOV work, but its
   revenue distribution matches its traffic distribution, so it explains little.

**Three analyses this account can run today**

- "Run product-friction on `sku`" — the catalog is large enough that the
  view→cart spread will find real money.
- "Break down Paid Social by `category`" — the 41%/12% gap suggests dedicated
  ad sets rather than one generic campaign.
- "Compare AOV by `price_range` across channels" — cheap, and it tells you which
  channel brings high-ticket buyers.

**Missing for an ecommerce account:** `brand` and `stock_status`. Both are
commonly available in the product feed and both would sharpen the analyses above.

**Stored** at `~/.seal-copilot/acct_demo/property-map.md`. Every later skill
reads it instead of rediscovering. It goes stale in 30 days or after any
tracking change.
