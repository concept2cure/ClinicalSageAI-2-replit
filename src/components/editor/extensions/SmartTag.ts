import { Node, mergeAttributes } from '@tiptap/core';

export type SmartTagAttributes = {
  id?: string | null;
  value?: string | null;
  sourceId?: string | null;
  dataset?: string | null;
  variable?: string | null;
  dataVersion?: string | null;
  status?: string | null;
  label?: string | null;
};

export type SmartTagInsertPayload = {
  type?: 'smartTag';
} & SmartTagAttributes;

export const SmartTag = Node.create({
  name: 'smartTag',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
      value: { default: null },
      sourceId: { default: null },
      dataset: { default: null },
      variable: { default: null },
      dataVersion: { default: null },
      status: { default: null },
      label: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-smarttag]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const display = HTMLAttributes?.label
      ? `${HTMLAttributes.label}: ${HTMLAttributes.value ?? ''}`
      : (HTMLAttributes?.value ?? '');

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-smarttag': 'true',
        'data-id': HTMLAttributes?.id ?? undefined,
        'data-variable': HTMLAttributes?.variable ?? undefined,
        'data-source-id': HTMLAttributes?.sourceId ?? undefined,
        'data-data-version': HTMLAttributes?.dataVersion ?? undefined,
        class:
          'smart-tag inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800',
      }),
      display,
    ];
  },
});

export default SmartTag;
