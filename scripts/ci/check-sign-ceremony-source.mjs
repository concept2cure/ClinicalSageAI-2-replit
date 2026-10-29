/**
 * Reading TypeScript source as text, for the sign-ceremony gate
 * (check-sign-ceremony.mjs) and its status-act scanner
 * (check-sign-ceremony-status-acts.mjs). Moved here unchanged from the gate on
 * 2026-10-29 so both can use one copy without importing each other;
 * literalEnd is new (D5, status acts).
 *
 * @module scripts/ci/check-sign-ceremony-source
 */

/**
 * Blank out comments, keeping string literals and newlines. A quoted or
 * commented occurrence is documentation; a string literal is how `'sign'` is
 * passed, so strings must survive.
 */
export function stripComments(src) {
  let out = '';
  let i = 0;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += blank(src.slice(i, stop));
      i = stop;
      continue;
    }
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
      continue;
    }
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) { j += 1; break; }
        j += 1;
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Index of the quote that closes the string literal opening at `i`. */
export function skipString(s, i) {
  const q = s[i];
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === '\\') { j += 2; continue; }
    if (s[j] === q) return j;
    j += 1;
  }
  return j;
}

/** The argument text of the call whose `(` is at `open`, balanced; parentheses inside strings do not count. */
export function callSpan(code, open) {
  let depth = 0;
  for (let j = open; j < code.length; j++) {
    const ch = code[j];
    if (ch === '"' || ch === "'" || ch === '`') { j = skipString(code, j); continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return code.slice(open, j + 1);
    }
  }
  return code.slice(open);
}

/** A call's arguments (span includes its parens), split at top-level commas. */
export function topLevelArgs(span) {
  const inner = span.slice(1, span.endsWith(')') ? -1 : undefined);
  const args = [];
  let depth = 0;
  let start = 0;
  for (let j = 0; j < inner.length; j++) {
    const ch = inner[j];
    if (ch === '"' || ch === "'" || ch === '`') { j = skipString(inner, j); continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) { args.push(inner.slice(start, j)); start = j + 1; }
  }
  args.push(inner.slice(start));
  return args.map((a) => a.trim());
}

/** Index of the character that closes the string literal opening at `i`; a template's `${…}` is skipped whole, nested strings and all. */
export function literalEnd(s, i) {
  const q = s[i];
  let j = i + 1;
  while (j < s.length) {
    const ch = s[j];
    if (ch === '\\') { j += 2; continue; }
    if (ch === q) return j;
    if (q === '`' && ch === '$' && s[j + 1] === '{') {
      let depth = 1;
      j += 2;
      while (j < s.length && depth > 0) {
        const c = s[j];
        if (c === '"' || c === "'" || c === '`') { j = literalEnd(s, j) + 1; continue; }
        if (c === '{') depth++;
        else if (c === '}') depth--;
        j += 1;
      }
      continue;
    }
    j += 1;
  }
  return j;
}
