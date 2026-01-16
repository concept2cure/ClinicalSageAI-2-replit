import { Editor } from '@tiptap/react';

interface RecordLike {
  [key: string]: unknown;
}

const createCellContent = (value: unknown) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value != null ? String(value) : '' }],
});

export const insertTableFromData = (
  editor: Editor | null,
  data: RecordLike[],
  sourceId: string,
  sourceLabel: string,
) => {
  if (!editor || !Array.isArray(data) || data.length === 0) {
    return false;
  }

  const headers = Object.keys(data[0] ?? {});
  if (headers.length === 0) {
    return false;
  }

  const tableNode = {
    type: 'table',
    attrs: {
      sourceId,
      sourceLabel,
      lastUpdated: new Date().toISOString(),
    },
    content: [
      {
        type: 'tableRow',
        content: headers.map(header => ({
          type: 'tableHeader',
          content: [createCellContent(header)],
        })),
      },
      ...data.map(row => ({
        type: 'tableRow',
        content: headers.map(header => ({
          type: 'tableCell',
          content: [createCellContent((row as RecordLike)[header])],
        })),
      })),
    ],
  };

  editor.chain().focus().insertContent(tableNode).run();
  return true;
};
