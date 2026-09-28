/**
 * Blank the comments out of JS/TS source, keeping every line where it was and
 * every string literal as written.
 *
 * Gates that scan code for a pattern strip comments first, so that prose
 * naming the pattern is not a violation. The regex most of them use,
 * /\/\*[\s\S]*?\*\//g, does not know about strings: a literal such as
 * 'https://*.neon.tech' or '/api/advisory/*' opens a "comment" that runs to
 * the next real `*` `/`, and the code in between is never scanned. On
 * 2026-09-23 that blanked 859 lines across 10 server files for
 * ci:client-ip-single-source, the security middleware among them. A
 * forwarding-header read added there would have passed the gate.
 *
 * This walks the text instead: quote-, template- and escape-aware.
 *
 * Approximation: regex literals are not tokenized. A quote inside /…/ can
 * open a string that is not one. The failure is in the safe direction: a
 * comment inside the mis-paired span is scanned as code, so the result can
 * be a false positive, never a hidden violation. Characters after a
 * backslash are skipped everywhere, so `\/\/` inside a regex does not read
 * as a line comment.
 */
export function stripComments(src) {
  const out = src.split('');
  const n = src.length;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      const end = nl === -1 ? n : nl;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      const end = close === -1 ? n : close + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(src, i, c);
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Index just past the string literal that opens at `start`. */
function skipString(src, start, quote) {
  const n = src.length;
  let i = start + 1;
  let depth = 0; // `${ … }` nesting inside a template literal
  while (i < n) {
    const ch = src[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (quote === '`') {
      if (depth === 0 && ch === '`') return i + 1;
      if (ch === '$' && src[i + 1] === '{') {
        depth++;
        i += 2;
        continue;
      }
      if (depth > 0 && ch === '}') depth--;
      i++;
      continue;
    }
    if (ch === quote) return i + 1;
    // An unterminated single- or double-quoted literal ends at the line.
    if (ch === '\n') return i;
    i++;
  }
  return n;
}
