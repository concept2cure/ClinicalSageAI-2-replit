/**
 * Blank the comments out of JS/TS source, keeping every line where it was and
 * every string literal as written.
 *
 * Gates that scan code for a pattern strip comments first, so that prose
 * naming the pattern is not a violation. The regex most of them used,
 * /\/\*[\s\S]*?\*\//g, does not know about strings: a literal such as
 * 'https://*.neon.tech' or '/api/advisory/*' opens a "comment" that runs to
 * the next real `*` `/`, and the code in between is never scanned. On
 * 2026-09-23 that blanked 859 lines across 10 server files for
 * ci:client-ip-single-source, the security middleware among them. A
 * forwarding-header read added there would have passed the gate.
 *
 * This walks the text instead: quote-, template-, escape- and regex-aware.
 *
 * Regex literals (2026-10-05). A `/` starts a regex literal when the token
 * before it cannot end an expression: start of input, an operator or opening
 * punctuation, or a keyword such as `return` (the rule every JS tokenizer
 * without a parser uses). The literal runs to the next unescaped `/` outside a
 * character class, on the same line; if the line ends first, the `/` was
 * division after all and is read as one character. Before this, a quote inside
 * a regex — /['"`]/ — opened a "string" that mis-paired every quote after it,
 * so a later real string holding a `/*` read as a comment and the code behind
 * it was blanked. Measured against the TypeScript parser over every tracked
 * JS/TS file (8,186), that hid code on 10 lines in 3 files; with regex
 * literals recognised it hides none.
 *
 * Remaining approximation: `)`, `]` and an identifier are always read as
 * ending an expression, so a regex directly after `if (…)` is read as
 * division; `}` is read as ending a block. When that misreads, quotes inside
 * the regex can still mis-pair.
 *
 * Options:
 *   lineComments: 'blank' (default) replaces a // comment with spaces, so
 *     columns stay true. 'drop' deletes it to the end of its line, so a gate
 *     that measures a character window does not spend the window on a note.
 *     Line numbers are kept either way.
 */
export function stripComments(src, { lineComments = 'blank' } = {}) {
  const out = src.split('');
  const n = src.length;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  const drop = (from, to) => {
    for (let k = from; k < to; k++) out[k] = '';
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
      (lineComments === 'drop' ? drop : blank)(i, end);
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
    if (c === '/' && regexMayStart(src, i)) {
      const end = skipRegex(src, i);
      if (end !== -1) {
        i = end;
        continue;
      }
    }
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(src, i, c);
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Keywords after which a `/` begins a regex literal, not a division. */
const REGEX_AFTER_WORD = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await',
]);
/** Punctuation after which a `/` begins a regex literal. */
const REGEX_AFTER_PUNCT = new Set('(,=:[!&|?{};+-*%~^<>'.split(''));

/** Whether the `/` at `at` can open a regex literal, judged by the token before it. */
function regexMayStart(src, at) {
  let k = at - 1;
  while (k >= 0 && /\s/.test(src[k])) k--;
  if (k < 0) return true;
  const prev = src[k];
  // JSX closing tags (`</div>`) put `<` right before the slash: not a regex.
  if (prev === '<' && k === at - 1) return false;
  if (REGEX_AFTER_PUNCT.has(prev)) return true;
  if (/[A-Za-z_$]/.test(prev)) {
    let s = k;
    while (s > 0 && /[A-Za-z0-9_$]/.test(src[s - 1])) s--;
    return REGEX_AFTER_WORD.has(src.slice(s, k + 1));
  }
  return false;
}

/** Index just past the regex literal (and its flags) opening at `start`, or -1 if none closes on this line. */
function skipRegex(src, start) {
  const n = src.length;
  let i = start + 1;
  let inClass = false;
  if (src[i] === '/' || src[i] === '*') return -1;
  while (i < n) {
    const ch = src[i];
    if (ch === '\n' || ch === '\r') return -1;
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
    } else if (ch === '[') {
      inClass = true;
    } else if (ch === '/') {
      i++;
      while (i < n && /[a-z]/i.test(src[i])) i++;
      return i;
    }
    i++;
  }
  return -1;
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
