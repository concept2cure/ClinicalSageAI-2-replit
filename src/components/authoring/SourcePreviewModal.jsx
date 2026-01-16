import React, { useEffect, useRef } from 'react';
import { X, FileText, Download, ZoomIn } from 'lucide-react';

export function SourcePreviewModal({ isOpen, onClose, artifact, highlightedVariable }) {
  if (!isOpen || !artifact) return null;

  const closeButtonRef = useRef(null);
  const targetRowRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => closeButtonRef.current?.focus?.());

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = priorOverflow;
      try {
        previouslyFocused?.focus?.();
      } catch {
        // ignore
      }
    };
  }, [onClose]);

  useEffect(() => {
    if (!highlightedVariable) return;
    const id = setTimeout(() => {
      try {
        targetRowRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      } catch {
        // ignore
      }
    }, 75);
    return () => clearTimeout(id);
  }, [highlightedVariable]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-preview-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-700 rounded">
              <FileText size={20} />
            </div>
            <div>
              <h3 id="source-preview-title" className="font-bold text-gray-800 text-sm">{artifact.label}</h3>
              <div className="text-xs text-gray-500 flex gap-2">
                <span>
                  Program: <span className="font-mono">{artifact.sasProgram}</span>
                </span>
                <span>•</span>
                <span>
                  Status: <span className="text-green-600 font-medium">{artifact.status}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Zoom" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded">
              <ZoomIn size={18} />
            </button>
            <button type="button" aria-label="Download" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded">
              <Download size={18} />
            </button>
            <button
              type="button"
              ref={closeButtonRef}
              onClick={() => onClose?.()}
              aria-label="Close"
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* DOCUMENT VIEWER (MOCK PDF/TABLE) */}
        <div className="flex-1 overflow-auto p-8 bg-gray-100/50">
          <div className="bg-white shadow-sm border border-gray-200 min-h-[800px] p-10 mx-auto max-w-3xl relative">
            {/* DOCUMENT HEADER */}
            <div className="text-center mb-8 border-b-2 border-black pb-4">
              <h1 className="font-bold text-lg uppercase mb-2">Table 14.2.1</h1>
              <h2 className="font-bold text-sm">Summary of Progression-Free Survival (PFS) - ITT Population</h2>
            </div>

            {/* THE DATA TABLE */}
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="text-left py-2 pl-2">Statistic</th>
                  <th className="text-right py-2">Placebo (N=224)</th>
                  <th className="text-right py-2 pr-2">Study Drug (N=226)</th>
                </tr>
              </thead>
              <tbody>
                {/* MOCK ROWS - We dynamically highlight based on 'highlightedVariable' */}
                <TableRow label="Subjects with Event, n(%)" val1="150 (67.0%)" val2="98 (43.4%)" />

                <TableRow
                  label="Hazard Ratio (95% CI)"
                  val1="-"
                  val2="0.45 (0.32, 0.58)"
                  isTarget={highlightedVariable === 'HR_PFS'} // <--- HIGHLIGHT LOGIC
                  rowRef={highlightedVariable === 'HR_PFS' ? targetRowRef : null}
                />

                <TableRow
                  label="p-value (Stratified Log-rank)"
                  val1="-"
                  val2="< 0.0001"
                  isTarget={highlightedVariable === 'PVAL_LOG'}
                  rowRef={highlightedVariable === 'PVAL_LOG' ? targetRowRef : null}
                />

                <tr aria-hidden="true">
                  <td colSpan={3} className="h-4"></td>
                </tr>

                <TableRow
                  label="Median PFS (months)"
                  val1="8.4"
                  val2="18.2"
                  isTarget={highlightedVariable === 'MED_OS'}
                  rowRef={highlightedVariable === 'MED_OS' ? targetRowRef : null}
                />
                <TableRow label="95% CI" val1="(7.2, 9.5)" val2="(15.5, 20.1)" />
              </tbody>
            </table>

            {/* FOOTER */}
            <div className="mt-12 text-[10px] text-gray-500 border-t border-black pt-2">
              <p>Source: /clinical/data/stats/final/t_pfs_km.sas</p>
              <p>Database Lock: 2025-11-15 14:30:00</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Row Component
const TableRow = ({ label, val1, val2, isTarget, rowRef }) => (
  <tr
    ref={rowRef || undefined}
    className={`border-b border-dotted border-gray-300 ${isTarget ? 'bg-yellow-100 transition-colors duration-1000' : ''}`}
  >
    <td className="py-2 pl-2">{label}</td>
    <td className="text-right py-2">{val1}</td>
    <td className="text-right py-2 pr-2 font-bold">
      {isTarget ? <span className="bg-yellow-300 px-1 rounded ring-2 ring-yellow-400 text-black">{val2}</span> : val2}
    </td>
  </tr>
);
