/**
 * TrackChangesExtension — TipTap mark extensions for inline track changes.
 *
 * Provides two marks:
 *   - `insertion` — green highlight for added text
 *   - `deletion` — red strikethrough for removed text
 *
 * Plus a ProseMirror plugin that intercepts editor transactions when
 * "suggestion mode" is active, converting direct edits into tracked marks.
 *
 * Each change carries: author, timestamp, changeId.
 * Accept = remove mark, keep content.  Reject = remove mark + content (for insertions)
 * or remove mark and restore (for deletions — text stays).
 */

import { Mark, mergeAttributes, Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    trackChanges: {
      /** Toggle whether direct edits are captured as tracked changes. */
      toggleSuggestionMode: () => ReturnType;
      /** Explicitly enable or disable suggestion mode. */
      setSuggestionMode: (enabled: boolean) => ReturnType;
      /** Accept a single tracked change by id. */
      acceptChange: (changeId: string) => ReturnType;
      /** Reject a single tracked change by id. */
      rejectChange: (changeId: string) => ReturnType;
      /** Accept every tracked change in the document. */
      acceptAllChanges: () => ReturnType;
      /** Reject every tracked change in the document. */
      rejectAllChanges: () => ReturnType;
    };
  }
}

// ── Insertion Mark ──────────────────────────────────────────────────────────

export const InsertionMark = Mark.create({
  name: 'insertion',
  priority: 1000,

  addAttributes() {
    return {
      changeId: { default: null },
      author: { default: null },
      authorName: { default: null },
      timestamp: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'ins[data-change-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'ins',
      mergeAttributes(HTMLAttributes, {
        class: 'track-insertion',
        style:
          'background-color: rgba(34,197,94,0.15); text-decoration: none; border-bottom: 2px solid rgb(34,197,94);',
        'data-change-id': HTMLAttributes.changeId,
        'data-author': HTMLAttributes.author,
        title: `Added by ${HTMLAttributes.authorName || 'Unknown'} at ${HTMLAttributes.timestamp || ''}`,
      }),
      0,
    ];
  },
});

// ── Deletion Mark ───────────────────────────────────────────────────────────

export const DeletionMark = Mark.create({
  name: 'deletion',
  priority: 1000,

  addAttributes() {
    return {
      changeId: { default: null },
      author: { default: null },
      authorName: { default: null },
      timestamp: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'del[data-change-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'del',
      mergeAttributes(HTMLAttributes, {
        class: 'track-deletion',
        style:
          'background-color: rgba(239,68,68,0.15); text-decoration: line-through; color: rgb(185,28,28);',
        'data-change-id': HTMLAttributes.changeId,
        'data-author': HTMLAttributes.author,
        title: `Deleted by ${HTMLAttributes.authorName || 'Unknown'} at ${HTMLAttributes.timestamp || ''}`,
      }),
      0,
    ];
  },
});

// ── Suggestion Mode Plugin ──────────────────────────────────────────────────

const suggestionModeKey = new PluginKey('suggestionMode');

export interface TrackChangesOptions {
  enabled: boolean;
  authorId: string;
  authorName: string;
}

/**
 * TrackChanges extension — wraps InsertionMark + DeletionMark + suggestion-mode plugin.
 *
 * Usage:
 *   TrackChanges.configure({ enabled: false, authorId: 'user-1', authorName: 'Jane' })
 *
 * Commands:
 *   editor.commands.toggleSuggestionMode()
 *   editor.commands.acceptChange(changeId)
 *   editor.commands.rejectChange(changeId)
 */
export const TrackChanges = Extension.create<TrackChangesOptions>({
  name: 'trackChanges',

  addOptions() {
    return {
      enabled: false,
      authorId: 'unknown',
      authorName: 'Unknown',
    };
  },

  addExtensions() {
    return [InsertionMark, DeletionMark];
  },

  addCommands() {
    return {
      toggleSuggestionMode:
        () =>
        ({ tr, dispatch }: any) => {
          if (dispatch) {
            const current = tr.getMeta(suggestionModeKey) ?? this.options.enabled;
            this.options.enabled = !current;
          }
          return true;
        },

      setSuggestionMode:
        (enabled: boolean) =>
        ({ dispatch }: any) => {
          if (dispatch) {
            this.options.enabled = enabled;
          }
          return true;
        },

      acceptChange:
        (changeId: string) =>
        ({ tr, state, dispatch }: any) => {
          if (!dispatch) return false;

          // Walk through the document and remove insertion/deletion marks with this changeId
          const { doc } = state;
          let modified = false;

          doc.descendants((node: any, pos: number) => {
            // For insertions: remove the mark, keep the text
            const insertionMark = node.marks?.find(
              (m: any) => m.type.name === 'insertion' && m.attrs.changeId === changeId,
            );
            if (insertionMark) {
              tr.removeMark(pos, pos + node.nodeSize, insertionMark.type);
              modified = true;
            }

            // For deletions: remove the entire text (accepting a deletion = text is gone)
            const deletionMark = node.marks?.find(
              (m: any) => m.type.name === 'deletion' && m.attrs.changeId === changeId,
            );
            if (deletionMark) {
              tr.delete(pos, pos + node.nodeSize);
              modified = true;
            }
          });

          if (modified) dispatch(tr);
          return modified;
        },

      rejectChange:
        (changeId: string) =>
        ({ tr, state, dispatch }: any) => {
          if (!dispatch) return false;

          const { doc } = state;
          let modified = false;

          doc.descendants((node: any, pos: number) => {
            // For insertions: remove the text entirely (rejecting an insertion = undo it)
            const insertionMark = node.marks?.find(
              (m: any) => m.type.name === 'insertion' && m.attrs.changeId === changeId,
            );
            if (insertionMark) {
              tr.delete(pos, pos + node.nodeSize);
              modified = true;
            }

            // For deletions: remove the mark, keep the text (rejecting deletion = keep text)
            const deletionMark = node.marks?.find(
              (m: any) => m.type.name === 'deletion' && m.attrs.changeId === changeId,
            );
            if (deletionMark) {
              tr.removeMark(pos, pos + node.nodeSize, deletionMark.type);
              modified = true;
            }
          });

          if (modified) dispatch(tr);
          return modified;
        },

      acceptAllChanges:
        () =>
        ({ editor }: any) => {
          const changeIds = new Set<string>();
          editor.state.doc.descendants((node: any) => {
            node.marks?.forEach((m: any) => {
              if ((m.type.name === 'insertion' || m.type.name === 'deletion') && m.attrs.changeId) {
                changeIds.add(m.attrs.changeId);
              }
            });
          });
          changeIds.forEach((id) => editor.commands.acceptChange(id));
          return true;
        },

      rejectAllChanges:
        () =>
        ({ editor }: any) => {
          const changeIds = new Set<string>();
          editor.state.doc.descendants((node: any) => {
            node.marks?.forEach((m: any) => {
              if ((m.type.name === 'insertion' || m.type.name === 'deletion') && m.attrs.changeId) {
                changeIds.add(m.attrs.changeId);
              }
            });
          });
          changeIds.forEach((id) => editor.commands.rejectChange(id));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const extensionThis = this;

    return [
      new Plugin({
        key: suggestionModeKey,

        // Intercept transactions to wrap edits in track marks
        appendTransaction(transactions, _oldState, newState) {
          if (!extensionThis.options.enabled) return null;

          // Only process user-initiated transactions with doc changes
          const userTxs = transactions.filter((t) => t.docChanged && !t.getMeta('trackChanges'));
          if (userTxs.length === 0) return null;

          const tr = newState.tr;
          tr.setMeta('trackChanges', true);

          const changeId = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const attrs = {
            changeId,
            author: extensionThis.options.authorId,
            authorName: extensionThis.options.authorName,
            timestamp: new Date().toISOString(),
          };

          // For each step in the user transaction, wrap inserted content with insertion mark
          for (const transaction of userTxs) {
            transaction.steps.forEach((step) => {
              const stepMap = step.getMap();
              stepMap.forEach((oldStart: number, oldEnd: number, newStart: number, newEnd: number) => {
                // Text was inserted at newStart..newEnd
                if (newEnd > newStart) {
                  const insertionMarkType = newState.schema.marks.insertion;
                  if (insertionMarkType) {
                    tr.addMark(newStart, newEnd, insertionMarkType.create(attrs));
                  }
                }
              });
            });
          }

          return tr.steps.length > 0 ? tr : null;
        },
      }),
    ];
  },
});

export default TrackChanges;
