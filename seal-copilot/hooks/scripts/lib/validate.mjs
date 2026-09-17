// A very small JSON Schema subset, with no dependencies.
//
// Why not a library: the plugin ships no package.json and installs no modules,
// and a hook that runs `npm install` is not a hook. Why at all: the state
// contract lived in prose, and in certification 9 — thirty of thirty-one cases
// green — twelve skills wrote twelve different profiles. None used `site_name`
// or `events`. Prose cannot hold a contract that a model has to keep.
//
// Supported: type (one or a list), required, properties, additionalProperties
// (false or a schema), enum, pattern, minLength, maxLength, minimum, maximum,
// items, minItems, anyOf, and two keywords of our own:
//
//   x-synonyms      { wrongName: "correctName" } — names the field the writer
//                   probably meant, which is the whole point of the error
//                   message. A model that reads 'unknown field "name"' guesses
//                   again; one that reads 'use "site_name"' fixes it.
//   x-requiredWhen  [{ when: { field: [values] }, require: [...],
//                      requireNonNull: [...] }] — conditional requirements, so
//                   a `silence` rule must carry active_hours while a
//                   `threshold` rule need not.

const typeOf = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
};
const matchesType = (v, t) => {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  if (t === 'object') return actual === 'object';
  return actual === t;
};
const show = (v) => {
  const s = typeof v === 'string' ? JSON.stringify(v) : Array.isArray(v) ? 'a list' : v === null ? 'null' : typeof v === 'object' ? 'an object' : String(v);
  return s.length > 40 ? s.slice(0, 37) + '…' : s;
};

/**
 * @returns {string[]} human-readable errors; empty means valid.
 */
export function validate(value, schema, path = '') {
  const errors = [];
  const at = path || 'the document';

  if (schema.anyOf) {
    const results = schema.anyOf.map((branch) => ({ branch, errs: validate(value, branch, path) }));
    if (results.some((r) => !r.errs.length)) return errors;          // one branch fits

    /*
     * Report the branch the writer plainly meant, not the shortest one.
     *
     * Shortest-wins is wrong the moment a union has a `null` branch: an object
     * that is nearly right produces several useful errors, while the null
     * branch produces exactly one useless one. Every malformed expectation
     * curve was reported as "must be null, got object" — true, unhelpful, and
     * it hid the actual mistake.
     *
     * So prefer branches whose declared type matches what was written, and only
     * fall back to all of them when none does.
     */
    const typeFits = (branch) => {
      if (!branch.type) return true;
      const types = Array.isArray(branch.type) ? branch.type : [branch.type];
      return types.some((t) => matchesType(value, t));
    };
    const candidates = results.filter((r) => typeFits(r.branch));
    const pool = candidates.length ? candidates : results;
    errors.push(...pool.sort((a, b) => a.errs.length - b.errs.length)[0].errs);
    return errors;
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${at} must be ${types.join(' or ')}, got ${typeOf(value)} (${show(value)})`);
      return errors;                      // every later check would be noise
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${at} must be one of ${schema.enum.map(show).join(', ')}, got ${show(value)}`);
  }
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${at} does not look right: ${show(value)}${schema.patternHint ? ` — ${schema.patternHint}` : ''}`);
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at} must not be empty`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${at} is ${value.length} characters, the limit is ${schema.maxLength}`);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at} must be at least ${schema.minimum}, got ${value}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at} must be at most ${schema.maximum}, got ${value}`);
  }

  if (typeOf(value) === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${at} must have at least ${schema.minItems} item(s), got ${value.length}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${at} must have at most ${schema.maxItems} item(s), got ${value.length}`);
    }
    if (schema.items) value.forEach((v, i) => errors.push(...validate(v, schema.items, `${path}[${i}]`)));
  }

  if (typeOf(value) === 'object') {
    const props = schema.properties || {};
    const syn = schema['x-synonyms'] || {};
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push(`${path ? path + '.' : ''}${key} is required and missing`);
    }
    for (const [key, v] of Object.entries(value)) {
      if (props[key]) { errors.push(...validate(v, props[key], `${path ? path + '.' : ''}${key}`)); continue; }
      if (schema.additionalProperties === false) {
        errors.push(syn[key]
          ? `${path ? path + '.' : ''}${key} is not a field in this contract — write ${syn[key]} instead`
          : `${path ? path + '.' : ''}${key} is not a field in this contract${props.extra || schema.properties?.extra ? ' — put site-specific extras under "extra"' : ''}`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        errors.push(...validate(v, schema.additionalProperties, `${path ? path + '.' : ''}${key}`));
      }
    }
    for (const rule of schema['x-requiredWhen'] || []) {
      const applies = Object.entries(rule.when).every(([f, vals]) => vals.includes(value[f]));
      if (!applies) continue;
      for (const key of rule.require || []) {
        if (!(key in value)) errors.push(`${path ? path + '.' : ''}${key} is required when ${Object.entries(rule.when).map(([f, v]) => `${f} is ${v.map(show).join('/')}`).join(' and ')}`);
      }
      for (const key of rule.requireNonNull || []) {
        if (value[key] === undefined || value[key] === null) {
          errors.push(`${path ? path + '.' : ''}${key} must be filled in when ${Object.entries(rule.when).map(([f, v]) => `${f} is ${v.map(show).join('/')}`).join(' and ')} — a check that has to invent its own expectation is the guessed threshold this plugin refuses to use`);
        }
      }
    }
  }
  return errors;
}

/**
 * Validate a whole file's text. `.jsonl` is validated line by line, because one
 * bad line must name its own number: a run log is appended to for months.
 */
export function validateFile(basename, text, schemas) {
  const schema = schemas[basename];
  if (!schema) return { known: false, errors: [] };
  const errors = [];
  if (basename.endsWith('.jsonl')) {
    text.split('\n').forEach((line, i) => {
      if (!line.trim()) return;
      let parsed;
      try { parsed = JSON.parse(line); }
      catch { errors.push(`line ${i + 1} is not valid JSON — one object per line, no trailing commas`); return; }
      for (const e of validate(parsed, schema, '')) errors.push(`line ${i + 1}: ${e}`);
    });
  } else {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { return { known: true, errors: [`not valid JSON: ${e.message}`] }; }
    errors.push(...validate(parsed, schema, ''));
  }
  return { known: true, errors };
}
