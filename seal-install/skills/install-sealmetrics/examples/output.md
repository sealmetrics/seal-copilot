> Reference output for a full install on an existing repo, across the three
> turns the procedure takes: the plan the user approves, the simulation before
> the deploy, and the verification after it — against the plan, not just for
> arrival. Note how planned, simulated and
> verified are kept apart — that distinction is the point of this skill. The
> "Turn" headings only label this reference; never print them in an answer.

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

**In the browser**, against your dev server on `http://localhost:3000`: the tag
is on the page once and loads, no console error, one `view_item` on the product
page, one `add_to_cart` per click, one `begin_checkout`, and one pageview per
navigation. I did not walk the purchase: it needs a real payment, so it stays
call-simulated only.

This is **simulated, not verified**: no event has reached Sealmetrics yet.
Deploy the changes when you are ready and tell me when the site is live. Once it
is, place one test order with a total you will recognise — 1.23 € if the store
allows it — and tell me the exact amount: that is how I tell your order from a
real customer's.

## Turn 3 — after the deploy: verified on the live site

**Pixel confirmed.** The first pageview from `demo-store.com` arrived 12 seconds
after you opened the site.

| Event | Kind | Where | Planned | Simulated | Verified live |
|---|---|---|---|---|---|
| `view_item` | micro | `app/products/[slug]/page.tsx` | ✓ `a3f9c21e7b04` | ✓ call · ✓ page | ✓ |
| `add_to_cart` | micro | `components/AddToCartButton.tsx` | ✓ | ✓ call · ✓ page | ✓ by recency — 4 in the last 15 min |
| `begin_checkout` | micro | `app/checkout/page.tsx` | ✓ | ✓ call · ✓ page | ✓ |
| `purchase` | conv | `app/checkout/success/page.tsx` | ✓ | ✓ call (after `Number()`); page not walked — needs a payment | ✓ your 1.23 € order, with `currency` and `items` |

Each event was checked against the plan, not just for arriving: revenue on
`purchase`, and `product_id` on `view_item`, `add_to_cart` and every purchase
item. `add_to_cart` arrived with the planned properties, but four visitors added
to cart while I was polling, so I cannot say the one I saw was yours. It is
almost certainly fine; it is not proven.

**I deployed nothing.** Every change was yours to ship; the plan is saved in the
state directory next to the simulation.

**Keep the plan in the repo?** I can add `.sealmetrics/plan.json` (the approved
plan and its id) and `.sealmetrics/cases.json` (the simulated calls). The plan
then gets reviewed with the code in every pull request, and the `sealmetrics`
CLI can check it in CI — failing a pull request that changes the events without
a new plan, or turns the total back into a string. Say yes and I will write both
files; nothing else changes.

**Next.** Give it a few days of traffic, then run `property-explorer` once to
map what you can analyze, and `weekly-health-check` after that.
