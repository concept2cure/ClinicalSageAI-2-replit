import React, { useState, useEffect } from 'react';
import { Search, X, Filter, Calendar } from 'lucide-react';

export default function FilterBar({ onChange, initialFilters = {}, showTags = true, showStatus = true, showLinkedFilter = false }) {
  const [search, setSearch] = useState(initialFilters.search || '');
  const [tags, setTags] = useState(initialFilters.tags || []);
  const [status, setStatus] = useState(initialFilters.status || '');
  const [linked, setLinked] = useState(initialFilters.linked || '');
  const [dateFrom, setDateFrom] = useState(initialFilters.dateFrom || '');
  const [dateTo, setDateTo] = useState(initialFilters.dateTo || '');

  useEffect(() => {
    const filters = {
      search: search || undefined,
      tags: tags.length > 0 ? tags : undefined,
      status: status || undefined,
      linked: linked || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    };
    // Debounce
    const handle = setTimeout(() => onChange?.(filters), 300);
    return () => clearTimeout(handle);
  }, [search, tags, status, linked, dateFrom, dateTo, onChange]);

  const activeCount = [search, tags.length > 0, status, linked, dateFrom, dateTo].filter(Boolean).length;

  const handleClearAll = () => {
    setSearch('');
    setTags([]);
    setStatus('');
    setLinked('');
    setDateFrom('');
    setDateTo('');
  };

  const handleTagToggle = (tag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {showStatus && (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="REVIEW">Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        )}

        {showLinkedFilter && (
          <select
            value={linked}
            onChange={(e) => setLinked(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Evidence</option>
            <option value="linked">Linked</option>
            <option value="unlinked">Unlinked</option>
          </select>
        )}

        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="From"
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="To"
          />
        </div>

        {activeCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
              {activeCount}
            </span>
            <button
              onClick={handleClearAll}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <X className="h-3 w-3" />
              Clear all
            </button>
          </div>
        )}
      </div>

      {showTags && (
        <div className="mt-3 flex flex-wrap gap-2">
          {['clinical', 'regulatory', 'technical', 'preclinical', 'literature'].map((tag) => (
            <button
              key={tag}
              onClick={() => handleTagToggle(tag)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                tags.includes(tag)
                  ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
