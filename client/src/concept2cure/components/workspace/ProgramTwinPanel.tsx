/**
 * ProgramTwinPanel — Unified project state model that aggregates dossier,
 * evidence, template, governance, and readiness dimensions.
 *
 * Answers: what is incomplete, weak, risky, blocked, and ready.
 * All values labeled deterministic / heuristic / inferred.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Brain,
  Loader2,
  X,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileText,
  Database,
  Layers,
  ShieldCheck,
  Target,
  Lock,
  PenLine,
  Sparkles,
  Info,
} from 'lucide-react';

// ── Auth helper ──
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Types ──
interface ProgramTwinData {
  confidence: string;
  dossier: {
    confidence: string;
    totalArtifacts: number;
    draftCount: number;
    reviewCount: number;
    approvedCount: number;
    lockedCount: number;
    placedCount: number;
    unplacedCount: number;
    moduleBreakdown: Record<
      string,
      { total: number; draft: number; review: number; approved: number; locked: number }
    >;
  };
  evidence: {
    confidence: string;
    evidenceBackedCount: number;
    precedentBackedCount: number;
    noEvidenceCount: number;
    totalSourceInputEvents: number;
    totalGenerationEvents: number;
    noEvidenceArtifacts: { id: string; title: string; ctdSection: string | null }[];
  };
  template: {
    confidence: string;
    withTemplateCount: number;
    withoutTemplateCount: number;
  };
  governance: {
    confidence: string;
    signatureCount: number;
    signedArtifactCount: number;
    unresolvedCommentCount: number;
    placementEventCount: number;
  };
  readiness: {
    confidence: string;
    authoringReadiness: number;
    reviewReadiness: number;
    submissionReadiness: number;
  };
  problems: {
    severity: 'error' | 'warning' | 'info';
    message: string;
    artifactId?: string;
    ctdSection?: string;
  }[];
}

interface ProgramTwinPanelProps {
  projectId?: string;
  projectName?: string;
  onClose: () => void;
  onOpenVerification?: (artifactId: string) => void;
  onOpenTransformCanvas?: () => void;
  onSelectSection?: (ctdSection: string) => void;
}

export const ProgramTwinPanel: React.FC<ProgramTwinPanelProps> = ({
  projectId,
  projectName,
  onClose,
  onOpenVerification,
  onOpenTransformCanvas,
  onSelectSection,
}) => {
  const [data, setData] = useState<ProgramTwinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['readiness', 'problems']));

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/concept2cure/projects/${projectId}/program-twin`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const payload = await res.json();
          setData(payload.data);
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex flex-col bg-white">
        <TwinHeader onClose={onClose} projectName={projectName} />
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-zinc-400">No project data</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0 overflow-hidden">
      <TwinHeader onClose={onClose} projectName={projectName} />

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* ── Summary card ── */}
        <div className="grid grid-cols-5 gap-2">
          <StatCard
            label="Total"
            value={data.dossier.totalArtifacts}
            icon={<FileText className="w-3.5 h-3.5 text-blue-500" />}
          />
          <StatCard
            label="Draft"
            value={data.dossier.draftCount}
            icon={<PenLine className="w-3.5 h-3.5 text-zinc-400" />}
          />
          <StatCard
            label="Review"
            value={data.dossier.reviewCount}
            icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
          />
          <StatCard
            label="Approved"
            value={data.dossier.approvedCount}
            icon={<CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
          />
          <StatCard
            label="Locked"
            value={data.dossier.lockedCount}
            icon={<Lock className="w-3.5 h-3.5 text-red-500" />}
          />
        </div>

        {/* ── Readiness ── */}
        <TwinSection
          title="Readiness"
          subtitle={`confidence: ${data.readiness.confidence}`}
          icon={<Target className="w-3.5 h-3.5 text-blue-500" />}
          expanded={expanded.has('readiness')}
          onToggle={() => toggle('readiness')}
        >
          <ReadinessBar label="Authoring" value={data.readiness.authoringReadiness} />
          <ReadinessBar label="Review" value={data.readiness.reviewReadiness} />
          <ReadinessBar label="Submission" value={data.readiness.submissionReadiness} />
        </TwinSection>

        {/* ── Problems ── */}
        {data.problems.length > 0 && (
          <TwinSection
            title={`Problems (${data.problems.length})`}
            icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
            expanded={expanded.has('problems')}
            onToggle={() => toggle('problems')}
          >
            {data.problems.map((p, i) => (
              <div key={i} className="flex items-start gap-1.5 py-0.5">
                {p.severity === 'error' ? (
                  <XCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                ) : p.severity === 'warning' ? (
                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                )}
                <span className="text-[11px] text-zinc-600">{p.message}</span>
              </div>
            ))}
          </TwinSection>
        )}

        {/* ── Dossier state ── */}
        <TwinSection
          title="Dossier State"
          subtitle={`confidence: ${data.dossier.confidence}`}
          icon={<Layers className="w-3.5 h-3.5 text-violet-500" />}
          expanded={expanded.has('dossier')}
          onToggle={() => toggle('dossier')}
        >
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="text-zinc-500">Placed</div>
            <div className="text-zinc-700 font-medium">{data.dossier.placedCount}</div>
            <div className="text-zinc-500">Unplaced</div>
            <div className="text-zinc-700 font-medium">{data.dossier.unplacedCount}</div>
          </div>
          {Object.keys(data.dossier.moduleBreakdown).length > 0 && (
            <div className="mt-2 space-y-1">
              {Object.entries(data.dossier.moduleBreakdown).map(([mod, counts]) => (
                <div key={mod} className="flex items-center gap-2 text-[11px]">
                  <button
                    onClick={() => {
                      const section = mod.replace('Module ', '');
                      if (section !== '_unplaced' && onSelectSection) onSelectSection(section);
                    }}
                    className="text-blue-600 hover:underline font-medium truncate focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded"
                  >
                    {mod}
                  </button>
                  <span className="text-zinc-400 ml-auto">{counts.total}</span>
                  <span className="text-zinc-300 text-[11px]">
                    D{counts.draft} R{counts.review} A{counts.approved} L{counts.locked}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TwinSection>

        {/* ── Evidence state ── */}
        <TwinSection
          title="Evidence State"
          subtitle={`confidence: ${data.evidence.confidence}`}
          icon={<Database className="w-3.5 h-3.5 text-emerald-500" />}
          expanded={expanded.has('evidence')}
          onToggle={() => toggle('evidence')}
        >
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="text-zinc-500">Evidence-backed</div>
            <div className="text-zinc-700 font-medium">{data.evidence.evidenceBackedCount}</div>
            <div className="text-zinc-500">Precedent-backed</div>
            <div className="text-zinc-700 font-medium">{data.evidence.precedentBackedCount}</div>
            <div className="text-zinc-500">No evidence</div>
            <div
              className={cn(
                'font-medium',
                data.evidence.noEvidenceCount > 0 ? 'text-amber-600' : 'text-zinc-700'
              )}
            >
              {data.evidence.noEvidenceCount}
            </div>
          </div>
          {data.evidence.noEvidenceArtifacts.length > 0 && (
            <div className="mt-2">
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider">
                Weak/no evidence
              </span>
              <ul className="mt-1 space-y-0.5">
                {data.evidence.noEvidenceArtifacts.slice(0, 5).map(a => (
                  <li key={a.id} className="flex items-center gap-1 text-[11px] text-zinc-600">
                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="truncate">{a.title}</span>
                    {a.ctdSection && (
                      <span className="text-[11px] text-zinc-400 ml-auto">{a.ctdSection}</span>
                    )}
                    {onOpenVerification && (
                      <button
                        onClick={() => onOpenVerification(a.id)}
                        className="text-[11px] text-blue-500 hover:underline ml-1 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded"
                      >
                        Verify
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TwinSection>

        {/* ── Template state ── */}
        <TwinSection
          title="Template State"
          subtitle={`confidence: ${data.template.confidence}`}
          icon={<FileText className="w-3.5 h-3.5 text-cyan-500" />}
          expanded={expanded.has('template')}
          onToggle={() => toggle('template')}
        >
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="text-zinc-500">With template</div>
            <div className="text-zinc-700 font-medium">{data.template.withTemplateCount}</div>
            <div className="text-zinc-500">Without template</div>
            <div
              className={cn(
                'font-medium',
                data.template.withoutTemplateCount > 0 ? 'text-amber-600' : 'text-zinc-700'
              )}
            >
              {data.template.withoutTemplateCount}
            </div>
          </div>
        </TwinSection>

        {/* ── Governance state ── */}
        <TwinSection
          title="Governance State"
          subtitle={`confidence: ${data.governance.confidence}`}
          icon={<ShieldCheck className="w-3.5 h-3.5 text-amber-500" />}
          expanded={expanded.has('governance')}
          onToggle={() => toggle('governance')}
        >
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="text-zinc-500">Signatures</div>
            <div className="text-zinc-700 font-medium">{data.governance.signatureCount}</div>
            <div className="text-zinc-500">Signed artifacts</div>
            <div className="text-zinc-700 font-medium">{data.governance.signedArtifactCount}</div>
            <div className="text-zinc-500">Unresolved comments</div>
            <div
              className={cn(
                'font-medium',
                data.governance.unresolvedCommentCount > 0 ? 'text-red-600' : 'text-zinc-700'
              )}
            >
              {data.governance.unresolvedCommentCount}
            </div>
            <div className="text-zinc-500">Placement events</div>
            <div className="text-zinc-700 font-medium">{data.governance.placementEventCount}</div>
          </div>
        </TwinSection>

        {/* ── Quick actions ── */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-zinc-100">
          {onOpenTransformCanvas && (
            <button
              onClick={onOpenTransformCanvas}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            >
              <Sparkles className="w-3 h-3" />
              Transform Canvas
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Sub-components ──

function TwinHeader({ onClose, projectName }: { onClose: () => void; projectName?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 h-10 border-b border-zinc-100 shrink-0">
      <Brain className="w-4 h-4 text-violet-500" />
      <h2 className="text-sm font-semibold text-zinc-800">Program Twin</h2>
      {projectName && (
        <>
          <span className="text-zinc-300">·</span>
          <span className="text-xs text-zinc-500 truncate">{projectName}</span>
        </>
      )}
      <button
        onClick={onClose}
        className="ml-auto p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        aria-label="Close panel"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 border border-zinc-100 rounded bg-zinc-50/50">
      {icon}
      <span className="text-sm font-bold text-zinc-800 tabular-nums">{value}</span>
      <span className="text-[11px] text-zinc-400">{label}</span>
    </div>
  );
}

function TwinSection({
  title,
  subtitle,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-zinc-100 rounded-lg">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 transition-colors rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
        )}
        {icon}
        <span className="text-xs font-semibold text-zinc-700 flex-1">{title}</span>
        {subtitle && <span className="text-[11px] text-zinc-400">{subtitle}</span>}
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function ReadinessBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="mb-1.5">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] text-zinc-600">{label}</span>
        <span className="text-[11px] font-medium text-zinc-700">{value}%</span>
      </div>
      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default ProgramTwinPanel;
