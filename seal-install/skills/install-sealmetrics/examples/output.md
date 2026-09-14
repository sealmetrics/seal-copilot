> Reference output for a full install on an existing repo. Note what is stated
> as confirmed versus written-but-unverified — that distinction is the point of
> this skill.

**Starting point:** your account has no site for `demo-store.com`, so I created
one. Framework detected: Next.js 14, App Router.

**1. Site created.** `demo-store.com`, account `acct_demo`. Check your email —
there is a claim link, and the account has no password until you use it.

**2. Snippet placed.** Added to `app/layout.tsx` inside `<head>`, above every
other script so nothing can call the tracker before it loads:

```tsx
<script src="https://t.sealmetrics.com/t.js?id=acct_demo" defer />
```

I did not add anything for route changes. The tracker records App Router
navigations on its own, and a second pageview call there would count every
navigation twice.

**3. Pixel confirmed.** After you deployed the snippet, the first pageview from
`demo-store.com` arrived 12 seconds after you opened the site. The tracker is
live. (It cannot be confirmed from `localhost`: hits from a domain the site
does not list are rejected without an error.)

**4. Events instrumented** (ecommerce funnel):

| Event | Kind | Where | Verified |
|---|---|---|---|
| `view_item` | micro | `components/ProductPage.tsx` | ✅ confirmed |
| `add_to_cart` | micro | `components/AddToCartButton.tsx` | ✅ confirmed |
| `begin_checkout` | micro | `app/checkout/page.tsx` | ✅ confirmed |
| `purchase` | conv | `app/checkout/success/page.tsx` | ⚠️ **not confirmed** |

`purchase` is deployed but has not fired — it needs a completed order, and no
one placed one while I was polling. Run one test order and I will re-verify.

Both `view_item` and `add_to_cart` send `product_id` with the same value. That
is the detail that makes per-SKU analysis possible later, and it is very hard to
add retroactively. `purchase` sends `Number(order.total)`: the order API
returns the total as a string, and the tracker drops an amount that is not a
number, so without `Number()` the sale would arrive with revenue 0.

No personal data is sent by any of these calls — no email, name, user id or
order id. That is what keeps the setup consentless.

**5. I deployed nothing.** Both deploys — the snippet, then the events — were
yours. Everything I changed is in the diff.

**Next.** Give it a few days of traffic, then run `property-explorer` once to
map what you can analyze, and `weekly-health-check` after that. If `purchase`
is still unconfirmed after your first real order, run `setup-audit` and I will
work the troubleshooting guide.
