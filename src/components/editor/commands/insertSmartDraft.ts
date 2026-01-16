import type { Editor } from '@tiptap/react';
import { parseAIResponse } from '../../../utils/ai/SmartContentParser';
import type { SourceReference } from '../../../services/LumenAIService';

interface InsertSmartDraftOptions {
  sources?: SourceReference[];
}

export const insertSmartDraft = (editor: Editor, rawText: string, options?: InsertSmartDraftOptions) => {
  if (!rawText) {
    return;
  }

  const nodes = parseAIResponse(rawText, options?.sources);
  if (!nodes.length) {
    return;
  }

  const nodeIdPrefix = `chip-${Date.now()}`;
  let counter = 0;

  const sourcesByLabel = new Map<string, SourceReference>();
  options?.sources?.forEach(source => {
    sourcesByLabel.set(source.name.toLowerCase(), source);
    sourcesByLabel.set(source.id.toLowerCase(), source);
  });

  editor
    .chain()
    .focus()
    .insertContent({
      type: 'paragraph',
      content: nodes.map(node => {
        if (node.type === 'smartData') {
          const nodeId = `${nodeIdPrefix}-${counter++}`;
          const sourceLabel = (node.attrs?.sourceLabel as string)?.toLowerCase() ?? '';
          const matchedSource = sourcesByLabel.get(sourceLabel);
          const sourceId = matchedSource?.id ?? (node.attrs?.id as string) ?? 'unlinked';

          return {
            ...node,
            attrs: {
              ...node.attrs,
              id: sourceId,
              nodeId,
            },
          };
        }

        return node;
      }),
    })
    .scrollIntoView()
    .run();
};
