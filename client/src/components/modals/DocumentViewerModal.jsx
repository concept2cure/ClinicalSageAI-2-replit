// DocumentViewerModal.jsx – shows full doc with highlighted snippet and PDF page
import React, { useEffect, useState, useRef } from 'react';
import { X, FileText, Download } from 'lucide-react';

export default function DocumentViewerModal({ docId, snippet, page, onClose }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const container = useRef(null);

  // Fetch document metadata and content
  useEffect(() => {
    setLoading(true);
    fetch(`/api/documents/${docId}`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to fetch document: ${r.status}`);
        return r.json();
      })
      .then(setDoc)
      .catch(err => {
        console.error('Document fetch error:', err);
        setError('Could not load document');
      })
      .finally(() => setLoading(false));
  }, [docId]);

  // Scroll to highlighted snippet
  useEffect(() => {
    if (!doc || !snippet || !container.current) return;

    // Find the snippet in document content
    const idx = doc.content.indexOf(snippet.slice(0, 50));
    if (idx !== -1) {
      // Create a temporary element to add data-idx attribute
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = highlighted;
      const targetEl = tempDiv.querySelector('mark');
      if (targetEl) {
        targetEl.setAttribute('data-idx', idx);
        container.current.innerHTML = tempDiv.innerHTML;

        // Find and scroll to the marked element
        const el = container.current.querySelector(`[data-idx='${idx}']`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [doc, snippet]);

  if (loading)
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-lg shadow-xl">
          <div className="animate-pulse">Loading document...</div>
        </div>
      </div>
    );

  if (error || !doc)
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-lg shadow-xl text-red-500">
          {error || 'Document not found'}
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-gray-200 dark:bg-slate-700 rounded"
          >
            Close
          </button>
        </div>
      </div>
    );

  // Prepare highlighted content
  const highlighted = doc.content.replace(
    snippet,
    `<mark class='bg-emerald-200 dark:bg-emerald-700/60'>${snippet}</mark>`
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-auto">
      <div className="bg-white dark:bg-slate-900 max-w-4xl w-full h-[80vh] rounded-lg shadow-xl relative p-6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 pb-3 mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText size={18} />
            {doc.title || `Document ${docId}`}
          </h2>
          <div className="flex items-center gap-2">
            <button
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              title="Download document"
            >
              <Download size={18} />
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-red-500" title="Close">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* PDF page preview */}
          {page && (
            <div className="border-b border-gray-200 dark:border-slate-700 pb-4 mb-4">
              <div className="text-sm font-medium mb-2">Page {page}</div>
              <div className="bg-gray-100 dark:bg-slate-800 rounded-lg p-2 flex justify-center">
                <img
                  src={`/api/documents/${docId}/page/${page}.png`}
                  alt={`PDF page ${page}`}
                  className="max-h-64 object-contain rounded border border-gray-300 dark:border-slate-600"
                  onError={e => {
                    e.target.onerror = null;
                    e.target.src =
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z'%3E%3C/path%3E%3Cpolyline points='13 2 13 9 20 9'%3E%3C/polyline%3E%3C/svg%3E";
                    e.target.alt = 'PDF preview not available';
                    e.target.className += ' opacity-30';
                  }}
                />
              </div>
            </div>
          )}

          {/* Text content with highlight */}
          <div className="flex-1 overflow-y-auto">
            <div
              ref={container}
              className="prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
