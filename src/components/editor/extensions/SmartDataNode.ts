import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import SmartDataChip from './SmartDataChip';

export interface SmartDataAttributes {
  id: string | null;
  value: string;
  sourceLabel: string;
  confidence: number;
  nodeId?: string | null;
}

export interface SmartDataInsertPayload {
  id?: string | null;
  value: string;
  sourceLabel?: string;
  confidence?: number;
  nodeId?: string | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    smartData: {
      insertSmartData: (attrs: SmartDataInsertPayload) => ReturnType;
    };
  }
}

const clampConfidence = (value: unknown): number => {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
};

export const SmartDataNode = Node.create({
  name: 'smartData',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute?.('data-source-id') ?? null,
      },
      value: {
        default: '',
        parseHTML: element => element.textContent ?? '',
      },
      sourceLabel: {
        default: 'Nonclinical Report',
        parseHTML: element =>
          element.getAttribute?.('data-source-label') ?? 'Nonclinical Report',
      },
      confidence: {
        default: 0,
        parseHTML: element => clampConfidence(element.getAttribute?.('data-confidence')),
      },
      nodeId: {
        default: null,
        parseHTML: element => element.getAttribute?.('data-node-id') ?? null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-smart-data="true"]',
      },
    ];
  },

  renderText({ node }) {
    const { value } = node.attrs as SmartDataAttributes;
    return value;
  },

  addCommands() {
    return {
      insertSmartData:
        attrs => ({ chain }) => {
          if (!attrs || !attrs.value) {
            return false;
          }

          const payload: SmartDataAttributes = {
            id: attrs.id ?? null,
            value: String(attrs.value),
            sourceLabel:
              attrs.sourceLabel && attrs.sourceLabel.trim().length > 0
                ? attrs.sourceLabel
                : 'Nonclinical Report',
            confidence: clampConfidence(attrs.confidence),
            nodeId: attrs.nodeId ?? null,
          };

          return chain()
            .insertContent({
              type: this.name,
              attrs: payload,
            })
            .run();
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(SmartDataChip);
  },

  renderHTML({ node }) {
    const attrs = node.attrs as SmartDataAttributes;

    return [
      'span',
      {
        'data-smart-data': 'true',
        'data-source-id': attrs.id ?? '',
        'data-source-label': attrs.sourceLabel ?? 'Nonclinical Report',
        'data-confidence': String(attrs.confidence ?? 0),
        'data-node-id': attrs.nodeId ?? '',
      },
      attrs.value ?? '',
    ];
  },
});

export default SmartDataNode;
