/**
 * Extract every string literal (template, single, double quoted) from JS/TS
 * source by walking the text with quote-type, escape, `${}`-interpolation,
 * and comment awareness.
 *
 * Exists because regex-based extraction pairs quote characters without
 * tracking JS context: a template literal containing '…' SQL string literals
 * gets cut at the first embedded quote — hiding both tenant filters (false
 * positives) and table references (false negatives) that follow it, and
 * cascading the mispairing through the rest of the file. The
 * tenant-isolation gate depends on this being right.
 *
 * Known approximations (acceptable for the gate's purposes):
 * - Regex literals are not tokenized; a quote inside /…/ can mispair.
 * - Nested template literals inside `${}` interpolations are treated as
 *   part of the outer literal.
 */
export function extractStringLiterals(text) {
  const out = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      const start = i;
      let depth = 0; // ${ … } nesting inside template literals
      i++;
      while (i < n) {
        const ch = text[i];
        if (ch === '\\') { i += 2; continue; }
        if (quote === '`' && ch === '$' && text[i + 1] === '{') { depth++; i += 2; continue; }
        if (quote === '`' && depth > 0 && ch === '}') { depth--; i++; continue; }
        if (ch === quote && depth === 0) { i++; break; }
        if (quote !== '`' && ch === '\n') break; // unterminated quote — stop the bleed at EOL
        i++;
      }
      out.push({ start, value: text.slice(start, i) });
      continue;
    }
    i++;
  }
  return out;
}
