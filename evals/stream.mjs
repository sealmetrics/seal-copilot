// Parses `claude -p --output-format stream-json` output. The final "result"
// event carries only the last assistant turn, so a skill that writes state
// after its report would leave "profile cached" as the answer. Concatenate
// every assistant text block instead.
export function parseStream(out) {
  const texts = []; let result = null, isError = false, sawStream = false, sessionId = null, sawResult = false;
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    sawStream = true;
    if (ev.session_id && !sessionId) sessionId = ev.session_id;
    if (ev.type === 'assistant') {
      for (const b of ev.message?.content || []) if (b.type === 'text' && b.text) texts.push(b.text);
    } else if (ev.type === 'result') {
      result = ev.result ?? null; isError = !!ev.is_error; sawResult = true;
    }
  }
  // sawResult must be returned: without it the runner's `truncated` flag reads
  // undefined, every attempt looks unfinished, and the suite silently retries
  // each case once — masking real failures behind the retry.
  if (!sawStream) return { text: out, result: null, isError: false, sessionId: null, sawResult: true };
  return { text: texts.length ? texts.join('\n\n') : (result || ''), result, isError, sessionId, sawResult };
}
