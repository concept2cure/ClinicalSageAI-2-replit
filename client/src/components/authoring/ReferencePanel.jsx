import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Download,
  Hash,
  Layers,
  Quote,
  Search,
  FileText,
  Type,
} from 'lucide-react';

// --- MOCK PUBMED DATABASE ---
const MOCK_REFS = [
  {
    id: 'PMID:382910',
    title: 'Efficacy of Novel Inhibitors in Phase 3 Trials',
    author: 'Smith, J. et al.',
    year: '2025',
    journal: 'N Engl J Med',
    type: 'Clinical Trial',
    status: 'OK',
    usageCount: 3,
    abstract:
      'In this phase 3 trial, the novel inhibitor demonstrated a statistically significant improvement...',
  },
  {
    id: 'PMID:382911',
    title: 'Safety Profiles of Immunotherapy Combinations',
    author: 'Doe, A. et al.',
    year: '2024',
    journal: 'Lancet Oncol',
    type: 'Review',
    status: 'RETRACTED',
    usageCount: 0,
    abstract: 'This article has been retracted due to data discrepancies...',
  },
  {
    id: 'PMID:382912',
    title: 'Global Oncology Trends and Outcomes',
    author: 'Chen, L. et al.',
    year: '2025',
    journal: 'J Clin Oncol',
    type: 'Epidemiology',
    status: 'OK',
    usageCount: 1,
    abstract: 'We analyzed global trends in oncology outcomes across 50 countries...',
  },
];

export function ReferencePanel() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRef, setSelectedRef] = useState(null);
  const [citationStyle, setCitationStyle] = useState('HARVARD'); // 'HARVARD' | 'VANCOUVER'
  const [pdfStatusById, setPdfStatusById] = useState({});

  const results = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return MOCK_REFS.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.author.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
    );
  }, [searchTerm]);

  const formatCitationValue = (ref) => {
    const lastName = String(ref?.author || '').split(',')[0] || 'Author';
    const year = ref?.year || 'YYYY';
    if (citationStyle === 'HARVARD') return `[${lastName} ${year}]`;
    const mockIndex = String(ref?.id || '').slice(-1) || '1';
    return `(${mockIndex})`;
  };

  const startPdfFetch = (ref) => {
    if (!ref?.id) return;
    if (ref.status === 'RETRACTED') return;

    setPdfStatusById((prev) => ({ ...prev, [ref.id]: 'fetching' }));
    window.setTimeout(() => {
      setPdfStatusById((prev) => ({ ...prev, [ref.id]: 'ready' }));
    }, 1200);
  };

  // --- DYNAMIC PAYLOAD GENERATOR ---
  const handleDragStart = (e, ref) => {
    if (ref.status === 'RETRACTED') return; // Strict Block

    e.stopPropagation();
    const citationValue = formatCitationValue(ref);

    const payload = JSON.stringify({
      type: 'smartTag',
      id: crypto.randomUUID(),
      value: citationValue,

      sourceId: ref.id,
      dataset: 'References',
      variable: 'Citation',
      dataVersion: ref.status,
      status: 'verified',
      label: ref.title,
      usageCount: ref.usageCount ?? 0,
    });

    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-clinical-data', payload);
  };

  const selectedPdfStatus = selectedRef ? pdfStatusById[selectedRef.id] : undefined;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* HEADER & CONTROLS */}
      <div className="p-3 border-b border-gray-200 bg-purple-50 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
            <BookOpen size={16} className="text-purple-600" />
            <span>Reference Manager</span>
          </div>
          <button
            type="button"
            onClick={() =>
              setCitationStyle((prev) => (prev === 'HARVARD' ? 'VANCOUVER' : 'HARVARD'))
            }
            className="flex items-center gap-1 text-[9px] bg-white border border-purple-200 px-2 py-1 rounded text-purple-700 hover:bg-purple-100 transition-colors"
            title="Toggle Citation Style"
          >
            {citationStyle === 'HARVARD' ? <Type size={10} /> : <Hash size={10} />}
            {citationStyle === 'HARVARD' ? 'Harvard' : 'Vancouver'}
          </button>
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-2 py-1.5 text-xs border border-purple-200 rounded focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            placeholder="Search PubMed..."
          />
        </div>
      </div>

      {/* RESULTS LIST */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {results.map((ref) => (
          <div
            key={ref.id}
            onClick={() => setSelectedRef(ref)}
            draggable={ref.status !== 'RETRACTED'}
            onDragStart={(e) => handleDragStart(e, ref)}
            className={`group p-3 border rounded cursor-pointer transition-all relative
                ${
                  selectedRef?.id === ref.id
                    ? 'border-purple-500 shadow-sm ring-1 ring-purple-100'
                    : 'border-gray-200 hover:border-purple-300'
                }
                ${ref.status === 'RETRACTED' ? 'bg-red-50/50 opacity-75' : 'bg-white'}
            `}
          >
            {ref.status === 'RETRACTED' && (
              <div className="absolute top-0 right-0 bg-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded-bl">
                RETRACTED
              </div>
            )}

            {ref.usageCount > 0 && ref.status !== 'RETRACTED' && (
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full text-[9px] border border-green-100">
                <Layers size={8} /> Used {ref.usageCount}x
              </div>
            )}

            <div className="flex items-center gap-2 mb-1 pr-14">
              <span
                className={`text-[10px] font-bold px-1.5 rounded ${
                  ref.status === 'RETRACTED'
                    ? 'text-red-700 bg-red-100'
                    : 'text-purple-700 bg-purple-50'
                }`}
              >
                {ref.type}
              </span>
            </div>

            <div
              className={`text-xs font-semibold leading-tight mb-1 pr-2 ${
                ref.status === 'RETRACTED' ? 'text-red-900 line-through' : 'text-gray-800'
              }`}
            >
              {ref.title}
            </div>

            <div className="text-[10px] text-gray-500">
              <span className="font-medium text-gray-700">{ref.author}</span> • {ref.year}
            </div>
          </div>
        ))}
      </div>

      {/* ABSTRACT & ACTION INSPECTOR */}
      <div className="shrink-0 border-t border-gray-200 bg-white">
        {selectedRef ? (
          <div
            className={`p-3 text-xs ${selectedRef.status === 'RETRACTED' ? 'bg-red-50' : 'bg-gray-50'}`}
          >
            <div className="font-semibold mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <FileText size={12} className="text-gray-500" />
                <span className="text-gray-800">Abstract Preview</span>
              </div>
              {selectedRef.status !== 'RETRACTED' && (
                <button
                  type="button"
                  onClick={() => startPdfFetch(selectedRef)}
                  disabled={selectedPdfStatus === 'fetching'}
                  className={`flex items-center gap-1 text-[9px] bg-white border border-gray-300 px-2 py-0.5 rounded transition-colors ${
                    selectedPdfStatus === 'fetching'
                      ? 'opacity-60 cursor-wait'
                      : 'hover:bg-gray-50'
                  }`}
                  title="Simulate PDF fetch"
                >
                  <Download size={10} />
                  {selectedPdfStatus === 'ready'
                    ? 'PDF Ready'
                    : selectedPdfStatus === 'fetching'
                      ? 'Fetching…'
                      : 'Get PDF'}
                </button>
              )}
            </div>

            <div className="text-gray-600 italic leading-relaxed h-[60px] overflow-y-auto mb-2 border-l-2 border-gray-300 pl-2">
              "{selectedRef.abstract}"
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-gray-200/50">
              <span className="font-mono text-[9px] text-gray-400">{selectedRef.id}</span>
              {selectedRef.status !== 'RETRACTED' ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded border bg-white border-purple-200 text-purple-700">
                    {formatCitationValue(selectedRef)}
                  </span>
                  <div className="flex items-center gap-1 text-purple-600 font-medium animate-pulse">
                    <Quote size={10} />
                    <span>Drag to Cite ({citationStyle === 'HARVARD' ? 'Author' : '#'})</span>
                  </div>
                </div>
              ) : (
                <span className="flex items-center gap-1 text-red-600 font-bold">
                  <AlertTriangle size={10} /> BLOCKED
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-400 text-xs italic bg-gray-50 flex flex-col items-center justify-center min-h-[140px]">
            <BookOpen size={20} className="mb-2 opacity-20" />
            Select a paper to verify
          </div>
        )}
      </div>
    </div>
  );
}
