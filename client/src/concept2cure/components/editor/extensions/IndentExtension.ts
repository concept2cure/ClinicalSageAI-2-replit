/**
 * IndentExtension — Paragraph indentation via margin-left.
 *
 * Adds indent/outdent commands that increase/decrease margin-left
 * on paragraph and heading nodes by 2rem increments (max 10 levels).
 */

import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      /** Increase the indent level of the selected block(s). */
      indent: () => ReturnType;
      /** Decrease the indent level of the selected block(s). */
      outdent: () => ReturnType;
    };
  }
}

const MAX_INDENT = 10;
const INDENT_REM_STEP = 2;
const INDENT_PX_STEP = 32;
const BLOCKED_SHORTCUT_CONTEXTS = [
  'table',
  'bulletList',
  'orderedList',
  'taskList',
  'taskItem',
  'codeBlock',
];

export function clampIndentLevel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_INDENT, Math.round(value)));
}

export function parseIndentFromMarginLeft(marginLeft: string | undefined | null): number {
  if (!marginLeft) return 0;

  const trimmed = marginLeft.trim().toLowerCase();
  const match = trimmed.match(/^(-?\d*\.?\d+)\s*(px|rem)$/);
  if (!match) return 0;

  const numeric = Number.parseFloat(match[1]);
  const unit = match[2];
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;

  if (unit === 'rem') return clampIndentLevel(numeric / INDENT_REM_STEP);
  if (unit === 'px') return clampIndentLevel(numeric / INDENT_PX_STEP);
  return 0;
}

export function canHandleIndentShortcut(editor: {
  storage?: { aiAutocomplete?: { ghostText?: string | null } };
  isEditable?: boolean;
  isActive: (name: string) => boolean;
}): boolean {
  if (editor.isEditable === false) return false;
  if (editor.storage?.aiAutocomplete?.ghostText) return false;

  return !BLOCKED_SHORTCUT_CONTEXTS.some(node => editor.isActive(node));
}

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
              return parseIndentFromMarginLeft(element.style.marginLeft);
            },
            renderHTML: (attributes) => {
              if (!attributes.indent || attributes.indent <= 0) return {};
              return { style: `margin-left: ${attributes.indent * INDENT_REM_STEP}rem` };
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
    } as any;
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const editor = this.editor as any;
        if (!canHandleIndentShortcut(editor)) return false;
        editor.commands.indent();
        return true;
      },
      'Shift-Tab': () => {
        const editor = this.editor as any;
        if (!canHandleIndentShortcut(editor)) return false;
        editor.commands.outdent();
        return true;
      },
    };
  },
});

export default Indent;
