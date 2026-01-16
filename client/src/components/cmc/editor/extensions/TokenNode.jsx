/* src/components/cmc/editor/extensions/TokenNode.jsx */
/* eslint-disable react/prop-types */
import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { X, RefreshCw, Lock, Unlock, Copy, Database, Calendar, TestTube, Building2, Package, Hash } from 'lucide-react'

import SpecsTable from '../tokens/SpecsTable.jsx';
import BatchAnalysesTable from '../tokens/BatchAnalysesTable.jsx';
import P8Table from '../tokens/P8Table.jsx';
import ControlStrategyBlock from '../tokens/ControlStrategyBlock.jsx';
import PPQSummary from '../tokens/PPQSummary.jsx';

/**
 * Enhanced Token extension with Smart Token Renderers
 * Supports regulatory document tokens with visual indicators
 * 
 * Token Types:
 *  - drug_name: Product/drug name (blue)
 *  - study_id: Study identifier (green) 
 *  - protocol_number: Protocol number (purple)
 *  - manufacturer: Manufacturer name (orange)
 *  - batch_number: Batch/lot number (cyan)
 *  - expiry_date: Expiration date (yellow)
 *  - custom: User-defined tokens (gray)
 *  - data_table: Complex data tables (special rendering)
 * 
 * Attributes stored in document content:
 *  - key: token key (e.g., 'QUALITY.SPECS.DP', 'drug_name')
 *  - type: token type for styling
 *  - value: current token value
 *  - citeId: citation uuid
 *  - sha256: payload hash at insertion
 *  - title: display label
 *  - frozen: boolean (client-side visual; server freeze happens at sign)
 *
 * Context (dynamic at runtime; not stored in document):
 *  - storage.context = { docId, sectionId, tokenValues }
 *  - storage.tokenValues: Map of token key to current value
 *  Use command: editor.commands.setTokenContext({ docId, sectionId })
 */

// Token type configuration
const TOKEN_TYPES = {
  drug_name: {
    icon: TestTube,
    color: 'bg-blue-100 text-blue-700 border-blue-300',
    label: 'Drug Name',
  },
  study_id: {
    icon: Database,
    color: 'bg-green-100 text-green-700 border-green-300',
    label: 'Study ID',
  },
  protocol_number: {
    icon: Hash,
    color: 'bg-purple-100 text-purple-700 border-purple-300',
    label: 'Protocol',
  },
  manufacturer: {
    icon: Building2,
    color: 'bg-orange-100 text-orange-700 border-orange-300',
    label: 'Manufacturer',
  },
  batch_number: {
    icon: Package,
    color: 'bg-cyan-100 text-cyan-700 border-cyan-300',
    label: 'Batch Number',
  },
  expiry_date: {
    icon: Calendar,
    color: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    label: 'Expiry Date',
  },
  custom: {
    icon: Database,
    color: 'bg-gray-100 text-gray-700 border-gray-300',
    label: 'Custom',
  },
  data_table: {
    icon: Database,
    color: 'bg-indigo-100 text-indigo-700 border-indigo-300',
    label: 'Data Table',
  },
};

// Get token type from key
const getTokenType = (key) => {
  if (key?.includes('QUALITY') || key?.includes('SPECS') || key?.includes('BATCH')) {
    return 'data_table';
  }
  const lowerKey = key?.toLowerCase() || '';
  for (const type of Object.keys(TOKEN_TYPES)) {
    if (lowerKey.includes(type.replace('_', ''))) {
      return type;
    }
  }
  return 'custom';
};
const TokenComponent = props => {
  const { node, updateAttributes, editor, deleteNode } = props;
  const { key, type, value, citeId, sha256, title, frozen } = node.attrs;
  const sectionId = editor.storage.token?.context?.sectionId;
  const tokenValues = editor.storage.token?.tokenValues || {};
  const [loading, setLoading] = React.useState(false);
  const [payload, setPayload] = React.useState(null);
  const [createdAt, setCreatedAt] = React.useState(null);
  const [curSha, setCurSha] = React.useState(sha256 || null);
  const [sourceRefs, setSourceRefs] = React.useState([]);
  const [isHovered, setIsHovered] = React.useState(false);
  
  // Determine token type and get config
  const tokenType = type || getTokenType(key);
  const tokenConfig = TOKEN_TYPES[tokenType] || TOKEN_TYPES.custom;
  const IconComponent = tokenConfig.icon;
  
  // Get current value from storage or node attrs
  const currentValue = tokenValues[key] || value || `{{${key}}}`;

  const fetchCitation = React.useCallback(async () => {
    if (!sectionId || !citeId) return;
    setLoading(true);
    try {
      const rows = await fetch(`/api/authoring/sections/${sectionId}/tokens`).then(r => r.json());
      const c = (rows || []).find(x => x.cite_id === citeId);
      if (c) {
        setPayload(c.payload || null);
        setCreatedAt(c.created_at || null);
        setCurSha(c.payload_sha256 || curSha);
        // payload may carry sourceRefs; if not, leave empty
        setSourceRefs(c.payload?.sourceRefs || c.sourceRefs || []);
      }
    } catch (e) {
      // noop
    } finally {
      setLoading(false);
    }
  }, [sectionId, citeId, curSha]);

  React.useEffect(() => {
    fetchCitation();
  }, [fetchCitation]);

  async function refresh() {
    if (frozen) {
      alert('This token is frozen. Unfreeze (remove freeze or re-draft) to refresh.');
      return;
    }
    try {
      const r = await fetch(`/api/authoring/sections/${sectionId}/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cite_id: citeId }),
      });
      const x = await r.json();
      if (!r.ok) return alert(x?.error || 'Refresh failed.');
      setCurSha(x.sha256 || curSha);
      await fetchCitation();
    } catch {
      alert('Refresh failed.');
    }
  }

  function toggleFreeze() {
    updateAttributes({ frozen: !frozen });
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      alert('Snapshot JSON copied.');
    } catch {
      alert('Copy failed.');
    }
  }

  // For simple tokens (non-data tables), show as inline pill
  if (tokenType !== 'data_table') {
    return (
      <NodeViewWrapper 
        as="span" 
        className="inline-block align-middle"
        contentEditable={false}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border cursor-default select-none ${tokenConfig.color} ${isHovered ? 'ring-2 ring-offset-1' : ''}`}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
              >
                <IconComponent className="h-3 w-3" />
                <span>{title || key}</span>
                {frozen && <Lock className="h-3 w-3 ml-1" />}
                {editor.isEditable && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNode();
                    }}
                    className="ml-1 hover:bg-black/10 rounded-full p-0.5"
                    title="Remove token"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className="space-y-1">
                <div className="font-medium">{tokenConfig.label}: {title || key}</div>
                <div className="text-sm">Current value: <span className="font-mono">{currentValue}</span></div>
                {frozen && <div className="text-xs text-yellow-600">Token is frozen</div>}
                <div className="text-xs text-gray-500">Click "Edit Token Values" to update</div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </NodeViewWrapper>
    );
  }
  
  // For data table tokens, keep the existing complex rendering
  const Pill = (
    <div className="flex items-center gap-2 text-[11px] px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 mb-2">
      <IconComponent className="h-4 w-4 text-indigo-600" />
      <span className="font-semibold text-indigo-900">{title || key}</span>
      {createdAt && (
        <span className="text-indigo-600">• {new Date(createdAt).toLocaleString()}</span>
      )}
      {curSha && <span className="font-mono text-indigo-500">• {curSha.slice(0, 8)}…</span>}
      <span
        className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${frozen ? 'bg-gray-200 text-gray-700' : 'bg-emerald-100 text-emerald-700'}`}
      >
        {frozen ? 'FROZEN' : 'LIVE'}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <button 
          className="p-1.5 hover:bg-white rounded-lg transition-colors" 
          onClick={refresh} 
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3 text-indigo-600" />
        </button>
        <button
          className="p-1.5 hover:bg-white rounded-lg transition-colors"
          onClick={toggleFreeze}
          title="Freeze/Unfreeze"
        >
          {frozen ? <Unlock className="h-3 w-3 text-gray-600" /> : <Lock className="h-3 w-3 text-indigo-600" />}
        </button>
        <button
          className="p-1.5 hover:bg-white rounded-lg transition-colors"
          onClick={copyJson}
          title="Copy JSON"
        >
          <Copy className="h-3 w-3 text-indigo-600" />
        </button>
        {Array.isArray(sourceRefs) && sourceRefs.length > 0 && (
          <button
            className="px-2 py-0.5 border rounded hover:bg-white"
            onClick={() => alert(JSON.stringify(sourceRefs, null, 2))}
            title="Source refs"
          >
            🔗
          </button>
        )}
      </div>
    </div>
  );

  function renderBody() {
    if (loading) return <div className="text-xs text-slate-500">Loading token…</div>;
    if (!payload)
      return <div className="text-xs text-rose-600">No snapshot payload found. Try Refresh.</div>;

    // Route to smart renderer by key
    if (/^QUALITY\.SPECS\.(DP|DS)$/.test(key)) return <SpecsTable payload={payload} />;
    if (/^BATCH\.ANALYSES\.(DP|DS)$/.test(key)) return <BatchAnalysesTable payload={payload} />;
    if (key === 'P8.TABLES' || key === 'P8.TRENDS' || key === 'P8.CONCLUSIONS')
      return <P8Table payload={payload} kind={key} />;
    if (key === 'PROCESS.CONTROL_STRATEGY') return <ControlStrategyBlock payload={payload} />;
    if (key === 'PPQ.SUMMARY') return <PPQSummary payload={payload} />;

    // Fallback JSON preview
    return (
      <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-2 overflow-auto max-h-64">
        {JSON.stringify(payload, null, 2)}
      </pre>
    );
  }

  return (
    <NodeViewWrapper className="TokenNode block border-2 border-indigo-200 rounded-lg p-3 bg-white shadow-md hover:shadow-lg transition-shadow">
      {Pill}
      <div className="mt-2">
        {renderBody()}
      </div>
    </NodeViewWrapper>
  );
};

const TokenNode = Node.create({
  name: 'token',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addStorage() {
    return {
      context: { docId: null, sectionId: null },
    };
  },

  addAttributes() {
    return {
      key: { default: null },
      type: { default: null }, // Token type for styling
      value: { default: null }, // Current token value
      citeId: { default: null },
      sha256: { default: null },
      title: { default: null },
      frozen: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-token]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-token': 'true' }), 0];
  },

  addCommands() {
    return {
      setTokenContext:
        ctx =>
        ({ editor }) => {
          editor.storage.token = editor.storage.token || {
            context: { docId: null, sectionId: null },
            tokenValues: {},
          };
          editor.storage.token.context = { ...(editor.storage.token.context || {}), ...ctx };
          return true;
        },
      updateTokenValues:
        values =>
        ({ editor }) => {
          editor.storage.token = editor.storage.token || {
            context: { docId: null, sectionId: null },
            tokenValues: {},
          };
          editor.storage.token.tokenValues = { ...(editor.storage.token.tokenValues || {}), ...values };
          return true;
        },
      insertToken:
        ({ key, type, title, value }) =>
        ({ chain }) => {
          return chain()
            .focus()
            .insertContent({
              type: 'token',
              attrs: { 
                key, 
                type: type || getTokenType(key),
                title: title || key,
                value: value || '',
                frozen: false,
                citeId: crypto.randomUUID ? crypto.randomUUID() : `cite_${Date.now()}`,
              },
            })
            .run();
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TokenComponent);
  },
});

export default TokenNode;
