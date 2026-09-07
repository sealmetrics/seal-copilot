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
<script async src="https://cdn.sealmetrics.com/sm.js?id=acct_demo" />
```

Because this is the App Router, I also wired route changes in
`app/providers.tsx` — without it a single-page app records one pageview per
session instead of one per route.

**3. Pixel confirmed.** First pageview arrived 12 seconds after you opened the
site. The tracker is live.

**4. Events instrumented** (ecommerce funnel):

| Event | Kind | Where | Verified |
|---|---|---|---|
| `product_view` | micro | `components/ProductPage.tsx` | ✅ confirmed |
| `add_to_cart` | micro | `components/AddToCartButton.tsx` | ✅ confirmed |
| `start_checkout` | micro | `app/checkout/page.tsx` | ✅ confirmed |
| `purchase` | conv | `app/checkout/success/page.tsx` | ⚠️ **not confirmed** |

`purchase` is written but has not fired — it needs a completed order, and no
one placed one while I was polling. Run one test order and I will re-verify.

Both `product_view` and `add_to_cart` send `sku` with the same value. That is
the detail that makes per-SKU analysis possible later, and it is very hard to
add retroactively. `purchase` sends order revenue, so recommendations will be
in euros rather than conversion counts.

No personal data is sent by any of these calls — no email, name, user id or
order id. That is what keeps the setup consentless.

**5. Nothing is deployed.** The changes are in your working tree. Review the
diff and ship when you are ready; the tracker only records the live site.

**Next.** Give it a few days of traffic, then run `property-explorer` once to
map what you can analyze, and `weekly-health-check` after that. If `purchase`
is still unconfirmed after your first real order, run `setup-audit` and I will
work the troubleshooting guide.
