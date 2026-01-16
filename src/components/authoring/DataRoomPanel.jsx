import React, { useMemo, useRef, useState } from 'react';
import { 
  Folder, Database, Table, Hash, Search, 
  ChevronRight, ChevronDown, ShieldCheck, 
  Info, FileCode, Users, Filter, AlertCircle, RefreshCw, Eye 
} from 'lucide-react';

import { SourcePreviewModal } from './SourcePreviewModal';

// --- MOCK REGULATORY WAREHOUSE (CDISC/ADaM Structure) ---
const CLINICAL_REPO = [
  {
    id: 'study-101',
    label: 'Protocol 101: Oncology Phase III',
    type: 'study',
    status: 'LOCKED',
    children: [
      {
        id: 'cut-final',
        label: 'Database Lock (2025-11-15)',
        type: 'cut',
        status: 'FINAL',
        children: [
          {
            id: 'dom-eff',
            label: 'Efficacy (ADSL/ADTTE)',
            type: 'domain',
            children: [
              {
                id: 'tbl-14.2.1',
                label: 'Table 14.2.1: Primary Endpoint (PFS)',
                type: 'artifact',
                sasProgram: 't_pfs_km.sas',
                population: 'ITT (N=450)',
                dataVersion: 'v2.0',
                status: 'VALIDATED',
                items: [
                  { id: 'v1', label: 'Hazard Ratio (95% CI)', value: '0.45 (0.32, 0.58)', variable: 'HR_PFS', type: 'stat' },
                  { id: 'v2', label: 'p-value (Log-rank)', value: '< 0.0001', variable: 'PVAL_LOG', type: 'stat' },
                  { id: 'v3', label: 'Median OS (months)', value: '18.2', variable: 'MED_OS', type: 'stat' }
                ]
              },
              {
                id: 'tbl-14.2.3',
                label: 'Table 14.2.3: Subgroup Analysis',
                type: 'artifact',
                sasProgram: 't_pfs_sub.sas',
                population: 'ITT (N=450)',
                dataVersion: 'v2.0',
                status: 'DRAFT', // This should disappear when filter is on
                items: [
                  { id: 'v6', label: 'HR (North America)', value: '0.55', variable: 'HR_NA', type: 'stat' }
                ]
              }
            ]
          },
          {
            id: 'dom-safe',
            label: 'Safety (ADAE)',
            type: 'domain',
            children: [
              {
                id: 'tbl-14.3.1',
                label: 'Table 14.3.1: AE Summary',
                type: 'artifact',
                sasProgram: 't_ae_over.sas',
                population: 'Safety (N=448)',
                dataVersion: 'v2.0',
                status: 'VALIDATED',
                items: [
                  { id: 'v4', label: 'Any TEAE n(%)', value: '412 (92.0%)', variable: 'ANY_AE', type: 'stat' },
                  { id: 'v5', label: 'Grade >=3 TEAE n(%)', value: '45 (10.1%)', variable: 'GR3_AE', type: 'stat' }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
];

// --- DRAGGABLE CHIP ---
const DataChip = ({ item, parent, onDragStart }) => (
  <div 
    draggable="true"
    onDragStart={(e) => onDragStart(e, item, parent)}
    className="group flex items-center justify-between p-2 mb-1 bg-white border border-gray-200 rounded text-xs hover:border-blue-500 hover:shadow-md cursor-grab active:cursor-grabbing transition-all select-none"
  >
    <div className="flex flex-col overflow-hidden mr-2">
      <div className="flex items-center gap-2">
        <Hash size={12} className="text-blue-500 shrink-0" />
        <span className="font-medium text-gray-700 truncate" title={item.label}>{item.label}</span>
      </div>
      <span className="text-[10px] text-gray-400 pl-5 truncate font-mono">{item.variable}</span>
    </div>
    <div className="shrink-0">
      <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 whitespace-nowrap">
        {item.value}
      </span>
    </div>
  </div>
);

// --- MAIN PANEL ---
export function DataRoomPanel({ activeTag, onSyncArtifact, activeSourceId, activeDataVersion } = {}) {
  const [expanded, setExpanded] = useState(['study-101', 'cut-final', 'dom-eff']);
  const [selectedArtifact, setSelectedArtifact] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showValidatedOnly, setShowValidatedOnly] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Back-compat: allow either the new activeTag object or the legacy props.
  const activeSource = activeTag?.sourceId ?? activeSourceId ?? null;
  const activeVersion = activeTag?.version ?? activeDataVersion ?? null;
  const [orphanTag, setOrphanTag] = useState(null);

  // Ref to track DOM elements for auto-scrolling / beacons
  const itemRefs = useRef({});

  const toggleNode = (id) => {
    setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // --- REGULATORY PAYLOAD (Step 1 Compliant) ---
  const handleDragStart = (e, item, parentArtifact) => {
    e.stopPropagation();
    const payload = JSON.stringify({
      type: 'smartTag',
      id: crypto.randomUUID(),
      value: item.value,
      sourceId: parentArtifact.label.split(':')[0],
      dataset: parentArtifact.population,
      variable: item.variable,
      dataVersion: parentArtifact.dataVersion ?? 'Final (Nov 15)',
      status: parentArtifact.status === 'VALIDATED' ? 'verified' : 'draft',
      label: item.label
    });
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-clinical-data', payload);
  };

  // --- SMART FILTER LOGIC ---
  // Recursively filters the tree based on Search Term AND Status
  const filteredTree = useMemo(() => {
    const filterNodes = (nodes) => {
      return nodes.map(node => {
        // Clone to avoid mutating state
        const newNode = { ...node };
        
        // 1. Filter Children first (Bottom-up)
        if (newNode.children) {
          newNode.children = filterNodes(newNode.children);
        }
        
        // 2. Check Matching Conditions
        const normalizedSearch = searchTerm.toLowerCase();
        const matchesSearch = searchTerm === '' || 
          newNode.label.toLowerCase().includes(normalizedSearch) ||
          newNode.items?.some(i =>
            i.label.toLowerCase().includes(normalizedSearch) ||
            i.variable.toLowerCase().includes(normalizedSearch) ||
            String(i.value).toLowerCase().includes(normalizedSearch)
          );
          
        const matchesStatus = !showValidatedOnly || 
          (newNode.type !== 'artifact' || newNode.status === 'VALIDATED');
        
        // 3. Keep if matches OR has matching children
        const hasChildren = newNode.children && newNode.children.length > 0;
        
        if ((matchesSearch && matchesStatus) || hasChildren) {
          return newNode;
        }
        return null;
      }).filter(Boolean);
    };

    return filterNodes(CLINICAL_REPO);
  }, [searchTerm, showValidatedOnly]);


  // AUTO-EXPAND LOGIC
  React.useEffect(() => {
    if (!searchTerm) return;
    // Helper: Collect all IDs in the tree
    const getAllIds = (nodes) =>
      nodes.reduce((acc, node) => {
        acc.push(node.id);
        if (node.children) acc.push(...getAllIds(node.children));
        return acc;
      }, []);
    // Expand all nodes to reveal search results
    setExpanded(getAllIds(CLINICAL_REPO));
  }, [searchTerm]);

  // STEP 4: LIVE-LINK RECEIVER
  React.useEffect(() => {
    if (!activeSource) {
      setOrphanTag(null);
      return;
    }

    const findNodeAndPath = (nodes, targetId, path = []) => {
      for (const node of nodes) {
        const isMatch = (node?.label && node.label.startsWith(targetId)) || node.id === targetId;
        if (isMatch) return { found: node, path };

        if (node.children) {
          const result = findNodeAndPath(node.children, targetId, [...path, node.id]);
          if (result) return result;
        }
      }
      return null;
    };

    const result = findNodeAndPath(CLINICAL_REPO, activeSource);
    if (!result) {
      setOrphanTag({ sourceId: activeSource, version: activeVersion ?? null });
      return;
    }

    setOrphanTag(null);

    // 1) Force reveal: clear filters that might hide it
    if (searchTerm) setSearchTerm('');
    if (showValidatedOnly) setShowValidatedOnly(false);

    // 2) Expand all parents + keep the node open
    setExpanded(prev => [...new Set([...prev, ...result.path, result.found.id])]);

    // 3) Select artifact to drive inspector
    if (result.found.type === 'artifact') {
      setSelectedArtifact(result.found);
    }

    // 4) Beacon: scroll + pulse
    setTimeout(() => {
      const element = itemRefs.current?.[result.found.id];
      if (!element) return;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('highlight-beacon');
      setTimeout(() => element.classList.remove('highlight-beacon'), 2000);
    }, 100);
  }, [activeSource, activeVersion]);

  React.useEffect(() => {
    if (!selectedArtifact && isPreviewOpen) setIsPreviewOpen(false);
  }, [isPreviewOpen, selectedArtifact]);

  const renderInspector = () => {
    if (orphanTag) {
      return (
        <div className="p-3 bg-amber-50 text-xs space-y-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div className="font-semibold text-amber-900 flex items-center gap-2">
            <AlertCircle size={14} className="text-amber-700" />
            Orphaned SmartTag
          </div>
          <div className="text-[11px] text-amber-800">
            This tag references a source that no longer exists in the Data Room.
          </div>
          <div className="text-[11px] font-mono text-amber-900 bg-white/60 border border-amber-200 rounded px-2 py-1">
            source: {orphanTag.sourceId}
            {orphanTag.version ? ` · ver: ${orphanTag.version}` : ''}
          </div>
        </div>
      );
    }

    if (!selectedArtifact) {
      return (
        <div className="p-3 text-[10px] text-gray-400 text-center italic bg-gray-50">
          Select an artifact to view provenance
        </div>
      );
    }

    const latestVersion = selectedArtifact?.dataVersion ?? null;
    const isVersionMismatch = Boolean(activeVersion && latestVersion && activeVersion !== latestVersion);

    return (
      <div
        className={`p-3 text-xs border-t transition-colors animate-in slide-in-from-bottom-2 fade-in duration-200 ${
          isVersionMismatch ? 'bg-amber-50' : 'bg-blue-50/50'
        }`}
      >
        <div className="font-semibold text-blue-900 mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Info size={12} />
            <span>Artifact Provenance</span>
          </div>

          {isVersionMismatch && (
            <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 font-bold">
              <AlertCircle size={10} /> OUTDATED
            </span>
          )}
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-gray-400">SAS Program</div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-gray-700 bg-white px-1 border rounded">
                <FileCode size={10} /> {selectedArtifact.sasProgram}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400">Population</div>
              <div className="flex items-center gap-1.5 text-gray-700">
                <Users size={10} /> {selectedArtifact.population}
              </div>
            </div>
          </div>

          {activeTag && (
            <div className="pt-2 border-t border-gray-200/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex flex-col">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wider">Doc Ver</span>
                  <span
                    className={`font-mono font-medium ${
                      isVersionMismatch ? 'text-red-600 line-through' : 'text-gray-700'
                    }`}
                  >
                    {activeVersion || 'Unknown'}
                  </span>
                </div>
                <div className="text-gray-300">
                  <ChevronRight size={12} />
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wider">Latest</span>
                  <span className="font-mono font-medium text-green-700">{latestVersion || 'Unknown'}</span>
                </div>
              </div>
            </div>
          )}

          <div className="pt-1 flex items-center justify-between border-t border-blue-100 mt-1">
            <span className="text-[10px] text-gray-400">Validation Status:</span>
            <div className="flex items-center gap-1">
              {selectedArtifact.status === 'VALIDATED' ? (
                <ShieldCheck size={10} className="text-green-500" />
              ) : (
                <AlertCircle size={10} className="text-amber-500" />
              )}
              <span
                className={`font-medium ${
                  selectedArtifact.status === 'VALIDATED' ? 'text-green-700' : 'text-amber-600'
                }`}
              >
                {selectedArtifact.status}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-200/50 mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 py-1.5 rounded text-[10px] font-medium transition-colors"
            >
              <Eye size={12} className="text-blue-500" />
              View Evidence
            </button>

            {isVersionMismatch && typeof onSyncArtifact === 'function' && (
              <button
                type="button"
                onClick={() => onSyncArtifact(selectedArtifact)}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded shadow-sm transition-all active:scale-95"
              >
                <RefreshCw size={12} className="animate-spin-slow" />
                <span className="font-bold">Sync to {latestVersion || 'latest'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderTree = (nodes) => (
    <div className="pl-3 border-l border-gray-100 ml-1">
      {nodes.map(node => (
        <div key={node.id} className="mt-1">
          <div 
            ref={el => { itemRefs.current[node.id] = el; }}
            onClick={() => { toggleNode(node.id); if (node.type === 'artifact') setSelectedArtifact(node); }}
            className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-all duration-300 ${selectedArtifact?.id === node.id ? 'bg-blue-50 text-blue-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}`}
          >
            <span className="text-gray-400 shrink-0">
              {node.children || node.items ? (expanded.includes(node.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <div className="w-3.5" />}
            </span>
            {node.type === 'study' && <Database size={14} className="text-indigo-600" />}
            {node.type === 'cut' && <ShieldCheck size={14} className={node.status === 'FINAL' ? 'text-green-600' : 'text-amber-500'} />}
            {node.type === 'domain' && <Folder size={14} className="text-gray-400" />}
            {node.type === 'artifact' && <Table size={14} className="text-emerald-600" />}
            <span className="text-xs font-medium truncate flex-1">{node.label}</span>
            {/* Status Badge */}
            {node.status && (
               <span className={`text-[9px] px-1 rounded border ${node.status === 'VALIDATED' || node.status === 'LOCKED' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}> 
                 {node.status}
               </span>
            )}
          </div>
          {expanded.includes(node.id) && (
            <div>
              {node.children && renderTree(node.children)}
              {node.items && (
                <div className="pl-4 pr-2 py-2 space-y-1 bg-gray-50/50 rounded-b border-l-2 border-blue-100 ml-2">
                  <div className="text-[10px] uppercase font-bold text-gray-400 mb-1 flex justify-between px-1">
                    <span>Variables</span><span className="text-blue-600">Drag to insert</span>
                  </div>
                  {node.items.map(item => <DataChip key={item.id} item={item} parent={node} onDragStart={handleDragStart} />)}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white w-full relative">
      {/* HEADER WITH FILTERS */}
      <div className="p-3 border-b border-gray-200 bg-gray-50 shrink-0 space-y-2">
        <div className="flex items-center justify-between font-bold text-sm text-gray-800">
          <div className="flex items-center gap-2"><Database size={16} /> Clinical Data Room</div>
          <div className="text-[10px] bg-blue-100 text-blue-700 px-1.5 rounded">v2.4</div>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-300 rounded focus:border-blue-500 focus:ring-1" 
            placeholder="Search artifacts..." 
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
           <button 
             onClick={() => setShowValidatedOnly(!showValidatedOnly)}
             className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors ${showValidatedOnly ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
           >
             <ShieldCheck size={10} /> {showValidatedOnly ? 'Validated Only' : 'Show All'}
           </button>
        </div>
      </div>

      {/* TREE */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredTree.length > 0 ? renderTree(filteredTree) : (
           <div className="p-4 text-center text-gray-400 text-xs">
             <Filter size={24} className="mx-auto mb-2 opacity-20" />
             No artifacts match your filter.
           </div>
        )}
      </div>

      {/* INSPECTOR PANE (The "Smart" Part) */}
      <div className="shrink-0 border-t border-gray-200 bg-white">
        {renderInspector()}
      </div>

      <SourcePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        artifact={selectedArtifact}
        highlightedVariable={activeTag?.variable}
      />
    </div>
  );
}
