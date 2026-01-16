import Table from '@tiptap/extension-table';

export const SmartTable = Table.extend({
  name: 'table',
  addAttributes() {
    return {
      ...(this.parent?.() || {}),
      sourceId: {
        default: null,
        parseHTML: element => element.getAttribute('data-source-id'),
        renderHTML: attributes => ({
          'data-source-id': attributes.sourceId,
        }),
      },
      sourceLabel: {
        default: null,
        parseHTML: element => element.getAttribute('data-source-label'),
        renderHTML: attributes => ({
          'data-source-label': attributes.sourceLabel,
        }),
      },
      lastUpdated: {
        default: null,
        parseHTML: element => element.getAttribute('data-last-updated'),
        renderHTML: attributes => ({
          'data-last-updated': attributes.lastUpdated,
        }),
      },
    };
  },
});
