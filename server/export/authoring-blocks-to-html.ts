/**
 * Export blocks → print HTML, for the PDF branch of the authoring export.
 *
 * Extracted for the same reason as the DOCX renderer beside it: the PDF branch
 * needs a browser engine to run, so while this lived inline in the route there
 * was no way to assert what it emitted, and the PDF quietly lost the same table
 * structure the DOCX did.
 *
 * Both renderers consume the same `ContentBlock[]`, so the two formats cannot
 * disagree about what the filed document contains — a property this module's
 * tests assert rather than assume.
 *
 * Every text node is escaped here and the emitted structure is a fixed
 * whitelist. Stored markup never reaches the renderer raw: an earlier version
 * escaped the whole string and printed editor HTML as literal tags in a filed
 * PDF, and the version before that passed it through.
 */
import type { ContentBlock, InlineRun } from './authoring-section-content.js';

export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(runs: InlineRun[]): string {
  return runs
    .map((r) => {
      let t = escapeHtml(r.text);
      if (r.superScript) t = `<sup>${t}</sup>`;
      if (r.subScript) t = `<sub>${t}</sub>`;
      if (r.bold) t = `<b>${t}</b>`;
      if (r.italics) t = `<i>${t}</i>`;
      /* An unresolved suggestion exports AS REDLINE. Settling it silently at
         export time would fabricate a decision nobody made. */
      if (r.suggestion === 'insertion') return `<ins>${t}</ins>`;
      if (r.suggestion === 'deletion') return `<del>${t}</del>`;
      if (r.underline) t = `<u>${t}</u>`;
      if (r.strike) t = `<s>${t}</s>`;
      return t;
    })
    .join('');
}

function tableHtml(b: ContentBlock): string {
  const rows = (b.rows ?? [])
    .map(
      (row) =>
        `<tr>${row
          .map((c) => {
            const tag = c.header ? 'th' : 'td';
            const cs = c.colSpan ? ` colspan="${c.colSpan}"` : '';
            const rs = c.rowSpan ? ` rowspan="${c.rowSpan}"` : '';
            return `<${tag}${cs}${rs}>${inline(c.runs)}</${tag}>`;
          })
          .join('')}</tr>`
    )
    .join('');
  const caption = b.caption ? `<caption>${escapeHtml(b.caption)}</caption>` : '';
  return `<table>${caption}${rows}</table>`;
}

/**
 * Render blocks to print HTML. Consecutive list items of the same kind become
 * one real list, so a numbered procedure keeps its numbering instead of
 * becoming a run of bulleted paragraphs.
 */
export function blocksToHtml(blocks: ContentBlock[]): string {
  const parts: string[] = [];
  let openList: 'ol' | 'ul' | null = null;
  const closeList = () => {
    if (openList) parts.push(`</${openList}>`);
    openList = null;
  };

  for (const b of blocks) {
    if (b.kind === 'list-item') {
      const want: 'ol' | 'ul' = b.ordered ? 'ol' : 'ul';
      if (openList !== want) {
        closeList();
        parts.push(`<${want}>`);
        openList = want;
      }
      parts.push(`<li>${inline(b.runs)}</li>`);
      continue;
    }
    closeList();
    if (b.kind === 'table') parts.push(tableHtml(b));
    else if (b.kind === 'heading') parts.push(`<h3>${inline(b.runs)}</h3>`);
    else parts.push(`<p>${inline(b.runs)}</p>`);
  }
  closeList();
  return parts.join('');
}

/** Print styles for the emitted structure. Kept with the markup it styles. */
export const PRINT_STYLES = `
  ul, ol { margin: 0.4em 0 0.4em 1.4em; padding: 0; }
  li { margin: 0.15em 0; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; page-break-inside: auto; }
  th, td { border: 1px solid #bfbfbf; padding: 5px 7px; text-align: left; vertical-align: top; font-size: 10.5pt; }
  th { background: #f2f4f5; font-weight: bold; }
  tr { page-break-inside: avoid; }
  caption { caption-side: bottom; font-style: italic; font-size: 10pt; padding-top: 4px; }
`;
