// Did every number in the answer come from somewhere real?
//
// "Every number is real (no invented data)" is the plugin's first principle and
// it had no test. `assess.mjs` checked phrases, tool calls, text blocks and
// state; nothing checked that a figure in a report existed in the data. A
// wrong sum inside a hundred-SKU pivot was invisible to the whole suite.
//
// The rule: every number in the answer must be a number the run was GIVEN, a
// number the calculator RETURNED, a threshold the skill itself documents, or
// derivable from two allowed numbers by one arithmetic step. Anything else is
// reported.
//
// Deliberately generous, because this repo has failed twelve correct answers on
// phrase bans and the lesson stuck: a false positive here would be the
// thirteenth. Quoted text is skipped (a hostile UTM value is data, not a
// claim), years and clock times are allowed, and small integers are allowed
// because "3 findings" and "step 2" are not measurements.

const r = (n) => Math.round(n * 1e6) / 1e6;

// Every numeric leaf of a served response or a calc output.
function leaves(value, out = new Set(), depth = 0) {
  if (depth > 8 || value === null || value === undefined) return out;
  if (typeof value === 'number') { out.add(r(value)); return out; }
  if (typeof value === 'string') {
    // Money arrives as "12345.67"; a date must not become 2026.
    if (/^-?\d+(\.\d+)?$/.test(value.trim())) out.add(r(Number(value)));
    return out;
  }
  if (Array.isArray(value)) { for (const v of value) leaves(v, out, depth + 1); return out; }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      leaves(v, out, depth + 1);
      // Object KEYS carry data too: a property pivot is { "SKU-1001": 4800 },
      // and an hour-of-week baseline is keyed by the hour.
      if (/^-?\d+(\.\d+)?$/.test(k)) out.add(r(Number(k)));
    }
    return out;
  }
  return out;
}

// Numbers the answer may use without them being measurements.
const FREE = new Set();
for (let i = 0; i <= 100; i++) FREE.add(i);            // counts, steps, percentages of a whole
for (let y = 2018; y <= 2040; y++) FREE.add(y);         // years
[0.5, 1.5, 2.5, 0.25, 0.75, 1000, 10000, 100000, 1e6].forEach((n) => FREE.add(n));

/**
 * @param answer      the final text
 * @param calls       the mock's call log, with `response` bodies
 * @param calcOutputs stdout of every calc.mjs invocation
 * @param skillText   the SKILL.md and references the run was told to follow
 */
export function fidelity(answer, calls = [], calcOutputs = [], skillText = '') {
  // Two sets, and the difference matters. `data` is what the run was actually
  // given or computed; `free` is what a sentence may contain without being a
  // measurement. Only `data` may be an OPERAND in a derivation: allowing the
  // integers 0-100 to take part means every data number carries a band of a
  // hundred around it, and then nothing is ever unexplained. That was the first
  // version of this file, and it passed an invented revenue figure.
  const data = new Set();
  for (const c of calls) if (c.response !== undefined) leaves(c.response, data);
  for (const c of calls) leaves(c.args, data);
  for (const out of calcOutputs) {
    try { leaves(JSON.parse(out), data); }
    catch { for (const m of String(out).matchAll(/-?\d+(?:\.\d+)?/g)) data.add(r(Number(m[0]))); }
  }
  // A property breakdown is pivoted BY UTM, and the skill is told to sum across
  // rows for a per-value count. That total is data the run was given, one
  // aggregation away — so add it, or a correct 118/900 ratio reads as invented
  // because 900 only ever existed as 540 + 360. In a real run the calculator
  // returns these totals and they arrive through calcOutputs anyway; this keeps
  // the check honest on a surface with no shell.
  for (const c of calls) {
    const rows = c.response && c.response.data;
    if (!Array.isArray(rows)) continue;
    const perValue = new Map();
    for (const row of rows) {
      if (!row || typeof row.values !== 'object' || row.values === null) continue;
      for (const [k, v] of Object.entries(row.values)) perValue.set(k, (perValue.get(k) || 0) + Number(v || 0));
    }
    for (const v of perValue.values()) data.add(r(v));
    if (perValue.size) data.add(r([...perValue.values()].reduce((a, b) => a + b, 0)));
  }

  const free = new Set(FREE);
  // Thresholds and sample floors the skill documents are legitimate to quote.
  for (const m of String(skillText).matchAll(/-?\d+(?:\.\d+)?/g)) free.add(r(Number(m[0])));
  const allowed = new Set([...data, ...free]);

  // A sorted array plus a nearest-value search, not a cartesian product: a
  // single page of raw events carries 1,500 numbers, and 1,500² pairs × six
  // operations is 13 million entries to build before the first check.
  const sorted = [...data].sort((a, b) => a - b);          // operands
  const quoted = [...allowed].sort((a, b) => a - b);      // may be quoted as-is
  const nearestIn = (arr, x) => {
    let lo = 0, hi = arr.length - 1, best = Infinity;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const d = Math.abs(arr[mid] - x);
      if (d < best) best = d;
      if (arr[mid] < x) lo = mid + 1; else hi = mid - 1;
    }
    return best;
  };
  const nearestVal = (arr, x) => {
    if (!arr.length) return undefined;
    let lo = 0, hi = arr.length - 1, best = arr[0];
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (Math.abs(arr[mid] - x) < Math.abs(best - x)) best = arr[mid];
      if (arr[mid] < x) lo = mid + 1; else hi = mid - 1;
    }
    return best;
  };

  /**
   * Is n one arithmetic step from two numbers the run was given?
   *
   * Solve for the second operand, take the nearest real data value, then
   * **recompute the relation and compare the result to n**. Checking the solved
   * operand instead is what let an invented 41,320 through: 0.02 / 41,320 is
   * 4.8e-7, the nearest data value is 0, and a tolerance taken from n's own
   * display precision (±0.5) swallowed the difference. Verifying forwards
   * cannot do that — 0.02 / 0 is not 41,320.
   */
  const derivable = (n, tol) => {
    for (const a of sorted) {
      const forms = [
        { solve: n - a, f: (b) => a + b },                  // n = a + b, a total
        { solve: a - n, f: (b) => a - b },                  // n = a - b, a difference
        { solve: a + n, f: (b) => b - a },                  // n = b - a
      ];
      if (a !== 0) forms.push({ solve: a / n, f: (b) => (b !== 0 ? a / b : NaN) });   // n = a / b, a rate
      // The percentage forms only where a percentage is plausible.
      if (n !== 0 && Math.abs(n) <= 1000) {
        forms.push({ solve: (a * 100) / n, f: (b) => (b !== 0 ? (a / b) * 100 : NaN) });
        forms.push({ solve: a / (n / 100 + 1), f: (b) => (b !== 0 ? ((a - b) / b) * 100 : NaN) });
      }
      for (const { solve, f } of forms) {
        if (!Number.isFinite(solve)) continue;
        const b = nearestVal(sorted, solve);
        if (b === undefined) continue;
        const got = f(b);
        if (Number.isFinite(got) && Math.abs(got - n) <= tol) return true;
      }
    }
    return false;
  };

  // Strip quoted strings, fenced code and inline code: a quoted hostile value
  // is data being reported, and a snippet is not a claim about the site.
  const prose = String(answer)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/"[^"\n]*"/g, ' ')
    .replace(/“[^”\n]*”/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')                  // clock times
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')              // dates
    .replace(/\b\d+h ?\d*m?\b/gi, ' ');                  // elapsed "4h 40m"

  const unexplained = [];
  const seen = new Set();
  // Unsigned, and never preceded by a word character or a hyphen: `SKU-1007`
  // is an identifier, not the number -1007, and an unguarded pattern read it
  // as one. Thousands separators are commas and the narrow or no-break spaces
  // a model reaches for — never a plain space, which merged two table cells
  // into "10014800". Both were live false positives in product-friction's
  // golden output, and a false positive here would be the thirteenth in this
  // repo to fail a correct answer.
  for (const m of prose.matchAll(/(?<![\w-])\d[\d.,  ]*\d|(?<![\w-])\d/g)) {
    const raw = m[0].trim();
    const n = Number(raw.replace(/[,  ]/g, ''));
    if (!Number.isFinite(n) || seen.has(n)) continue;
    seen.add(n);
    // Tolerance: a rounded figure ("17.9k", "2.35%") must match what it rounds
    // from. Scale the window to the precision the answer chose to show.
    const decimals = (raw.split('.')[1] || '').length;
    const tol = Math.max(Math.abs(n) * 1e-9, 0.5 * Math.pow(10, -decimals));
    if (nearestIn(quoted, n) <= tol) continue; // given outright, or a threshold
    if (derivable(n, tol)) continue;          // one step from two given numbers
    unexplained.push(n);
  }
  return unexplained;
}
