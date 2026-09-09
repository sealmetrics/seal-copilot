# SaaS & Lead-Gen Playbook

Load when the customer sells software or generates leads rather than shipping
products (signals: `signup`, `demo_request`, `trial_start`, `lead` or `contact`
conversions; `pricing_view`, `cta_click`, `form_view` microconversions;
`plan`, `company_size`, `industry` properties; heavy blog traffic).

## What is different about this vertical

**Revenue is usually absent or misleading.** Most SaaS accounts pass no value
on a signup, or pass a placeholder. Check `get_conversions` first: if
`avg_value` is 0 or null, every impact estimate must be expressed in **leads**,
and the user supplies the value per lead. Never invent one, and never present a
lead count as revenue.

**The conversion is the beginning, not the end.** A signup that never becomes a
customer is not a win. Sealmetrics sees the acquisition, not the retention, so
say so before recommending that someone scale a channel on signup volume alone.
Where a `plan` property exists, use it — plan mix is the closest available
proxy for lead quality.

**The blog is an acquisition channel with a different job.** Informational
traffic converting at 0.5% is normal and not a finding. What matters is whether
it converts *at all* and whether the path from blog to product exists.

## Funnel

Canonical stages: entrance → `pricing_view` → `form_view` → submit
(`demo_request` / `signup` / `trial_start`). Map the real names via
`list_microconversion_types`; common variants are `view_pricing`,
`cta_click_demo`, `demo_form_view`, `contact_form_view`.

Compute and track:

- Pricing-view rate = pricing_view / entrances — top-of-funnel intent
- Form-view rate = form_view / pricing_view — does the pricing page persuade
- **Submit rate = conversions / form_view — the step that breaks most often**

The submit rate is where SaaS funnels fail, and it fails silently: traffic,
intent and form views all hold while submissions collapse. A required field, a
validation error, or a third-party script is the usual cause. Always segment it
by device before blaming the offer.

## Signature analyses

1. **Cost of a broken form.** `get_funnel` plus `get_microconversions(
   compare=previous)` per stage. If every stage above submit is flat and submit
   dropped, it is mechanical, not commercial. Quantify in leads: form views ×
   (prior submit rate − current rate).
2. **Brand vs non-brand paid.** `get_terms(period=90d, utm_medium=cpc)`. Brand
   terms converting at several times non-brand is normal. The finding is when
   non-brand is most of the traffic and converts near zero — that is budget
   buying the wrong intent.
3. **Blog versus product paths.** `get_content_groups` and
   `get_landing_pages_by_content_group`. The classic result: most acquisition
   enters through the blog and converts at a fraction of the product pages.
   The recommendation is a path from blog to product, not "improve blog
   conversion".
4. **Plan mix by channel.** If a `plan` or `company_size` property exists, run
   `get_property_values(property_key=plan, group_by=utm_source, period=90d)`.
   Channels that bring enterprise-shaped leads deserve different budget
   treatment than channels that bring free signups, even at identical CR.
5. **Form friction by device.** `get_microconversion_details(
   conversion_type=<form_view>, device_type='mobile')` against the desktop
   call. A submit rate that is fine on desktop and halved on mobile is a form
   layout problem, and it is common.
6. **Lead-quality caveat on any scale recommendation.** Before recommending
   more spend on the highest-CR channel, state that Sealmetrics measures
   acquisition only, and suggest checking that channel's leads against the CRM.

## Recommendation framing for SaaS

Express impact in **leads per month**, then multiply by the user's own value
per lead if they provide one. State the acquisition-only limit whenever the
recommendation involves scaling spend. For funnel repairs, give the expected
submit-rate recovery and the date to re-check it.
