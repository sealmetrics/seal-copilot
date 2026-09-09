# Hotels & Travel Playbook

Load when the customer is a hotel, hotel group, or travel business
(signals: booking conversions; room_view / booking_start microconversions;
room_type / rate_plan properties; OTA referrers like booking.com, expedia).

## Booking funnel

Canonical stages: search → room_view → booking_start → booking.
Map actual names via `list_microconversion_types`.

## Seasonality rule (overrides the default)

Hotels are strongly seasonal: **always compare yoy**, never just previous
period. A 30% drop vs last month in October is normal; a 10% drop vs last
October is a problem. Use `compare=yoy` in every analysis. For lead-time
sensitive properties, remind the customer that today's bookings reflect
campaigns from weeks ago.

## Signature analyses

1. **Direct vs OTA share.** Identify OTA traffic via `get_top_referrers`
   and `get_channels`; compute direct booking revenue share. The ROI
   argument: every booking shifted from OTA to direct saves 15–25%
   commission. Quantify: OTA-referred bookings × ADR × commission rate
   = the budget available for direct acquisition campaigns.
2. **Source markets.** `get_countries(compare=yoy, sort_by=revenue)` crossed
   with `get_top_campaigns(country=XX)` — `get_campaigns` has no country
   filter. Find countries with high CR or revenue and no active campaigns.
   Country is derived from browser timezone, not IP, so corroborate with
   language in `get_terms(country=XX)` or a localized landing path before
   recommending spend (see `methodology.md`). Also flag markets where
   campaigns run but CR is far below the country's organic CR.
3. **Booking properties.** If tracked (check `list_property_keys`):
   room_type, rate_plan, lead_time, stay_length, guests. Cross with
   channel/campaign via `get_property_values(group_by=utm_source)`.
   Classic finding: "suite bookings come 4× more from email than paid —
   put suites in the newsletter, not in generic search ads".
4. **Funnel by market.** Run `get_funnel(country=XX)` for top 3 source
   markets separately — a payment or language issue often shows up as a
   booking_start → booking gap in one country only.
5. **Brand protection check.** `get_terms` filtered to paid: if the hotel's
   own brand name dominates paid terms, flag that OTAs may be bidding on
   the brand and direct SEO/SEM defense matters.
6. **Booking watchdog.** Run `calibrate-watchdog` once with the watched
   event set to `booking_start` (or the equivalent), then schedule
   `cart-watchdog` hourly. A learned day-of-week × hour baseline catches
   booking-engine outages within minutes — especially valuable across
   mid-week night hours where direct bookings concentrate from leisure
   traffic.
7. **Property discovery first.** Hotel accounts vary widely in what they
   instrument. Run `property-explorer` once on engagement start to map
   which of room_type / rate_plan / lead_time / stay_length / guests are
   actually tracked, and to surface the highest-signal cross with channel.

## Recommendation framing for hotels

Express impact in bookings and ADR-based revenue, and always note the OTA
commission saved when recommending direct-channel investment.
