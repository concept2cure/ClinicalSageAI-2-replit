/**
 * Range-anchored comments for the canonical section editor.
 *
 * The comment store (`authoring_comments`) has carried `anchor` and
 * `position_data` JSONB columns since its migration, written verbatim from the
 * create request — but every client wrote comments at section granularity, so
 * a reviewer's "this claim needs a citation" pointed at 4,000 words. This mark
 * is the missing half: the range lives IN the document as a `commentAnchor`
 * mark carrying the server-issued comment id, so it survives edits around it,
 * moves with the text it annotates, and persists in saved HTML and revision
 * snapshots. The comment row keeps the text snapshot in `anchor` (see
 * `CommentAnchorPayload`) so the thread stays meaningful even if the marked
 * text is later deleted.
 *
 * Resolution model: the mark is the anchor, the row is the thread. Resolving
 * or deleting the comment leaves any orphaned mark inert (rendered only while
 * its id is in the live open-comment set — the component passes those ids in).
 */

import { Mark } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';

/** What DocumentAuthoring persists into `authoring_comments.anchor`. */
export interface CommentAnchorPayload {
  kind: 'text-range';
  /** The exact text the comment was made on, at creation time. */
  quote: string;
  /** Range in the section document at creation time (advisory — the mark in
   *  the document is authoritative once saved; these survive for audit). */
  from: number;
  to: number;
}

export interface CommentAnchorOptions {
  /** Click on annotated text → open that thread in the comments rail. */
  onAnchorClick: ((commentId: string) => void) | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentAnchor: {
      /** Anchor the current selection to a server-issued comment id. */
      setCommentAnchor: (commentId: string) => ReturnType;
      /** Remove the anchor for one comment id everywhere in the doc. */
      unsetCommentAnchor: (commentId: string) => ReturnType;
    };
  }
}

const clickKey = new PluginKey('c2cCommentAnchorClick');

export const CommentAnchor = Mark.create<CommentAnchorOptions>({
  name: 'commentAnchor',
  // Typing at the edge of an annotated range should not extend the annotation.
  inclusive: false,
  // A range can carry a comment and a suggestion at once.
  excludes: '',

  addOptions() {
    return { onAnchorClick: null };
  },

  addAttributes() {
    return {
      commentId: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.commentId ? { 'data-comment-id': String(attrs.commentId) } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'rse-comment-anchor' }, 0];
  },

  addCommands() {
    return {
      setCommentAnchor:
        (commentId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { commentId }),
      unsetCommentAnchor:
        (commentId: string) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.marks[this.name];
          let found = false;
          state.doc.descendants((node: PMNode, pos: number) => {
            const mark = node.marks.find(
              (m) => m.type === type && m.attrs.commentId === commentId,
            );
            if (mark) {
              tr.removeMark(pos, pos + node.nodeSize, mark);
              found = true;
            }
          });
          if (found && dispatch) dispatch(tr);
          return found;
        },
    };
  },

  addProseMirrorPlugins() {
    const opts = this.options;
    return [
      new Plugin({
        key: clickKey,
        props: {
          handleClickOn(_view, _pos, node, _nodePos, _event, direct) {
            if (!direct || !opts.onAnchorClick) return false;
            const mark = node.marks?.find((m) => m.type.name === 'commentAnchor');
            const id = mark?.attrs.commentId;
            if (typeof id === 'string' && id) {
              opts.onAnchorClick(id);
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

/** Every comment id currently anchored in the document, with its first range. */
export function collectCommentAnchors(doc: PMNode): Map<string, { from: number; to: number }> {
  const out = new Map<string, { from: number; to: number }>();
  doc.descendants((node, pos) => {
    for (const m of node.marks) {
      if (m.type.name !== 'commentAnchor') continue;
      const id = m.attrs.commentId as string | null;
      if (!id) continue;
      const cur = out.get(id);
      if (!cur) out.set(id, { from: pos, to: pos + node.nodeSize });
      else cur.to = Math.max(cur.to, pos + node.nodeSize);
    }
  });
  return out;
}
