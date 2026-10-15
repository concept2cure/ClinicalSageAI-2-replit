/**
 * Typeset blocks: the document model typeset-leaf-pdf.ts lays out, and the
 * exact reading of a composed Module 3 section into it.
 *
 * ── Why not a markdown parser ────────────────────────────────────────────────
 * A composed section is stored in ONE format, written by ONE function,
 * module3Composer.renderComposedSectionMarkdown:
 *
 *     ## <label>\n\n<narrative>[\n\n### <table title>\n\n| h | h |\n| --- | --- |\n| c | c |]*
 *
 * The narrative and every cell are RECORDED TEXT, not markdown: a specification
 * limit "TAMC NMT 1*10^3 CFU/g", a process step "Charge 2*3 kg", a line that
 * starts "1." or "#". The first version of this module read the content with a
 * general markdown lexer, and emphasis took the asterisks: "1*10^3 CFU/g" was
 * filed as "110^3 CFU/g" (found by the 2026-10-04 discovery map,
 * typeset-emphasis-alters-recorded-values). Escaping the recorded text on the
 * way in would change the stored bytes — and with them every signed snapshot.
 * So the reading is the exact inverse of the one writer instead: the heading,
 * the table blocks the writer appends, and everything else literal. Only the
 * one escape the writer makes (`\|` inside a cell) is undone.
 */

export type TypesetBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'table'; headers: string[]; rows: string[][] };

const HEADING = /^## ([^\n]*)(\n\n|$)/;
const SEPARATOR = /^\|( --- \|)+$/;

/** One table row as the writer emits it: "| a | b \| c |" → ["a", "b | c"]. */
function cells(line: string): string[] {
  const inner = line.replace(/^\| ?/, '').replace(/ ?\|$/, '');
  // The writer joins cells with ' | ' and escapes a pipe inside a value as
  // '\\|', so a delimiter is always space-pipe-space and an escaped pipe never is.
  return inner.split(' | ').map(c => c.replace(/\\\|/g, '|').trim());
}

/**
 * The table blocks a composed section ends with, or null when `tail` is not
 * exactly a sequence of them. `tail` starts at a "\n\n### " the writer put
 * there.
 */
function readTables(tail: string): TypesetBlock[] | null {
  const blocks: TypesetBlock[] = [];
  let rest = tail;
  while (rest.length > 0) {
    const m = /^\n\n### ([^\n]*)\n\n(\|[^\n]*)\n(\|[^\n]*)((?:\n\|[^\n]*)*)/.exec(rest);
    if (!m || !SEPARATOR.test(m[3])) return null;
    const headers = cells(m[2]);
    const rows = m[4] ? m[4].slice(1).split('\n').map(cells) : [];
    if (rows.some(r => r.length !== headers.length)) return null;
    blocks.push({ kind: 'heading', level: 3, text: m[1].replace(/\\\|/g, '|') });
    blocks.push({ kind: 'table', headers, rows });
    rest = rest.slice(m[0].length);
    // The writer emits `${header}\n${separator}\n${rows}`, so a table with no
    // rows leaves one newline after its separator.
    if (rows.length === 0 && rest.startsWith('\n')) rest = rest.slice(1);
  }
  return blocks;
}

/** Recorded text as paragraphs: blank lines separate them, every character kept. */
export function literalParagraphs(text: string): TypesetBlock[] {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map(p => p.replace(/^\n+|\n+$/g, ''))
    .filter(p => p.trim().length > 0)
    .map(p => ({ kind: 'paragraph' as const, text: p }));
}

/**
 * A composed section, as stored, to typeset blocks: its heading, its narrative
 * as literal paragraphs, then each appended table under its title. Content not
 * in the writer's format is returned whole as literal paragraphs — never
 * reinterpreted.
 */
export function composedSectionToBlocks(content: string): TypesetBlock[] {
  const text = String(content ?? '');
  const blocks: TypesetBlock[] = [];
  let body = text;
  const head = HEADING.exec(text);
  if (head) {
    blocks.push({ kind: 'heading', level: 2, text: head[1] });
    body = text.slice(head[0].length);
  }
  // The narrative ends where the writer's table blocks begin: the first
  // "\n\n### " from which the rest reads exactly as tables to the end.
  for (let at = body.indexOf('\n\n### '); at !== -1; at = body.indexOf('\n\n### ', at + 1)) {
    const tables = readTables(body.slice(at));
    if (tables) return [...blocks, ...literalParagraphs(body.slice(0, at)), ...tables];
  }
  return [...blocks, ...literalParagraphs(body)];
}
