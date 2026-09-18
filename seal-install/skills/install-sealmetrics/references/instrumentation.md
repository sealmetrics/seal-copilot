# Placement, the taxonomy, and what to pass

Read this at Step 2, before writing a single call. Every rule here was
written because an install shipped without it.

**Placement rules that matter more than the framework:**

- The snippet goes in `<head>`, and it must load **before** anything that calls
  `sealmetrics.*`. Most "sealmetrics is not defined" reports are a tag manager
  firing before the tracker.
- One installation per site. Two copies double every pageview.
- In a single-page app, **do not add a pageview call on route changes.** The
  tracker already records every History API navigation by itself (React
  Router, the Next.js router, Vue Router, Nuxt, Angular). A second call on the
  route change counts every navigation twice, and it looks right in code
  review. The only exception is a site that must set the content group from
  code per route: load the tracker with `&spa=0`, which turns the automatic
  route pageview off, and fire `sealmetrics({ group })` yourself.

**The funnel per vertical.** The names are a closed set:
`verify_event_instrumented` rejects any other name as `out_of_taxonomy`, so an
invented name is an event that can never be verified. What distinguishes a room
from a product, or a demo from a contact form, goes in a property:

| Vertical | Conversions | Microconversions |
|---|---|---|
| Ecommerce | `purchase` with revenue | `view_item`, `add_to_cart`, `begin_checkout` |
| Hotel / travel | `booking` with revenue | `view_item` with `item_type: 'room'`, `begin_checkout` |
| SaaS / lead-gen | `signup` (`plan: 'trial'` for a trial), `lead` (`form_name: 'demo_request'` for a demo), `subscription` with revenue | `cta_click` (`cta: 'pricing'`), `form_submit` |

Older sites often already fire names from before the taxonomy was closed —
`product_view`, `start_checkout`, `room_view`, `pricing_view`. Do not write
new calls with those names, and do not rename working calls without asking:
renaming splits the site's history in two. Say which ones the verifier rejects
and let the user decide.

Two things to get right at install time, because retrofitting them is painful:

- **Pass revenue** on the conversion where revenue exists, **as a number**.
  Without it every later recommendation is expressed in conversions instead of
  euros. The tracker silently drops an amount that is not a number, and a total
  read from the DOM, an API or a data layer is often a string (`"149.99"`): wrap
  it in `Number()`, or the conversion arrives, verifies, and carries revenue 0.
- **Pass a product identifier** on *both* the product-view and the
  add-to-cart events, and on each purchase item, using the same key and the
  same value. This single detail is what makes per-SKU analysis possible
  later. Getting it right now costs nothing; adding it in six months means six
  months of unusable history.

Never send personal data. Sealmetrics is consentless by design and that
property depends on no identifiers being passed — no emails, names, user ids,
order ids, phone numbers or addresses, in any event, property or list item.
To avoid counting a purchase twice on a reload, key a `sessionStorage` flag on
the order id in the browser; never send the id.
