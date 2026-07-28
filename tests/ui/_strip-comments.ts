/**
 * Blank out comments in JS/TS/CSS source before scanning it.
 *
 * Every source-scanning guard in this repo needs this, and gets it wrong the
 * same way if it improvises: the guard matches the comment that documents the
 * defect it is guarding against, and fails on a file that is actually correct.
 * That happened four separate times while these tests were being written, which
 * is why there is now exactly one implementation.
 *
 * It is a state machine rather than a pair of regexes because regex chaining is
 * provably wrong here, not merely inelegant:
 *
 *   client/src/App.jsx line 15 is a `//` comment documenting the route
 *   `/concept2cure/*`. Stripping block comments first sees that `/*`, opens a
 *   comment, and closes it at the next terminator 42 lines later — swallowing
 *   every import in the file. Stripping line comments first instead leaves a
 *   `//` inside a block comment to orphan its opener. Neither order is safe.
 *
 * Comments are blanked in place rather than removed, so byte offsets and line
 * numbers remain valid for callers that report `file:line`.
 */
export function stripComments(src: string, isCss = false): string {
  const out = src.split('');
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (!isCss && c === '/' && next === '/') {
      const nl = src.indexOf('\n', i);
      const stop = nl === -1 ? src.length : nl;
      blank(i, stop);
      i = stop;
    } else if (c === '"' || c === "'" || c === '`') {
      // Skip string bodies so a `//` or `/*` inside one is never treated as a
      // comment. Escape-aware; template-literal interpolation is not descended
      // into, which is safe for every current caller.
      i++;
      while (i < src.length && src[i] !== c) i += src[i] === '\\' ? 2 : 1;
      i++;
    } else {
      i++;
    }
  }
  return out.join('');
}
