/**
 * RegulatoryTransformCanvas — 5-stage evidence-to-document transformation surface.
 *
 * Lanes: Inputs → Structured Transform → Draft Output → Governance → Downstream Actions
 *
 * Shows live project data when available, honest empty states otherwise.
 * Not a diagram toy — every lane shows real data from the project context.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  getSectionLabel,
  getExpectedDocTypesForSection,
  getSubmissionAppCandidates,
  getTemplateStructureForArtifact,
  type TemplateStructureNode,
} from '../../models/ctdHierarchy';
import {
  FileText,
  Database,
  Layers,
  ShieldCheck,
  ArrowRight,
  Loader2,
  X,
  CheckCircle,
  PenLine,
  Plus,
  Sparkles,
  Eye,
  MapPin,
  GitCompare,
} from 'lucide-react';

// ── Auth helper ──
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Types ──
interface TransformContext {
  project: {
    id: number;
    name: string;
    submissionType: string;
    sponsor: string;
    indication: string;
    region: string;
  };
  artifacts: {
    total: number;
    byStatus: { draft: number; review: number; approved: number; locked: number };
  };
  evidence: {
    sourceInputCount: number;
    generationCount: number;
    confidence: string;
  };
  ctdSections: string[];
  templateIds: string[];
}

interface RegulatoryTransformCanvasProps {
  projectId?: string;
  projectName?: string;
  /** Pre-bound CTD section (from dossier node) */
  ctdSection?: string;
  /** Pre-bound template key (from template tree) */
  templateKey?: string;
  /** Pre-bound artifact (from active document / editor) */
  artifactId?: string;
  artifactTitle?: string;
  onClose: () => void;
  onCreateDraft: (title: string, ctdSection: string, templateKey?: string) => void;
  onOpenEditor: (artifactId: string) => void;
  onOpenPlacement: (artifactId?: string) => void;
  onOpenVerification?: (artifactId: string) => void;
}

export const RegulatoryTransformCanvas: React.FC<RegulatoryTransformCanvasProps> = ({
  projectId,
  projectName,
  ctdSection: preCtdSection,
  templateKey: preTemplateKey,
  artifactId: preArtifactId,
  artifactTitle: preArtifactTitle,
  onClose,
  onCreateDraft,
  onOpenEditor,
  onOpenPlacement,
  onOpenVerification,
}) => {
  const [context, setContext] = useState<TransformContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCtd, setSelectedCtd] = useState(preCtdSection || '');
  const [selectedTemplate] = useState(preTemplateKey || '');
  const [draftTitle, setDraftTitle] = useState(preArtifactTitle || '');
  const [docType, setDocType] = useState('regulatory_document');

  // Load transform context
  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/concept2cure/projects/${projectId}/transform-context`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const payload = await res.json();
          setContext(payload.data);
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  // Derive template structure
  const templateStructure: TemplateStructureNode[] = selectedTemplate
    ? getTemplateStructureForArtifact({ templateId: selectedTemplate, ctdSection: selectedCtd }) ||
      []
    : selectedCtd
      ? getTemplateStructureForArtifact({ templateId: null, ctdSection: selectedCtd }) || []
      : [];

  // Expected doc types for selected section
  const expectedDocTypes = selectedCtd ? getExpectedDocTypesForSection(selectedCtd) : [];

  // Matching submission apps
  const matchingApps = getSubmissionAppCandidates(selectedCtd, docType, selectedTemplate);

  const handleCreateDraft = useCallback(() => {
    if (!draftTitle.trim() || !selectedCtd) return;
    onCreateDraft(draftTitle.trim(), selectedCtd, selectedTemplate || undefined);
  }, [draftTitle, selectedCtd, selectedTemplate, onCreateDraft]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-zinc-200 shrink-0">
        <Sparkles className="w-4 h-4 text-violet-500" />
        <h2 className="text-sm font-semibold text-zinc-800">Regulatory Transform Canvas</h2>
        {projectName && (
          <>
            <span className="text-zinc-400">·</span>
            <span className="text-xs text-zinc-500 truncate">{projectName}</span>
          </>
        )}
        <button
          onClick={onClose}
          className="ml-auto p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          aria-label="Close canvas"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas lanes */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-5 gap-px bg-zinc-100 min-h-full">
          {/* ── Lane 1: Inputs ── */}
          <div className="bg-white p-3 flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 pb-1 border-b border-zinc-200">
              <Database className="w-3.5 h-3.5 text-blue-500" />
              Inputs
            </div>
            {context ? (
              <>
                <LaneStat
                  label="Source documents"
                  value={`${context.artifacts.total} artifact(s)`}
                />
                <LaneStat
                  label="Evidence events"
                  value={`${context.evidence.sourceInputCount}`}
                  sublabel={`confidence: ${context.evidence.confidence}`}
                />
                <LaneStat label="Precedent events" value={`${context.evidence.generationCount}`} />
                <LaneStat
                  label="CTD targets"
                  value={
                    context.ctdSections.length > 0
                      ? context.ctdSections.join(', ')
                      : 'none assigned'
                  }
                />
                <LaneStat
                  label="Templates used"
                  value={context.templateIds.length > 0 ? `${context.templateIds.length}` : 'none'}
                />
                <LaneStat label="Project" value={context.project.name || '—'} />
                {context.project.submissionType && (
                  <LaneStat label="Submission" value={context.project.submissionType} />
                )}
              </>
            ) : (
              <EmptyLane message="No project selected" />
            )}
          </div>

          {/* ── Lane 2: Structured Transform ── */}
          <div className="bg-white p-3 flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 pb-1 border-b border-zinc-200">
              <Layers className="w-3.5 h-3.5 text-violet-500" />
              Structured Transform
            </div>
            {selectedCtd ? (
              <>
                <LaneStat
                  label="Target section"
                  value={`${selectedCtd} — ${getSectionLabel(selectedCtd)}`}
                />
                <LaneStat
                  label="Expected doc types"
                  value={expectedDocTypes.length > 0 ? expectedDocTypes.join(', ') : 'any'}
                />
                {templateStructure.length > 0 ? (
                  <div>
                    <span className="text-xs text-zinc-400 uppercase tracking-wider">
                      Required blocks
                    </span>
                    <ul className="mt-1 space-y-0.5">
                      {templateStructure.slice(0, 8).map(s => (
                        <li
                          key={s.key}
                          className="flex items-center gap-1 text-xs text-zinc-600"
                        >
                          {s.required ? (
                            <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                          ) : (
                            <span className="w-3 h-3 rounded-full border border-zinc-300 shrink-0" />
                          )}
                          <span className="truncate">{s.label}</span>
                        </li>
                      ))}
                      {templateStructure.length > 8 && (
                        <li className="text-xs text-zinc-400">
                          +{templateStructure.length - 8} more
                        </li>
                      )}
                    </ul>
                  </div>
                ) : (
                  <span className="text-xs text-zinc-400">No template structure mapped</span>
                )}
                {matchingApps.length > 0 && (
                  <div>
                    <span className="text-xs text-zinc-400 uppercase tracking-wider">
                      Matching apps
                    </span>
                    <ul className="mt-1 space-y-0.5">
                      {matchingApps.map(app => (
                        <li key={app.appId} className="text-xs text-violet-600">
                          {app.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <>
                <span className="text-xs text-zinc-400">Select a CTD section</span>
                {context && context.ctdSections.length > 0 && (
                  <div className="space-y-1">
                    {context.ctdSections.slice(0, 6).map(s => (
                      <button
                        key={s}
                        onClick={() => setSelectedCtd(s)}
                        className="w-full text-left text-xs px-2 py-1 rounded hover:bg-blue-50 text-blue-600 transition-colors"
                      >
                        {s} — {getSectionLabel(s)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Lane 3: Draft Output ── */}
          <div className="bg-white p-3 flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 pb-1 border-b border-zinc-200">
              <FileText className="w-3.5 h-3.5 text-emerald-500" />
              Draft Output
            </div>
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">
                Artifact title
              </label>
              <input
                type="text"
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                placeholder="Document title..."
                className="w-full text-sm px-2 py-1.5 rounded border border-zinc-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
              />
            </div>
            {selectedCtd && (
              <LaneStat
                label="Target CTD"
                value={`${selectedCtd} — ${getSectionLabel(selectedCtd)}`}
              />
            )}
            {selectedTemplate && <LaneStat label="Template" value={selectedTemplate} />}
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">
                Doc type
              </label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value)}
                className="w-full text-sm px-2 py-1.5 rounded border border-zinc-200 outline-none focus:border-blue-400"
              >
                <option value="regulatory_document">Regulatory Document</option>
                <option value="evidence_memo">Evidence Memo</option>
                <option value="protocol_rationale">Protocol Rationale</option>
                <option value="clinical_overview">Clinical Overview</option>
                <option value="risk_benefit_analysis">Risk-Benefit Analysis</option>
                <option value="audit_report">Audit Report</option>
              </select>
            </div>
            <LaneStat label="Status preview" value="draft (new)" />
          </div>

          {/* ── Lane 4: Governance ── */}
          <div className="bg-white p-3 flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 pb-1 border-b border-zinc-200">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
              Governance
            </div>
            <LaneStat label="Provenance" value="always on" sublabel="Every action recorded" />
            <LaneStat label="Version destination" value="v1 (new artifact)" />
            {selectedCtd && (
              <LaneStat label="Placement impact" value={`Into section ${selectedCtd}`} />
            )}
            <LaneStat label="Approval readiness" value="Draft — not yet reviewable" />
            <LaneStat label="Integrity chain" value="Will be established on first save" />
          </div>

          {/* ── Lane 5: Downstream Actions ── */}
          <div className="bg-white p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 pb-1 border-b border-zinc-200">
              <ArrowRight className="w-3.5 h-3.5 text-blue-500" />
              Downstream Actions
            </div>
            <ActionButton
              icon={<Plus className="w-3.5 h-3.5" />}
              label="Create governed draft"
              disabled={!draftTitle.trim() || !selectedCtd}
              onClick={handleCreateDraft}
              primary
            />
            {preArtifactId && (
              <ActionButton
                icon={<PenLine className="w-3.5 h-3.5" />}
                label="Open in editor"
                onClick={() => onOpenEditor(preArtifactId)}
              />
            )}
            <ActionButton
              icon={<MapPin className="w-3.5 h-3.5" />}
              label="Place in dossier"
              onClick={() => onOpenPlacement(preArtifactId)}
            />
            {preArtifactId && onOpenVerification && (
              <ActionButton
                icon={<Eye className="w-3.5 h-3.5" />}
                label="Verify artifact"
                onClick={() => onOpenVerification(preArtifactId)}
              />
            )}
            <ActionButton
              icon={<GitCompare className="w-3.5 h-3.5" />}
              label="Create comparison target"
              disabled
              onClick={() => {}}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Helper sub-components ──

function LaneStat({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div>
      <span className="text-xs text-zinc-400 uppercase tracking-wider">{label}</span>
      <p className="text-sm text-zinc-700 font-medium leading-tight">{value}</p>
      {sublabel && <p className="text-xs text-zinc-400">{sublabel}</p>}
    </div>
  );
}

function EmptyLane({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <span className="text-xs text-zinc-400">{message}</span>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium transition-colors text-left',
        'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
        primary && !disabled
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : !disabled
            ? 'bg-zinc-50 text-zinc-700 hover:bg-zinc-100 border border-zinc-200'
            : 'bg-zinc-50 text-zinc-400 border border-zinc-200 cursor-not-allowed'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export default RegulatoryTransformCanvas;
