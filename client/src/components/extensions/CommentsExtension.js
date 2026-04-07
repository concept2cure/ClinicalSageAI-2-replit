import { Mark } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const CommentsExtension = Mark.create({
  name: 'comment',

  addOptions() {
    return {
      HTMLAttributes: {},
      comments: [],
      onCommentAdded: () => {},
      onCommentDeleted: () => {},
      onCommentResolved: () => {},
      currentUser: 'User',
    };
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: element => element.getAttribute('data-comment-id'),
        renderHTML: attributes => {
          if (!attributes.commentId) return {};
          return {
            'data-comment-id': attributes.commentId,
          };
        },
      },
      author: {
        default: null,
        parseHTML: element => element.getAttribute('data-author'),
        renderHTML: attributes => {
          if (!attributes.author) return {};
          return {
            'data-author': attributes.author,
          };
        },
      },
      timestamp: {
        default: null,
        parseHTML: element => element.getAttribute('data-timestamp'),
        renderHTML: attributes => {
          if (!attributes.timestamp) return {};
          return {
            'data-timestamp': attributes.timestamp,
          };
        },
      },
      resolved: {
        default: false,
        parseHTML: element => element.getAttribute('data-resolved') === 'true',
        renderHTML: attributes => {
          return {
            'data-resolved': attributes.resolved,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-comment-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const resolved = HTMLAttributes['data-resolved'] === 'true';
    const classes = ['comment-mark'];
    
    if (resolved) {
      classes.push('comment-resolved');
    } else {
      classes.push('comment-active');
    }

    return ['span', { ...HTMLAttributes, class: classes.join(' ') }, 0];
  },

  addProseMirrorPlugins() {
    const extension = this;
    
    return [
      new Plugin({
        key: new PluginKey('comments'),
        state: {
          init() {
            return {
              comments: extension.options.comments,
              decorations: DecorationSet.empty,
              activeComment: null,
            };
          },
          apply(tr, state) {
            const meta = tr.getMeta('comments');
            if (meta) {
              if (meta.comments !== undefined) {
                state = { ...state, comments: meta.comments };
              }
              if (meta.activeComment !== undefined) {
                state = { ...state, activeComment: meta.activeComment };
              }
            }

            // Create decorations for comments
            const decorations = state.comments.map(comment => {
              if (!comment.from || !comment.to) return null;
              
              const decoration = Decoration.inline(
                comment.from,
                comment.to,
                {
                  class: `comment-mark ${comment.resolved ? 'comment-resolved' : 'comment-active'}`,
                  'data-comment-id': comment.id,
                  'data-author': comment.author,
                  'data-timestamp': comment.timestamp,
                  'data-resolved': comment.resolved,
                  title: `${comment.author}: ${comment.text}`,
                },
                { inclusiveStart: true, inclusiveEnd: true }
              );
              return decoration;
            }).filter(d => d);

            state.decorations = DecorationSet.create(tr.doc, decorations);

            return state;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state).decorations;
          },
          handleClick: (view, pos) => {
            const state = this.getState(view.state);
            const decorations = state.decorations.find(pos, pos);
            
            if (decorations.length > 0) {
              const decoration = decorations[0];
              const commentId = decoration.type.attrs['data-comment-id'];
              const comment = state.comments.find(c => c.id === commentId);
              
              if (comment) {
                // Set active comment
                const tr = view.state.tr;
                tr.setMeta('comments', { activeComment: comment });
                view.dispatch(tr);
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      addComment: (text, from = null, to = null) => ({ state, dispatch }) => {
        const { selection } = state;
        const commentFrom = from !== null ? from : selection.from;
        const commentTo = to !== null ? to : selection.to;

        if (dispatch) {
          const commentsState = state.plugins
            .find(plugin => plugin.spec.key?.key === 'comments')
            ?.getState(state);
          
          const newComment = {
            id: `comment-${Date.now()}`,
            text,
            author: this.options.currentUser,
            timestamp: new Date().toISOString(),
            from: commentFrom,
            to: commentTo,
            resolved: false,
            replies: [],
          };

          const comments = [...(commentsState?.comments || []), newComment];
          
          const tr = state.tr;
          tr.setMeta('comments', { comments });
          dispatch(tr);

          if (this.options.onCommentAdded) {
            this.options.onCommentAdded(newComment);
          }
        }
        return true;
      },
      
      resolveComment: (commentId) => ({ state, dispatch }) => {
        if (dispatch) {
          const commentsState = state.plugins
            .find(plugin => plugin.spec.key?.key === 'comments')
            ?.getState(state);
          
          const comments = (commentsState?.comments || []).map(comment => 
            comment.id === commentId 
              ? { ...comment, resolved: true, resolvedBy: this.options.currentUser, resolvedAt: new Date().toISOString() }
              : comment
          );
          
          const tr = state.tr;
          tr.setMeta('comments', { comments });
          dispatch(tr);

          if (this.options.onCommentResolved) {
            this.options.onCommentResolved(commentId);
          }
        }
        return true;
      },
      
      deleteComment: (commentId) => ({ state, dispatch }) => {
        if (dispatch) {
          const commentsState = state.plugins
            .find(plugin => plugin.spec.key?.key === 'comments')
            ?.getState(state);
          
          const comments = (commentsState?.comments || []).filter(comment => comment.id !== commentId);
          
          const tr = state.tr;
          tr.setMeta('comments', { comments });
          dispatch(tr);

          if (this.options.onCommentDeleted) {
            this.options.onCommentDeleted(commentId);
          }
        }
        return true;
      },
      
      replyToComment: (commentId, replyText) => ({ state, dispatch }) => {
        if (dispatch) {
          const commentsState = state.plugins
            .find(plugin => plugin.spec.key?.key === 'comments')
            ?.getState(state);
          
          const comments = (commentsState?.comments || []).map(comment => {
            if (comment.id === commentId) {
              const reply = {
                id: `reply-${Date.now()}`,
                text: replyText,
                author: this.options.currentUser,
                timestamp: new Date().toISOString(),
              };
              return {
                ...comment,
                replies: [...(comment.replies || []), reply],
              };
            }
            return comment;
          });
          
          const tr = state.tr;
          tr.setMeta('comments', { comments });
          dispatch(tr);
        }
        return true;
      },
    };
  },
});