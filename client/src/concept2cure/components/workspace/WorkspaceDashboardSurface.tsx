/**
 * WorkspaceDashboardSurface — Dashboard mode rendering.
 * Extracted from ProjectWorkspaceShell center pane (mode === 'dashboard').
 */

import React from 'react';
import { ShieldCheck, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProjectDashboard } from './ProjectDashboard';
import { ComputeJobPanel } from '../compute/ComputeJobPanel';
import { SubmissionCommandCenter } from '../submission/SubmissionCommandCenter';
import RegulatoryCommunicationsHub from '../correspondence/RegulatoryCommunicationsHub';
import type { TreeArtifact } from './ProjectFileTree';
import type { DocumentConsequenceRow } from './documentConsequence';

interface Proposal {
  id: string;
  status: string;
  governanceState?: 'ACCEPTED_GOVERNED' | 'ACCEPTED_PERSISTED_NO_GOVERNANCE' | 'REJECTED';
  artifactId?: string;
  artifactVersion?: number;
  artifactStatus?: string;
  placementState?: string;
  provenanceRef?: string;
  auditRef?: string;
}

export interface WorkspaceDashboardSurfaceProps {
  projectId: string;
  projectName?: string;
  projectType?: string;
  submissionType?: string;
  projectNav: string;
  artifacts: TreeArtifact[];
  reviewInFlight: number;
  documentConsequenceRows: DocumentConsequenceRow[];
  proposals: Proposal[];
  onSetComputeJobs: (jobs: any[]) => void;
  onOpenComputeArtifact: (
    artifactId: string,
    inspector?: 'compare' | 'provenance' | 'audit' | null
  ) => void;
  onOpenPlacementForDoc: (art: TreeArtifact, op: 'place' | 'relocate') => void;
  onOpenDocument: (docId: string) => void;
  onCreateDocument: () => void;
  onOpenEditor: () => void;
  onOpenDossier: () => void;
  onSwitchToIntelligence?: () => void;
  onNavigate?: (mode: string) => void;
  onActOnProposal: (proposalId: string, action: 'accept' | 'reject') => void;
  normalizeGovernanceState: (p: Proposal) => { label: string; tone: string };
  captureReviewPackage: (p: Proposal) => void;
}

export const WorkspaceDashboardSurface: React.FC<WorkspaceDashboardSurfaceProps> = ({
  projectId,
  projectName,
  projectType,
  submissionType,
  projectNav,
  artifacts,
  reviewInFlight,
  documentConsequenceRows,
  proposals,
  onSetComputeJobs,
  onOpenComputeArtifact,
  onOpenPlacementForDoc,
  onOpenDocument,
  onCreateDocument,
  onOpenEditor,
  onOpenDossier,
  onSwitchToIntelligence,
  onNavigate,
  onActOnProposal,
  normalizeGovernanceState,
  captureReviewPackage,
}) => {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
      {projectNav === 'communications' && (
        <div className="rounded-xl border border-stone-200 overflow-hidden bg-white">
          <RegulatoryCommunicationsHub projectId={projectId} />
        </div>
      )}
      {projectNav !== 'communications' && (
        <>
          <ComputeJobPanel
            projectId={projectId}
            onJobsLoaded={jobs => onSetComputeJobs(jobs)}
            onOpenArtifact={artifactId => onOpenComputeArtifact(artifactId)}
            onOpenProvenance={artifactId => onOpenComputeArtifact(artifactId, 'provenance')}
            onOpenAudit={artifactId => onOpenComputeArtifact(artifactId, 'audit')}
            onPlaceArtifact={artifactId => {
              const art = artifacts.find(a => a.id === artifactId);
              if (!art) return;
              onOpenPlacementForDoc(art, art.ctdSection ? 'relocate' : 'place');
            }}
          />
          <ProjectDashboard
            projectId={projectId}
            projectName={projectName || 'Untitled Project'}
            projectType={projectType}
            submissionType={submissionType}
            artifacts={artifacts}
            onOpenDocument={onOpenDocument}
            onCreateDocument={onCreateDocument}
            onOpenEditor={onOpenEditor}
            onOpenDossier={onOpenDossier}
            onOpenIntelligence={onSwitchToIntelligence}
            onOpenSubmissions={onNavigate ? () => onNavigate('submissions') : undefined}
            onOpenTemplates={onNavigate ? () => onNavigate('template-library') : undefined}
            onOpenTaskBoard={onNavigate ? () => onNavigate('task-board') : undefined}
            onOpenCSRWorkflow={onNavigate ? () => onNavigate('csr-workflow') : undefined}
            onOpenINDChecklist={onNavigate ? () => onNavigate('ind-checklist') : undefined}
          />
          {projectNav === 'submission_builder' && <SubmissionCommandCenter projectId={projectId} />}
          {projectNav === 'haq' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span className="text-sm font-semibold text-emerald-900">
                  HAQ Manager — Governed Artifact Queue
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] ml-auto border-emerald-200 text-emerald-700"
                >
                  {artifacts.filter(a => a.status === 'review' || a.status === 'draft').length} open
                </Badge>
              </div>
              <p className="text-xs text-emerald-800">
                Triage governed artifacts, review pulse signals, and proposal accept/reject actions
                in one quality queue.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-800">
                  Draft artifacts:{' '}
                  <span className="font-semibold">
                    {artifacts.filter(a => a.status === 'draft').length}
                  </span>
                </div>
                <div className="rounded border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-800">
                  Reviews in flight: <span className="font-semibold">{reviewInFlight}</span>
                </div>
                <div className="rounded border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-800">
                  Pending proposals:{' '}
                  <span className="font-semibold">
                    {proposals.filter(p => p.status === 'pending').length}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Document Consequence Ledger */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold text-slate-900">
                Document Consequence Ledger
              </span>
              <Badge variant="outline" className="text-[10px] ml-auto">
                {documentConsequenceRows.length} tracked
              </Badge>
            </div>
            {documentConsequenceRows.length === 0 ? (
              <div className="text-xs text-slate-500">
                No generated or accepted document consequences yet.
              </div>
            ) : (
              <div className="space-y-2">
                {documentConsequenceRows.map(row => (
                  <div
                    key={row.rowKey}
                    className="rounded border border-slate-100 px-3 py-2 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-slate-800 truncate">{row.title}</div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          row.status === 'draft' && 'text-amber-700 border-amber-200',
                          row.status === 'approved' && 'text-emerald-700 border-emerald-200',
                          row.status === 'review' && 'text-stone-700 border-blue-200',
                          row.status === 'locked' && 'text-slate-700 border-slate-200'
                        )}
                      >
                        {row.status}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                      <span>v{row.version}</span>
                      <span className="text-slate-300">·</span>
                      <span>{row.placement}</span>
                      <span className="text-slate-300">·</span>
                      <span>
                        {row.sourceType === 'compute'
                          ? 'Compute'
                          : row.sourceType === 'proposal_accept'
                          ? 'Proposal'
                          : 'Generated'}
                      </span>
                      {row.provenancePresent && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-violet-600">Prov ✓</span>
                        </>
                      )}
                      {row.auditPresent && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-sky-600">Audit ✓</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-blue-600"
                        disabled={!row.openable}
                        onClick={() => onOpenComputeArtifact(row.artifactId)}
                      >
                        {row.openable ? 'Open in editor' : 'View only'}
                      </Button>
                      {row.provenancePresent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px] text-violet-600"
                          onClick={() => onOpenComputeArtifact(row.artifactId, 'provenance')}
                        >
                          Provenance
                        </Button>
                      )}
                      {row.auditPresent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px] text-emerald-600"
                          onClick={() => onOpenComputeArtifact(row.artifactId, 'audit')}
                        >
                          Audit
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Conversation proposals with governed consequence visibility */}
          {proposals.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-slate-900">Document Proposals</span>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {proposals.length}
                </Badge>
              </div>
              {proposals.map(p => (
                <div key={p.id} className="rounded border border-slate-100 px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-800">{p.id.slice(0, 12)}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px]',
                        p.status === 'pending' && 'text-amber-700 border-amber-200',
                        p.status === 'accepted' && 'text-emerald-700 border-emerald-200',
                        p.status === 'rejected' && 'text-rose-700 border-rose-200'
                      )}
                    >
                      {p.status}
                    </Badge>
                  </div>

                  {/* Governance consequence (visible after accept) */}
                  {p.status === 'accepted' && p.governanceState && (
                    <div className="rounded bg-slate-50 border border-slate-100 px-2.5 py-1.5 text-[11px] space-y-1">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className={cn('w-3 h-3', normalizeGovernanceState(p).tone)} />
                        <span className={cn('font-medium', normalizeGovernanceState(p).tone)}>
                          {normalizeGovernanceState(p).label}
                        </span>
                      </div>
                      {p.artifactId && (
                        <div className="text-slate-600 space-y-0.5">
                          <div>
                            Artifact:{' '}
                            <span className="font-medium text-slate-800">
                              {p.artifactId.slice(0, 20)}
                            </span>{' '}
                            · v{p.artifactVersion ?? 1} · {p.artifactStatus || 'draft'}
                          </div>
                          <div>
                            Placement: {p.placementState || 'unplaced'} · Provenance:{' '}
                            {p.provenanceRef ? p.provenanceRef.slice(0, 12) : 'none'} · Audit:{' '}
                            {p.auditRef ? p.auditRef.slice(0, 12) : 'none'}
                          </div>
                        </div>
                      )}
                      {p.artifactId && (
                        <div className="flex items-center gap-2 pt-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[10px] text-blue-600"
                            onClick={() => onOpenComputeArtifact(p.artifactId!)}
                          >
                            Open in editor
                          </Button>
                          {p.provenanceRef && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[10px] text-violet-600"
                              onClick={() => onOpenComputeArtifact(p.artifactId!, 'provenance')}
                            >
                              Provenance
                            </Button>
                          )}
                          {p.auditRef && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[10px] text-emerald-600"
                              onClick={() => onOpenComputeArtifact(p.artifactId!, 'audit')}
                            >
                              Audit
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[10px] text-indigo-600"
                            onClick={() => captureReviewPackage(p)}
                          >
                            Review package
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions for pending proposals */}
                  {p.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2.5 text-[11px] text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        onClick={() => onActOnProposal(p.id, 'accept')}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2.5 text-[11px] text-rose-700 border-rose-200 hover:bg-rose-50"
                        onClick={() => onActOnProposal(p.id, 'reject')}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
