/**
 * @fileoverview Authority Tracker — Regulatory authority interaction management
 * @module concept2cure/pages/MissionControl/AuthorityTracker
 *
 * Tracks meetings, submissions, RFIs, and correspondence with regulatory
 * authorities (FDA, EMA, PMDA, HC, TGA). Calendar/timeline and list views,
 * commitment tracking, linked artifacts, and outcome summaries.
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { LIFECYCLE } from '../../components/ui/enterprise';
import {
  Building2,
  Calendar,
  List,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
  Link2,
  MessageSquare,
  Send,
  X,
} from 'lucide-react';
import {
  useAuthorityInteractions,
  useCreateAuthorityInteraction,
  usePrograms,
} from '../../hooks/useMissionControl';

// ─── Types & Constants ───────────────────────────────────────────────────────

interface AuthorityTrackerProps {
  programId: number | null;
}

type InteractionType =
  | 'pre-submission'
  | 'type-a-meeting'
  | 'type-b-meeting'
  | 'type-c-meeting'
  | 'rfi-response'
  | 'deficiency-response'
  | 'annual-report'
  | 'correspondence';

type Authority = 'FDA' | 'EMA' | 'PMDA' | 'HC' | 'TGA';

type InteractionStatus = 'planned' | 'submitted' | 'completed' | 'cancelled';

const INTERACTION_TYPES: { value: InteractionType; label: string }[] = [
  { value: 'pre-submission', label: 'Pre-Submission' },
  { value: 'type-a-meeting', label: 'Type A Meeting' },
  { value: 'type-b-meeting', label: 'Type B Meeting' },
  { value: 'type-c-meeting', label: 'Type C Meeting' },
  { value: 'rfi-response', label: 'RFI Response' },
  { value: 'deficiency-response', label: 'Deficiency Response' },
  { value: 'annual-report', label: 'Annual Report' },
  { value: 'correspondence', label: 'Correspondence' },
];

const AUTHORITIES: Authority[] = ['FDA', 'EMA', 'PMDA', 'HC', 'TGA'];

const STATUSES: InteractionStatus[] = ['planned', 'submitted', 'completed', 'cancelled'];

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  'pre-submission':       { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  dot: 'bg-purple-500' },
  'type-a-meeting':       { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
  'type-b-meeting':       { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',     dot: 'bg-sky-500' },
  'type-c-meeting':       { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200',    dot: 'bg-cyan-500' },
  'rfi-response':         { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  'deficiency-response':  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  dot: 'bg-orange-500' },
  'annual-report':        { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  'correspondence':       { bg: 'bg-zinc-50',    text: 'text-zinc-700',    border: 'border-zinc-200',    dot: 'bg-zinc-500' },
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  planned:   { bg: LIFECYCLE.draft.bg,        text: LIFECYCLE.draft.text },
  submitted: { bg: LIFECYCLE.in_review.bg,    text: LIFECYCLE.in_review.text },
  completed: { bg: LIFECYCLE.approved.bg,     text: LIFECYCLE.approved.text },
  cancelled: { bg: LIFECYCLE.archived.bg,     text: LIFECYCLE.archived.text },
};

const AUTHORITY_STYLE: Record<string, { bg: string; text: string }> = {
  FDA:  { bg: 'bg-blue-50',    text: 'text-blue-700' },
  EMA:  { bg: 'bg-blue-50',  text: 'text-blue-700' },
  PMDA: { bg: 'bg-rose-50',    text: 'text-rose-700' },
  HC:   { bg: 'bg-red-50',     text: 'text-red-700' },
  TGA:  { bg: 'bg-teal-50',    text: 'text-teal-700' },
};

function typeLabel(type: string): string {
  return INTERACTION_TYPES.find(t => t.value === type)?.label ?? type;
}

function isOverdue(dateStr: string | undefined, status: string): boolean {
  if (!dateStr || status === 'completed' || status === 'cancelled') return false;
  return new Date(dateStr) < new Date();
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysUntil(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── Component ───────────────────────────────────────────────────────────────

export const AuthorityTracker: React.FC<AuthorityTrackerProps> = ({ programId }) => {
  const [view, setView] = useState<'timeline' | 'list'>('list');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [newInteraction, setNewInteraction] = useState({
    type: 'type-b-meeting' as InteractionType,
    authority: 'FDA' as Authority,
    subject: '',
    date: '',
    description: '',
    status: 'planned' as InteractionStatus,
  });

  const { data: interactions = [], isLoading } = useAuthorityInteractions(programId);
  const createInteraction = useCreateAuthorityInteraction();
  const { data: _programs } = usePrograms();

  // ── Derived data ──────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    let upcoming = 0;
    let overdue = 0;

    interactions.forEach((ix: any) => {
      byType[ix.type] = (byType[ix.type] || 0) + 1;
      if (ix.status !== 'completed' && ix.status !== 'cancelled') {
        if (isOverdue(ix.date, ix.status)) {
          overdue++;
        } else {
          upcoming++;
        }
      }
    });
    return { total: interactions.length, byType, upcoming, overdue };
  }, [interactions]);

  const sortedUpcoming = useMemo(() => {
    return [...interactions]
      .filter((ix: any) => ix.status !== 'completed' && ix.status !== 'cancelled')
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [interactions]);

  const selectedInteraction = useMemo(() => {
    if (!selectedId) return null;
    return interactions.find((ix: any) => ix.id === selectedId) || null;
  }, [interactions, selectedId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleRow = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedId(id);
  };

  const handleCreate = () => {
    if (!programId || !newInteraction.subject.trim()) return;
    createInteraction.mutate({
      programId,
      ...newInteraction,
    });
    setNewInteraction({
      type: 'type-b-meeting',
      authority: 'FDA',
      subject: '',
      date: '',
      description: '',
      status: 'planned',
    });
    setShowAddModal(false);
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Clock className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col bg-[#faf9f5] overflow-hidden">
      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-blue-500" />
          <h1 className="text-base font-semibold text-zinc-900">Authority Tracker</h1>
          <span className="text-xs text-zinc-500">{stats.total} interactions</span>
          {stats.overdue > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium animate-pulse">
              {stats.overdue} overdue
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-zinc-200 overflow-hidden">
            <button
              onClick={() => setView('timeline')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 text-xs',
                view === 'timeline'
                  ? 'bg-zinc-900 text-white'
                  : 'bg-white text-zinc-600 hover:bg-zinc-50',
              )}
            >
              <Calendar className="w-3.5 h-3.5" />
              Timeline
            </button>
            <button
              onClick={() => setView('list')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 text-xs',
                view === 'list'
                  ? 'bg-zinc-900 text-white'
                  : 'bg-white text-zinc-600 hover:bg-zinc-50',
              )}
            >
              <List className="w-3.5 h-3.5" />
              List
            </button>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Interaction
          </button>
        </div>
      </div>

      {/* ─── Stats Strip ───────────────────────────────────────────────────── */}
      <div className="border-b bg-white px-6 py-2.5 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-50 text-zinc-700">
          <FileText className="w-3 h-3" /> {stats.total} total
        </span>
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 text-blue-700">
          <Clock className="w-3 h-3" /> {stats.upcoming} upcoming
        </span>
        {stats.overdue > 0 && (
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-50 text-red-700">
            <AlertTriangle className="w-3 h-3" /> {stats.overdue} overdue
          </span>
        )}
        {Object.entries(stats.byType).slice(0, 4).map(([type, count]) => {
          const colors = TYPE_COLORS[type] || TYPE_COLORS.correspondence;
          return (
            <span key={type} className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md', colors.bg, colors.text)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', colors.dot)} />
              {count} {typeLabel(type)}
            </span>
          );
        })}
      </div>

      {/* ─── Main Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Timeline or List */}
        <div className={cn('flex-1 overflow-y-auto', selectedInteraction ? 'border-r' : '')}>
          <div className="p-6 max-w-5xl mx-auto space-y-4">

            {interactions.length === 0 ? (
              <div className="bg-white rounded-xl border p-12 text-center">
                <Building2 className="w-10 h-10 text-zinc-200 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">No authority interactions recorded</p>
                <p className="text-xs text-zinc-400 mt-1">
                  Add meetings, submissions, and correspondence with regulatory authorities.
                </p>
              </div>
            ) : view === 'timeline' ? (
              /* ── Timeline View ──────────────────────────────────────────── */
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Upcoming &amp; Active
                </h3>
                {sortedUpcoming.length === 0 && (
                  <p className="text-xs text-zinc-400 py-4 text-center">No upcoming interactions</p>
                )}
                {sortedUpcoming.map((ix: any) => {
                  const colors = TYPE_COLORS[ix.type] || TYPE_COLORS.correspondence;
                  const overdue = isOverdue(ix.date, ix.status);
                  const days = daysUntil(ix.date);
                  return (
                    <button
                      key={ix.id}
                      onClick={() => setSelectedId(ix.id)}
                      className={cn(
                        'w-full text-left p-4 rounded-xl border transition-all duration-150',
                        overdue
                          ? 'bg-red-50 border-red-200 hover:border-red-300'
                          : 'bg-white border-zinc-200 hover:border-zinc-300',
                        selectedId === ix.id && 'ring-1 ring-blue-400 border-blue-300',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className={cn('w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0', colors.dot)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn('text-xs px-1.5 py-0.5 rounded-full', colors.bg, colors.text)}>
                              {typeLabel(ix.type)}
                            </span>
                            {ix.authority && (
                              <span className={cn(
                                'text-xs px-1.5 py-0.5 rounded-full font-medium',
                                AUTHORITY_STYLE[ix.authority]?.bg || 'bg-zinc-100',
                                AUTHORITY_STYLE[ix.authority]?.text || 'text-zinc-600',
                              )}>
                                {ix.authority}
                              </span>
                            )}
                            {overdue && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                                Overdue
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-zinc-900 truncate">{ix.subject}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-xs text-zinc-500">{formatDate(ix.date)}</span>
                            {days !== null && !overdue && (
                              <span className="text-xs text-zinc-400">
                                {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`}
                              </span>
                            )}
                            {days !== null && overdue && (
                              <span className="text-xs text-red-600 font-medium">
                                {Math.abs(days)} day{Math.abs(days) !== 1 ? 's' : ''} overdue
                              </span>
                            )}
                            {ix.commitments?.length > 0 && (
                              <span className="text-xs text-zinc-400">
                                {ix.commitments.length} commitment{ix.commitments.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* Completed / cancelled */}
                {interactions.filter((ix: any) => ix.status === 'completed' || ix.status === 'cancelled').length > 0 && (
                  <>
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider pt-4">
                      Completed / Cancelled
                    </h3>
                    {interactions
                      .filter((ix: any) => ix.status === 'completed' || ix.status === 'cancelled')
                      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((ix: any) => {
                        const colors = TYPE_COLORS[ix.type] || TYPE_COLORS.correspondence;
                        return (
                          <button
                            key={ix.id}
                            onClick={() => setSelectedId(ix.id)}
                            className={cn(
                              'w-full text-left p-4 rounded-xl border transition-all bg-white border-zinc-200 hover:border-zinc-300 opacity-70',
                              selectedId === ix.id && 'ring-1 ring-blue-400 border-blue-300 opacity-100',
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <span className={cn('w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0', colors.dot, 'opacity-50')} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full', colors.bg, colors.text)}>
                                    {typeLabel(ix.type)}
                                  </span>
                                  {ix.authority && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
                                      {ix.authority}
                                    </span>
                                  )}
                                  <span className={cn(
                                    'text-xs px-1.5 py-0.5 rounded-full',
                                    STATUS_STYLE[ix.status]?.bg,
                                    STATUS_STYLE[ix.status]?.text,
                                  )}>
                                    {ix.status}
                                  </span>
                                </div>
                                <p className="text-sm font-medium text-zinc-600 truncate">{ix.subject}</p>
                                <span className="text-xs text-zinc-400">{formatDate(ix.date)}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                  </>
                )}
              </div>
            ) : (
              /* ── List View ──────────────────────────────────────────────── */
              <div className="bg-white rounded-xl border">
                <div className="p-4 border-b flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-900">All Interactions</h3>
                  <span className="text-xs text-zinc-500">{interactions.length} records</span>
                </div>

                {/* Table header */}
                <div className="grid grid-cols-[1fr_80px_1.5fr_100px_90px_80px] gap-2 px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b bg-zinc-50">
                  <span>Type</span>
                  <span>Authority</span>
                  <span>Subject</span>
                  <span>Date</span>
                  <span>Status</span>
                  <span className="text-right">Commits</span>
                </div>

                {/* Table rows */}
                <div className="divide-y">
                  {interactions.map((ix: any) => {
                    const colors = TYPE_COLORS[ix.type] || TYPE_COLORS.correspondence;
                    const statusColors = STATUS_STYLE[ix.status] || STATUS_STYLE.planned;
                    const authColors = AUTHORITY_STYLE[ix.authority] || { bg: 'bg-zinc-100', text: 'text-zinc-600' };
                    const overdue = isOverdue(ix.date, ix.status);
                    const expanded = expandedRows.has(ix.id);
                    const commitments: any[] = ix.commitments || [];

                    return (
                      <div key={ix.id}>
                        <button
                          onClick={() => toggleRow(ix.id)}
                          className={cn(
                            'w-full grid grid-cols-[1fr_80px_1.5fr_100px_90px_80px] gap-2 px-4 py-3 text-left transition-colors items-center',
                            overdue ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-zinc-50',
                            expanded && 'bg-blue-50/30',
                          )}
                        >
                          <span className="flex items-center gap-2">
                            {expanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                            )}
                            <span className={cn('text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap', colors.bg, colors.text)}>
                              {typeLabel(ix.type)}
                            </span>
                          </span>
                          <span className={cn('text-xs px-1.5 py-0.5 rounded-full text-center font-medium w-fit', authColors.bg, authColors.text)}>
                            {ix.authority || '--'}
                          </span>
                          <span className="text-xs text-zinc-900 truncate">{ix.subject}</span>
                          <span className={cn('text-xs', overdue ? 'text-red-600 font-medium' : 'text-zinc-600')}>
                            {formatDate(ix.date)}
                          </span>
                          <span className={cn('text-xs px-1.5 py-0.5 rounded-full text-center w-fit', statusColors.bg, statusColors.text)}>
                            {ix.status}
                          </span>
                          <span className="text-xs text-zinc-500 text-right">
                            {commitments.length || '--'}
                          </span>
                        </button>

                        {/* Expanded inline detail */}
                        {expanded && (
                          <div className="px-10 pb-4 pt-1 border-t border-dashed border-zinc-200 bg-zinc-50/50">
                            {ix.description && (
                              <p className="text-xs text-zinc-600 mb-3">{ix.description}</p>
                            )}

                            {/* Commitments */}
                            {commitments.length > 0 && (
                              <div className="mb-3">
                                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                                  Commitments
                                </h4>
                                <div className="space-y-1">
                                  {commitments.map((c: any, idx: number) => (
                                    <div key={idx} className="flex items-center gap-2 p-1.5 rounded-md bg-white border border-zinc-200">
                                      {c.completed ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                      ) : (
                                        <Clock className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                                      )}
                                      <span className={cn('text-xs flex-1', c.completed ? 'text-zinc-500 line-through' : 'text-zinc-700')}>
                                        {c.text || c.title || c.description}
                                      </span>
                                      {c.dueDate && (
                                        <span className={cn(
                                          'text-xs',
                                          !c.completed && isOverdue(c.dueDate, 'planned')
                                            ? 'text-red-600 font-medium'
                                            : 'text-zinc-400',
                                        )}>
                                          Due {formatDate(c.dueDate)}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Linked artifacts */}
                            {ix.linkedArtifacts?.length > 0 && (
                              <div className="mb-3">
                                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                                  Linked Artifacts
                                </h4>
                                <div className="flex flex-wrap gap-1.5">
                                  {ix.linkedArtifacts.map((a: any, idx: number) => (
                                    <span key={idx} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white border border-zinc-200 text-zinc-700">
                                      <Link2 className="w-3 h-3 text-zinc-400" />
                                      {a.title || a.code || a}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Outcomes / minutes */}
                            {ix.outcomes && (
                              <div>
                                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                                  Outcomes / Minutes
                                </h4>
                                <p className="text-xs text-zinc-600 p-2 rounded-md bg-white border border-zinc-200">
                                  {ix.outcomes}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Detail Panel (right sidebar) ────────────────────────────────── */}
        {selectedInteraction && (
          <div className="w-96 bg-white overflow-y-auto flex flex-col">
            {/* Detail header */}
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">Interaction Detail</h3>
              <button
                onClick={() => setSelectedId(null)}
                className="p-1 rounded-md hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 flex-1">
              {/* Type & Authority badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  'text-xs px-2 py-1 rounded-full font-medium',
                  TYPE_COLORS[selectedInteraction.type]?.bg || 'bg-zinc-100',
                  TYPE_COLORS[selectedInteraction.type]?.text || 'text-zinc-600',
                )}>
                  {typeLabel(selectedInteraction.type)}
                </span>
                {selectedInteraction.authority && (
                  <span className={cn(
                    'text-xs px-2 py-1 rounded-full font-medium',
                    AUTHORITY_STYLE[selectedInteraction.authority]?.bg || 'bg-zinc-100',
                    AUTHORITY_STYLE[selectedInteraction.authority]?.text || 'text-zinc-600',
                  )}>
                    {selectedInteraction.authority}
                  </span>
                )}
                <span className={cn(
                  'text-xs px-2 py-1 rounded-full',
                  STATUS_STYLE[selectedInteraction.status]?.bg || 'bg-zinc-100',
                  STATUS_STYLE[selectedInteraction.status]?.text || 'text-zinc-600',
                )}>
                  {selectedInteraction.status}
                </span>
              </div>

              {/* Subject */}
              <div>
                <h4 className="text-base font-semibold text-zinc-900">{selectedInteraction.subject}</h4>
                <p className="text-xs text-zinc-500 mt-1">
                  {formatDate(selectedInteraction.date)}
                  {isOverdue(selectedInteraction.date, selectedInteraction.status) && (
                    <span className="text-red-600 font-medium ml-2">Overdue</span>
                  )}
                </p>
              </div>

              {/* Description */}
              {selectedInteraction.description && (
                <div>
                  <h5 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                    Description
                  </h5>
                  <p className="text-xs text-zinc-700 leading-relaxed">
                    {selectedInteraction.description}
                  </p>
                </div>
              )}

              {/* Commitments */}
              <div>
                <h5 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Commitments
                </h5>
                {(!selectedInteraction.commitments || selectedInteraction.commitments.length === 0) ? (
                  <p className="text-xs text-zinc-400 text-center py-3">No commitments recorded</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedInteraction.commitments.map((c: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-zinc-50 border border-zinc-200">
                        {c.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Clock className="w-4 h-4 text-zinc-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-xs', c.completed ? 'text-zinc-500 line-through' : 'text-zinc-700')}>
                            {c.text || c.title || c.description}
                          </p>
                          {c.dueDate && (
                            <p className={cn(
                              'text-xs mt-0.5',
                              !c.completed && isOverdue(c.dueDate, 'planned')
                                ? 'text-red-600 font-medium'
                                : 'text-zinc-400',
                            )}>
                              Due {formatDate(c.dueDate)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Linked Artifacts */}
              {selectedInteraction.linkedArtifacts?.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Linked Artifacts
                  </h5>
                  <div className="space-y-1">
                    {selectedInteraction.linkedArtifacts.map((a: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-50 border border-zinc-200">
                        <Link2 className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                        <span className="text-xs text-zinc-700">{a.title || a.code || a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Outcomes / Minutes */}
              {selectedInteraction.outcomes && (
                <div>
                  <h5 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Outcomes / Minutes
                  </h5>
                  <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                    <p className="text-xs text-zinc-700 leading-relaxed whitespace-pre-wrap">
                      {selectedInteraction.outcomes}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Add Interaction Modal ─────────────────────────────────────────── */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-xl border shadow-xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-zinc-900 mb-4">Add Authority Interaction</h3>
            <div className="space-y-3">
              {/* Type */}
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Type</label>
                <select
                  value={newInteraction.type}
                  onChange={e => setNewInteraction(prev => ({ ...prev, type: e.target.value as InteractionType }))}
                  className="w-full text-xs px-2 py-2 border border-zinc-200 rounded-lg bg-white"
                >
                  {INTERACTION_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Authority + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-700 mb-1 block">Authority</label>
                  <select
                    value={newInteraction.authority}
                    onChange={e => setNewInteraction(prev => ({ ...prev, authority: e.target.value as Authority }))}
                    className="w-full text-xs px-2 py-2 border border-zinc-200 rounded-lg bg-white"
                  >
                    {AUTHORITIES.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-700 mb-1 block">Status</label>
                  <select
                    value={newInteraction.status}
                    onChange={e => setNewInteraction(prev => ({ ...prev, status: e.target.value as InteractionStatus }))}
                    className="w-full text-xs px-2 py-2 border border-zinc-200 rounded-lg bg-white"
                  >
                    {STATUSES.map(s => (
                      <option key={s} value={s} className="capitalize">{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Subject</label>
                <input
                  type="text"
                  value={newInteraction.subject}
                  onChange={e => setNewInteraction(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                  placeholder="Meeting or submission subject..."
                />
              </div>

              {/* Date */}
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Date</label>
                <input
                  type="date"
                  value={newInteraction.date}
                  onChange={e => setNewInteraction(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Description</label>
                <textarea
                  value={newInteraction.description}
                  onChange={e => setNewInteraction(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none h-20 resize-none"
                  placeholder="Notes or context for this interaction..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newInteraction.subject.trim() || createInteraction.isPending}
                className="px-4 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-60"
              >
                {createInteraction.isPending ? 'Adding...' : 'Add Interaction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthorityTracker;
