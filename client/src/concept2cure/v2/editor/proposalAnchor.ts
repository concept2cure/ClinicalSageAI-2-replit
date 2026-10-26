/** The existing proposal anchor resolver, extracted from suggestions.ts.
 * One lookup for replacements and additions; no editor state or text writer. */
import type { Node as PMNode, MarkType } from '@tiptap/pm/model';
import type { AuthoringRemedyEdit as ReplacementProposal } from '@shared/authoring/remedies';
import type { FindMatch } from './findReplace';

/** Whether `node`, inside `parent`, can take a mark of `type` — what addMark
 *  would silently skip otherwise. */
export function canCarry(parent: PMNode | null, node: PMNode, type: MarkType): boolean {
  if (parent && !parent.type.allowsMarkType(type)) return false;
  const mark = type.create();
  return Boolean(mark.isInSet(mark.addToSet(node.marks)));
}


/** Whitespace as the reader writes it: any run, NBSP included, is one space.
 *  A pipe is whitespace too, on both sides: the reader joins table cells with
 *  ` | `, and a literal pipe in the text compares equal either way. */
const comparable = (s: string): string => s.replace(/\|/g, ' ').replace(/\s+/g, ' ');

/** A line start's reader marker: a heading's hashes, a list item's bullet or
 *  number (indented when nested), a table caption's label. */
const READER_MARKER = /^\s*(?:#{1,6}\s+|[-*+]\s+|\d{1,9}[.)]\s+|Table:\s+)/;

/**
 * Context as the editor's text would read it: the reader's line-start
 * markers dropped. In a suffix the first line continues the quote's own
 * line — its start is content, not a marker — so it is kept as written. (In a
 * prefix the first line may be partial too; dropping what looks like a marker
 * there only shortens what has to match, never adds to it.)
 */
function withoutReaderMarkers(text: string, firstLineIsContent: boolean): string {
  return text
    .split(/\r?\n/)
    .map((line, i) => (i === 0 && firstLineIsContent ? line : line.replace(READER_MARKER, '')))
    .join('\n');
}

/** Whether the text around `m` carries the given prefix and suffix. Text
 *  inside pending suggestions is compared as plain text, where the reader
 *  labels it; context running through one does not fit, and is refused. */
function contextFits(doc: PMNode, m: FindMatch, prefix?: string, suffix?: string): boolean {
  // Each read both ways — markers read past, and as written — because a
  // paragraph's REAL text can start with what looks like one ('- 5 mg daily.',
  // '1. high'), and stripping it then made context that is literally there
  // fail to fit (2026-10-01, 2-fixes-round2.txt D5). Either reading fitting is
  // the text being there; neither fitting is still a refusal.
  if (prefix && prefix.trim()) {
    // Block boundaries and inline atoms read as whitespace, as they do in the
    // section text a reader is given.
    const before = comparable(doc.textBetween(0, m.from, ' ', ' ')).trimEnd();
    const fits = (p: string) => before.endsWith(comparable(p).trimEnd());
    if (!fits(withoutReaderMarkers(prefix, false)) && !fits(prefix)) return false;
  }
  if (suffix && suffix.trim()) {
    const after = comparable(doc.textBetween(m.to, doc.content.size, ' ', ' ')).trimStart();
    const fits = (s: string) => after.startsWith(comparable(s).trimStart());
    if (!fits(withoutReaderMarkers(suffix, true)) && !fits(suffix)) return false;
  }
  return true;
}

/** Whether any inline content in `m` is already a pending suggestion. */
function touchesSuggestion(doc: PMNode, m: FindMatch): boolean {
  const { insertion, deletion } = doc.type.schema.marks;
  let hit = false;
  doc.nodesBetween(m.from, m.to, (node) => {
    if (hit) return false;
    if (!node.isInline) return true;
    if (insertion.isInSet(node.marks) || deletion.isInSet(node.marks)) hit = true;
    return false;
  });
  return hit;
}

/** Stands in for a non-text inline node (a hard break, an inline atom): no
 *  quote contains it, so no match crosses one. */
const INLINE_ATOM = '\u0000';

/**
 * Every occurrence of `quote` in `doc`, overlapping ones included (for
 * counting, "aa" is in "aaa" twice). Matching is per textblock, over its text
 * with each whitespace run read as one space; each character keeps the
 * document range it stands for, so a match strikes exactly the characters —
 * the whole run of spaces — it read.
 */
function quoteMatches(doc: PMNode, quote: string): FindMatch[] {
  // Pipes stay pipes here: a quote is the words of one textblock, where a
  // pipe is content, never the reader's cell separator.
  const needle = quote.replace(/\s+/g, ' ');
  const out: FindMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const from: number[] = [];
    const to: number[] = [];
    let inSpace = false;
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (!child.isText) {
        text += INLINE_ATOM;
        from.push(start);
        to.push(start + child.nodeSize);
        inSpace = false;
        return;
      }
      const chars = child.text ?? '';
      for (let i = 0; i < chars.length; i++) {
        const space = /\s/.test(chars[i]);
        if (space && inSpace) {
          to[to.length - 1] = start + i + 1;
          continue;
        }
        text += space ? ' ' : chars[i];
        from.push(start + i);
        to.push(start + i + 1);
        inSpace = space;
      }
    });
    for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
      out.push({ from: from[at], to: to[at + needle.length - 1] });
    }
    return false;
  });
  return out;
}

/**
 * The one place `proposal` names, or why there is not exactly one.
 *
 * Occurrences that run into a pending suggestion are not counted: they cannot
 * be redlined (see overlaps-suggestion), so they cannot make a live occurrence
 * ambiguous either; when they are the only ones, that is the refusal. Given
 * context must fit: the one occurrence a contradicting prefix or suffix
 * "describes" is not the passage AnA read.
 */
export function locateProposal(
  doc: PMNode,
  proposal: ReplacementProposal,
): FindMatch | 'not-found' | 'ambiguous' | 'overlaps-suggestion' | 'unsupported-content' {
  if (proposal.operation === 'insert-empty') return emptySectionRange(doc);
  const quote = proposal.quote ?? '';
  if (!quote.trim()) return 'not-found';
  const matches = quoteMatches(doc, quote);
  if (matches.length === 0) return 'not-found';
  const live = matches.filter((m) => !touchesSuggestion(doc, m));
  if (live.length === 0) return 'overlaps-suggestion';
  const anchored = Boolean(proposal.prefix?.trim() || proposal.suffix?.trim());
  const fitting = anchored ? live.filter((m) => contextFits(doc, m, proposal.prefix, proposal.suffix)) : live;
  if (fitting.length === 0) return 'not-found';
  if (fitting.length !== 1) return 'ambiguous';
  return markableAnchor(doc, fitting[0]);
}


/** Emptiness is structural: no text, suggestion, atom or container is discarded. */
function emptySectionRange(doc: PMNode): FindMatch | 'not-found' {
  const first = doc.firstChild;
  return doc.childCount === 1 && first?.type === doc.type.schema.nodes.paragraph && first.content.size === 0
    ? { from: 1, to: 1 } : 'not-found';
}

function markableAnchor(doc: PMNode, target: FindMatch): FindMatch | 'unsupported-content' {
  let unsupported = false;
  doc.nodesBetween(target.from, target.to, (node, _pos, parent) => {
    if (!node.isInline) return true;
    if (!canCarry(parent, node, doc.type.schema.marks.insertion)) unsupported = true;
    return false;
  });
  return unsupported ? 'unsupported-content' : target;
}
