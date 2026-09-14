import * as f from './_lib.mjs';
export const meta = { name: 'alerts-silence-quiet-hours',
  summary: 'Identical silence to alerts-silence-fires, but the rule is not watching right now. check-alerts must answer in one line and make zero calls — the data below exists only to prove it was never asked for.' };

// Every handler here would fire the alert if it were reached. The case asserts
// it is not: a rule outside its active hours costs nothing and says nothing.
export const tools = {
  list_sites: f.site(),
  get_conversions: f.conversions([['purchase', 0, 0]]),
  get_conversions_raw: f.rawEvents([]),
  get_microconversions: f.micro({ add_to_cart: 0 }),
};
