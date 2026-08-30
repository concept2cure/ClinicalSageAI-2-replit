/**
 * Table and figure captions for the canonical section editor.
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * Two things, and the second is worse than the first.
 *
 * 1. NOTHING WAS NUMBERED. A CTD document's tables and figures are numbered
 *    objects — "Table 14.2.1", "Figure 3" — and a reviewer navigates by those
 *    numbers. A writer typed the number into the caption by hand, which makes
 *    it wrong the moment a table is inserted above it, with no way to find the
 *    ones that went wrong except by reading the document.
 *
 * 2. THE EDITOR DESTROYED CAPTIONS IT WAS GIVEN. The schema had no notion of a
 *    `<caption>`, so ProseMirror descended into the unknown element and placed
 *    its text as a CELL. Stored content reading
 *
 *        <table><caption>Summary of adverse events</caption><tr><th>…
 *
 *    came back from the editor as a table whose first row is a one-cell row
 *    containing "Summary of adverse events", and the next save wrote that into
 *    the governed record. The fail-closed fidelity gate could not catch it:
 *    that gate compares TEXT, and every character survived — the caption simply
 *    stopped being a caption and became data. Verified against this editor
 *    before the fix; see the test file beside this module.
 *
 * ── What this holds ─────────────────────────────────────────────────────────
 * THE OBJECT'S IDENTITY AND ITS WORDS. Never its number. "Table 3" describes
 * where a table currently sits in a document; it is not a name for it. The
 * ordinal is derived from position — here for the canvas, and again in each
 * export renderer for the filed document — so inserting a table renumbers
 * everything after it, and every reference to any of them, with nobody editing
 * a caption.
 *
 * Unlike a cross-reference or a citation there is no cached rendering to store:
 * the caption element already carries the words a text-comparing fidelity gate,
 * a plain-text extraction and a search index need to see, and the number is not
 * something any of them should be shown.
 *
 * ── Why the caption is an ATTRIBUTE and not a child node ────────────────────
 * `prosemirror-tables` treats every child of a table node as a ROW: `TableMap`
 * indexes `table.child(i).child(j)` to build the column map that every table
 * command depends on. A caption node inside the table would break row/column
 * insertion, merging and selection outright. So the caption is an attribute of
 * the table node that SERIALIZES as a real `<caption>` child — which is the
 * storage form the export parser already reads and the round-trip allowlist
 * already recognises — with a parse rule that stops ProseMirror from turning
 * the element into a row on the way back in.
 *
 * A FIGURE's caption is its alt text. That is already the string both export
 * renderers print in the caption position; giving a figure a second, parallel
 * caption field would be two stores for one sentence.
 *
 * ── Why the numbering needs the sections around this one ────────────────────
 * The editor holds ONE section; the numbering belongs to the DOCUMENT. A canvas
 * that numbered its own tables from 1 would show "Table 1" for an object the
 * filing prints as "Table 7" — a plausible-looking wrong number, which is the
 * exact failure this design exists to remove. So the host supplies the
 * captioned objects in the sections ORDERED ABOVE this one and the ones BELOW,
 * and this section's own objects are numbered in between. Same numbers as the
 * export, from the same rule and the same shared module.
 */

import { Extension } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  CAPTION_ID_ATTR,
  captionCrossReferenceTargets,
  captionLineText,
  makeCaptionNumbering,
  numberCaptions,
  type CaptionedObject,
  type CaptionKind,
  type NumberedCaption,
} from '@shared/authoring/captions';
import type { CrossReferenceTarget } from '@shared/authoring/cross-references';

/** The schema node names the two numbered object kinds live on. */
const TABLE_NODE = 'table';
const IMAGE_NODE = 'image';

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * A fresh identity for an object that has just been given a caption.
 *
 * Assigned once and never reassigned: a reference points at the identity, so a
 * writer rewording a caption must not break every reference to it.
 */
export function newCaptionId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Older browsers: still unique enough to key one document's objects, and the
  // export never interprets the value — it only matches it.
  return `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The captioned object a schema node is, or null when it is not one.
 *
 * ONE predicate, mirroring `blockCaption` on the export side: a table's caption
 * is its caption attribute, a figure's is its alt text, and no caption text
 * means no number (see @shared/authoring/captions).
 */
export function nodeCaption(node: PMNode): CaptionedObject | null {
  const kind: CaptionKind | null =
    node.type.name === TABLE_NODE ? 'table' : node.type.name === IMAGE_NODE ? 'figure' : null;
  if (!kind) return null;
  const caption = clean(kind === 'table' ? node.attrs.caption : node.attrs.alt);
  if (!caption) return null;
  const id = clean(node.attrs.captionId);
  return { kind, caption, ...(id ? { id } : {}) };
}

/**
 * Every captioned object in one editor document, in reading order.
 *
 * A figure INSIDE a table is not one of them — it is part of the table it sits
 * in and has no caption position of its own to print "Figure 4" in, which is
 * the same rule the export applies to a figure in a cell. Descending stops at
 * the table for exactly that reason.
 */
export function captionedObjectsInDoc(doc: PMNode): CaptionedObject[] {
  const out: CaptionedObject[] = [];
  doc.descendants((node) => {
    if (node.type.name !== TABLE_NODE && node.type.name !== IMAGE_NODE) return true;
    const object = nodeCaption(node);
    if (object) out.push(object);
    return false;
  });
  return out;
}

/**
 * The captioned objects of one stored section's HTML, in reading order.
 *
 * This is how the host tells the canvas what to count from — see the header —
 * and how it assembles the document's directory of referenceable objects. Uses
 * the browser parser rather than a pattern over the string, for the same reason
 * `citedSourceIdsInHtml` does: stored content is three generations of markup
 * and prose can legitimately contain tag-shaped tokens, so the only trustworthy
 * reader of it is the same parser the fidelity gate uses.
 */
export function captionedObjectsInHtml(html: string): CaptionedObject[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: CaptionedObject[] = [];
  // `table img` is excluded by the same rule the doc walk applies: a figure in
  // a cell is part of its table, not a numbered object of the document.
  doc.body.querySelectorAll('table, img').forEach((el) => {
    if (el.tagName.toLowerCase() === 'img' && el.closest('table')) return;
    const isTable = el.tagName.toLowerCase() === 'table';
    if (isTable && el.closest('table') !== el) return;
    const caption = clean(
      isTable
        ? (el.querySelector(':scope > caption')?.textContent ?? '')
        : el.getAttribute('alt'),
    );
    if (!caption) return;
    const id = clean(el.getAttribute(CAPTION_ID_ATTR));
    out.push({ kind: isTable ? 'table' : 'figure', caption, ...(id ? { id } : {}) });
  });
  return out;
}

/**
 * Every captioned object of the DOCUMENT, numbered: the sections above this
 * one, then this section's live content, then the sections below.
 *
 * One pass, one rule, the same shared numbering the export uses — so the number
 * on the canvas is the number in the filing.
 */
export function numberDocumentCaptions(
  before: readonly CaptionedObject[],
  doc: PMNode | null,
  after: readonly CaptionedObject[],
): { before: NumberedCaption[]; here: NumberedCaption[]; after: NumberedCaption[] } {
  const numbering = makeCaptionNumbering();
  return {
    before: numberCaptions(before, numbering),
    here: numberCaptions(doc ? captionedObjectsInDoc(doc) : [], numbering),
    after: numberCaptions(after, numbering),
  };
}

/**
 * The document's captioned objects as CROSS-REFERENCE TARGETS.
 *
 * Merged by the host into the same directory the sections go into, so the
 * editor's reference node resolves a table exactly as it resolves a section —
 * one resolver, one failure state, no second mechanism. See
 * @shared/authoring/captions.
 */
export function captionTargets(
  before: readonly CaptionedObject[],
  doc: PMNode | null,
  after: readonly CaptionedObject[],
): CrossReferenceTarget[] {
  const n = numberDocumentCaptions(before, doc, after);
  return captionCrossReferenceTargets([...n.before, ...n.here, ...n.after]);
}

/**
 * The captioned objects of one document state, in order, as a comparable
 * string.
 *
 * The host repaints the live cross-reference views when this changes — which is
 * exactly when a table's number could have moved, and not on every keystroke.
 */
export function captionOrderKey(doc: PMNode): string {
  return captionedObjectsInDoc(doc)
    .map((o) => `${o.kind} ${o.id ?? ''} ${o.caption}`)
    .join('');
}

/* ── The table node, extended to hold a caption ───────────────── */

/**
 * The document's table, carrying its caption.
 *
 * Replaces TableKit's own `table` node (the kit is configured with
 * `table: false` beside it) rather than sitting next to it: two table nodes in
 * one schema is two documents' worth of ambiguity, and `prosemirror-tables`
 * resolves its commands through `tableRole`, which both would claim.
 */
export const CaptionedTable = Table.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      /* The authored words. Serialized as a `<caption>` CHILD (see renderHTML),
         not as an attribute: that is the storage form the export parser already
         reads, the form the round-trip allowlist already recognises, and the
         form any consumer that knows nothing of this feature can still read. */
      caption: {
        default: '',
        parseHTML: (el: HTMLElement) =>
          clean(el.querySelector(':scope > caption')?.textContent ?? ''),
        renderHTML: () => ({}),
      },
      /* The object's identity, and the only thing a cross-reference to this
         table stores. Never its number. */
      captionId: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute(CAPTION_ID_ATTR),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.captionId ? { [CAPTION_ID_ATTR]: String(attrs.captionId) } : {},
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'table' },
      /* THE RULE THAT STOPS THE CAPTION BECOMING A ROW.
         Without it ProseMirror treats `<caption>` as unknown markup, descends
         into it, and places its text in the table's content — where the only
         thing that fits is a cell. The caption's words are read off the
         `<table>` element by the attribute above, so ignoring the element here
         loses nothing; leaving it out silently rewrote the governed record. */
      { tag: 'caption', ignore: true },
    ];
  },

  renderHTML(props) {
    const out = this.parent?.(props) as unknown;
    const caption = clean((props.node as PMNode).attrs.caption);
    if (!caption || !Array.isArray(out)) return out as never;
    /* The parent emits ['table', attrs, colgroup, ['tbody', 0]] — optionally
       inside a wrapper div. The caption is HTML's own first-child-of-table
       element, so it goes directly after the attribute object. */
    const table = out[0] === 'table' ? out : (out.find?.((c) => Array.isArray(c) && c[0] === 'table') as unknown[] | undefined);
    if (!Array.isArray(table)) return out as never;
    table.splice(2, 0, ['caption', {}, caption]);
    return out as never;
  },
});

/* ── Numbering the canvas ─────────────────────────────────────── */

export interface CaptionNumberingOptions {
  /** Captioned objects in the sections ordered ABOVE this one, in order. */
  before: (() => readonly CaptionedObject[]) | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    captionNumbering: {
      /** Give the table the caret is in, or the selected figure, this caption. */
      setObjectCaption: (caption: string) => ReturnType;
    };
  }
}

/** The table the selection sits in, or the figure it has selected. */
function captionTargetAt(
  state: { selection: { from: number; $from: { depth: number; node(d: number): PMNode; before(d: number): number } }; doc: PMNode },
): { pos: number; node: PMNode } | null {
  const sel = state.selection as unknown as { node?: PMNode; from: number };
  if (sel.node && sel.node.type.name === IMAGE_NODE) {
    return { pos: sel.from, node: sel.node };
  }
  const $from = state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === TABLE_NODE) return { pos: $from.before(d), node };
  }
  return null;
}

/** What the caption panel should show when it opens: the object's own words. */
export function captionAt(state: Parameters<typeof captionTargetAt>[0]): {
  kind: CaptionKind;
  caption: string;
} | null {
  const hit = captionTargetAt(state);
  if (!hit) return null;
  const kind: CaptionKind = hit.node.type.name === TABLE_NODE ? 'table' : 'figure';
  return {
    kind,
    caption: clean(kind === 'table' ? hit.node.attrs.caption : hit.node.attrs.alt),
  };
}

const captionNumberingKey = new PluginKey('captionNumbering');

/**
 * Shows each captioned object's number, live, in the canvas.
 *
 * A DECORATION, not stored content and not a node: the number is a rendering of
 * position and must never enter the document, or the next save would write it
 * into the governed record — which is the defect the whole feature exists to
 * remove. Decorations are recomputed from state, so inserting a table above
 * renumbers everything below it as the writer types, with nothing else touched.
 *
 * The table's caption is drawn here for a second reason too: the table node
 * view is `prosemirror-tables`' own, which renders only colgroup and tbody, so
 * a caption that lives in the node's attributes has nowhere else to appear on
 * screen. Drawn BELOW the object in both cases, which is where the print
 * stylesheet puts it (`caption-side: bottom`) and where a figure's caption goes.
 */
export const CaptionNumbering = Extension.create<CaptionNumberingOptions>({
  name: 'captionNumbering',

  addOptions() {
    return { before: null };
  },

  addCommands() {
    return {
      setObjectCaption:
        (caption: string) =>
        ({ state, tr, dispatch }) => {
          const hit = captionTargetAt(state);
          if (!hit) return false;
          const words = clean(caption);
          const isTable = hit.node.type.name === TABLE_NODE;
          const attrs: Record<string, unknown> = { ...hit.node.attrs };
          if (isTable) attrs.caption = words;
          else attrs.alt = words;
          /* The identity is minted the first time an object is captioned and
             kept for the object's life — a writer rewording a caption must not
             break every reference pointing at it. */
          if (words && !clean(attrs.captionId)) attrs.captionId = newCaptionId();
          if (dispatch) dispatch(tr.setNodeMarkup(hit.pos, undefined, attrs));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: captionNumberingKey,
        props: {
          decorations(state) {
            const numbering = makeCaptionNumbering();
            // The sections above this one are numbered first, so this section's
            // objects carry the numbers the filing prints.
            for (const o of options.before?.() ?? []) numbering.next(o.kind);
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== TABLE_NODE && node.type.name !== IMAGE_NODE) return true;
              const object = nodeCaption(node);
              if (!object) return false;
              const line = captionLineText(
                object.kind,
                numbering.next(object.kind),
                object.caption,
              );
              decorations.push(
                Decoration.widget(
                  pos + node.nodeSize,
                  () => {
                    const dom = document.createElement('figcaption');
                    dom.className = 'rse-caption';
                    dom.dataset.kind = object.kind;
                    dom.contentEditable = 'false';
                    dom.textContent = line;
                    return dom;
                  },
                  { side: 1 },
                ),
              );
              return false;
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
