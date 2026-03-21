/**
 * CommentMark — TipTap mark extension for inline comments.
 *
 * Creates highlighted regions that can have comment threads attached.
 * Pattern follows the existing TraceabilityMark extension.
 */

import { Mark, mergeAttributes } from '@tiptap/core';

export interface CommentThread {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  resolved: boolean;
  highlightedText?: string;
  replies: Array<{
    id: string;
    text: string;
    authorId: string;
    authorName: string;
    createdAt: string;
  }>;
}

export const CommentMark = Mark.create({
  name: 'comment',

  addAttributes() {
    return {
      commentId: {
        default: null,
      },
      authorId: {
        default: null,
      },
      authorName: {
        default: null,
      },
      createdAt: {
        default: null,
      },
      resolved: {
        default: false,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-comment]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const resolved = HTMLAttributes.resolved === true || HTMLAttributes.resolved === 'true';
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-comment': 'true',
        'data-comment-id': HTMLAttributes.commentId,
        class: resolved
          ? 'comment-mark comment-resolved bg-zinc-100 border-b border-dashed border-zinc-400 cursor-pointer'
          : 'comment-mark bg-amber-100 border-b-2 border-amber-400 cursor-pointer hover:bg-amber-200',
      }),
      0,
    ];
  },
});

export default CommentMark;
