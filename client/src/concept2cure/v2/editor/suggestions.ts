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
 * KNOWN v1 LIMITS (deliberate, documented rather than hidden):
 *   - Only same-textblock deletions are reinterpreted as suggestions.
 *     Structural edits (joining/splitting paragraphs, deleting across block
 *     boundaries, table surgery) apply directly, untracked.
 *   - Formatting-only changes (bold, heading level) are not tracked.
 *   - Undo/redo and remote collaboration transactions pass through untouched:
 *     an undo must restore the previous state, not generate counter-suggestions,
 *     and a collaborator's edits arrive already marked by their editor.
 */

import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { ReplaceStep } from '@tiptap/pm/transform';
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
          // Descending order so earlier positions stay valid as text is removed.
          for (const r of [...ranges].sort((a, b) => b.from - a.from)) {
            const keepText = (r.kind === 'insertion') === (action === 'accept');
            if (keepText) {
              tr.removeMark(r.from, r.to, r.kind === 'insertion' ? insertion : deletion);
            } else {
              tr.delete(r.from, r.to);
            }
          }
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
          const paras = clean.replace(/\r\n/g, '\n').split(/\n{2,}/);
          const nodes = paras.map((p) =>
            state.schema.nodes.paragraph.create(
              null,
              p
                ? Fragment.from(state.schema.text(p.replace(/\n+/g, ' '), [mark]))
                : Fragment.empty,
            ),
          );
          tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0));
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
