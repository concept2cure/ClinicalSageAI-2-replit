/**
 * WorkspaceCenterSurface — Center content router.
 * Wraps DocumentStudioSurface and routes between Phase4 panels,
 * dashboard, browse, and edit surfaces.
 * Extracted from ProjectWorkspaceShell.
 */

import React from 'react';
import { DocumentStudioSurface } from './DocumentStudioSurface';
import { RegulatoryTransformCanvas } from './RegulatoryTransformCanvas';
import { GoldenDossierVerificationPanel } from './GoldenDossierVerificationPanel';
import { ProgramTwinPanel } from './ProgramTwinPanel';
import { SubmissionAppsPanel } from './SubmissionAppsPanel';
import { ReviewPulseDashboard } from './ReviewPulseDashboard';
import { CommunicationCenter } from './CommunicationCenter';
import {
  WorkspaceDashboardSurface,
  type WorkspaceDashboardSurfaceProps,
} from './WorkspaceDashboardSurface';
import { WorkspaceBrowseSurface, type WorkspaceBrowseSurfaceProps } from './WorkspaceBrowseSurface';
import { WorkspaceEditSurface, type WorkspaceEditSurfaceProps } from './WorkspaceEditSurface';
import type { TreeArtifact } from './ProjectFileTree';
import type { Phase4Panel } from './workspaceShellControllers';

interface Phase4Ctx {
  ctdSection?: string;
  templateKey?: string;
  artifactId?: string;
  artifactTitle?: string;
}

export interface WorkspaceCenterSurfaceProps {
  // Routing
  mode: 'dashboard' | 'browse' | 'edit';
  phase4Panel: Phase4Panel;
  phase4Ctx: Phase4Ctx;
  operatingLayer: string;

  // Project context
  projectId: string;
  projectName?: string;
  projectType?: string;
  submissionType?: string;
  artifacts: TreeArtifact[];

  // Phase4 callbacks
  onClosePhase4Panel: () => void;
  onPhase4CreateDraft: (
    title: string,
    ctdSection: string,
    templateKey?: string,
    existingArtifactId?: string
  ) => void;
  onOpenEditorForArtifact: (artId: string) => void;
  onOpenPlacementForArtifact: (artId: string) => void;
  onOpenVerification: (artId: string) => void;
  onOpenTransformCanvas: (
    ctdSection?: string,
    templateKey?: string,
    artifactId?: string,
    artifactTitle?: string
  ) => void;
  onCreateSubsection: (subsectionKey: string, label: string) => void;
  onSelectSection: (section: string) => void;
  onNavigateToArtifact: (artifactId: string) => void;
  onNavigate?: (mode: string) => void;

  // Surface props (pass-through)
  dashboardProps: Omit<
    WorkspaceDashboardSurfaceProps,
    'projectId' | 'projectName' | 'projectType' | 'submissionType' | 'artifacts'
  >;
  browseProps: Omit<WorkspaceBrowseSurfaceProps, 'projectId'>;
  editProps: Omit<WorkspaceEditSurfaceProps, 'projectId' | 'submissionType' | 'projectType'>;
}

export const WorkspaceCenterSurface: React.FC<WorkspaceCenterSurfaceProps> = ({
  mode,
  phase4Panel,
  phase4Ctx,
  operatingLayer,
  projectId,
  projectName,
  projectType,
  submissionType,
  artifacts,
  onClosePhase4Panel,
  onPhase4CreateDraft,
  onOpenEditorForArtifact,
  onOpenPlacementForArtifact,
  onOpenVerification,
  onOpenTransformCanvas,
  onCreateSubsection,
  onSelectSection,
  onNavigateToArtifact,
  onNavigate,
  dashboardProps,
  browseProps,
  editProps,
}) => {
  return (
    <DocumentStudioSurface
      osLayer={operatingLayer}
      onOpenWorkbench={domain => {
        if (domain === 'biostatistics') onNavigate?.('biostatistics');
        if (domain === 'safety-narrative') onNavigate?.('safety-narrative');
        if (domain === 'precedent-intelligence') onNavigate?.('precedent-intelligence');
      }}
    >
      {phase4Panel === 'transform' ? (
        <RegulatoryTransformCanvas
          projectId={projectId}
          projectName={projectName || 'Project'}
          ctdSection={phase4Ctx.ctdSection}
          templateKey={phase4Ctx.templateKey}
          artifactId={phase4Ctx.artifactId}
          artifactTitle={phase4Ctx.artifactTitle}
          onClose={onClosePhase4Panel}
          onCreateDraft={onPhase4CreateDraft}
          onOpenEditor={onOpenEditorForArtifact}
          onOpenPlacement={(artId?: string) => {
            if (artId) onOpenPlacementForArtifact(artId);
            onClosePhase4Panel();
          }}
          onOpenVerification={(artId: string) => onOpenVerification(artId)}
        />
      ) : phase4Panel === 'verification' && phase4Ctx.artifactId ? (
        <GoldenDossierVerificationPanel
          projectId={projectId}
          artifactId={phase4Ctx.artifactId}
          onClose={onClosePhase4Panel}
          onOpenEditor={onOpenEditorForArtifact}
          onOpenPlacement={(artId: string) => {
            onOpenPlacementForArtifact(artId);
            onClosePhase4Panel();
          }}
          onOpenProvenance={() => {
            if (phase4Ctx.artifactId) onOpenEditorForArtifact(phase4Ctx.artifactId);
            onClosePhase4Panel();
          }}
          onOpenAudit={() => onClosePhase4Panel()}
          onOpenCompare={() => onClosePhase4Panel()}
          onOpenTransformCanvas={() =>
            onOpenTransformCanvas(
              undefined,
              undefined,
              phase4Ctx.artifactId,
              phase4Ctx.artifactTitle
            )
          }
          onCreateSubsection={onCreateSubsection}
        />
      ) : phase4Panel === 'twin' ? (
        <ProgramTwinPanel
          projectId={projectId}
          projectName={projectName || 'Project'}
          onClose={onClosePhase4Panel}
          onOpenVerification={onOpenVerification}
          onOpenTransformCanvas={() => onOpenTransformCanvas()}
          onSelectSection={(section: string) => {
            onSelectSection(section);
            onClosePhase4Panel();
          }}
        />
      ) : phase4Panel === 'apps' ? (
        <SubmissionAppsPanel
          projectId={projectId}
          projectName={projectName || 'Project'}
          onClose={onClosePhase4Panel}
          onCreateDraft={onPhase4CreateDraft}
          onOpenTransformCanvas={(ctdSec?: string, tmplKey?: string) =>
            onOpenTransformCanvas(ctdSec, tmplKey)
          }
        />
      ) : phase4Panel === 'pulse' ? (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ReviewPulseDashboard projectId={projectId} onNavigateToArtifact={onNavigateToArtifact} />
        </div>
      ) : phase4Panel === 'communication_center' ? (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <CommunicationCenter
            projectId={projectId}
            projectName={projectName || 'Project'}
            submissionType={(submissionType as any) || (projectType as any) || 'NDA'}
            artifacts={artifacts.map(a => ({
              id: a.id,
              title: a.title,
              ctdSection: a.ctdSection,
              status: a.status || 'draft',
              version: a.version || 1,
            }))}
          />
        </div>
      ) : mode === 'dashboard' ? (
        <WorkspaceDashboardSurface
          projectId={projectId}
          projectName={projectName}
          projectType={projectType}
          submissionType={submissionType}
          artifacts={artifacts}
          {...dashboardProps}
        />
      ) : mode === 'browse' ? (
        <WorkspaceBrowseSurface projectId={projectId} {...browseProps} />
      ) : (
        <WorkspaceEditSurface
          projectId={projectId}
          submissionType={submissionType}
          projectType={projectType}
          {...editProps}
        />
      )}
    </DocumentStudioSurface>
  );
};
