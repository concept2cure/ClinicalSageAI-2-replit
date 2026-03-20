/**
 * @fileoverview Mission Control Home — Submission War Room
 * @module concept2cure/pages/MissionControl/MissionControlHome
 * @version 1.0.0
 *
 * The project home screen. Shows destination, route, readiness by domain,
 * top blockers, next-best actions, artifacts in motion, confidence score,
 * recent changes that matter, pending approvals, predicted risk hotspots.
 *
 * This must feel like a submission war room, not a dashboard cemetery.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Target,
  Compass,
  FileText,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  BarChart3,
  GitBranch,
  Plus,
  Loader2,
  Eye,
  Lock,
  TrendingUp,
  Activity,
  AlertCircle,
  Zap,
  Globe,
  Users,
  ChevronRight,
  Beaker,
  FlaskConical,
  FolderOpen,
  Scale,
  Building2,
  Fingerprint,
  Bell,
  MessageSquare,
  LayoutGrid,
} from 'lucide-react';
import {
  usePrograms,
  useCreateProgram,
  useDestinations,
  useArtifacts,
  useRisks,
  useReadiness,
  useScaffoldProgram,
  useProvenance,
} from '../../hooks/useMissionControl';
import SnowGlobeMissionControlCard from '../SnowGlobe/SnowGlobeMissionControlCard';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface MissionControlHomeProps {
  projectId?: string;
  projectName?: string;
  submissionType?: string;
}

type CustomerTrack = 'biotech' | 'pharma' | 'cro' | 'device' | 'diagnostics';

const TRACK_CONFIG: Record<CustomerTrack, { label: string; color: string; icon: typeof FlaskConical }> = {
  biotech: { label: 'Biotech', color: 'violet', icon: FlaskConical },
  pharma: { label: 'Pharma', color: 'blue', icon: Beaker },
  cro: { label: 'CRO', color: 'emerald', icon: Users },
  device: { label: 'Medical Device', color: 'amber', icon: Shield },
  diagnostics: { label: 'Diagnostics', color: 'rose', icon: Activity },
};

// ═══════════════════════════════════════════════════════════════════════════════
// READINESS RADAR
// ═══════════════════════════════════════════════════════════════════════════════

function ReadinessRadar({ readiness, className }: { readiness: Record<string, number>; className?: string }) {
  const axes = [
    { key: 'artifactCompleteness', label: 'Artifacts', short: 'ART' },
    { key: 'evidenceAdequacy', label: 'Evidence', short: 'EVD' },
    { key: 'reviewMaturity', label: 'Review', short: 'REV' },
    { key: 'approvalMaturity', label: 'Approval', short: 'APR' },
    { key: 'consistencyIntegrity', label: 'Consistency', short: 'CON' },
    { key: 'routeFit', label: 'Route Fit', short: 'RTE' },
    { key: 'authorityConfidence', label: 'Authority', short: 'AUT' },
    { key: 'complianceIntegrity', label: 'Compliance', short: 'CMP' },
    { key: 'timelineConfidence', label: 'Timeline', short: 'TML' },
  ];

  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      {axes.map(axis => {
        const value = readiness[axis.key] || 0;
        const color = value >= 75 ? 'emerald' : value >= 50 ? 'amber' : 'red';
        return (
          <div key={axis.key} className="text-center">
            <div className="relative w-12 h-12 mx-auto mb-1">
              <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#e4e4e7"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke={color === 'emerald' ? '#10b981' : color === 'amber' ? '#f59e0b' : '#ef4444'}
                  strokeWidth="3"
                  strokeDasharray={`${value}, 100`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-zinc-700">
                {value}
              </span>
            </div>
            <p className="text-xs font-medium text-zinc-500 leading-tight">{axis.label}</p>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRAM CREATION MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function CreateProgramPanel({ onCreated }: { onCreated: (id: number) => void }) {
  const [name, setName] = useState('');
  const [track, setTrack] = useState<CustomerTrack>('biotech');
  const [destType, setDestType] = useState('IND');
  const [indication, setIndication] = useState('');
  const createProgram = useCreateProgram();
  const scaffold = useScaffoldProgram();

  const handleCreate = async () => {
    if (!name.trim()) return;
    const program = await createProgram.mutateAsync({
      name,
      customerTrack: track,
      indication,
    });
    // Auto-scaffold artifacts
    await scaffold.mutateAsync({ programId: program.id, destinationType: destType, customerTrack: track });
    onCreated(program.id);
  };

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-6 max-w-lg mx-auto">
      <h2 className="text-lg font-semibold text-zinc-900 mb-1">Create Program</h2>
      <p className="text-sm text-zinc-500 mb-5">Define where you're going. We'll build the road.</p>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-zinc-600 mb-1 block">Program Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
            placeholder="e.g., NeuroCure IND Program"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-600 mb-1 block">Customer Track</label>
          <div className="grid grid-cols-5 gap-2">
            {(Object.keys(TRACK_CONFIG) as CustomerTrack[]).map(t => {
              const cfg = TRACK_CONFIG[t];
              return (
                <button
                  key={t}
                  onClick={() => setTrack(t)}
                  className={cn(
                    'px-2 py-2 rounded-lg text-xs font-medium border transition-colors text-center',
                    track === t
                      ? 'bg-violet-50 border-violet-300 text-violet-700'
                      : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  )}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-600 mb-1 block">Destination Type</label>
          <select
            value={destType}
            onChange={e => setDestType(e.target.value)}
            className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="IND">IND (Investigational New Drug)</option>
            <option value="NDA">NDA (New Drug Application)</option>
            <option value="BLA">BLA (Biologics License)</option>
            <option value="510K">510(k) Premarket Notification</option>
            <option value="PMA">PMA (Premarket Approval)</option>
            <option value="DE_NOVO">De Novo Classification</option>
            <option value="CTA">CTA (Clinical Trial Application)</option>
            <option value="MAA">MAA (Marketing Authorization)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-600 mb-1 block">Indication / Intended Use</label>
          <input
            value={indication}
            onChange={e => setIndication(e.target.value)}
            className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            placeholder="e.g., Treatment of major depressive disorder"
          />
        </div>

        <button
          onClick={handleCreate}
          disabled={!name.trim() || createProgram.isPending || scaffold.isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 disabled:opacity-60 transition-colors"
        >
          {(createProgram.isPending || scaffold.isPending) ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {scaffold.isPending ? 'Scaffolding artifacts...' : 'Create & Scaffold'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const MissionControlHome: React.FC<MissionControlHomeProps> = ({
  projectId,
  projectName,
  submissionType,
}) => {
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: programs = [], isLoading: loadingPrograms } = usePrograms();
  const activeProgramId = selectedProgramId || (programs.length > 0 ? programs[0].id : null);
  const activeProgram = programs.find((p: any) => p.id === activeProgramId);

  const { data: destinations = [] } = useDestinations(activeProgramId);
  const { data: artifacts = [] } = useArtifacts(activeProgramId);
  const { data: risks = [] } = useRisks(activeProgramId);
  const { data: readinessData } = useReadiness(activeProgramId);
  const { data: provenance = [] } = useProvenance(activeProgramId, { limit: 10 });

  const readiness = readinessData?.readiness || {};
  const overallConfidence = readinessData?.overallConfidence || 0;
  const blockers = readinessData?.blockers || [];
  const nextActions = readinessData?.nextActions || [];
  const summary = readinessData?.summary || {};

  // Artifact lifecycle breakdown
  const lifecycleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    artifacts.forEach((a: any) => {
      counts[a.lifecycleState] = (counts[a.lifecycleState] || 0) + 1;
    });
    return counts;
  }, [artifacts]);

  // Artifacts in motion (not planned, not locked)
  const inMotion = artifacts.filter((a: any) =>
    ['drafting', 'in-review', 'revision-needed'].includes(a.lifecycleState)
  );

  if (loadingPrograms) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#FAFAF9]">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  // No programs — show creation flow
  if (programs.length === 0 || showCreate) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#FAFAF9] p-8">
        <CreateProgramPanel onCreated={(id) => {
          setSelectedProgramId(id);
          setShowCreate(false);
        }} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#FAFAF9] overflow-hidden">
      {/* ── Top Bar: Program Selector + Confidence ─────────────────── */}
      <div className="border-b bg-white px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-violet-600" />
          <select
            value={activeProgramId || ''}
            onChange={e => setSelectedProgramId(parseInt(e.target.value))}
            className="text-sm font-semibold text-zinc-900 bg-transparent border-none focus:outline-none cursor-pointer"
          >
            {programs.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {activeProgram && (
          <>
            <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-xs font-medium">
              {TRACK_CONFIG[activeProgram.customerTrack as CustomerTrack]?.label || activeProgram.customerTrack}
            </span>
            {activeProgram.indication && (
              <span className="text-xs text-zinc-500">{activeProgram.indication}</span>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          {/* Overall Confidence */}
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold',
            overallConfidence >= 70 ? 'bg-emerald-50 text-emerald-700' :
            overallConfidence >= 40 ? 'bg-amber-50 text-amber-700' :
            'bg-red-50 text-red-700'
          )}>
            <TrendingUp className="w-3.5 h-3.5" />
            {overallConfidence}% confidence
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
          >
            <Plus className="w-3.5 h-3.5" />
            New Program
          </button>
        </div>
      </div>

      {/* ── Main Grid ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 grid grid-cols-12 gap-5">

          {/* ── Left Column (8 cols): Core Intelligence ─────────── */}
          <div className="col-span-8 space-y-5">

            {/* Destination + Route */}
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
                  <Compass className="w-4 h-4 text-violet-500" />
                  Destination & Route
                </h2>
                {destinations.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-xs font-medium">
                    {destinations[0].destinationType} — {destinations[0].region}
                  </span>
                )}
              </div>
              {destinations.length > 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  {destinations.map((d: any) => (
                    <div key={d.id} className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                      <div className="flex items-center gap-2 mb-1">
                        <Globe className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-sm font-medium text-zinc-800">{d.name}</span>
                      </div>
                      <p className="text-xs text-zinc-500">{d.destinationType} • {d.region}</p>
                      <div className={cn(
                        'mt-2 text-xs font-medium',
                        d.status === 'active' ? 'text-emerald-600' : 'text-zinc-500'
                      )}>
                        {d.status}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No destinations configured. Create the program to auto-generate.</p>
              )}
            </div>

            {/* Blocker Stack */}
            {blockers.length > 0 && (
              <div className="bg-white rounded-xl border border-red-100 p-5">
                <h2 className="text-sm font-semibold text-red-800 flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  Top Blockers
                </h2>
                <div className="space-y-2">
                  {blockers.map((b: any, i: number) => (
                    <div key={i} className={cn(
                      'flex items-start gap-3 p-3 rounded-lg',
                      b.severity === 'critical' ? 'bg-red-50' : 'bg-amber-50'
                    )}>
                      <AlertTriangle className={cn(
                        'w-4 h-4 mt-0.5 flex-shrink-0',
                        b.severity === 'critical' ? 'text-red-500' : 'text-amber-500'
                      )} />
                      <div>
                        <p className="text-sm font-medium text-zinc-800">{b.message}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">Type: {b.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next-Best Actions */}
            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-zinc-800 flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-amber-500" />
                Next-Best Actions
              </h2>
              {nextActions.length > 0 ? (
                <div className="space-y-2">
                  {nextActions.map((a: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 hover:bg-zinc-100 transition-colors cursor-pointer">
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white',
                        a.priority === 'critical' ? 'bg-red-500' : a.priority === 'high' ? 'bg-amber-500' : 'bg-blue-500'
                      )}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-800">{a.action}: {a.target}</p>
                        <p className="text-xs text-zinc-500">{a.reason}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-400" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">All clear — no immediate actions needed.</p>
              )}
            </div>

            {/* Artifacts in Motion */}
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  Artifacts in Motion
                </h2>
                <span className="text-xs text-zinc-500">{inMotion.length} active</span>
              </div>

              {/* Lifecycle bar */}
              <div className="flex items-center gap-1 h-2 mb-4 rounded-full overflow-hidden bg-zinc-100">
                {lifecycleCounts['approved'] && (
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(lifecycleCounts['approved'] / (artifacts.length || 1)) * 100}%` }} />
                )}
                {lifecycleCounts['in-review'] && (
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(lifecycleCounts['in-review'] / (artifacts.length || 1)) * 100}%` }} />
                )}
                {lifecycleCounts['drafting'] && (
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(lifecycleCounts['drafting'] / (artifacts.length || 1)) * 100}%` }} />
                )}
                {lifecycleCounts['planned'] && (
                  <div className="h-full bg-zinc-300 rounded-full" style={{ width: `${(lifecycleCounts['planned'] / (artifacts.length || 1)) * 100}%` }} />
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-zinc-500 mb-4">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Approved ({lifecycleCounts['approved'] || 0})</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> In Review ({lifecycleCounts['in-review'] || 0})</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Drafting ({lifecycleCounts['drafting'] || 0})</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-300" /> Planned ({lifecycleCounts['planned'] || 0})</span>
              </div>

              {inMotion.length > 0 ? (
                <div className="space-y-1.5">
                  {inMotion.slice(0, 6).map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50">
                      <div className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        a.lifecycleState === 'in-review' ? 'bg-blue-500' :
                        a.lifecycleState === 'drafting' ? 'bg-amber-400' : 'bg-zinc-400'
                      )} />
                      <span className="text-xs font-mono text-zinc-500 w-12">{a.code}</span>
                      <span className="text-sm text-zinc-800 flex-1 truncate">{a.title}</span>
                      <span className="text-xs text-zinc-500 capitalize">{a.lifecycleState}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No artifacts currently in motion.</p>
              )}
            </div>

            {/* Risk Signals */}
            {risks.length > 0 && (
              <div className="bg-white rounded-xl border p-5">
                <h2 className="text-sm font-semibold text-zinc-800 flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Risk Signals ({risks.filter((r: any) => r.status !== 'resolved').length} open)
                </h2>
                <div className="space-y-2">
                  {risks.filter((r: any) => r.status !== 'resolved').slice(0, 5).map((r: any) => (
                    <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-50">
                      <div className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        r.severity === 'critical' ? 'bg-red-500' :
                        r.severity === 'high' ? 'bg-amber-500' :
                        r.severity === 'medium' ? 'bg-yellow-400' : 'bg-zinc-400'
                      )} />
                      <span className="text-sm text-zinc-800 flex-1">{r.title}</span>
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        r.severity === 'critical' ? 'bg-red-100 text-red-700' :
                        r.severity === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-600'
                      )}>
                        {r.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right Column (4 cols): Readiness + Activity ──────── */}
          <div className="col-span-4 space-y-5">

            {/* Readiness Radar */}
            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-zinc-800 flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-emerald-500" />
                Readiness Profile
              </h2>
              <ReadinessRadar readiness={readiness} />
              <div className="mt-4 pt-3 border-t border-zinc-200 text-center">
                <p className="text-xs text-zinc-500">Overall Confidence</p>
                <p className={cn(
                  'text-2xl font-bold',
                  overallConfidence >= 70 ? 'text-emerald-600' :
                  overallConfidence >= 40 ? 'text-amber-600' : 'text-red-600'
                )}>
                  {overallConfidence}%
                </p>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-zinc-800 mb-3">Program Summary</h2>
              <div className="space-y-2">
                {[
                  { label: 'Total Artifacts', value: summary.totalArtifacts || 0, icon: FileText },
                  { label: 'Completed', value: summary.completedArtifacts || 0, icon: CheckCircle2 },
                  { label: 'Evidence Nodes', value: summary.totalEvidence || 0, icon: GitBranch },
                  { label: 'Strong Evidence', value: summary.strongEvidence || 0, icon: Shield },
                  { label: 'Reviews Done', value: `${summary.completedReviews || 0}/${summary.totalReviews || 0}`, icon: Eye },
                  { label: 'Open Risks', value: summary.openRisks || 0, icon: AlertTriangle },
                  { label: 'Decisions', value: summary.decisions || 0, icon: Compass },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex items-center justify-between py-1.5">
                      <span className="flex items-center gap-2 text-xs text-zinc-600">
                        <Icon className="w-3.5 h-3.5 text-zinc-400" />
                        {item.label}
                      </span>
                      <span className="text-sm font-semibold text-zinc-800">{item.value}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Activity (Provenance) */}
            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-zinc-800 flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-blue-500" />
                Recent Activity
              </h2>
              {provenance.length > 0 ? (
                <div className="space-y-2">
                  {provenance.slice(0, 8).map((p: any) => (
                    <div key={p.id} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 mt-1.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-zinc-700 truncate">{p.changeDescription}</p>
                        <p className="text-xs text-zinc-400">
                          {new Date(p.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No activity recorded yet.</p>
              )}
            </div>

            {/* Stale Content Alerts */}
            {(summary.staleDependencies || 0) > 0 && (
              <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
                <h3 className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Stale Content Warning
                </h3>
                <p className="text-xs text-amber-700">
                  {summary.staleDependencies} upstream changes have not been reflected in dependent artifacts. Review dependency chain.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Snow Globe — Prediction Intelligence Summary ────────────────── */}
        {activeProgram && (
          <div className="mt-6">
            <SnowGlobeMissionControlCard
              programId={activeProgram.id}
              className="rounded-xl"
            />
          </div>
        )}

        {/* ── Quick Access — Mission Control Modules ──────────────────────── */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-violet-600" />
            Quick Access
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {([
              { id: 'artifact-graph', label: 'Artifact Graph', icon: GitBranch, color: 'blue', desc: 'Dependencies & lifecycle' },
              { id: 'review-center', label: 'Review Center', icon: Eye, color: 'violet', desc: 'Approvals & feedback' },
              { id: 'dossier-view', label: 'Dossier View', icon: FolderOpen, color: 'emerald', desc: 'eCTD structure' },
              { id: 'risk-cockpit', label: 'Risk Cockpit', icon: Shield, color: 'red', desc: 'Risk signals' },
              { id: 'route-planner', label: 'Route Planner', icon: Compass, color: 'indigo', desc: 'Pathway planning' },
              { id: 'evidence-manager', label: 'Evidence', icon: FlaskConical, color: 'teal', desc: 'Sources & linking' },
              { id: 'decision-log', label: 'Decisions', icon: Scale, color: 'violet', desc: 'Rationale tracking' },
              { id: 'authority-tracker', label: 'Authority', icon: Building2, color: 'blue', desc: 'Meetings & RFIs' },
              { id: 'provenance-trail', label: 'Provenance', icon: Fingerprint, color: 'zinc', desc: 'Audit trail' },
              { id: 'task-board', label: 'Task Board', icon: LayoutGrid, color: 'amber', desc: 'Kanban & sprints' },
              { id: 'team-workspace', label: 'Team', icon: Users, color: 'emerald', desc: 'Members & roles' },
              { id: 'program-analytics', label: 'Analytics', icon: BarChart3, color: 'blue', desc: 'Trends & metrics' },
            ] as const).map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    // Navigate via parent ZenApp's layoutMode — dispatch custom event
                    window.dispatchEvent(new CustomEvent('mc-navigate', { detail: { mode: item.id } }));
                  }}
                  className={cn(
                    'group flex flex-col items-center gap-1.5 p-3 rounded-xl border border-zinc-200 bg-white',
                    'hover:shadow-sm hover:border-zinc-300 transition-all text-center'
                  )}
                >
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', `bg-${item.color}-50`)}>
                    <Icon className={cn('w-4 h-4', `text-${item.color}-600`)} />
                  </div>
                  <span className="text-xs font-medium text-zinc-800 leading-tight">{item.label}</span>
                  <span className="text-xs text-zinc-400 leading-tight">{item.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Collaboration & Notifications Quick Links ──────────────────── */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('mc-navigate', { detail: { mode: 'notifications' } }))}
            className="flex-1 flex items-center gap-2 p-3 rounded-xl border border-zinc-200 bg-white hover:shadow-sm hover:border-zinc-300 transition-all"
          >
            <Bell className="w-4 h-4 text-amber-600" />
            <div className="text-left">
              <span className="text-xs font-medium text-zinc-800">Notifications</span>
              <span className="text-xs text-zinc-400 block">Alerts & action items</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 ml-auto" />
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('mc-navigate', { detail: { mode: 'collaboration-hub' } }))}
            className="flex-1 flex items-center gap-2 p-3 rounded-xl border border-zinc-200 bg-white hover:shadow-sm hover:border-zinc-300 transition-all"
          >
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <div className="text-left">
              <span className="text-xs font-medium text-zinc-800">Collaboration Hub</span>
              <span className="text-xs text-zinc-400 block">Threads & discussions</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 ml-auto" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MissionControlHome;
