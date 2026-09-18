// Incidents, so a firing rule notifies once and not every five minutes.
//
// One entry per incident, not per evaluation. A rule that fired an hour ago and
// is still failing is "still open since", not a new incident. It reopens only
// after it has recovered and broken again, and never inside the cooldown.
//
// State lives in a file when a path is given AND that path proves writable (a
// Railway volume), otherwise in memory. Memory is honest about its cost: on a restart an open incident is
// forgotten and the next evaluation notifies again. That is a duplicate
// notification, not a missed one, which is the right way round.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export function store(path) {
  let state = { incidents: {} };
  if (path && existsSync(path)) {
    try { state = JSON.parse(readFileSync(path, 'utf8')); }
    catch { /* a corrupt file must not stop the watch; start clean */ }
  }
  state.incidents ||= {};
  state.due ||= {};

  // Prove the path is writable instead of assuming it. `persistent` used to mean
  // "a path was given", so a volume the process cannot write made every save
  // fail inside a silent catch: the startup warning never appeared, the state
  // file was never written, and each restart re-notified an incident that was
  // still open. That is the one failure this file exists to prevent, and it
  // reached production on 2026-09-18.
  let writable = false;
  let unwritableBecause = null;
  if (path) {
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(state, null, 2));
      writable = true;
    } catch (e) { unwritableBecause = e.message; }
  }

  let warned = false;
  const persist = () => {
    if (!path || !writable) return;
    try {
      writeFileSync(path, JSON.stringify(state, null, 2));
    } catch (e) {
      // A disk that goes away mid-run degrades to memory, but says so once.
      writable = false;
      unwritableBecause = e.message;
      if (!warned) {
        warned = true;
        console.log(`${new Date().toISOString()} WARNING: writing ${path} failed, incidents are in memory from now on and a restart will re-notify: ${e.message}`);
      }
    }
  };

  return {
    get persistent() { return writable; },
    get unwritableBecause() { return unwritableBecause; },

    /** The open incident for a rule, or null. */
    open(key) {
      const i = state.incidents[key];
      return i && !i.resolved_at ? i : null;
    },

    /** Record a new incident. Returns it, or null when one is already open. */
    start(key, { at, headline, evidence }) {
      const existing = this.open(key);
      if (existing) {
        existing.last_seen_at = at;
        existing.evaluations = (existing.evaluations || 1) + 1;
        persist();
        return null;
      }
      const incident = { key, started_at: at, last_seen_at: at, headline, evidence, evaluations: 1, resolved_at: null };
      state.incidents[key] = incident;
      persist();
      return incident;
    },

    /** Close an open incident. Returns it when it was open, else null. */
    resolve(key, at) {
      const i = this.open(key);
      if (!i) return null;
      i.resolved_at = at;
      persist();
      return i;
    },

    /**
     * Is the rule inside its cooldown?
     *
     * Cooldown means "do not REOPEN before N minutes after closing", not "do
     * not evaluate": a rule that recovered and broke again two minutes later is
     * usually the same incident flapping.
     */
    inCooldown(key, now, minutes) {
      const i = state.incidents[key];
      if (!i?.resolved_at || !minutes) return false;
      return (now - new Date(i.resolved_at)) / 60000 < minutes;
    },

    /**
      * When a rule is next worth reading, and when it was last read.
      *
      * This lives here rather than in a module variable so that a pass is a
      * function of its arguments: with the schedule in module scope, two runs
      * in one process shared it, and the second silently checked nothing.
      */
    due(key) { const t = state.due[key]; return t ? new Date(t) : null; },
    setDue(key, date) { state.due[key] = date.toISOString(); persist(); },

    /** For the heartbeat line, and for the noise check. */
    summary() {
      const all = Object.values(state.incidents);
      return { open: all.filter((i) => !i.resolved_at).length, total: all.length };
    },

    /**
     * Incidents a rule opened in the last `days`. A rule that opens more than
     * two a week for three weeks is noise, and the creator should be told with
     * the figure rather than left to mute it.
     */
    recentCount(key, now, days = 7) {
      const i = state.incidents[key];
      if (!i) return 0;
      const hist = i.history || [];
      const cutoff = now - days * 86400000;
      return hist.filter((t) => new Date(t) >= cutoff).length + (i.started_at && new Date(i.started_at) >= cutoff ? 1 : 0);
    },

    /** Keep a short history so the noise check has something to count. */
    archive(key, at) {
      const i = state.incidents[key];
      if (!i) return;
      i.history = [...(i.history || []), at].slice(-20);
      persist();
    },
  };
}
