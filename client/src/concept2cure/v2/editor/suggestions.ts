/**
 * Track changes for the canonical section editor — real suggestions, not CSS.
 *
 * The store has carried an `authoring_sections.track_changes` boolean since the
 * table was created, PATCHable at the API, and the retired DocCanvas drew a
 * "Track" checkbox that only switched on ins/del STYLING — no code path ever
 * produced an `ins` or `del` element, so the column was a capability with no
 * implementation. This module is the implementation.
 *
 * Mechanism: two persistent marks (`insertion` → `<ins>`, `deletion` → `<del>`)
 * carrying per-edit attribution (author id, display name, minute-bucket
 * timestamp so one typing run merges into one suggestion), plus a ProseMirror
 * plugin that reinterprets edits while tracking is enabled:
 *
 *   - inserted content is marked `insertion` under the current author;
 *   - deleted content is NOT removed — it is restored with a `deletion` mark,
 *     so the record shows what was struck and by whom until someone with the
 *     document open accepts or rejects the suggestion;
 *   - deleting one's own (or any) pending insertion really deletes it — a
 *     proposal being withdrawn is not itself a change to the record;
 *   - accept/reject resolve a suggestion: accept-insertion keeps the text and
 *     drops the mark, reject-insertion removes the text; accept-deletion
 *     removes the text, reject-deletion restores it by dropping the mark.
 *
 * Because suggestions are ordinary marks, they persist in the section's saved
 * HTML: a pending redline survives reload, revision snapshots and export
 * exactly as written.
 *
 * `insertSuggestedContent` is the door AnA's drafts come through. An LLM answer
 * about a Module 3 section is not prose — it is a specification table, a
 * heading, a numbered list of controls. Those arrive as a markdown subset, so
 * this module converts that subset into REAL ProseMirror nodes (table /
 * heading / bulletList / orderedList, bold and italic marks) before inserting
 * it, every node still carrying the pending `insertion` mark so the human
 * accepts or rejects it exactly as before. Anything the converter does not
 * recognise falls back to the original paragraph behaviour: text is never
 * dropped, only ever left as-is.
 *
 * KNOWN v1 LIMITS (deliberate, documented rather than hidden):
 *   - Only same-textblock deletions are reinterpreted as suggestions.
 *     Structural edits (joining/splitting paragraphs, deleting across block
 *     boundaries, table surgery) apply directly, untracked.
 *   - Formatting-only changes (bold, heading level) are not tracked.
 *   - Undo/redo and remote collaboration transactions pass through untouched:
 *     an undo must restore the previous state, not generate counter-suggestions,
 *     and a collaborator's edits arrive already marked by their editor.
 *   - The markdown subset is a SUBSET (see MARKDOWN SUBSET below): no nested
 *     lists, no code fences, no images (the schema has no image node), no
 *     underscore emphasis, no inline links. Unsupported syntax survives
 *     verbatim as paragraph text rather than being reinterpreted or dropped.
 */

import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { ReplaceStep, Transform } from '@tiptap/pm/transform';
import { Fragment, Slice } from '@tiptap/pm/model';
import type { Node as PMNode, Mark as PMMark, Schema } from '@tiptap/pm/model';

/* ── Attribution ──────────────────────────────────────────────── */

export interface SuggestionAuthor {
  /** Stable id (JWT subject for humans; 'ana' for AI-proposed content). */
  id: string;
  /** Display name as it should read in the redline. */
  name: string;
}

/** Minute-bucket timestamp: one continuous typing run = one suggestion. */
function minuteBucket(now = new Date()): string {
  const iso = now.toISOString();
  return iso.slice(0, 16) + ':00Z'; // YYYY-MM-DDTHH:MM:00Z
}

/* Transactions carrying this meta are the editor's own suggestion machinery
   (accept/reject/AI-insert) and must not be reinterpreted by the plugin. */
export const SUGGESTION_ACTION_META = 'c2c-suggestion-action';

const suggestionAttrs = {
  authorId: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-author-id'),
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.authorId ? { 'data-author-id': String(attrs.authorId) } : {},
  },
  authorName: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-author-name'),
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.authorName ? { 'data-author-name': String(attrs.authorName) } : {},
  },
  at: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-at'),
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.at ? { 'data-at': String(attrs.at) } : {},
  },
};

/* ── The two suggestion marks ─────────────────────────────────── */

export const InsertionMark = Mark.create({
  name: 'insertion',
  excludes: 'deletion',
  // Above StarterKit marks so nothing else claims <ins> first.
  priority: 1000,
  addAttributes() {
    return suggestionAttrs;
  },
  parseHTML() {
    return [{ tag: 'ins' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['ins', { ...HTMLAttributes, class: 'rse-ins' }, 0];
  },
});

export const DeletionMark = Mark.create({
  name: 'deletion',
  excludes: 'insertion',
  // Above StarterKit's Strike, whose parse rules also claim <del> — a struck
  // suggestion must never round-trip into a plain strikethrough.
  priority: 1000,
  // Typing at the edge of struck text must not extend the strike.
  inclusive: false,
  addAttributes() {
    return suggestionAttrs;
  },
  parseHTML() {
    return [{ tag: 'del' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['del', { ...HTMLAttributes, class: 'rse-del' }, 0];
  },
});

/* ── Suggestion census (for the review strip) ─────────────────── */

export interface SuggestionRange {
  from: number;
  to: number;
  kind: 'insertion' | 'deletion';
  authorId: string | null;
  authorName: string | null;
  at: string | null;
  text: string;
}

/** Walk the doc and group adjacent same-kind, same-author suggestion spans. */
export function collectSuggestions(doc: PMNode): SuggestionRange[] {
  const out: SuggestionRange[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.marks.length) return;
    const mark = node.marks.find(
      (m) => m.type.name === 'insertion' || m.type.name === 'deletion',
    );
    if (!mark) return;
    const kind = mark.type.name as 'insertion' | 'deletion';
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.to === pos &&
      prev.kind === kind &&
      prev.authorId === (mark.attrs.authorId ?? null)
    ) {
      prev.to = pos + node.nodeSize;
      prev.text += node.text ?? '';
      return;
    }
    out.push({
      from: pos,
      to: pos + node.nodeSize,
      kind,
      authorId: (mark.attrs.authorId as string | null) ?? null,
      authorName: (mark.attrs.authorName as string | null) ?? null,
      at: (mark.attrs.at as string | null) ?? null,
      text: node.text ?? '',
    });
  });
  return out;
}

/* ── Deletion reinterpretation helpers ────────────────────────── */

/**
 * Prepare removed inline content for restoration as a deletion suggestion:
 * pending insertions vanish for real (withdrawing a proposal is not a change
 * to the record), text already struck keeps its original attribution, and
 * everything else gains this author's deletion mark.
 */
function markFragmentDeleted(
  frag: Fragment,
  delMark: PMMark,
  schema: Schema,
): Fragment {
  const nodes: PMNode[] = [];
  frag.forEach((node) => {
    const hasIns = node.marks.some((m) => m.type === schema.marks.insertion);
    if (hasIns) return; // a pending insertion un-happens
    const hasDel = node.marks.some((m) => m.type === schema.marks.deletion);
    nodes.push(hasDel ? node : node.mark(delMark.addToSet(node.marks)));
  });
  return Fragment.from(nodes);
}

/* ── Emptied-structure cleanup ────────────────────────────────── */

/**
 * Containers that exist only to hold content. When resolving a suggestion
 * empties one completely — rejecting a drafted table, accepting the deletion
 * of a whole list — the husk is removed with it. Paragraphs are NOT in this
 * set: an empty paragraph is a legitimate thing for an author to keep, and
 * leaving it is the behaviour that shipped.
 */
const PRUNABLE_CONTAINERS = new Set([
  'table',
  'bulletList',
  'orderedList',
  'taskList',
  'heading',
]);

/**
 * After deletions at `probes` (positions recorded BEFORE the deletions), drop
 * any prunable container those deletions left with no text at all. Outermost
 * empty container wins, so a rejected table goes as a table rather than
 * leaving rows behind.
 */
function pruneEmptiedContainers(tr: Transaction, probes: number[]): void {
  const targets: Array<{ from: number; to: number }> = [];
  for (const probe of probes) {
    try {
      const pos = Math.min(Math.max(tr.mapping.map(probe, -1), 0), tr.doc.content.size);
      const $pos = tr.doc.resolve(pos);
      for (let d = 1; d <= $pos.depth; d++) {
        const node = $pos.node(d);
        if (!PRUNABLE_CONTAINERS.has(node.type.name)) continue;
        if (node.textContent.trim().length > 0) continue;
        targets.push({ from: $pos.before(d), to: $pos.after(d) });
        break;
      }
    } catch {
      // A probe that no longer resolves is a probe with nothing to clean up.
    }
  }
  // Descending, skipping anything that overlaps a range already removed.
  targets.sort((a, b) => b.from - a.from);
  let lowestRemoved = Number.POSITIVE_INFINITY;
  for (const t of targets) {
    if (t.to > lowestRemoved) continue;
    try {
      tr.delete(t.from, t.to);
      lowestRemoved = t.from;
    } catch {
      // Geometry this v1 does not model; the husk stands rather than crashing.
    }
  }
}

/* ── MARKDOWN SUBSET → ProseMirror structure (AnA drafts) ─────── */

/**
 * Deliberately hand-rolled and dependency-free, and deliberately a SUBSET —
 * exactly what a regulatory answer contains:
 *
 *   GFM pipe tables (header row + `---|---` separator)  → table/tableRow/
 *                                                          tableHeader/tableCell
 *   ATX headings `#`/`##`/`###` (deeper clamps to 3)    → heading
 *   `-`/`*`/`+` bullets, `1.`/`1)` ordered items        → bulletList/orderedList
 *   `**bold**`, `*italic*`                              → bold / italic marks
 *   everything else                                     → paragraph, as before
 *
 * NOT supported, on purpose: nested lists (flattened to one level), code
 * fences, blockquotes, links, images (the editor schema has no image node),
 * and `_underscore_` emphasis — regulatory text is full of identifiers like
 * `batch_id` and `3.2.P.5_1`, and reinterpreting those would corrupt content
 * to gain nothing. Unsupported syntax is left verbatim.
 */

const MD_HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const MD_BULLET = /^ {0,3}[-*+][ \t]+(\S.*)$/;
const MD_ORDERED = /^ {0,3}(\d{1,9})[.)][ \t]+(\S.*)$/;
/** `| --- | :---: |` — the row that makes the line above it a table header. */
const MD_TABLE_RULE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
/**
 * `**bold**` / `*italic*`. Content may not begin or end with whitespace or a
 * star, which is what keeps a `* ` bullet marker and a bare `3 * 4` out of it.
 * No lookbehind — that syntax is unsupported in older Safari and would throw
 * at parse time, taking the whole editor with it.
 */
const MD_EMPHASIS = /\*\*([^\s*](?:[^*]*[^\s*])?)\*\*|\*([^\s*](?:[^*]*[^\s*])?)\*/g;

type MdBlock =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'bulletList'; items: string[] }
  | { kind: 'orderedList'; items: string[]; start: number }
  | { kind: 'table'; rows: string[][]; raw: string[] };

/** Split one table line into cells, honouring `\|` as a literal pipe. */
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

/** Is `lines[i]` a table header whose separator row follows? */
function tableStartsAt(lines: string[], i: number): boolean {
  const header = lines[i];
  const rule = lines[i + 1];
  if (!header || !rule) return false;
  if (!header.includes('|') || !rule.includes('|')) return false;
  if (!MD_TABLE_RULE.test(rule)) return false;
  return splitTableRow(header).length === splitTableRow(rule).length;
}

/** `lines[i]` is a table header; consume it and its body rows. */
function consumeTable(lines: string[], i: number): { block: MdBlock; end: number } {
  const rows = [splitTableRow(lines[i])];
  const raw = [lines[i], lines[i + 1]];
  let j = i + 2;
  for (; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim() || !l.includes('|')) break;
    rows.push(splitTableRow(l));
    raw.push(l);
  }
  return { block: { kind: 'table', rows, raw }, end: j - 1 };
}

/** `lines[i]` is a list item; consume the run of items and any lazy
 *  continuation lines hanging off them. */
function consumeList(
  lines: string[],
  i: number,
  bullet: RegExpExecArray | null,
  ordered: RegExpExecArray | null,
): { block: MdBlock; end: number } {
  const isBullet = Boolean(bullet);
  const items: string[] = [bullet ? bullet[1] : ordered![2]];
  const start = ordered ? Number(ordered[1]) : 1;
  let j = i + 1;
  for (; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim()) break;
    const nb = MD_BULLET.exec(l);
    const no = nb ? null : MD_ORDERED.exec(l);
    if (isBullet && nb) {
      items.push(nb[1]);
      continue;
    }
    if (!isBullet && no) {
      items.push(no[2]);
      continue;
    }
    // A switch of marker, a heading or a table ends this list…
    if (nb || no || MD_HEADING.test(l) || tableStartsAt(lines, j)) break;
    // …anything else is a lazy continuation of the item above it.
    items[items.length - 1] += ' ' + l.trim();
  }
  return {
    block: isBullet ? { kind: 'bulletList', items } : { kind: 'orderedList', items, start },
    end: j - 1,
  };
}

function parseMarkdownBlocks(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ kind: 'paragraph', lines: para });
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      continue;
    }

    if (tableStartsAt(lines, i)) {
      const { block, end } = consumeTable(lines, i);
      flush();
      blocks.push(block);
      i = end;
      continue;
    }

    const h = MD_HEADING.exec(line);
    if (h) {
      flush();
      blocks.push({ kind: 'heading', level: Math.min(h[1].length, 3), text: h[2] });
      continue;
    }

    const bullet = MD_BULLET.exec(line);
    const ordered = bullet ? null : MD_ORDERED.exec(line);
    if (bullet || ordered) {
      const { block, end } = consumeList(lines, i, bullet, ordered);
      flush();
      blocks.push(block);
      i = end;
      continue;
    }

    para.push(line);
  }
  flush();
  return blocks;
}

/** One line of inline markdown → text nodes carrying `insMark` (+ emphasis). */
function inlineFragment(schema: Schema, text: string, insMark: PMMark): Fragment {
  const bold = schema.marks.bold ?? null;
  const italic = schema.marks.italic ?? null;
  const nodes: PMNode[] = [];
  const push = (raw: string, extra: PMMark | null) => {
    if (!raw) return;
    const marks = extra ? extra.addToSet([insMark]) : [insMark];
    nodes.push(schema.text(raw, marks));
  };

  MD_EMPHASIS.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = MD_EMPHASIS.exec(text)) !== null) {
    if (m.index > last) push(text.slice(last, m.index), null);
    if (m[1] != null) push(m[1], bold ? bold.create() : null);
    else push(m[2], italic ? italic.create() : null);
    last = m.index + m[0].length;
  }
  if (last < text.length) push(text.slice(last), null);
  return nodes.length ? Fragment.fromArray(nodes) : Fragment.empty;
}

/**
 * Today's behaviour, kept verbatim as the floor everything falls back to:
 * blank lines split paragraphs, single newlines collapse to spaces.
 */
function plainParagraphNodes(schema: Schema, clean: string, mark: PMMark): PMNode[] {
  const paras = clean.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return paras.map((p) =>
    schema.nodes.paragraph.create(
      null,
      p
        ? Fragment.from(schema.text(p.replace(/\n+/g, ' '), [mark]))
        : Fragment.empty,
    ),
  );
}

/** Builds one paragraph of inline content carrying the pending mark. */
type ParaFn = (text: string) => PMNode;

function listNode(
  schema: Schema,
  block: Extract<MdBlock, { kind: 'bulletList' | 'orderedList' }>,
  para: ParaFn,
): PMNode[] {
  const N = schema.nodes;
  const listType = block.kind === 'bulletList' ? N.bulletList : N.orderedList;
  if (!listType || !N.listItem) return block.items.map((item) => para(item));
  const items = block.items.map((t) => N.listItem.createChecked(null, Fragment.from(para(t))));
  // A list that starts at 3 renders as 3 — the numbering in a regulatory
  // answer is often a continuation, not a fresh count.
  const start = block.kind === 'orderedList' ? block.start : 1;
  const wantsStart =
    start !== 1 && Number.isFinite(start) && Boolean(listType.spec.attrs?.start);
  return [listType.createChecked(wantsStart ? { start } : null, Fragment.fromArray(items))];
}

function tableNode(
  schema: Schema,
  block: Extract<MdBlock, { kind: 'table' }>,
  para: ParaFn,
): PMNode[] {
  const { table, tableRow, tableHeader, tableCell } = schema.nodes;
  if (!table || !tableRow || !tableHeader || !tableCell) {
    // A schema without tables keeps the markdown as text — the pipes are ugly,
    // losing the numbers would be worse.
    return [para(block.raw.join(' '))];
  }
  // Square the grid off the widest row: a ragged answer is padded, never
  // truncated, because truncation is exactly how an acceptance limit goes
  // missing from a specification.
  const cols = block.rows.reduce((m, r) => Math.max(m, r.length), 0);
  const rowNodes = block.rows.map((cells, idx) => {
    const cellType = idx === 0 ? tableHeader : tableCell;
    const cellNodes: PMNode[] = [];
    for (let c = 0; c < cols; c++) {
      cellNodes.push(cellType.createChecked(null, Fragment.from(para(cells[c] ?? ''))));
    }
    return tableRow.createChecked(null, Fragment.fromArray(cellNodes));
  });
  return [table.createChecked(null, Fragment.fromArray(rowNodes))];
}

/**
 * Markdown subset → nodes. `createChecked` throughout, so a structure the
 * schema will not accept throws here and the caller falls back to paragraphs
 * rather than producing an invalid document.
 */
function structuredNodes(schema: Schema, clean: string, mark: PMMark): PMNode[] {
  const N = schema.nodes;
  const para: ParaFn = (text) =>
    N.paragraph.createChecked(null, inlineFragment(schema, text, mark));
  const out: PMNode[] = [];

  for (const block of parseMarkdownBlocks(clean)) {
    if (block.kind === 'heading') {
      out.push(
        N.heading
          ? N.heading.createChecked(
              { level: block.level },
              inlineFragment(schema, block.text, mark),
            )
          : para(block.text),
      );
    } else if (block.kind === 'bulletList' || block.kind === 'orderedList') {
      out.push(...listNode(schema, block, para));
    } else if (block.kind === 'table') {
      out.push(...tableNode(schema, block, para));
    } else {
      out.push(para(block.lines.join(' ')));
    }
  }
  return out;
}

/* ── The tracking plugin ──────────────────────────────────────── */

interface TrackChangesStorage {
  enabled: boolean;
  author: SuggestionAuthor;
}

const trackKey = new PluginKey('c2cTrackChanges');

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    c2cTrackChanges: {
      /** Turn suggestion capture on/off for this editor instance. */
      setTrackChangesEnabled: (enabled: boolean) => ReturnType;
      /** Set who future suggestions are attributed to. */
      setSuggestionAuthor: (author: SuggestionAuthor) => ReturnType;
      /** Resolve one suggestion range. */
      resolveSuggestion: (range: SuggestionRange, action: 'accept' | 'reject') => ReturnType;
      /** Resolve every suggestion in the document. */
      resolveAllSuggestions: (action: 'accept' | 'reject') => ReturnType;
      /**
       * Insert proposed content (e.g. an AnA draft) at the selection as a
       * pending insertion attributed to `author` — never as settled text.
       * `text` is read as the markdown subset documented above: tables,
       * headings and lists become real nodes, anything else becomes
       * paragraphs, and every node carries the pending `insertion` mark.
       */
      insertSuggestedContent: (text: string, author: SuggestionAuthor) => ReturnType;
    };
  }
}

export const TrackChanges = Extension.create<
  { author: SuggestionAuthor; enabled: boolean },
  TrackChangesStorage
>({
  name: 'c2cTrackChanges',

  addOptions() {
    return { author: { id: 'unknown', name: 'Unknown author' }, enabled: false };
  },

  addStorage() {
    return { enabled: this.options.enabled, author: this.options.author };
  },

  addExtensions() {
    return [InsertionMark, DeletionMark];
  },

  addCommands() {
    return {
      setTrackChangesEnabled:
        (enabled: boolean) =>
        ({ tr, dispatch }) => {
          this.storage.enabled = enabled;
          if (dispatch) dispatch(tr.setMeta(SUGGESTION_ACTION_META, true));
          return true;
        },
      setSuggestionAuthor:
        (author: SuggestionAuthor) =>
        () => {
          this.storage.author = author;
          return true;
        },
      resolveSuggestion:
        (range: SuggestionRange, action: 'accept' | 'reject') =>
        ({ state, tr, dispatch }) => {
          const { insertion, deletion } = state.schema.marks;
          const keepText =
            (range.kind === 'insertion') === (action === 'accept');
          if (keepText) {
            tr.removeMark(range.from, range.to, range.kind === 'insertion' ? insertion : deletion);
          } else {
            tr.delete(range.from, range.to);
            pruneEmptiedContainers(tr, [range.from]);
          }
          tr.setMeta(SUGGESTION_ACTION_META, true);
          if (dispatch) dispatch(tr);
          return true;
        },
      resolveAllSuggestions:
        (action: 'accept' | 'reject') =>
        ({ state, tr, dispatch }) => {
          const ranges = collectSuggestions(state.doc);
          if (!ranges.length) return false;
          const { insertion, deletion } = state.schema.marks;
          const removedAt: number[] = [];
          // Descending order so earlier positions stay valid as text is removed.
          for (const r of [...ranges].sort((a, b) => b.from - a.from)) {
            const keepText = (r.kind === 'insertion') === (action === 'accept');
            if (keepText) {
              tr.removeMark(r.from, r.to, r.kind === 'insertion' ? insertion : deletion);
            } else {
              tr.delete(r.from, r.to);
              removedAt.push(r.from);
            }
          }
          pruneEmptiedContainers(tr, removedAt);
          tr.setMeta(SUGGESTION_ACTION_META, true);
          if (dispatch) dispatch(tr);
          return true;
        },
      insertSuggestedContent:
        (text: string, author: SuggestionAuthor) =>
        ({ state, tr, dispatch }) => {
          const clean = (text ?? '').trim();
          if (!clean) return false;
          const { insertion } = state.schema.marks;
          const mark = insertion.create({
            authorId: author.id,
            authorName: author.name,
            at: minuteBucket(),
          });
          // AnA answers in markdown; a Module 3 answer IS a table. Convert the
          // subset we understand into real nodes, and fall back to flat
          // paragraphs — the behaviour that shipped — the moment anything about
          // that conversion is not sound. Text is never dropped either way.
          let nodes: PMNode[];
          try {
            nodes = structuredNodes(state.schema, clean, mark);
          } catch {
            nodes = [];
          }
          if (!nodes.length) nodes = plainParagraphNodes(state.schema, clean, mark);

          let slice = new Slice(Fragment.fromArray(nodes), 0, 0);
          try {
            // Probe on a scratch Transform — NOT on `state.tr`, which inside a
            // command IS this very transaction (tiptap's chainable state), so
            // probing there would apply the draft twice. If this geometry
            // cannot be fitted at the selection (a table inside a table cell,
            // say), the real transaction must not be left half-applied.
            const { from, to } = state.selection;
            new Transform(state.doc).replaceRange(from, to, slice);
          } catch {
            slice = new Slice(
              Fragment.fromArray(plainParagraphNodes(state.schema, clean, mark)),
              0,
              0,
            );
          }
          tr.replaceSelection(slice);
          tr.setMeta(SUGGESTION_ACTION_META, true);
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    /** Last delete-key direction, so the caret lands where the next press of
     *  the same key continues the strike instead of re-striking struck text. */
    let deleteDir: 'back' | 'fwd' | null = null;

    return [
      new Plugin({
        key: trackKey,
        props: {
          handleKeyDown(_view, event) {
            if (event.key === 'Backspace') deleteDir = 'back';
            else if (event.key === 'Delete') deleteDir = 'fwd';
            else deleteDir = null;
            return false;
          },
        },
        appendTransaction(transactions, _oldState, newState) {
          if (!storage.enabled) return null;
          const dir = deleteDir;
          deleteDir = null;

          const content = (transactions as readonly Transaction[]).filter(
            (tr) =>
              tr.docChanged &&
              !tr.getMeta(SUGGESTION_ACTION_META) &&
              !tr.getMeta('y-sync$') &&
              !tr.getMeta('history$') &&
              !tr.getMeta('appendedTransaction'),
          );
          if (!content.length) return null;

          const schema = newState.schema;
          const insType = schema.marks.insertion;
          const delType = schema.marks.deletion;
          const bucket = minuteBucket();
          const insMark = insType.create({
            authorId: storage.author.id,
            authorName: storage.author.name,
            at: bucket,
          });
          const delMark = delType.create({
            authorId: storage.author.id,
            authorName: storage.author.name,
            at: bucket,
          });

          const fix = newState.tr;
          let mutated = false;
          let caretTo: number | null = null;

          for (let t = 0; t < content.length; t++) {
            const tr = content[t];
            for (let i = 0; i < tr.steps.length; i++) {
              const step = tr.steps[i];
              if (!(step instanceof ReplaceStep)) continue;
              const docBefore = tr.docs[i];

              // Bring this step's coordinates forward to newState: through the
              // remainder of its own transaction, then any later transactions.
              const toFinal = (pos: number, assoc: -1 | 1): number => {
                let p = tr.mapping.slice(i + 1).map(pos, assoc);
                for (let u = t + 1; u < content.length; u++) {
                  p = content[u].mapping.map(p, assoc);
                }
                return p;
              };

              try {
                const insStart = toFinal(step.from, -1);

                // 1) Restore same-textblock deletions as a deletion suggestion,
                //    placed BEFORE any replacement text (redlines read
                //    struck-then-inserted).
                let restoredSize = 0;
                if (step.to > step.from) {
                  const $from = docBefore.resolve(step.from);
                  const $to = docBefore.resolve(step.to);
                  if ($from.sameParent($to) && $from.parent.isTextblock) {
                    const removed = $from.parent.content.cut(
                      $from.parentOffset,
                      $to.parentOffset,
                    );
                    const restored = markFragmentDeleted(removed, delMark, schema);
                    if (restored.size > 0) {
                      const at = fix.mapping.map(insStart, -1);
                      fix.insert(at, restored);
                      restoredSize = restored.size;
                      mutated = true;
                      if (step.slice.size === 0) {
                        caretTo = dir === 'fwd' ? at + restoredSize : at;
                      }
                    }
                  }
                }

                // 2) Mark inserted content as a pending insertion (and clear
                //    any deletion mark it inherited from surrounding text).
                if (step.slice.size > 0) {
                  // The restored deletion was inserted AT insStart, so the
                  // inserted content now begins right after it; its length is
                  // exactly the step's slice size.
                  const a = fix.mapping.map(insStart, -1) + restoredSize;
                  const b = a + step.slice.size;
                  if (b > a) {
                    fix.removeMark(a, b, delType);
                    fix.addMark(a, b, insMark);
                    mutated = true;
                  }
                }
              } catch {
                // Geometry this v1 does not model (structural replace across
                // blocks). The edit stands untracked rather than crashing the
                // editor; the limit is documented in the module header.
              }
            }
          }

          if (!mutated) return null;
          if (caretTo != null) {
            const clamped = Math.max(0, Math.min(caretTo, fix.doc.content.size));
            fix.setSelection(TextSelection.create(fix.doc, clamped));
          }
          fix.setMeta(SUGGESTION_ACTION_META, true);
          return fix;
        },
      }),
    ];
  },
});
