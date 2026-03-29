/**
 * IndentExtension — Paragraph indentation via margin-left.
 *
 * Adds indent/outdent commands that increase/decrease margin-left
 * on paragraph and heading nodes by 2rem increments (max 10 levels).
 */

import { Extension } from '@tiptap/core';

const MAX_INDENT = 10;

export const Indent = Extension.create({
  name: 'indent',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const ml = element.style.marginLeft;
              if (!ml) return 0;
              const val = parseInt(ml, 10);
              return isNaN(val) ? 0 : Math.round(val / 32); // 2rem ≈ 32px
            },
            renderHTML: (attributes) => {
              if (!attributes.indent || attributes.indent <= 0) return {};
              return { style: `margin-left: ${attributes.indent * 2}rem` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ tr, state, dispatch }: any) => {
          const { selection } = state;
          const { from, to } = selection;
          let changed = false;

          state.doc.nodesBetween(from, to, (node: any, pos: number) => {
            if (node.type.name === 'paragraph' || node.type.name === 'heading') {
              const current = node.attrs.indent || 0;
              if (current < MAX_INDENT) {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: current + 1 });
                changed = true;
              }
            }
          });

          if (changed && dispatch) dispatch(tr);
          return changed;
        },

      outdent:
        () =>
        ({ tr, state, dispatch }: any) => {
          const { selection } = state;
          const { from, to } = selection;
          let changed = false;

          state.doc.nodesBetween(from, to, (node: any, pos: number) => {
            if (node.type.name === 'paragraph' || node.type.name === 'heading') {
              const current = node.attrs.indent || 0;
              if (current > 0) {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: current - 1 });
                changed = true;
              }
            }
          });

          if (changed && dispatch) dispatch(tr);
          return changed;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => (this.editor as any).commands.indent(),
      'Shift-Tab': () => (this.editor as any).commands.outdent(),
    };
  },
});

export default Indent;
