// Pure assertion logic, shared by the runner and the self-test.
export function assess(c, answer, calls) {
  const failures = [];
  const names = calls.map(x => x.tool);
  const rejected = calls.filter(x => x.rejected);
  for (const re of c.mustMatch || []) if (!re.test(answer)) failures.push(`missing ${re}`);
  for (const re of c.mustNotMatch || []) if (re.test(answer)) failures.push(`forbidden ${re}`);
  for (const t of c.mustCall || []) if (!names.includes(t)) failures.push(`never called ${t}`);
  for (const t of c.mustNotCall || []) if (names.includes(t)) failures.push(`should not have called ${t}`);
  if (c.maxCalls && calls.length > c.maxCalls) failures.push(`${calls.length} calls > budget ${c.maxCalls}`);
  if (rejected.length && !c.allowRejected)
    failures.push(`${rejected.length} invalid call(s): ${rejected.map(r => r.rejected).join(' | ')}`);
  if (!answer.trim()) failures.push('empty answer');
  return failures;
}
