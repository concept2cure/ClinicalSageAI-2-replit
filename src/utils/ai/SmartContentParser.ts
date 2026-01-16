import { JSONContent } from '@tiptap/react';
import type { SourceReference } from '../../services/LumenAIService';

const TOKEN_MATCHER = /(\{\{.*?\|.*?\|.*?\}\})/g;

const parseConfidence = (confidence: string): number => {
  const numeric = confidence.replace(/[^0-9.+-]/g, '');
  const parsed = Number.parseFloat(numeric);
  return Number.isFinite(parsed) ? parsed : 0;
};

const addTextNodes = (nodes: JSONContent[], text: string) => {
  if (!text) {
    return;
  }

  const segments = text.split(/\n/);
  segments.forEach((segment, index) => {
    if (segment.length > 0) {
      nodes.push({ type: 'text', text: segment });
    }

    if (index < segments.length - 1) {
      nodes.push({ type: 'hardBreak' });
    }
  });
};

const normaliseLabel = (label: string) => label.trim().toLowerCase();

const buildSourceLookup = (sources?: SourceReference[]) => {
  if (!sources || sources.length === 0) {
    return new Map<string, SourceReference>();
  }

  const map = new Map<string, SourceReference>();
  sources.forEach(source => {
    map.set(normaliseLabel(source.name), source);
    map.set(normaliseLabel(source.id), source);
  });
  return map;
};

export const parseAIResponse = (text: string, sources?: SourceReference[]): JSONContent[] => {
  if (!text) {
    return [];
  }

  const parts = text.split(TOKEN_MATCHER).filter(part => part !== '');
  const nodes: JSONContent[] = [];
  const sourceLookup = buildSourceLookup(sources);

  parts.forEach(part => {
    const isToken = part.startsWith('{{') && part.endsWith('}}');

    if (isToken) {
      const tokenBody = part.slice(2, -2);
      const [value = '', sourceLabel = '', confidence = ''] = tokenBody.split('|');
      const lookupKey = normaliseLabel(sourceLabel || value);
      const matchedSource = sourceLookup.get(lookupKey);

      nodes.push({
        type: 'smartData',
        attrs: {
          value: value.trim(),
          sourceLabel: sourceLabel.trim(),
          confidence: parseConfidence(confidence.trim()),
          id: matchedSource?.id ?? null,
        },
      });
    } else {
      addTextNodes(nodes, part);
    }
  });

  return nodes;
};
