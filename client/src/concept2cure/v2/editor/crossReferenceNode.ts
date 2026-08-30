/**
 * Cross-references for the canonical section editor.
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * "See Section 2.7.4.2" and "as shown in Table 3" were plain, unmanaged text.
 * Renumber or move the target and every reference to it is silently wrong; the
 * only way to find them is to read the document. Cross-referencing is one of
 * the tasks a regulatory writer spends the most time on, and the platform's own
 * shadow review already lists it as a finding.
 *
 * ── What this node holds ────────────────────────────────────────────────────
 * THE TARGET'S IDENTITY. Never its printed number. `2.7.4.2` describes where a
 * section currently sits in a document; it is not a name for that section. The
 * node stores the section id and the display text is resolved — here for the
 * canvas, and again in each export renderer for the filed document — so a
 * renumber corrects every reference with nobody editing the referring sections.
 *
 * `label` is a CACHE of the last rendering, written into the serialized HTML as
 * the element's text. It exists for two narrow reasons, and is authoritative
 * for neither the canvas nor either renderer:
 *   - the fail-closed fidelity gate compares stored text against parsed text
 *     (roundTrip.ts). A node contributing no text would push every section
 *     holding a reference into raw source mode;
 *   - a consumer that knows nothing of cross-references still sees words.
 * The node view below never displays it, and the export renderers ignore it.
 *
 * ── The failure state ───────────────────────────────────────────────────────
 * A reference whose target is not in the section directory renders as a stated
 * refusal, here and in the exported document. It is never a plausible-looking
 * wrong number, and it never silently disappears — the same contract the image
 * node keeps for a figure whose bytes are gone.
 *
 * ── Why the directory arrives by callback ───────────────────────────────────
 * The extension set is built once per mount, but the document's sections change
 * while the editor is open — that is the entire point, since renumbering one is
 * what every reference to it must survive. `lookup` reads the host's current
 * list on every call, and `repaint` is the set of live node views to re-render
 * when that list changes.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import {
  CROSS_REF_TARGET_ATTR,
  CROSS_REF_DISPLAY_ATTR,
  CROSS_REFERENCE_MISSING_TEXT,
  normalizeCrossReferenceDisplay,
  resolveCrossReference,
  type CrossReferenceDisplay,
  type CrossReferenceLookup,
} from '@shared/authoring/cross-references';

export interface CrossReferenceOptions {
  /** Reads the host's CURRENT section directory. Null disables resolution. */
  lookup: (() => CrossReferenceLookup | null) | null;
  /** Live node views, re-rendered when the section directory changes. */
  repaint: Set<() => void> | null;
}

export interface CrossReferenceAttrs {
  target: string;
  display?: CrossReferenceDisplay;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    crossReference: {
      /** Insert a reference to another section at the caret. */
      insertCrossReference: (attrs: CrossReferenceAttrs) => ReturnType;
    };
  }
}

export const CrossReference = Node.create<CrossReferenceOptions>({
  name: 'crossReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { lookup: null, repaint: null };
  },

  addAttributes() {
    return {
      target: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute(CROSS_REF_TARGET_ATTR),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.target ? { [CROSS_REF_TARGET_ATTR]: String(attrs.target) } : {},
      },
      display: {
        default: 'code-title' as CrossReferenceDisplay,
        parseHTML: (el: HTMLElement) =>
          normalizeCrossReferenceDisplay(el.getAttribute(CROSS_REF_DISPLAY_ATTR)),
        renderHTML: (attrs: Record<string, unknown>) => ({
          [CROSS_REF_DISPLAY_ATTR]: normalizeCrossReferenceDisplay(attrs.display),
        }),
      },
      /* Last-known rendering. See the header: a cache, never a source. */
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
        /* Above the Link mark's `a[href]` rule so a reference is never parsed
           as an ordinary link — which would keep the printed number as plain
           text and drop the target id, i.e. exactly the old behaviour. */
        tag: `a[${CROSS_REF_TARGET_ATTR}]`,
        priority: 60,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    /* The label is serialized as the element's TEXT rather than as another
       attribute: that is what a text-comparing fidelity gate, a plain-text
       extraction and a search index can all read without knowing what a
       cross-reference is. */
    return ['a', mergeAttributes(HTMLAttributes), String(node.attrs.label ?? '')];
  },

  addCommands() {
    return {
      insertCrossReference:
        (attrs: CrossReferenceAttrs) =>
        ({ commands }) => {
          const target = (attrs.target ?? '').trim();
          if (!target) return false;
          const display = normalizeCrossReferenceDisplay(attrs.display);
          const lookup = this.options.lookup?.() ?? null;
          const resolved = resolveCrossReference(target, display, lookup);
          // A reference is only ever inserted to a section that exists right
          // now — the picker offers the live directory, so an unresolvable
          // insert means the list moved under the writer, and inserting a
          // reference already broken is not a thing to do quietly.
          if (!resolved.found) return false;
          return commands.insertContent({
            type: this.name,
            attrs: { target, display, label: resolved.text },
          });
        },
    };
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('a');
      dom.className = 'rse-xref';
      // Not a navigation: clicking a reference in the canvas places the caret.
      dom.setAttribute('role', 'link');
      dom.setAttribute(CROSS_REF_TARGET_ATTR, String(node.attrs.target ?? ''));

      const paint = () => {
        const display = normalizeCrossReferenceDisplay(node.attrs.display);
        const lookup = this.options.lookup?.() ?? null;
        const resolved = resolveCrossReference(
          String(node.attrs.target ?? ''),
          display,
          lookup,
        );
        if (resolved.found) {
          delete dom.dataset.missing;
          dom.textContent = resolved.text;
          dom.title = 'Cross-reference — kept current with the section it points to.';
          return;
        }
        /* STATED, not guessed. The cached label is deliberately not used as a
           fallback: printing the last number this reference happened to show
           is the failure this whole feature exists to remove. */
        dom.dataset.missing = '1';
        dom.textContent = CROSS_REFERENCE_MISSING_TEXT;
        dom.title =
          'The section this reference points to is no longer in this document. ' +
          'Point it at another section or delete it.';
      };
      paint();

      const repaint = this.options.repaint ?? null;
      repaint?.add(paint);

      return {
        dom,
        // A different target is a different reference — rebuild the view.
        update: (updated) =>
          updated.type.name === this.name &&
          updated.attrs.target === node.attrs.target &&
          updated.attrs.display === node.attrs.display,
        destroy: () => {
          repaint?.delete(paint);
        },
      };
    };
  },
});
