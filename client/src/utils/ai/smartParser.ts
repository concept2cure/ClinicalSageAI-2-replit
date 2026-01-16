import type { JSONContent } from '@tiptap/core';

const TOKEN_PATTERN = /\{\{([^|{}]+)\|([^|{}]+)\|([^{}]+)\}\}/g;

const createTextNodes = (text: string): JSONContent[] => {
  if (!text) {
    return [];
  }

  const segments = text.split(/\n/);
  const nodes: JSONContent[] = [];

  segments.forEach((segment, index) => {
    if (segment.length > 0) {
      nodes.push({
        type: 'text',
        text: segment,
      });
    }

    if (index < segments.length - 1) {
      nodes.push({ type: 'hardBreak' });
    }
  });

  return nodes;
};

export const parseAIResponseToContent = (text: string): JSONContent => {
  if (!text) {
    return {
      type: 'paragraph',
      content: [],
    };
  }

  const content: JSONContent[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    const [matched, value, sourceLabel, confidenceRaw] = match;

    const preceding = text.slice(lastIndex, match.index);
    content.push(...createTextNodes(preceding));

    const confidence = Number.parseFloat(confidenceRaw.trim());

    content.push({
      type: 'smartData',
      attrs: {
        value: value.trim(),
        sourceLabel: sourceLabel.trim(),
        confidence: Number.isFinite(confidence) ? confidence : 0,
      },
    });

    lastIndex = match.index + matched.length;
  }

  const trailing = text.slice(lastIndex);
  content.push(...createTextNodes(trailing));

  return {
    type: 'paragraph',
    content,
  };
};
