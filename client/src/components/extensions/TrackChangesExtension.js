import { Mark } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const TrackChangesExtension = Mark.create({
  name: 'trackChanges',

  addOptions() {
    return {
      HTMLAttributes: {},
      author: 'Unknown',
      enabled: true,
      changes: [],
      onChangeAdded: () => {},
    };
  },

  addAttributes() {
    return {
      changeType: {
        default: null,
        parseHTML: element => element.getAttribute('data-change-type'),
        renderHTML: attributes => {
          if (!attributes.changeType) return {};
          return {
            'data-change-type': attributes.changeType,
          };
        },
      },
      changeId: {
        default: null,
        parseHTML: element => element.getAttribute('data-change-id'),
        renderHTML: attributes => {
          if (!attributes.changeId) return {};
          return {
            'data-change-id': attributes.changeId,
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
      comment: {
        default: null,
        parseHTML: element => element.getAttribute('data-comment'),
        renderHTML: attributes => {
          if (!attributes.comment) return {};
          return {
            'data-comment': attributes.comment,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-change-type]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const changeType = HTMLAttributes['data-change-type'];
    const classes = ['track-change'];
    
    if (changeType === 'insertion') {
      classes.push('track-insertion');
    } else if (changeType === 'deletion') {
      classes.push('track-deletion');
    } else if (changeType === 'format') {
      classes.push('track-format');
    }

    return ['span', { ...HTMLAttributes, class: classes.join(' ') }, 0];
  },

  addProseMirrorPlugins() {
    const extension = this;
    
    return [
      new Plugin({
        key: new PluginKey('trackChanges'),
        state: {
          init() {
            return {
              enabled: extension.options.enabled,
              changes: extension.options.changes,
              decorations: DecorationSet.empty,
            };
          },
          apply(tr, state) {
            const meta = tr.getMeta('trackChanges');
            if (meta) {
              if (meta.enabled !== undefined) {
                state = { ...state, enabled: meta.enabled };
              }
              if (meta.changes !== undefined) {
                state = { ...state, changes: meta.changes };
              }
            }

            // Track new changes
            if (state.enabled && tr.docChanged) {
              const change = {
                id: `change-${Date.now()}`,
                type: 'edit',
                author: extension.options.author,
                timestamp: new Date().toISOString(),
                from: tr.mapping.map(tr.selection.from),
                to: tr.mapping.map(tr.selection.to),
              };

              // Add change to list
              state.changes = [...state.changes, change];
              
              // Notify about change
              if (extension.options.onChangeAdded) {
                extension.options.onChangeAdded(change);
              }
            }

            // Create decorations for changes
            if (state.enabled && state.changes.length > 0) {
              const decorations = state.changes.map(change => {
                const decoration = Decoration.inline(
                  change.from,
                  change.to,
                  {
                    class: `track-change track-${change.type}`,
                    'data-change-id': change.id,
                    'data-author': change.author,
                    'data-timestamp': change.timestamp,
                  }
                );
                return decoration;
              }).filter(d => d);

              state.decorations = DecorationSet.create(tr.doc, decorations);
            }

            return state;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state).decorations;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      toggleTrackChanges: () => ({ tr, dispatch }) => {
        if (dispatch) {
          const state = this.editor.state.plugins
            .find(plugin => plugin.key === 'trackChanges')
            ?.getState(this.editor.state);
          
          tr.setMeta('trackChanges', {
            enabled: !state?.enabled,
          });
        }
        return true;
      },
      acceptChange: (changeId) => ({ tr, dispatch }) => {
        if (dispatch) {
          const state = this.editor.state.plugins
            .find(plugin => plugin.key === 'trackChanges')
            ?.getState(this.editor.state);
          
          const changes = state?.changes.filter(c => c.id !== changeId) || [];
          
          tr.setMeta('trackChanges', { changes });
        }
        return true;
      },
      rejectChange: (changeId) => ({ tr, dispatch }) => {
        if (dispatch) {
          const state = this.editor.state.plugins
            .find(plugin => plugin.key === 'trackChanges')
            ?.getState(this.editor.state);
          
          const change = state?.changes.find(c => c.id === changeId);
          if (change) {
            // Revert the change
            tr.delete(change.from, change.to);
            
            // Remove from changes list
            const changes = state.changes.filter(c => c.id !== changeId);
            tr.setMeta('trackChanges', { changes });
          }
        }
        return true;
      },
      acceptAllChanges: () => ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setMeta('trackChanges', { changes: [] });
        }
        return true;
      },
      rejectAllChanges: () => ({ tr, dispatch }) => {
        if (dispatch) {
          const state = this.editor.state.plugins
            .find(plugin => plugin.key === 'trackChanges')
            ?.getState(this.editor.state);
          
          // Revert all changes in reverse order
          const changes = state?.changes || [];
          changes.reverse().forEach(change => {
            tr.delete(change.from, change.to);
          });
          
          tr.setMeta('trackChanges', { changes: [] });
        }
        return true;
      },
    };
  },
});