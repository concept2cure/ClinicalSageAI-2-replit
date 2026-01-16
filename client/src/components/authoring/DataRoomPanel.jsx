import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  Folder, FileText, ChevronRight, ChevronDown, 
  Database, Table, Activity, Hash, Search, GripVertical, Sparkles
} from 'lucide-react';

// MOCK HIERARCHICAL DATA (Simulating a Veeva/CDISC structure)
const CLINICAL_TREE = [
  {
    id: 'study-101',
    label: 'Protocol 101 (Pivotal Phase 3)',
    type: 'study',
    status: 'LOCKED',
    children: [
      {
        id: 'dom-eff',
        label: '14.2 Efficacy',
        type: 'folder',
        children: [
          {
            id: 'tbl-14.2.1',
            label: 'Table 14.2.1 - Primary Endpoint (PFS)',
            type: 'table',
            status: 'FINAL',
            updated: '2025-11-15',
            artifacts: [
              { id: 'a1', label: 'Hazard Ratio (95% CI)', value: '0.45 (0.35, 0.58)', type: 'value', variable: 'HR' },
              { id: 'a2', label: 'p-value (Stratified)', value: '< 0.0001', type: 'value', variable: 'PVAL' },
              { id: 'a3', label: 'Median PFS (Treatment)', value: '18.4 mo', type: 'value', variable: 'MED_TRT' }
            ]
          },
          {
            id: 'tbl-14.2.2',
            label: 'Table 14.2.2 - OS Interim',
            type: 'table',
            status: 'DRAFT',
            updated: '2026-01-10', // Recent update
            artifacts: [
              { id: 'a4', label: 'Overall Survival HR', value: '0.76', type: 'value', variable: 'HR_OS', status: 'stale' }
            ]
          }
        ]
      },
      {
        id: 'dom-safe',
        label: '14.3 Safety',
        type: 'folder',
        children: [
          {
            id: 'tbl-14.3.1',
            label: 'Table 14.3.1 - AE Summary',
            type: 'table',
            status: 'FINAL',
            artifacts: [
              { id: 'a5', label: 'Subjects with any TEAE', value: '145 (45.2%)', type: 'value', variable: 'ANY_AE' },
              { id: 'a6', label: 'Grade >=3 TEAEs', value: '23 (7.1%)', type: 'value', variable: 'GR3_AE' }
            ]
          }
        ]
      }
    ]
  }
];

// RECURSIVE TREE ITEM COMPONENT
const TreeItem = ({ node, level = 0, activeSourceId, onDraftWithAI }) => {
  const rowRef = useRef(null);
  const isMatch = useMemo(() => {
    if (!activeSourceId) return false;
    if (node.type !== 'table') return false;
    return String(node.label || '').toLowerCase().startsWith(String(activeSourceId).toLowerCase());
  }, [activeSourceId, node.label, node.type]);

  const [isOpen, setIsOpen] = useState(level < 3); // Auto-expand deeper so tables are visible

  useEffect(() => {
    if (!isMatch) return;
    setIsOpen(true);
    const el = rowRef.current;
    if (!el) return;

    // Scroll + pulse beacon
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('highlight-beacon');
    const t = setTimeout(() => el.classList.remove('highlight-beacon'), 1600);
    return () => clearTimeout(t);
  }, [isMatch]);

  // DRAG HANDLER (The "Payload Packer")
  const handleDragStart = (e, artifact, parentNode) => {
    // SECURITY: Stop propagation so we don't drag the whole folder
    e.stopPropagation(); 
    
    const payload = JSON.stringify({
      type: 'smartTag',
      id: crypto.randomUUID(),
      value: artifact.value,
      sourceId: parentNode.label.split(' - ')[0], // e.g. "Table 14.2.1"
      dataset: parentNode.id,
      variable: artifact.variable,
      status: artifact.status || 'verified',
      label: artifact.label
    });
    
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-clinical-data', payload);
  };

  const handleTableDragStart = (e, tableNode) => {
    e.stopPropagation();

    const sourceId = String(tableNode.label || '').split(' - ')[0];
    const payload = JSON.stringify({
      type: 'table',
      id: crypto.randomUUID(),
      sourceId,
      dataset: tableNode.id,
      label: tableNode.label,
      status: tableNode.status || 'verified',
      updated: tableNode.updated,
      artifacts: Array.isArray(tableNode.artifacts) ? tableNode.artifacts : [],
    });

    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-clinical-data', payload);
  };

  const handleDraftTable = (e, tableNode) => {
    e.stopPropagation();
    const sourceId = String(tableNode.label || '').split(' - ')[0];

    onDraftWithAI?.({
      type: 'table',
      label: tableNode.label,
      population: tableNode.id,
      sourceId,
      dataset: tableNode.id,
      status: tableNode.status,
      updated: tableNode.updated,
      artifacts: Array.isArray(tableNode.artifacts) ? tableNode.artifacts : [],
    });
  };

  if (node.type === 'value') {
    // RENDER: Draggable Data Chip
    return (
      <div 
        draggable="true"
        onDragStart={(e) => handleDragStart(e, node, { label: 'Unknown Source', ...node })}
        className="ml-6 mb-1 flex items-center justify-between p-1.5 bg-white border border-gray-200 rounded text-xs hover:border-blue-400 hover:shadow-sm cursor-grab active:cursor-grabbing group"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Hash size={12} className="text-blue-500 shrink-0" />
          <span className="text-gray-600 truncate" title={node.label}>{node.label}</span>
        </div>
        <span className="font-mono font-semibold text-blue-700 bg-blue-50 px-1.5 rounded">
          {node.value}
        </span>
      </div>
    );
  }

  // RENDER: Folder or Table Container
  return (
    <div className="mb-1 select-none" ref={rowRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
          level === 0 ? 'bg-gray-100 font-semibold text-gray-800' : 'hover:bg-gray-50 text-gray-700'
        } ${isMatch ? 'ring-2 ring-blue-400/50 bg-blue-50' : ''}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {/* DRAG HANDLE (tables only) */}
        {node.type === 'table' ? (
          <span
            draggable="true"
            onDragStart={(e) => handleTableDragStart(e, node)}
            onClick={(e) => e.stopPropagation()}
            title="Drag this table into the AI panel"
            className="text-gray-300 hover:text-gray-500 active:text-gray-600 cursor-grab active:cursor-grabbing"
          >
            <GripVertical size={14} />
          </span>
        ) : (
          <span className="w-[14px]" aria-hidden="true" />
        )}

        {/* ICON LOGIC */}
        <span className="text-gray-400">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        {node.type === 'study' && <Database size={14} className="text-indigo-600" />}
        {node.type === 'folder' && <Folder size={14} className="text-amber-500" />}
        {node.type === 'table' && <Table size={14} className="text-emerald-600" />}
        
        <span className="text-xs truncate flex-1">{node.label}</span>

        {/* QUICK ACTIONS (tables only) */}
        {node.type === 'table' && (
          <button
            type="button"
            onClick={(e) => handleDraftTable(e, node)}
            className="ml-1 inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100"
            title="Open AI tab and draft from this table"
          >
            <Sparkles size={12} />
            Draft
          </button>
        )}
        
        {/* STATUS BADGE */}
        {node.status && (
          <span className={`text-[9px] px-1 rounded-sm border ${
            node.status === 'FINAL' || node.status === 'LOCKED' 
              ? 'bg-gray-200 text-gray-600 border-gray-300' 
              : 'bg-amber-100 text-amber-700 border-amber-200'
          }`}>
            {node.status}
          </span>
        )}
      </div>

      {/* CHILDREN / ARTIFACTS */}
      {isOpen && (
        <div className="border-l border-gray-200 ml-4">
          {/* Render sub-folders */}
          {node.children?.map(child => (
            <TreeItem
              key={child.id}
              node={child}
              level={level + 1}
              activeSourceId={activeSourceId}
              onDraftWithAI={onDraftWithAI}
            />
          ))}
          
          {/* Render draggable artifacts inside a table */}
          {node.artifacts?.map(art => (
            <div 
              key={art.id}
              draggable="true"
              onDragStart={(e) => handleDragStart(e, art, node)} // Pass parent "node" as source
              className="ml-4 mb-1 flex items-center justify-between p-1.5 bg-white border border-gray-100 rounded text-xs hover:border-blue-400 hover:shadow-sm cursor-grab active:cursor-grabbing"
            >
              <span className="text-gray-500 truncate mr-2" title={art.label}>{art.label}</span>
              <div className="flex items-center gap-2">
                 {art.status === 'stale' && <div className="w-1.5 h-1.5 rounded-full bg-red-500" title="Data Changed!" />}
                 <span className="font-mono font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[11px]">
                   {art.value}
                 </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export function DataRoomPanel({ activeSourceId, onDraftWithAI }) {
  return (
    <div className="flex flex-col h-full bg-white w-full border-l">
      {/* HEADER */}
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
          <Database size={16} />
          <span>Data Browser</span>
        </div>
        <div className="mt-2 relative">
          <Search size={12} className="absolute left-2 top-2 text-gray-400" />
          <input 
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
            placeholder="Filter tables, listings..." 
          />
        </div>
      </div>

      {/* TREE CONTENT */}
      <div className="flex-1 overflow-y-auto p-2">
        {CLINICAL_TREE.map(node => (
          <TreeItem key={node.id} node={node} activeSourceId={activeSourceId} onDraftWithAI={onDraftWithAI} />
        ))}
      </div>
      
      {/* FOOTER */}
      <div className="p-2 border-t bg-gray-50 text-[10px] text-gray-400 flex justify-between">
        <span>Source: CDISC/ADaM</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> Connected</span>
      </div>
    </div>
  );
}
