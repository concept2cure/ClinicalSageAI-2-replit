import { Editor } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { insertTableFromData } from './insertTableFromData';

interface RecordLike {
  [key: string]: unknown;
}

export const updateTableData = (
  editor: Editor | null,
  sourceId: string,
  newData: RecordLike[],
  sourceLabelOverride?: string,
) => {
  if (!editor || !sourceId || !Array.isArray(newData) || newData.length === 0) {
    return false;
  }

  let targetPosition = -1;
  let targetNode: ProseMirrorNode | null = null;

  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'table' && node.attrs?.sourceId === sourceId) {
      targetPosition = position;
      targetNode = node;
      return false;
    }
    return true;
  });

  if (targetPosition === -1 || !targetNode) {
    console.warn(`Table with sourceId ${sourceId} not found.`);
    return false;
  }

  const from = targetPosition;
  const to = targetPosition + targetNode.nodeSize;

  editor.chain().focus().deleteRange({ from, to }).run();
  editor.commands.setTextSelection(from);

  const sourceLabel = (sourceLabelOverride ?? (targetNode.attrs?.sourceLabel as string)) || sourceId;
  const inserted = insertTableFromData(editor, newData, sourceId, sourceLabel);

  if (!inserted) {
    console.warn(`Failed to insert updated table for ${sourceId}.`);
    return false;
  }

  console.log(`Table ${sourceId} updated successfully.`);
  return true;
};
