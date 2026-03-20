/**
 * @fileoverview Decision Log — Timeline of program decision records
 * @module concept2cure/pages/MissionControl/DecisionLog
 * @version 1.0.0
 *
 * @description
 * Chronological decision record tracker for regulatory programs.
 * Displays decisions as a vertical timeline with expandable detail cards,
 * status filtering, search, and a modal to record new decisions.
 *
 * @compliance
 * - FDA 21 CFR Part 11: All decision records are audit-logged server-side
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Scale,
  Search,
  Plus,
  Clock,
  ChevronDown,
  ChevronUp,
  FileText,
  Users,
  AlertTriangle,
  LinkIcon,
  Calendar,
} from 'lucide-react';
import { useDecisions, useCreateDecision, usePrograms } from '../../hooks/useMissionControl';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

interface DecisionLogProps {
  programId: number | null;
}

type DecisionStatus = 'proposed' | 'accepted' | 'rejected' | 'deferred' | 'superseded';
type DecisionCategory = 'regulatory' | 'clinical' | 'manufacturing' | 'commercial' | 'technical';

const STATUS_COLORS: Record<DecisionStatus, { bg: string; text: string; dot: string }> = {
  proposed:   { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  accepted:   { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected:   { bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500' },
  deferred:   { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  superseded: { bg: 'bg-zinc-100',  text: 'text-zinc-600',   dot: 'bg-zinc-400' },
};

const CATEGORY_COLORS: Record<DecisionCategory, string> = {
  regulatory:    'bg-violet-50 text-violet-700',
  clinical:      'bg-blue-50 text-blue-700',
  manufacturing: 'bg-orange-50 text-orange-700',
  commercial:    'bg-emerald-50 text-emerald-700',
  technical:     'bg-zinc-100 text-zinc-600',
};

const ALL_STATUSES: DecisionStatus[] = ['proposed', 'accepted', 'rejected', 'deferred', 'superseded'];
const ALL_CATEGORIES: DecisionCategory[] = ['regulatory', 'clinical', 'manufacturing', 'commercial', 'technical'];

const EMPTY_FORM = {
  title: '',
  category: 'regulatory' as DecisionCategory,
  status: 'proposed' as DecisionStatus,
  rationale: '',
  impact: '',
  decisionMaker: '',
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const DecisionLog: React.FC<DecisionLogProps> = ({ programId }) => {
  const [statusFilter, setStatusFilter] = useState<DecisionStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: decisions = [], isLoading } = useDecisions(programId);
  const createDecision = useCreateDecision();

  // ── Filtered & searched decisions ─────────────────────────────────────
  const filtered = useMemo(() => {
    let list = decisions as any[];
    if (statusFilter !== 'all') {
      list = list.filter((d: any) => d.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d: any) =>
          d.title?.toLowerCase().includes(q) ||
          d.rationale?.toLowerCase().includes(q) ||
          d.impact?.toLowerCase().includes(q) ||
          d.decisionMaker?.toLowerCase().includes(q) ||
          d.category?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [decisions, statusFilter, searchQuery]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const toggleExpanded = (id: number) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const handleSubmit = () => {
    if (!programId || !form.title.trim()) return;
    createDecision.mutate(
      { programId, ...form },
      {
        onSuccess: () => {
          setForm(EMPTY_FORM);
          setShowModal(false);
        },
      }
    );
  };

  // ── Loading state ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Clock className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#FAFAF9] overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="w-5 h-5 text-blue-600" />
          <h1 className="text-base font-semibold text-zinc-900">Decision Log</h1>
          <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-xs font-medium">
            {(decisions as any[]).length} decision{(decisions as any[]).length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => setShowModal(true)}
          disabled={!programId}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
          Record Decision
        </button>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b px-6 py-2 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {(['all', ...ALL_STATUSES] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-lg transition-colors capitalize',
                statusFilter === s
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Search decisions..."
          />
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          {filtered.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-20">
              <Scale className="w-12 h-12 text-zinc-200 mb-4" />
              <p className="text-sm font-medium text-zinc-500">No decisions recorded</p>
              <p className="text-xs text-zinc-400 mt-1">
                {programId
                  ? 'Record your first decision to start building the audit trail.'
                  : 'Select a program to view its decision log.'}
              </p>
            </div>
          ) : (
            /* Timeline */
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-4 top-2 bottom-2 w-px bg-zinc-200" />

              <div className="space-y-4">
                {filtered.map((decision: any) => {
                  const status: DecisionStatus = ALL_STATUSES.includes(decision.status)
                    ? decision.status
                    : 'proposed';
                  const category: DecisionCategory = ALL_CATEGORIES.includes(decision.category)
                    ? decision.category
                    : 'technical';
                  const colors = STATUS_COLORS[status];
                  const isExpanded = expandedId === decision.id;

                  return (
                    <div key={decision.id} className="relative pl-10">
                      {/* Timeline dot */}
                      <div
                        className={cn(
                          'absolute left-2.5 top-4 w-3 h-3 rounded-full border-2 border-white ring-2',
                          colors.dot,
                          status === 'accepted' ? 'ring-emerald-200' :
                          status === 'rejected' ? 'ring-red-200' :
                          status === 'deferred' ? 'ring-amber-200' :
                          status === 'proposed' ? 'ring-blue-200' :
                          'ring-zinc-200'
                        )}
                      />

                      {/* Card */}
                      <div
                        className={cn(
                          'bg-white border rounded-xl p-4 transition-all hover:shadow-sm cursor-pointer',
                          isExpanded ? 'border-zinc-300 shadow-sm' : 'border-zinc-200'
                        )}
                        onClick={() => toggleExpanded(decision.id)}
                      >
                        {/* Card header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <h3 className="text-sm font-semibold text-zinc-900">
                                {decision.title}
                              </h3>
                              <span
                                className={cn(
                                  'text-[11px] px-1.5 py-0.5 rounded-full font-medium capitalize',
                                  colors.bg,
                                  colors.text
                                )}
                              >
                                {status}
                              </span>
                              <span
                                className={cn(
                                  'text-[11px] px-1.5 py-0.5 rounded-full capitalize',
                                  CATEGORY_COLORS[category]
                                )}
                              >
                                {category}
                              </span>
                            </div>

                            {decision.rationale && (
                              <p className="text-xs text-zinc-600 line-clamp-2 mb-2">
                                {decision.rationale}
                              </p>
                            )}

                            {decision.impact && (
                              <p className="text-xs text-zinc-500 line-clamp-1 mb-2">
                                <span className="font-medium text-zinc-700">Impact:</span>{' '}
                                {decision.impact}
                              </p>
                            )}

                            {/* Meta row */}
                            <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                              {decision.decisionMaker && (
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {decision.decisionMaker}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(decision.createdAt || decision.date)}
                              </span>
                              {(decision.linkedArtifacts?.length > 0 || decision.artifactCount > 0) && (
                                <span className="flex items-center gap-1">
                                  <LinkIcon className="w-3 h-3" />
                                  {decision.linkedArtifacts?.length ?? decision.artifactCount} artifact
                                  {(decision.linkedArtifacts?.length ?? decision.artifactCount) !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            className="flex-shrink-0 p-1 rounded-md hover:bg-zinc-100 text-zinc-400"
                            onClick={e => {
                              e.stopPropagation();
                              toggleExpanded(decision.id);
                            }}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-zinc-200 space-y-3">
                            {decision.rationale && (
                              <div>
                                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                                  Full Rationale
                                </h4>
                                <p className="text-xs text-zinc-700 leading-relaxed">
                                  {decision.rationale}
                                </p>
                              </div>
                            )}

                            {decision.impact && (
                              <div>
                                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                                  Impact Summary
                                </h4>
                                <p className="text-xs text-zinc-700 leading-relaxed">
                                  {decision.impact}
                                </p>
                              </div>
                            )}

                            {decision.alternatives && decision.alternatives.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                                  Alternatives Considered
                                </h4>
                                <ul className="space-y-1">
                                  {decision.alternatives.map((alt: string, idx: number) => (
                                    <li
                                      key={idx}
                                      className="text-xs text-zinc-600 flex items-start gap-1.5"
                                    >
                                      <span className="text-zinc-400 mt-0.5">&#8226;</span>
                                      {alt}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {decision.riskImplications && (
                              <div>
                                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                                  Risk Implications
                                </h4>
                                <p className="text-xs text-zinc-700 leading-relaxed">
                                  {decision.riskImplications}
                                </p>
                              </div>
                            )}

                            {decision.stakeholders && decision.stakeholders.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                                  <Users className="w-3 h-3 text-zinc-400" />
                                  Stakeholders Consulted
                                </h4>
                                <div className="flex flex-wrap gap-1.5">
                                  {decision.stakeholders.map((name: string, idx: number) => (
                                    <span
                                      key={idx}
                                      className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600"
                                    >
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Add Decision Modal ──────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-xl border shadow-xl w-full max-w-lg p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-5">
              <Scale className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-semibold text-zinc-900">Record Decision</h3>
            </div>

            <div className="space-y-3">
              {/* Title */}
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="Decision title..."
                />
              </div>

              {/* Category + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-700 mb-1 block">Category</label>
                  <select
                    value={form.category}
                    onChange={e =>
                      setForm(prev => ({ ...prev, category: e.target.value as DecisionCategory }))
                    }
                    className="w-full text-xs px-2 py-2 border border-zinc-200 rounded-lg bg-white"
                  >
                    {ALL_CATEGORIES.map(c => (
                      <option key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-700 mb-1 block">Status</label>
                  <select
                    value={form.status}
                    onChange={e =>
                      setForm(prev => ({ ...prev, status: e.target.value as DecisionStatus }))
                    }
                    className="w-full text-xs px-2 py-2 border border-zinc-200 rounded-lg bg-white"
                  >
                    {ALL_STATUSES.map(s => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Rationale */}
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Rationale</label>
                <textarea
                  value={form.rationale}
                  onChange={e => setForm(prev => ({ ...prev, rationale: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 h-20 resize-none"
                  placeholder="Why was this decision made?"
                />
              </div>

              {/* Impact */}
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">
                  Impact Summary
                </label>
                <textarea
                  value={form.impact}
                  onChange={e => setForm(prev => ({ ...prev, impact: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 h-16 resize-none"
                  placeholder="Expected impact on the program..."
                />
              </div>

              {/* Decision Maker */}
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">
                  Decision Maker
                </label>
                <input
                  type="text"
                  value={form.decisionMaker}
                  onChange={e => setForm(prev => ({ ...prev, decisionMaker: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="Name or role..."
                />
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setShowModal(false);
                }}
                className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!form.title.trim() || createDecision.isPending}
                className="px-4 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {createDecision.isPending ? 'Saving...' : 'Save Decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DecisionLog;
