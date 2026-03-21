/**
 * @fileoverview Evidence Manager — Browse, create, and link evidence nodes
 * @module concept2cure/pages/MissionControl/EvidenceManager
 *
 * Full evidence lifecycle: search/filter evidence by type and strength,
 * view details, link evidence to artifacts, add new evidence nodes.
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  FlaskConical,
  Search,
  Plus,
  Clock,
  Link2,
  Unlink,
  FileText,
  BookOpen,
  Microscope,
  BarChart3,
  Users,
  Globe,
  ChevronRight,
  X,
} from 'lucide-react';
import {
  useEvidence,
  useCreateEvidence,
  useLinkEvidence,
  useArtifacts,
  usePrograms,
} from '../../hooks/useMissionControl';

/* ───────────────────────────── Types & Constants ─────────────────────────── */

interface EvidenceManagerProps {
  programId: number | null;
}

type Strength = 'strong' | 'moderate' | 'weak' | 'insufficient';
type EvidenceType =
  | 'publication'
  | 'clinical-data'
  | 'bench-test'
  | 'predicate-comparison'
  | 'real-world-evidence'
  | 'expert-opinion';

const STRENGTH_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  strong:       { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  moderate:     { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  weak:         { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  insufficient: { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500' },
};

const TYPE_LABELS: Record<string, string> = {
  publication:           'Publication',
  'clinical-data':       'Clinical Data',
  'bench-test':          'Bench Test',
  'predicate-comparison':'Predicate Comparison',
  'real-world-evidence': 'Real-World Evidence',
  'expert-opinion':      'Expert Opinion',
};

const TYPE_ICONS: Record<string, typeof FileText> = {
  publication:           BookOpen,
  'clinical-data':       BarChart3,
  'bench-test':          Microscope,
  'predicate-comparison':FileText,
  'real-world-evidence': Globe,
  'expert-opinion':      Users,
};

const EMPTY_FORM = {
  title: '',
  type: 'publication' as string,
  strength: 'moderate' as string,
  source: '',
  description: '',
};

/* ───────────────────────────── Component ──────────────────────────────────── */

export const EvidenceManager: React.FC<EvidenceManagerProps> = ({ programId }) => {
  // Remote data
  const { data: evidence = [], isLoading } = useEvidence(programId);
  const { data: artifacts = [] } = useArtifacts(programId);
  const createEvidence = useCreateEvidence();
  const linkEvidence = useLinkEvidence();

  // Local UI state
  const [search, setSearch] = useState('');
  const [filterStrength, setFilterStrength] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [linkArtifactId, setLinkArtifactId] = useState<string>('');

  // Derived data
  const filtered = useMemo(() => {
    let list = evidence as any[];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e: any) =>
          e.title?.toLowerCase().includes(q) ||
          e.source?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q),
      );
    }
    if (filterStrength) list = list.filter((e: any) => e.strength === filterStrength);
    if (filterType) list = list.filter((e: any) => e.type === filterType);
    return list;
  }, [evidence, search, filterStrength, filterType]);

  const selected = useMemo(
    () => (evidence as any[]).find((e: any) => e.id === selectedId) ?? null,
    [evidence, selectedId],
  );

  const stats = useMemo(() => {
    const items = evidence as any[];
    const byStrength: Record<string, number> = { strong: 0, moderate: 0, weak: 0, insufficient: 0 };
    let linked = 0;
    items.forEach((e: any) => {
      if (byStrength[e.strength] !== undefined) byStrength[e.strength]++;
      if (e.linkedArtifacts?.length || e.artifactCount > 0) linked++;
    });
    return { total: items.length, byStrength, linked, unlinked: items.length - linked };
  }, [evidence]);

  // Handlers
  const handleCreate = () => {
    if (!programId || !form.title.trim()) return;
    createEvidence.mutate({ programId, ...form }, {
      onSuccess: () => {
        setForm(EMPTY_FORM);
        setShowAddModal(false);
      },
    });
  };

  const handleLink = () => {
    if (!selected || !linkArtifactId) return;
    linkEvidence.mutate({ artifactId: Number(linkArtifactId), evidenceId: selected.id });
    setLinkArtifactId('');
  };

  /* ─── Loading ─── */
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Clock className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  /* ─── Render ─── */
  return (
    <div className="flex-1 flex flex-col bg-[#faf9f5] overflow-hidden">
      {/* ── Header ── */}
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical className="w-5 h-5 text-blue-500" />
          <h1 className="text-base font-semibold text-zinc-900">Evidence Manager</h1>
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
            {stats.total}
          </span>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Evidence
        </button>
      </div>

      {/* ── Stats Strip ── */}
      <div className="border-b bg-white px-6 py-2 flex items-center gap-4 overflow-x-auto">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="font-medium text-zinc-900">{stats.total}</span> total
        </div>
        <span className="text-zinc-200">|</span>
        {(['strong', 'moderate', 'weak', 'insufficient'] as Strength[]).map(s => {
          const c = STRENGTH_COLORS[s];
          return (
            <div key={s} className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className={cn('w-2 h-2 rounded-full', c.dot)} />
              <span className="capitalize">{s}</span>
              <span className="font-medium text-zinc-900">{stats.byStrength[s]}</span>
            </div>
          );
        })}
        <span className="text-zinc-200">|</span>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Link2 className="w-3 h-3" />
          <span className="font-medium text-zinc-900">{stats.linked}</span> linked
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Unlink className="w-3 h-3" />
          <span className="font-medium text-zinc-900">{stats.unlinked}</span> unlinked
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column — Evidence List */}
        <div className="w-[420px] flex flex-col border-r bg-white overflow-hidden">
          {/* Search & Filters */}
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search evidence..."
                className="w-full text-xs pl-8 pr-3 py-2 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none bg-zinc-50"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterStrength}
                onChange={e => setFilterStrength(e.target.value)}
                className="text-xs px-2 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700 flex-1"
              >
                <option value="">All Strength</option>
                <option value="strong">Strong</option>
                <option value="moderate">Moderate</option>
                <option value="weak">Weak</option>
                <option value="insufficient">Insufficient</option>
              </select>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="text-xs px-2 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700 flex-1"
              >
                <option value="">All Types</option>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Evidence Cards */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-12 text-center">
                <FlaskConical className="w-10 h-10 text-zinc-200 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">
                  {stats.total === 0 ? 'No evidence yet' : 'No evidence matches filters'}
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  {stats.total === 0
                    ? 'Add evidence to support your regulatory submissions.'
                    : 'Try adjusting your search or filters.'}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((ev: any) => {
                  const sColors = STRENGTH_COLORS[ev.strength] || STRENGTH_COLORS.moderate;
                  const TypeIcon = TYPE_ICONS[ev.type] || FileText;
                  const artCount = ev.linkedArtifacts?.length ?? ev.artifactCount ?? 0;
                  const isSelected = ev.id === selectedId;
                  return (
                    <button
                      key={ev.id}
                      onClick={() => setSelectedId(ev.id)}
                      className={cn(
                        'w-full text-left p-3 hover:bg-zinc-50 transition-colors duration-150',
                        isSelected && 'bg-blue-50/60 border-l-2 border-l-blue-500',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <TypeIcon className="w-4 h-4 mt-0.5 text-zinc-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-medium text-zinc-900 truncate">{ev.title}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                              {TYPE_LABELS[ev.type] || ev.type}
                            </span>
                            <span className={cn('text-xs px-1.5 py-0.5 rounded-full', sColors.bg, sColors.text)}>
                              {ev.strength}
                            </span>
                            {artCount > 0 && (
                              <span className="text-xs text-zinc-500 flex items-center gap-0.5">
                                <Link2 className="w-2.5 h-2.5" />
                                {artCount}
                              </span>
                            )}
                          </div>
                          {ev.source && (
                            <p className="text-xs text-zinc-400 mt-1 truncate">{ev.source}</p>
                          )}
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-1" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column — Detail Panel */}
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <div className="max-w-2xl mx-auto p-6 space-y-6">
              {/* Title & Badges */}
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 mb-2">{selected.title}</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700">
                    {TYPE_LABELS[selected.type] || selected.type}
                  </span>
                  {(() => {
                    const sc = STRENGTH_COLORS[selected.strength] || STRENGTH_COLORS.moderate;
                    return (
                      <span className={cn('text-xs px-2 py-0.5 rounded-full', sc.bg, sc.text)}>
                        {selected.strength}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Source */}
              {selected.source && (
                <div className="bg-white rounded-xl border p-4">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Source</h3>
                  <p className="text-sm text-zinc-700">{selected.source}</p>
                </div>
              )}

              {/* Description */}
              {selected.description && (
                <div className="bg-white rounded-xl border p-4">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Description</h3>
                  <p className="text-sm text-zinc-700 whitespace-pre-wrap">{selected.description}</p>
                </div>
              )}

              {/* Linked Artifacts */}
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Linked Artifacts</h3>
                  <span className="text-xs text-zinc-400">
                    {selected.linkedArtifacts?.length ?? selected.artifactCount ?? 0} linked
                  </span>
                </div>

                {/* Existing links */}
                {selected.linkedArtifacts && selected.linkedArtifacts.length > 0 ? (
                  <div className="space-y-2 mb-3">
                    {selected.linkedArtifacts.map((art: any) => (
                      <div
                        key={art.id}
                        className="flex items-center gap-2 p-2 rounded-lg bg-zinc-50 border border-zinc-200"
                      >
                        <FileText className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                        <span className="text-xs text-zinc-700 flex-1 truncate">
                          {art.title || art.name || `Artifact #${art.id}`}
                        </span>
                        <button
                          className="text-xs text-zinc-400 hover:text-red-500 flex items-center gap-0.5"
                          title="Unlink artifact"
                        >
                          <Unlink className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 mb-3">No artifacts linked to this evidence.</p>
                )}

                {/* Link new artifact */}
                <div className="flex items-center gap-2">
                  <select
                    value={linkArtifactId}
                    onChange={e => setLinkArtifactId(e.target.value)}
                    className="flex-1 text-xs px-2 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700"
                  >
                    <option value="">Select artifact to link...</option>
                    {(artifacts as any[]).map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.title || a.name || `Artifact #${a.id}`}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleLink}
                    disabled={!linkArtifactId}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Metadata */}
              <div className="bg-white rounded-xl border p-4">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Metadata</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {selected.createdAt && (
                    <div>
                      <span className="text-zinc-400">Created</span>
                      <p className="text-zinc-700 mt-0.5">
                        {new Date(selected.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  {selected.updatedAt && (
                    <div>
                      <span className="text-zinc-400">Last Updated</span>
                      <p className="text-zinc-700 mt-0.5">
                        {new Date(selected.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  {selected.id && (
                    <div>
                      <span className="text-zinc-400">Evidence ID</span>
                      <p className="text-zinc-700 mt-0.5">#{selected.id}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center">
                <FlaskConical className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">Select evidence to view details</p>
                <p className="text-xs text-zinc-400 mt-1">Click an item in the list to inspect and manage links.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Add Evidence Modal ── */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-xl border shadow-xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-zinc-900">Add Evidence</h3>
              <button onClick={() => setShowAddModal(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                  placeholder="Evidence title..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-700 mb-1 block">Type</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full text-xs px-2 py-2 border border-zinc-200 rounded-lg bg-white"
                  >
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-700 mb-1 block">Strength</label>
                  <select
                    value={form.strength}
                    onChange={e => setForm(prev => ({ ...prev, strength: e.target.value }))}
                    className="w-full text-xs px-2 py-2 border border-zinc-200 rounded-lg bg-white"
                  >
                    <option value="strong">Strong</option>
                    <option value="moderate">Moderate</option>
                    <option value="weak">Weak</option>
                    <option value="insufficient">Insufficient</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Source</label>
                <input
                  type="text"
                  value={form.source}
                  onChange={e => setForm(prev => ({ ...prev, source: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                  placeholder="Citation or source..."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none h-24 resize-none"
                  placeholder="Summary of the evidence..."
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
                disabled={!form.title.trim() || createEvidence.isPending}
                className="px-4 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-60"
              >
                {createEvidence.isPending ? 'Adding...' : 'Add Evidence'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EvidenceManager;
