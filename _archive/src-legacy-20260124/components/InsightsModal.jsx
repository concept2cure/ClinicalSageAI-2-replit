// InsightsModal.jsx – detailed cards with filter, tabs & docs links
import React, { useEffect, useState } from 'react';
import ModalPortal from './ModalPortal';
import { X } from 'lucide-react';

export default function InsightsModal({ onClose }) {
  const [models, setModels] = useState([]);
  const [filter, setFilter] = useState('');
  const [tag, setTag] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/insight-models?limit=100')
      .then(r => {
        if (!r.ok) {
          throw new Error(`HTTP error! Status: ${r.status}`);
        }
        return r.json();
      })
      .then(data => {
        setModels(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching AI models:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const tags = Array.from(new Set(models.flatMap(m => m.tags || [])));
  const visible = models.filter(
    m =>
      (tag === 'all' || (m.tags || []).includes(tag)) &&
      (filter === '' || m.name.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-800 w-full max-w-4xl rounded-lg shadow-2xl p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-500 hover:text-red-500"
          >
            <X size={20} />
          </button>
          <h2 className="text-2xl font-semibold mb-4">AI Insight Models ({models.length})</h2>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-emerald-500 rounded-full border-t-transparent"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-md text-red-700 dark:text-red-400">
              Error loading AI models: {error}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-4 text-xs">
                <button
                  onClick={() => setTag('all')}
                  className={`px-3 py-1 rounded ${
                    tag === 'all' ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-slate-700'
                  }`}
                >
                  All
                </button>
                {tags.map(t => (
                  <button
                    key={t}
                    onClick={() => setTag(t)}
                    className={`px-3 py-1 rounded ${
                      tag === t ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-slate-700'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="Search model…"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="mb-4 w-full border rounded px-3 py-2 text-sm focus:outline-emerald-600 bg-gray-50 dark:bg-slate-700 dark:border-slate-600"
              />

              <div className="grid sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1">
                {visible.map((m, i) => (
                  <a
                    key={i}
                    href={m.docUrl || '#'}
                    target={m.docUrl ? '_blank' : '_self'}
                    className="block p-4 border rounded-lg bg-gray-50 dark:bg-slate-700 hover:border-emerald-600 transition"
                  >
                    <h3 className="font-semibold mb-1 text-emerald-600 dark:text-emerald-300">
                      {m.name}
                    </h3>
                    <p className="text-xs opacity-80 mb-2" style={{ minHeight: '2.5em' }}>
                      {m.description}
                    </p>
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded dark:bg-emerald-900 dark:text-emerald-200">
                      v{m.version}
                    </span>
                  </a>
                ))}
                {visible.length === 0 && <p className="italic text-gray-500">No models match.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
