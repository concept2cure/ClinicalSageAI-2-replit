/**
 * GoldenDossierVerificationPanel — Artifact verification against CTD placement,
 * template conformance, evidence support, and governance state.
 *
 * Shows: Overall verdict, strengths, gaps, blockers, and actionable next steps.
 * Every finding is labeled deterministic / heuristic / inferred.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  X,
  MapPin,
  GitCompare,
  Eye,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronRight,
  PenLine,
} from 'lucide-react';

// ── Auth helper ──
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Types ──
interface Finding {
  status: 'pass' | 'caution' | 'fail';
  message: string;
  confidence: string;
}

interface VerificationResult {
  artifactId: string;
  title: string;
  overallStatus: 'pass' | 'caution' | 'fail';
  score: number;
  placement: { findings: Finding[] };
  templateConformance: { findings: Finding[] };
  evidenceSupport: { findings: Finding[] };
  governance: { findings: Finding[] };
  findings: Finding[];
  recommendedActions: string[];
}

interface GoldenDossierVerificationPanelProps {
  projectId?: string;
  artifactId?: string;
  onClose: () => void;
  onOpenEditor?: (artifactId: string) => void;
  onOpenPlacement?: (artifactId: string) => void;
  onOpenProvenance?: () => void;
  onOpenAudit?: () => void;
  onOpenCompare?: () => void;
  onOpenTransformCanvas?: () => void;
  onCreateSubsection?: (key: string, label: string) => void;
}

export const GoldenDossierVerificationPanel: React.FC<GoldenDossierVerificationPanelProps> = ({
  projectId,
  artifactId,
  onClose,
  onOpenEditor,
  onOpenPlacement,
  onOpenProvenance,
  onOpenAudit,
  onOpenCompare,
  onOpenTransformCanvas,
  onCreateSubsection: _onCreateSubsection,
}) => {
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['placement', 'templateConformance', 'evidenceSupport', 'governance'])
  );

  const load = useCallback(async () => {
    if (!projectId || !artifactId) {
      setLoading(false);
      setError('No artifact selected');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/verification`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const payload = await res.json();
        setResult(payload.data);
      } else {
        setError('Verification failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [projectId, artifactId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
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

  if (error || !result) {
    return (
      <div className="flex-1 flex flex-col bg-white">
        <PanelHeader onClose={onClose} title="Golden Dossier Verification" />
        <div className="flex-1 flex items-center justify-center p-4">
          <span className="text-sm text-zinc-400">{error || 'No data'}</span>
        </div>
      </div>
    );
  }

  const statusIcon = {
    pass: <CheckCircle className="w-5 h-5 text-emerald-500" />,
    caution: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    fail: <XCircle className="w-5 h-5 text-red-500" />,
  };

  const statusLabel = { pass: 'Pass', caution: 'Caution', fail: 'Fail' };
  const statusColor = {
    pass: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    caution: 'bg-amber-50 border-amber-200 text-amber-800',
    fail: 'bg-red-50 border-red-200 text-red-800',
  };

  const sections: { key: string; label: string; findings: Finding[] }[] = [
    { key: 'placement', label: 'CTD Placement', findings: result.placement.findings },
    {
      key: 'templateConformance',
      label: 'Template Conformance',
      findings: result.templateConformance.findings,
    },
    {
      key: 'evidenceSupport',
      label: 'Evidence Support',
      findings: result.evidenceSupport.findings,
    },
    { key: 'governance', label: 'Governance', findings: result.governance.findings },
  ];

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0 overflow-hidden">
      <PanelHeader onClose={onClose} title="Golden Dossier Verification" />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Overall verdict */}
        <div
          className={cn(
            'flex items-center gap-3 p-3 rounded-lg border',
            statusColor[result.overallStatus]
          )}
        >
          {statusIcon[result.overallStatus]}
          <div className="flex-1">
            <p className="text-sm font-semibold">{statusLabel[result.overallStatus]}</p>
            <p className="text-xs opacity-80">{result.title}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{result.score}%</p>
            <p className="text-[10px] uppercase tracking-wider opacity-60">Score</p>
          </div>
        </div>

        {/* Verification dimensions */}
        {sections.map(({ key, label, findings }) => {
          const expanded = expandedSections.has(key);
          const hasFail = findings.some(f => f.status === 'fail');
          const hasCaution = findings.some(f => f.status === 'caution');
          const sectionIcon = hasFail ? (
            <XCircle className="w-3.5 h-3.5 text-red-500" />
          ) : hasCaution ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          ) : (
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
          );

          return (
            <div key={key} className="border border-zinc-100 rounded-lg">
              <button
                onClick={() => toggleSection(key)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 transition-colors rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                aria-expanded={expanded}
              >
                {expanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                )}
                {sectionIcon}
                <span className="text-xs font-semibold text-zinc-700 flex-1">{label}</span>
                <span className="text-[10px] text-zinc-400">{findings.length} check(s)</span>
              </button>
              {expanded && (
                <div className="px-3 pb-2 space-y-1">
                  {findings.map((f, i) => (
                    <FindingRow key={i} finding={f} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Recommended actions */}
        {result.recommendedActions.length > 0 && (
          <div className="border border-zinc-100 rounded-lg p-3">
            <p className="text-xs font-semibold text-zinc-700 mb-2">Recommended Actions</p>
            <ul className="space-y-1.5">
              {result.recommendedActions.map((action, i) => (
                <li key={i} className="flex items-center gap-2 text-[11px] text-zinc-600">
                  <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  {action}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Quick actions */}
        <div className="border border-zinc-100 rounded-lg p-3">
          <p className="text-xs font-semibold text-zinc-700 mb-2">Quick Actions</p>
          <div className="flex flex-wrap gap-1.5">
            {onOpenEditor && artifactId && (
              <QuickActionBtn
                icon={<PenLine className="w-3 h-3" />}
                label="Open in editor"
                onClick={() => onOpenEditor(artifactId)}
              />
            )}
            {onOpenPlacement && artifactId && (
              <QuickActionBtn
                icon={<MapPin className="w-3 h-3" />}
                label="Move/place"
                onClick={() => onOpenPlacement(artifactId)}
              />
            )}
            {onOpenCompare && (
              <QuickActionBtn
                icon={<GitCompare className="w-3 h-3" />}
                label="Compare"
                onClick={onOpenCompare}
              />
            )}
            {onOpenProvenance && (
              <QuickActionBtn
                icon={<Eye className="w-3 h-3" />}
                label="Provenance"
                onClick={onOpenProvenance}
              />
            )}
            {onOpenAudit && (
              <QuickActionBtn
                icon={<FileText className="w-3 h-3" />}
                label="Audit"
                onClick={onOpenAudit}
              />
            )}
            {onOpenTransformCanvas && (
              <QuickActionBtn
                icon={<Sparkles className="w-3 h-3" />}
                label="Transform canvas"
                onClick={onOpenTransformCanvas}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Sub-components ──

function PanelHeader({ onClose, title }: { onClose: () => void; title: string }) {
  return (
    <div className="flex items-center gap-2 px-4 h-10 border-b border-zinc-100 shrink-0">
      <ShieldCheck className="w-4 h-4 text-emerald-500" />
      <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
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

function FindingRow({ finding }: { finding: Finding }) {
  const icon = {
    pass: <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />,
    caution: <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />,
    fail: <XCircle className="w-3 h-3 text-red-500 shrink-0" />,
  };

  return (
    <div className="flex items-start gap-1.5 py-0.5">
      {icon[finding.status]}
      <span className="text-[11px] text-zinc-600 flex-1">{finding.message}</span>
      <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-50 text-zinc-400 shrink-0">
        {finding.confidence}
      </span>
    </div>
  );
}

function QuickActionBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
    >
      {icon}
      {label}
    </button>
  );
}

export default GoldenDossierVerificationPanel;
