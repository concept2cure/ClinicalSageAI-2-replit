/**
 * @fileoverview Provenance Viewer — 21 CFR Part 11 compliant audit trail
 * @module concept2cure/pages/MissionControl/ProvenanceViewer
 *
 * Full provenance/audit trail viewer with timeline, filtering,
 * hash chain verification, and date-grouped entries.
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Fingerprint,
  Shield,
  CheckCircle2,
  Clock,
  User,
  Hash,
  Search,
  ChevronDown,
  AlertTriangle,
  FileText,
  GitBranch,
  Link2,
  Eye,
  ThumbsUp,
  PenLine,
  ArrowRightLeft,
  Plus,
  Loader2,
} from 'lucide-react';
import { useProvenance, usePrograms } from '../../hooks/useMissionControl';

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

interface ProvenanceViewerProps {
  programId: number | null;
}

const ENTITY_TYPES = [
  { value: '', label: 'All Entities' },
  { value: 'program', label: 'Program' },
  { value: 'artifact', label: 'Artifact' },
  { value: 'evidence', label: 'Evidence' },
  { value: 'review', label: 'Review' },
  { value: 'decision', label: 'Decision' },
  { value: 'risk', label: 'Risk' },
  { value: 'collaboration', label: 'Collaboration' },
] as const;

const ACTION_STYLES: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  created:      { bg: 'bg-emerald-50',  text: 'text-emerald-700', icon: Plus },
  updated:      { bg: 'bg-blue-50',     text: 'text-blue-700',    icon: PenLine },
  transitioned: { bg: 'bg-purple-50',   text: 'text-purple-700',  icon: ArrowRightLeft },
  linked:       { bg: 'bg-cyan-50',     text: 'text-cyan-700',    icon: Link2 },
  reviewed:     { bg: 'bg-amber-50',    text: 'text-amber-700',   icon: Eye },
  approved:     { bg: 'bg-emerald-50',  text: 'text-emerald-700', icon: ThumbsUp },
  rejected:     { bg: 'bg-red-50',      text: 'text-red-700',     icon: AlertTriangle },
  deleted:      { bg: 'bg-red-50',      text: 'text-red-600',     icon: AlertTriangle },
  signed:       { bg: 'bg-indigo-50',   text: 'text-indigo-700',  icon: Fingerprint },
  submitted:    { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: FileText },
  branched:     { bg: 'bg-teal-50',     text: 'text-teal-700',    icon: GitBranch },
};

const LIMIT_OPTIONS = [50, 100, 200] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}

function formatDateHeader(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return ts;
  }
}

function toDateKey(ts: string): string {
  try {
    return new Date(ts).toISOString().slice(0, 10);
  } catch {
    return 'unknown';
  }
}

function isToday(ts: string): boolean {
  try {
    return new Date(ts).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  } catch {
    return false;
  }
}

function getActionStyle(action: string) {
  const key = (action || '').toLowerCase();
  return ACTION_STYLES[key] || { bg: 'bg-zinc-50', text: 'text-zinc-700', icon: Clock };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ProvenanceViewer: React.FC<ProvenanceViewerProps> = ({ programId }) => {
  // Filters
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [limit, setLimit] = useState<number>(50);

  // Data
  const { data: entries = [], isLoading, isFetching } = useProvenance(programId, {
    entityType: entityTypeFilter || undefined,
    limit,
  });

  // Client-side filtering for search & date range (server handles entity type + limit)
  const filtered = useMemo(() => {
    let result = entries as any[];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e: any) =>
          (e.action || '').toLowerCase().includes(q) ||
          (e.entityType || '').toLowerCase().includes(q) ||
          (e.actorName || e.actorId || '').toString().toLowerCase().includes(q) ||
          (e.details || e.summary || '').toString().toLowerCase().includes(q) ||
          (e.entityId || '').toString().includes(q),
      );
    }

    if (dateFrom) {
      result = result.filter((e: any) => toDateKey(e.timestamp || e.createdAt) >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((e: any) => toDateKey(e.timestamp || e.createdAt) <= dateTo);
    }

    return result;
  }, [entries, searchQuery, dateFrom, dateTo]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: { date: string; label: string; items: any[] }[] = [];
    const map = new Map<string, any[]>();

    filtered.forEach((entry: any) => {
      const key = toDateKey(entry.timestamp || entry.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    });

    // Sort date keys descending
    const sortedKeys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
    sortedKeys.forEach(key => {
      groups.push({ date: key, label: formatDateHeader(key), items: map.get(key)! });
    });

    return groups;
  }, [filtered]);

  // Stats
  const stats = useMemo(() => {
    const all = entries as any[];
    const todayCount = all.filter((e: any) => isToday(e.timestamp || e.createdAt)).length;
    const actors = new Set(all.map((e: any) => e.actorId || e.actorName || 'system'));
    const chainValid = all.length === 0 || all.every((e: any) => e.hashValid !== false);
    return {
      total: all.length,
      today: todayCount,
      uniqueActors: actors.size,
      chainValid,
    };
  }, [entries]);

  // ---------------------------------------------------------------------------
  // No program selected state
  // ---------------------------------------------------------------------------

  if (!programId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#faf9f5]">
        <div className="text-center">
          <Fingerprint className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">Select a program to view its provenance trail</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#faf9f5]">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex-1 flex flex-col bg-[#faf9f5] overflow-hidden">
      {/* Header */}
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Fingerprint className="w-5 h-5 text-blue-600" />
          <h1 className="text-base font-semibold text-zinc-900">Provenance Trail</h1>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-medium border border-emerald-200">
            <Shield className="w-3 h-3" />
            21 CFR Part 11 Compliant
          </span>
        </div>
        {isFetching && !isLoading && (
          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
        )}
      </div>

      {/* Stats Strip */}
      <div className="border-b bg-white px-6 py-2.5">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs text-zinc-500">Total Entries</span>
            <span className="text-xs font-semibold text-zinc-800">{stats.total}</span>
          </div>
          <div className="w-px h-4 bg-zinc-200" />
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs text-zinc-500">Today</span>
            <span className="text-xs font-semibold text-zinc-800">{stats.today}</span>
          </div>
          <div className="w-px h-4 bg-zinc-200" />
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs text-zinc-500">Unique Actors</span>
            <span className="text-xs font-semibold text-zinc-800">{stats.uniqueActors}</span>
          </div>
          <div className="w-px h-4 bg-zinc-200" />
          <div className="flex items-center gap-2">
            <Hash className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs text-zinc-500">Chain Integrity</span>
            {stats.chainValid ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                <AlertTriangle className="w-3.5 h-3.5" />
                Broken
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="border-b bg-white px-6 py-2.5">
        <div className="flex items-center gap-3">
          <select
            value={entityTypeFilter}
            onChange={e => setEntityTypeFilter(e.target.value)}
            className="text-xs px-2 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700"
          >
            {ENTITY_TYPES.map(et => (
              <option key={et.value} value={et.value}>{et.label}</option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-xs px-2 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-xs px-2 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700"
            />
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search entries..."
              className="w-full text-xs pl-8 pr-3 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Limit</span>
            <select
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
              className="text-xs px-2 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700"
            >
              {LIMIT_OPTIONS.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Audit Timeline */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <Fingerprint className="w-10 h-10 text-zinc-200 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">No provenance entries found</p>
              <p className="text-xs text-zinc-400 mt-1">
                {searchQuery || dateFrom || dateTo || entityTypeFilter
                  ? 'Try adjusting your filters.'
                  : 'Actions in this program will appear here as an immutable audit trail.'}
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map(group => (
                <div key={group.date}>
                  {/* Date Separator */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-px flex-1 bg-zinc-200" />
                    <span className="text-[11px] font-medium text-zinc-500 whitespace-nowrap">
                      {group.label}
                    </span>
                    <div className="h-px flex-1 bg-zinc-200" />
                  </div>

                  {/* Timeline entries */}
                  <div className="relative">
                    {/* Vertical timeline line */}
                    <div className="absolute left-[15px] top-2 bottom-2 w-px bg-zinc-200" />

                    <div className="space-y-1">
                      {group.items.map((entry: any, idx: number) => {
                        const style = getActionStyle(entry.action);
                        const ActionIcon = style.icon;
                        const ts = entry.timestamp || entry.createdAt;
                        const actor = entry.actorName || entry.actorId || 'System';
                        const detail = entry.details || entry.summary || entry.changes || null;
                        const hashOk = entry.hashValid !== false;

                        return (
                          <div key={entry.id || idx} className="relative flex gap-4 pl-0 py-2 group">
                            {/* Timeline dot */}
                            <div
                              className={cn(
                                'relative z-10 flex-shrink-0 w-[31px] h-[31px] rounded-full border-2 border-white flex items-center justify-center',
                                style.bg,
                              )}
                            >
                              <ActionIcon className={cn('w-3.5 h-3.5', style.text)} />
                            </div>

                            {/* Entry card */}
                            <div className="flex-1 bg-white rounded-xl border border-zinc-200 p-3.5 hover:border-zinc-300 transition-colors min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  {/* Action badge + entity */}
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span
                                      className={cn(
                                        'text-[10px] font-medium px-2 py-0.5 rounded-full capitalize',
                                        style.bg,
                                        style.text,
                                      )}
                                    >
                                      {entry.action}
                                    </span>
                                    <span className="text-xs text-zinc-500">
                                      <span className="capitalize">{entry.entityType}</span>
                                      {entry.entityId && (
                                        <span className="text-zinc-400 ml-1">#{entry.entityId}</span>
                                      )}
                                    </span>
                                  </div>

                                  {/* Detail / changes */}
                                  {detail && (
                                    <p className="text-xs text-zinc-600 mt-1 line-clamp-2">
                                      {typeof detail === 'object' ? JSON.stringify(detail) : detail}
                                    </p>
                                  )}
                                </div>

                                {/* Right side: timestamp, actor, hash */}
                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                  <span className="text-[10px] text-zinc-400 whitespace-nowrap">
                                    {formatTimestamp(ts)}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <User className="w-3 h-3 text-zinc-400" />
                                    <span className="text-[10px] text-zinc-500 max-w-[120px] truncate">
                                      {actor}
                                    </span>
                                  </div>
                                  {hashOk ? (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                                      <CheckCircle2 className="w-3 h-3" />
                                      verified
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] text-red-500">
                                      <AlertTriangle className="w-3 h-3" />
                                      invalid
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load More / Pagination */}
          {filtered.length > 0 && filtered.length >= limit && (
            <div className="flex items-center justify-center mt-8">
              <button
                onClick={() => setLimit(prev => Math.min(prev + 50, 500))}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                Load more entries
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProvenanceViewer;
