/**
 * PageBreak — Custom TipTap node extension for explicit page breaks.
 *
 * Renders as a visual divider in the editor with "Page Break" label.
 * On export (DOCX/PDF), maps to page-break-after: always.
 */

import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Insert an explicit page break at the current selection. */
      setPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [
      { tag: 'div[data-page-break]' },
      { tag: 'hr.page-break' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-page-break': 'true',
        class: 'page-break',
        style: [
          'page-break-after: always',
          'border: none',
          'border-top: 2px dashed rgb(168,162,158)',
          'margin: 2rem 0',
          'padding: 0.5rem 0',
          'text-align: center',
          'position: relative',
        ].join(';'),
        contenteditable: 'false',
      }),
      [
        'span',
        {
          style: [
            'background: white',
            'color: rgb(168,162,158)',
            'padding: 0 0.75rem',
            'font-size: 11px',
            'text-transform: uppercase',
            'letter-spacing: 0.05em',
            'position: relative',
            'top: -0.15rem',
          ].join(';'),
        },
        'Page Break',
      ],
    ];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ commands }: any) => {
          return commands.insertContent({ type: this.name });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => (this.editor as any).commands.setPageBreak(),
    };
  },
});

export default PageBreak;
