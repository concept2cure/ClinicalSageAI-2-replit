import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import SmartTagChip from '../components/SmartTagChip';

/**
 * SmartTag Extension - Regulatory-Grade Data Compliance
 * 
 * Purpose: Establish Chain of Custody for clinical evidence in IND/eCTD dossiers
 * Compliance: 21 CFR Part 11 (Audit Trails & Data Integrity)
 * 
 * This extension creates "atomic" data points that maintain traceability
 * to their statistical source, enabling detection of stale data when
 * upstream datasets are updated.
 * 
 * ENHANCED version of SmartDataNode with full regulatory attributes
 * 
 * @typedef {Object} SmartTagAttributes
 * @property {string|null} id - Unique identifier
 * @property {string} value - Display value (formatted for ICH E3)
 * @property {string|null} rawValue - Exact SAS output
 * @property {string|null} sourceId - Link to source TLF
 * @property {string|null} dataset - CDISC domain (ADSL, ADAE, etc.)
 * @property {string|null} variable - Statistical variable name
 * @property {string} dataVersion - Data cut version (v1.0, v1.1, etc.)
 * @property {string|null} lastVerified - ISO timestamp of last QC
 * @property {'draft'|'verified'|'stale'|'frozen'} status - Validation status
 * @property {string} label - Hover tooltip text
 * 
 * @typedef {Object} SmartTagInsertPayload
 * @property {string|null} [id] - Optional unique identifier
 * @property {string} value - Display value (REQUIRED)
 * @property {string|null} [rawValue] - Optional raw value
 * @property {string|null} [sourceId] - Optional source ID
 * @property {string|null} [dataset] - Optional dataset
 * @property {string|null} [variable] - Optional variable
 * @property {string} [dataVersion] - Optional version (default: 'v1.0')
 * @property {string|null} [lastVerified] - Optional timestamp
 * @property {'draft'|'verified'|'stale'|'frozen'} [status] - Optional status (default: 'draft')
 * @property {string} [label] - Optional label
 */

export const SmartTag = Node.create({
  name: 'smartTag',

  // DOM CONFIGURATION
  group: 'inline',
  inline: true,
  atom: true,        // CRITICAL: Integrity protection. User cannot edit the number manually.
  selectable: true,
  draggable: true,

  // REGULATORY ATTRIBUTES (The Chain of Custody)
  addAttributes() {
    return {
      // 1. IDENTITY
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id') ?? null,
      },
      
      // 2. THE VALUE (Display vs Raw)
      value: {
        default: '---',
        parseHTML: element => element.getAttribute('data-value') ?? '---',
      },
      rawValue: {
        default: null,
        parseHTML: element => element.getAttribute('data-raw-value') ?? null,
      },
      
      // 3. SOURCE TRACEABILITY (Upstream Dependencies)
      sourceId: {
        default: null,
        parseHTML: element => element.getAttribute('data-source-id') ?? null,
      },
      dataset: {
        default: null,
        parseHTML: element => element.getAttribute('data-dataset') ?? null,
      },
      variable: {
        default: null,
        parseHTML: element => element.getAttribute('data-variable') ?? null,
      },
      
      // 4. VERSION CONTROL (Downstream Safety)
      dataVersion: {
        default: 'v1.0',
        parseHTML: element => element.getAttribute('data-version') ?? 'v1.0',
      },
      lastVerified: {
        default: null,
        parseHTML: element => element.getAttribute('data-verified') ?? null,
      },
      
      // 5. STATUS
      status: {
        default: 'draft',
        parseHTML: element => {
          const s = element.getAttribute('data-status');
          return (['draft', 'verified', 'stale', 'frozen'].includes(s)) ? s : 'draft';
        },
      },
      
      // 6. META
      label: {
        default: 'Data Point',
        parseHTML: element => element.getAttribute('data-label') ?? 'Data Point',
      }
    }
  },

  parseHTML() {
    return [{
      tag: 'smart-tag',
    }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'smart-tag',
      mergeAttributes(HTMLAttributes, {
        'data-id': HTMLAttributes.id,
        'data-value': HTMLAttributes.value,
        'data-raw-value': HTMLAttributes.rawValue,
        'data-source-id': HTMLAttributes.sourceId,
        'data-dataset': HTMLAttributes.dataset,
        'data-variable': HTMLAttributes.variable,
        'data-version': HTMLAttributes.dataVersion,
        'data-verified': HTMLAttributes.lastVerified,
        'data-status': HTMLAttributes.status,
        'data-label': HTMLAttributes.label,
        'class': `smart-tag-chip status-${HTMLAttributes.status}`,
        'title': HTMLAttributes.label, // Browser tooltip
      }),
      HTMLAttributes.value // The only thing visible to the reader/reviewer
    ]
  },

  renderText({ node }) {
    return node.attrs.value;
  },

  addCommands() {
    return {
      insertSmartTag: (attrs) => ({ chain }) => {
        if (!attrs || !attrs.value) {
          return false;
        }

        const payload = {
          id: attrs.id || `tag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          value: String(attrs.value),
          rawValue: attrs.rawValue || null,
          sourceId: attrs.sourceId || null,
          dataset: attrs.dataset || null,
          variable: attrs.variable || null,
          dataVersion: attrs.dataVersion || 'v1.0',
          lastVerified: attrs.lastVerified || null,
          status: attrs.status || 'draft',
          label: attrs.label || `${attrs.dataset || 'Data'}/${attrs.variable || 'Value'}`,
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
    return ReactNodeViewRenderer(SmartTagChip);
  },
});

export default SmartTag;
