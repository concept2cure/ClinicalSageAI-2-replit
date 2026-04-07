/**
 * GlobalDocumentSearch — Cross-project document search with filters.
 *
 * Searches across all artifacts in the organization, with filters for
 * status, CTD section, project, and document type. Results link directly
 * to the document editor.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { LoadingState } from '@/components/ui/statesV2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const { toast } = useToast();
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
    apiRequest('GET', '/api/concept2cure/artifacts')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(payload => {
        const data = payload.data || payload || [];
        setAllDocs(data);
      })
      .catch(() => {
        setAllDocs([]);
        toast({ title: 'Failed to load documents', variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [isOpen, toast]);

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

  return (
    <AnimatePresence>
    {isOpen && (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Dialog */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
        className="fixed top-[10%] left-1/2 -translate-x-1/2 w-full max-w-2xl bg-white rounded-xl shadow-sm overflow-hidden z-50">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-stone-200">
          <Search className="w-5 h-5 text-stone-400 shrink-0" />
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search all documents across projects..."
            className="flex-1 text-base bg-transparent border-none outline-none shadow-none text-stone-900 placeholder:text-stone-400 focus-visible:ring-0"
          />
          <Button
            variant={showFilters ? 'default' : 'ghost'}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              showFilters ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' : ''
            )}
          >
            <Filter className="w-4 h-4" />
          </Button>
          <kbd className="hidden sm:flex items-center px-2 py-1 text-xs text-stone-400 bg-stone-100 rounded-md">
            ESC
          </kbd>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-stone-100 bg-stone-50/60">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="review">In Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="locked">Published</SelectItem>
              </SelectContent>
            </Select>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(statusFilter !== 'all' || projectFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setStatusFilter('all'); setProjectFilter('all'); }}
                className="text-xs text-stone-500 hover:text-stone-700"
              >
                Clear filters
              </Button>
            )}
          </div>
        )}

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto">
          {loading ? (
            <LoadingState message="Searching documents…" size="sm" />
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Search className="w-10 h-10 text-stone-300 mb-3" />
              <p className="text-sm font-medium text-stone-500">
                {allDocs.length === 0 ? 'No documents found' : `No results for "${query}"`}
              </p>
              <p className="text-xs text-stone-400 mt-1">
                {allDocs.length === 0 ? 'Create documents in a project to search them here.' : 'Try a different search term or adjust filters.'}
              </p>
            </div>
          ) : (
            <div className="py-1">
              <div className="px-4 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                  {allDocs.length > results.length && ` of ${allDocs.length}`}
                </span>
              </div>
              {results.map(doc => {
                const status = normalizeStatus(doc.status);
                const StatusIcon = STATUS_ICONS[status] || Clock;
                const colorClass = STATUS_COLORS[status] || STATUS_COLORS.draft;

                return (
                  <Button
                    key={doc.id}
                    variant="ghost"
                    onClick={() => handleSelect(doc)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 h-auto text-left rounded-none hover:bg-stone-50"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-stone-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">{doc.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 text-[10px] text-stone-400">
                          <FolderOpen className="w-2.5 h-2.5" />
                          {doc.projectName}
                        </span>
                        {doc.ctdSection && (
                          <span className="text-[10px] text-violet-500 font-medium">
                            CTD {doc.ctdSection}
                          </span>
                        )}
                        {doc.version != null && (
                          <span className="text-[10px] text-stone-400 tabular-nums">v{doc.version}</span>
                        )}
                      </div>
                    </div>
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium', colorClass)}>
                      <StatusIcon className="w-2.5 h-2.5" />
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-stone-200 bg-stone-50">
          <span className="text-xs text-stone-500">
            {allDocs.length} total document{allDocs.length !== 1 ? 's' : ''} across {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1 text-xs text-stone-400">
            <kbd className="px-1.5 py-0.5 bg-stone-200 rounded text-stone-600">↵</kbd>
            <span>Open</span>
          </div>
        </div>
      </motion.div>
    </>
    )}
    </AnimatePresence>
  );
}

export default GlobalDocumentSearch;
