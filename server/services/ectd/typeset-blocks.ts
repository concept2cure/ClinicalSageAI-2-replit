/**
 * Typeset blocks: the document model typeset-leaf-pdf.ts lays out, and the
 * reading of stored markdown into it. Split from the layout so each half stays
 * readable; see typeset-leaf-pdf.ts for why a Module 3 leaf is typeset at all.
 */

import { marked, type Token, type Tokens } from 'marked';
import { decodeHtmlEntities } from '../../export/decode-html-entities.js';

export type TypesetBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'preformatted'; text: string };

// ── Markdown → blocks ─────────────────────────────────────────────────────────

/**
 * The text a run of inline tokens reads as. Emphasis keeps its words; inline
 * HTML keeps its raw characters, because in CMC prose "<LOQ" and "<0.05%" are
 * values, not tags; entities are decoded once, as a browser would.
 */
function inlineText(tokens: Token[] | undefined, fallback: string): string {
  if (!tokens || tokens.length === 0) return decodeHtmlEntities(fallback);
  return tokens
    .map(t => {
      switch (t.type) {
        case 'html':
          return (t as Tokens.HTML).raw;
        case 'br':
          return '\n';
        case 'escape':
          return (t as Tokens.Escape).text;
        case 'codespan':
          return (t as Tokens.Codespan).text;
        case 'image': {
          const img = t as Tokens.Image;
          return `[Figure: ${img.text || img.href}]`;
        }
        default: {
          const nested = (t as { tokens?: Token[] }).tokens;
          const text = (t as { text?: string }).text ?? (t as { raw: string }).raw;
          return nested && nested.length ? inlineText(nested, text) : decodeHtmlEntities(text);
        }
      }
    })
    .join('');
}

function listItemLines(item: Tokens.ListItem, depth: number): string[] {
  const lines: string[] = [];
  const own: string[] = [];
  for (const t of item.tokens ?? []) {
    if (t.type === 'list') {
      const nested = t as Tokens.List;
      nested.items.forEach((child, i) => {
        const marker = nested.ordered ? `${(Number(nested.start) || 1) + i}.` : '-';
        const [first, ...rest] = listItemLines(child, depth + 1);
        lines.push(`${'  '.repeat(depth + 1)}${marker} ${first ?? ''}`, ...rest);
      });
    } else {
      own.push(
        inlineText((t as { tokens?: Token[] }).tokens, (t as { text?: string }).text ?? t.raw)
      );
    }
  }
  return [own.join(' ').trim(), ...lines];
}

function tokensToBlocks(tokens: Token[]): TypesetBlock[] {
  const blocks: TypesetBlock[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'space':
      case 'def':
      case 'hr':
        break;
      case 'heading': {
        const h = t as Tokens.Heading;
        blocks.push({ kind: 'heading', level: h.depth, text: inlineText(h.tokens, h.text) });
        break;
      }
      case 'paragraph': {
        const p = t as Tokens.Paragraph;
        blocks.push({ kind: 'paragraph', text: inlineText(p.tokens, p.text) });
        break;
      }
      case 'text': {
        const x = t as Tokens.Text;
        blocks.push({ kind: 'paragraph', text: inlineText(x.tokens, x.text) });
        break;
      }
      case 'list': {
        const l = t as Tokens.List;
        blocks.push({
          kind: 'list',
          ordered: l.ordered,
          start: Number(l.start) || 1,
          items: l.items.map(item => listItemLines(item, 0).join('\n')),
        });
        break;
      }
      case 'table': {
        const tb = t as Tokens.Table;
        blocks.push({
          kind: 'table',
          headers: tb.header.map(c => inlineText(c.tokens, c.text)),
          rows: tb.rows.map(r => r.map(c => inlineText(c.tokens, c.text))),
        });
        break;
      }
      case 'blockquote':
        blocks.push(...tokensToBlocks((t as Tokens.Blockquote).tokens));
        break;
      case 'code':
        blocks.push({ kind: 'preformatted', text: (t as Tokens.Code).text });
        break;
      case 'html':
        // A block of raw HTML is kept as the characters it is, never dropped.
        blocks.push({ kind: 'paragraph', text: (t as Tokens.HTML).raw.trim() });
        break;
      default:
        blocks.push({ kind: 'paragraph', text: decodeHtmlEntities(t.raw.trim()) });
    }
  }
  return blocks.filter(b => b.kind !== 'paragraph' || b.text.trim().length > 0);
}

/** Markdown (GFM tables) to typeset blocks. Pure and deterministic. */
export function markdownToTypesetBlocks(markdown: string): TypesetBlock[] {
  return tokensToBlocks(marked.lexer(markdown ?? '', { gfm: true }));
}
