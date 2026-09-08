/**
 * Citations for the canonical section editor.
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * A CTD module is an argument built on sources, and this editor had no citation
 * of any kind. The ribbon carried a control labelled "Cite"; what it did was
 * send the selected sentence to the assistant pane as a question. Nothing was
 * created, nothing stored, nothing numbered, and no reference list existed
 * anywhere in the product or in anything it filed.
 *
 * ── What this node holds ────────────────────────────────────────────────────
 * THE SOURCE'S IDENTITY, and the author's pinpoint. Never the number. "[3]"
 * describes where a source currently sits in this document's reference list; it
 * is not a name for that source, and it moves every time a citation is inserted
 * anywhere earlier in the document. The node stores the source id and the
 * number is derived from position — here for the canvas, and again in each
 * export renderer for the filed document — so inserting a citation renumbers
 * everything after it with nobody editing a single stored section.
 *
 * `locator` ("p. 42", "Table 3") IS stored, because it is authored content: no
 * renderer can recompute which page of a study report a claim came from.
 *
 * `label` is a CACHE of the source's NAME, written into the serialized HTML as
 * the element's text. Note what it is not: the number. The cross-reference node
 * beside this one caches the target's number, which is defensible there because
 * a section's number is stable between renumberings — a citation's is not, so
 * caching it would churn the stored bytes of untouched sections and would hand
 * any plain-text consumer an ordinal that is wrong more often than right. The
 * cache holds words, for the two reasons a cache exists here at all:
 *   - the fail-closed fidelity gate compares stored text against parsed text
 *     (roundTrip.ts). A node contributing no text would push every section
 *     holding a citation into raw source mode;
 *   - a consumer that knows nothing of citations still sees the source's name.
 * The node view below never displays it, and neither export renderer reads it.
 *
 * ── The failure state ───────────────────────────────────────────────────────
 * A citation whose source is not in the library renders as a stated refusal,
 * here and in the exported document, and takes NO number — numbering it would
 * leave a gap in the reference list, which sends a reviewer looking for an entry
 * that does not exist. It is never a plausible-looking wrong number and it never
 * silently disappears.
 *
 * ── Why the numbers need the sections above this one ────────────────────────
 * The editor holds ONE section; the reference list belongs to the DOCUMENT. A
 * canvas that numbered its own citations from 1 would show "[1]" for a claim the
 * filing prints as "[7]" — a plausible-looking wrong number, which is the exact
 * failure this design exists to remove. So the host supplies the source ids
 * already cited by the sections ORDERED ABOVE this one, and numbering continues
 * from there. Same numbers as the export, from the same rule.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import {
  CITATION_SOURCE_ATTR,
  CITATION_LOCATOR_ATTR,
  CITATION_MISSING_TEXT,
  citationMarkerText,
  citationSourceName,
  makeCitationRegistry,
  resolveCitation,
  type CitationLookup,
} from '@shared/authoring/citations';

/** The node's name in the schema; also what jsonDocText matches on. */
export const CITATION_NODE = 'citation';

export interface CitationOptions {
  /** Reads the host's CURRENT source library. Null disables resolution. */
  lookup: (() => CitationLookup | null) | null;
  /** Reads the source ids cited by the sections above this one, in order. */
  preceding: (() => readonly string[]) | null;
  /** Live node views, re-rendered when the numbering could have changed. */
  repaint: Set<() => void> | null;
}

export interface CitationAttrs {
  source: string;
  locator?: string | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    citation: {
      /** Insert a citation of a source at the caret. */
      insertCitation: (attrs: CitationAttrs) => ReturnType;
    };
  }
}

/**
 * Every source id cited in one stored section's HTML, in reading order.
 *
 * Uses the browser parser rather than a pattern over the string: stored content
 * is three generations of markup and prose can legitimately contain tag-shaped
 * tokens, so the only trustworthy reader of it is the same parser the fidelity
 * gate uses (roundTrip.ts, htmlVisibleText).
 *
 * This is how the host tells the canvas what number to start at — see the
 * header note.
 */
export function citedSourceIdsInHtml(html: string): string[] {
  if (!html || html.indexOf(CITATION_SOURCE_ATTR) === -1) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  doc.body.querySelectorAll(`[${CITATION_SOURCE_ATTR}]`).forEach((el) => {
    const id = (el.getAttribute(CITATION_SOURCE_ATTR) ?? '').trim();
    if (id) out.push(id);
  });
  return out;
}

/**
 * The number each cited source carries in THIS document, right now.
 *
 * The sections above this one are numbered first, then this section's citations
 * in document order — the same one-pass, first-appearance rule the export
 * registry applies, and literally the same registry implementation, so the
 * canvas and the filed document cannot disagree about a number.
 *
 * A source that does not resolve is absent from the map and consumes no number.
 */
export function citationNumbers(
  doc: PMNode,
  lookup: CitationLookup | null,
  preceding: readonly string[],
): Map<string, number> {
  const registry = makeCitationRegistry(lookup);
  for (const id of preceding) registry.cite(id);
  doc.descendants((node) => {
    if (node.type.name === CITATION_NODE) registry.cite(String(node.attrs.source ?? ''));
    return true;
  });
  const out = new Map<string, number>();
  for (const entry of registry.entries()) out.set(entry.source.id, entry.number);
  return out;
}

/**
 * The citations of one document state, in order, as a comparable string.
 *
 * The host repaints the live node views when this changes — which is exactly
 * when a number could have moved, and not on every keystroke.
 */
export function citationOrderKey(doc: PMNode): string {
  const ids: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === CITATION_NODE) ids.push(String(node.attrs.source ?? ''));
    return true;
  });
  return ids.join('');
}

export const Citation = Node.create<CitationOptions>({
  name: CITATION_NODE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { lookup: null, preceding: null, repaint: null };
  },

  addAttributes() {
    return {
      source: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute(CITATION_SOURCE_ATTR),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.source ? { [CITATION_SOURCE_ATTR]: String(attrs.source) } : {},
      },
      /* Authored content, not a derived value — stored, and printed inside the
         marker by both renderers. */
      locator: {
        default: '',
        parseHTML: (el: HTMLElement) => (el.getAttribute(CITATION_LOCATOR_ATTR) ?? '').trim(),
        renderHTML: (attrs: Record<string, unknown>) => {
          const locator = String(attrs.locator ?? '').trim();
          return locator ? { [CITATION_LOCATOR_ATTR]: locator } : {};
        },
      },
      /* The source's NAME as it stood when cited. See the header: a cache, never
         a source, and deliberately not the number. */
      label: {
        default: '',
        parseHTML: (el: HTMLElement) => el.textContent ?? '',
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        /* Above the Link mark's `a[href]` rule so a citation is never parsed as
           an ordinary link — which would keep the cached name as plain text and
           drop the source id, leaving a claim with no traceable source at all. */
        tag: `a[${CITATION_SOURCE_ATTR}]`,
        priority: 60,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    /* The label is serialized as the element's TEXT rather than as another
       attribute: that is what a text-comparing fidelity gate, a plain-text
       extraction and a search index can all read without knowing what a
       citation is. */
    return ['a', mergeAttributes(HTMLAttributes), String(node.attrs.label ?? '')];
  },

  addCommands() {
    return {
      insertCitation:
        (attrs: CitationAttrs) =>
        ({ commands }) => {
          const source = (attrs.source ?? '').trim();
          if (!source) return false;
          const lookup = this.options.lookup?.() ?? null;
          const resolved = resolveCitation(source, lookup);
          /* A citation is only ever inserted against a source that exists right
             now — the picker offers the live library, so an unresolvable insert
             means the library moved under the writer, and filing a citation that
             is already broken is not a thing to do quietly. */
          if (!resolved.found || !resolved.source) return false;
          return commands.insertContent({
            type: this.name,
            attrs: {
              source,
              locator: (attrs.locator ?? '').trim(),
              label: citationSourceName(resolved.source),
            },
          });
        },
    };
  },

  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('a');
      dom.className = 'rse-cite';
      // Not a navigation: clicking a citation in the canvas places the caret.
      dom.setAttribute('role', 'link');
      dom.setAttribute(CITATION_SOURCE_ATTR, String(node.attrs.source ?? ''));

      const paint = () => {
        const sourceId = String(node.attrs.source ?? '');
        const lookup = this.options.lookup?.() ?? null;
        const numbers = citationNumbers(
          editor.state.doc,
          lookup,
          this.options.preceding?.() ?? [],
        );
        const number = numbers.get(sourceId);
        if (number != null) {
          const resolved = resolveCitation(sourceId, lookup);
          delete dom.dataset.missing;
          dom.textContent = citationMarkerText(number, String(node.attrs.locator ?? ''));
          dom.title = resolved.source
            ? `${citationSourceName(resolved.source)} — numbered by its position in this document’s reference list.`
            : 'Numbered by its position in this document’s reference list.';
          return;
        }
        /* STATED, not guessed. The cached name is deliberately not a fallback,
           and no number is printed: a marker with a number the reference list
           has no entry for sends a reviewer looking for something that is not
           there. */
        dom.dataset.missing = '1';
        dom.textContent = CITATION_MISSING_TEXT;
        dom.title =
          'The source this citation refers to is not available to this document. ' +
          'Cite another source or delete it.';
      };
      paint();

      const repaint = this.options.repaint ?? null;
      repaint?.add(paint);

      return {
        dom,
        // A different source or pinpoint is a different citation — rebuild.
        update: (updated) =>
          updated.type.name === this.name &&
          updated.attrs.source === node.attrs.source &&
          updated.attrs.locator === node.attrs.locator,
        destroy: () => {
          repaint?.delete(paint);
        },
      };
    };
  },
});
