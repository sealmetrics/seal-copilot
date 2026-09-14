> Reference output for a full install on an existing repo, across the three
> turns the procedure takes: the plan the user approves, the simulation before
> the deploy, and the verification after it. Note how planned, simulated and
> verified are kept apart — that distinction is the point of this skill.

## Turn 1 — the plan, before any file is edited

**Starting point:** your account already has a site for `demo-store.com`
(`acct_demo`), so nothing is created. Framework: Next.js 14, App Router.

**Install plan `a3f9c21e7b04`**

Loader: `https://t.sealmetrics.com/t.js?id=acct_demo` in `app/layout.tsx`
(auto pageviews on, SPA navigations recorded by the tracker — no route code).

| Event | Kind | Trigger | Where | Properties | Revenue |
|---|---|---|---|---|---|
| pageview | auto on load + SPA navigations | load | `app/layout.tsx` | — | — |
| `view_item` | micro | page | `app/products/[slug]/page.tsx` | product_id, price | — |
| `add_to_cart` | micro | click | `components/AddToCartButton.tsx` | product_id, quantity | — |
| `begin_checkout` | micro | page | `app/checkout/page.tsx` | items_count | — |
| `purchase` | conv | page | `app/checkout/success/page.tsx` | currency, items[] (product_id, quantity, price) | order.total |

- `order.total` comes from the orders API as a string; the plan sends
  `Number(order.total)`, because the tracker drops an amount that is not a number.
- `product_id` is the same key and value on the product page, the cart and each
  purchase item — that is what makes per-SKU analysis possible later.
- No event carries an email, name, customer id or order id. To avoid counting a
  purchase twice on a reload, the success page keeps a `sessionStorage` flag
  keyed on the order in the browser; the id is never sent.

Files I will edit: `app/layout.tsx`, `app/products/[slug]/page.tsx`,
`components/AddToCartButton.tsx`, `app/checkout/page.tsx`,
`app/checkout/success/page.tsx`.

**Shall I go ahead with this plan, or change something first?**

## Turn 2 — after "go ahead": written and simulated

Plan approved and saved. Snippet placed in `app/layout.tsx` inside `<head>`:

```tsx
<script src="https://t.sealmetrics.com/t.js?id=acct_demo" defer />
```

The four events are written where the plan says.

**Simulation** (the real tracker, run locally — nothing sent to Sealmetrics):
the first round failed on `purchase` — the call passed `order.total`, which the
orders API returns as `"149.99"`, so the sale would have been stored with
revenue 0. I changed it to `Number(order.total)` and simulated again: all four
events pass, one pageview per page and per navigation.

This is **simulated, not verified**: no event has reached Sealmetrics yet.
Deploy the changes when you are ready and tell me when the site is live — I
will confirm the pixel and each event there.

## Turn 3 — after the deploy: verified on the live site

**Pixel confirmed.** The first pageview from `demo-store.com` arrived 12 seconds
after you opened the site.

| Event | Kind | Where | Planned | Simulated | Verified live |
|---|---|---|---|---|---|
| `view_item` | micro | `app/products/[slug]/page.tsx` | ✓ `a3f9c21e7b04` | ✓ | ✓ |
| `add_to_cart` | micro | `components/AddToCartButton.tsx` | ✓ | ✓ | ✓ |
| `begin_checkout` | micro | `app/checkout/page.tsx` | ✓ | ✓ | ✓ |
| `purchase` | conv | `app/checkout/success/page.tsx` | ✓ | ✓ (after `Number()`) | ⚠️ needs a test order |

`purchase` is simulated but not verified: it only fires after a completed
order, and nobody placed one while I was polling. Place one test order and I
will verify it.

**I deployed nothing.** Every change was yours to ship; the plan is saved in the
state directory next to the simulation.

**Next.** Give it a few days of traffic, then run `property-explorer` once to
map what you can analyze, and `weekly-health-check` after that. If `purchase`
is still unverified after your first real order, run `setup-audit`.
