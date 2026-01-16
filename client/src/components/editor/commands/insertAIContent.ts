import { Editor } from '@tiptap/react';
import { parseAIResponseToContent } from '@/utils/ai/smartParser';

export const insertAIContent = (editor: Editor | null, rawText: string) => {
  if (!editor || !rawText) {
    return false;
  }

  const content = parseAIResponseToContent(rawText);
  editor.chain().focus().insertContent(content).run();
  return true;
};
