/**
 * GlobalDocumentSearch — Cross-project document search with filters.
 *
 * Searches across all artifacts in the organization, with filters for
 * status, CTD section, project, and document type. Results link directly
 * to the document editor.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  X,
  FileText,
  Filter,
  ChevronRight,
  Loader2,
  FolderOpen,
  Clock,
  CheckCircle,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { LIFECYCLE, toLifecycleStage } from '../ui/enterprise';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  projectId: string;
  title: string;
  type?: string;
  category?: string;
  status: string;
  ctdSection?: string;
  version?: number;
  projectName: string;
  createdAt?: string;
  updatedAt?: string;
}

interface GlobalDocumentSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDocument: (projectId: string, documentId: string) => void;
}

// ── Auth ───────────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Status helpers ─────────────────────────────────────────────────────────

const STATUS_ICONS: Record<string, React.ElementType> = {
  draft: Clock,
  review: AlertTriangle,
  approved: CheckCircle,
  locked: Lock,
};

const STATUS_COLORS: Record<string, string> = {
  draft: `${LIFECYCLE.draft.text} ${LIFECYCLE.draft.bg}`,
  review: `${LIFECYCLE.in_review.text} ${LIFECYCLE.in_review.bg}`,
  approved: `${LIFECYCLE.approved.text} ${LIFECYCLE.approved.bg}`,
  locked: `${LIFECYCLE.archived.text} ${LIFECYCLE.archived.bg}`,
};

function normalizeStatus(raw?: string): string {
  if (!raw) return 'draft';
  const s = raw.toLowerCase().trim();
  if (s.includes('review')) return 'review';
  if (s === 'approved' || s === 'final') return 'approved';
  if (s === 'locked' || s === 'published') return 'locked';
  return 'draft';
}

// ── Component ──────────────────────────────────────────────────────────────

export function GlobalDocumentSearch({ isOpen, onClose, onOpenDocument }: GlobalDocumentSearchProps) {
  const [query, setQuery] = useState('');
  const [allDocs, setAllDocs] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch all artifacts on open
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch('/api/concept2cure/artifacts', { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(payload => {
        const data = payload.data || payload || [];
        setAllDocs(data);
      })
      .catch(() => setAllDocs([]))
      .finally(() => setLoading(false));
  }, [isOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setStatusFilter('all');
      setProjectFilter('all');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Unique projects for filter
  const projects = useMemo(() => {
    const map = new Map<string, string>();
    allDocs.forEach(d => map.set(d.projectId, d.projectName));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allDocs]);

  // Filtered results
  const results = useMemo(() => {
    let filtered = allDocs;

    if (query.trim()) {
      const q = query.toLowerCase();
      filtered = filtered.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.projectName.toLowerCase().includes(q) ||
        (d.ctdSection && d.ctdSection.toLowerCase().includes(q)) ||
        (d.type && d.type.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(d => normalizeStatus(d.status) === statusFilter);
    }

    if (projectFilter !== 'all') {
      filtered = filtered.filter(d => d.projectId === projectFilter);
    }

    return filtered.slice(0, 50); // Cap at 50 results
  }, [allDocs, query, statusFilter, projectFilter]);

  const handleSelect = useCallback((doc: SearchResult) => {
    onOpenDocument(doc.projectId, doc.id);
    onClose();
  }, [onOpenDocument, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed top-[10%] left-1/2 -translate-x-1/2 w-full max-w-2xl bg-white rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-200">
          <Search className="w-5 h-5 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search all documents across projects..."
            className="flex-1 text-base bg-transparent border-none outline-none text-zinc-900 placeholder:text-zinc-400"
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'p-1.5 rounded-md transition-colors duration-150',
              showFilters ? 'bg-blue-100 text-blue-600' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'
            )}
          >
            <Filter className="w-4 h-4" />
          </button>
          <kbd className="hidden sm:flex items-center px-2 py-1 text-xs text-zinc-400 bg-zinc-100 rounded-md">
            ESC
          </kbd>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100 bg-zinc-50/60">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg bg-white focus-visible:ring-2 focus-visible:ring-blue-500 outline-none/30"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="review">In Review</option>
              <option value="approved">Approved</option>
              <option value="locked">Published</option>
            </select>
            <select
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg bg-white focus-visible:ring-2 focus-visible:ring-blue-500 outline-none/30 max-w-[200px]"
            >
              <option value="all">All Projects</option>
              {projects.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            {(statusFilter !== 'all' || projectFilter !== 'all') && (
              <button
                onClick={() => { setStatusFilter('all'); setProjectFilter('all'); }}
                className="text-xs text-zinc-500 hover:text-zinc-700"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Search className="w-10 h-10 text-zinc-300 mb-3" />
              <p className="text-sm font-medium text-zinc-500">
                {allDocs.length === 0 ? 'No documents found' : `No results for "${query}"`}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                {allDocs.length === 0 ? 'Create documents in a project to search them here.' : 'Try a different search term or adjust filters.'}
              </p>
            </div>
          ) : (
            <div className="py-1">
              <div className="px-4 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                  {allDocs.length > results.length && ` of ${allDocs.length}`}
                </span>
              </div>
              {results.map(doc => {
                const status = normalizeStatus(doc.status);
                const StatusIcon = STATUS_ICONS[status] || Clock;
                const colorClass = STATUS_COLORS[status] || STATUS_COLORS.draft;

                return (
                  <button
                    key={doc.id}
                    onClick={() => handleSelect(doc)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-inset"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{doc.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                          <FolderOpen className="w-2.5 h-2.5" />
                          {doc.projectName}
                        </span>
                        {doc.ctdSection && (
                          <span className="text-[10px] text-violet-500 font-medium">
                            CTD {doc.ctdSection}
                          </span>
                        )}
                        {doc.version != null && (
                          <span className="text-[10px] text-zinc-400 tabular-nums">v{doc.version}</span>
                        )}
                      </div>
                    </div>
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium', colorClass)}>
                      <StatusIcon className="w-2.5 h-2.5" />
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 bg-zinc-50">
          <span className="text-xs text-zinc-500">
            {allDocs.length} total document{allDocs.length !== 1 ? 's' : ''} across {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <kbd className="px-1.5 py-0.5 bg-zinc-200 rounded text-zinc-600">↵</kbd>
            <span>Open</span>
          </div>
        </div>
      </div>
    </>
  );
}

export default GlobalDocumentSearch;
