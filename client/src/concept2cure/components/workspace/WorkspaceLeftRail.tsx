/**
 * WorkspaceLeftRail — tree panel with mode toggle, document context band,
 * and tree content switcher (files, dossier, templates, outline, registry).
 * Hidden when mode === 'dashboard'.
 */
import React from 'react';
import { BookOpen, Brain, Files, Layers, List, FileText, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SkeletonText } from '@/components/ui/statesV2';
import { ProjectFileTree, type TreeArtifact } from './ProjectFileTree';
import { DossierTree } from './DossierTree';
import { TemplateTree } from './TemplateTree';
import { DocumentOutlineTree } from './DocumentOutlineTree';
import { OperatingSystemRegistryPanel, type RegistryKind } from './OperatingSystemRegistryPanel';
import type {
  LeftRailMode,
  OperatingLayer,
  PendingMove,
  Phase4Panel,
} from './workspaceShellControllers';
import type { DossierNode } from './ctdHierarchy';
import type { SectionMetrics } from './SectionRequirementsPanel';

export interface WorkspaceLeftRailProps {
  isINDWorkspace: boolean;
  operatingLayer: OperatingLayer;
  setOperatingLayer: (layer: string) => void;
  activeRegistry: RegistryKind;
  setActiveRegistry: (kind: RegistryKind) => void;
  leftRailMode: LeftRailMode;
  setLeftRailMode: (mode: LeftRailMode) => void;
  outlineAvailable: boolean;
  activeArtifact: TreeArtifact | null;
  loading: boolean;
  artifacts: TreeArtifact[];
  selectedDocId: string | null;
  selectedFolder: string | null;
  pendingMove: PendingMove | null;
  selectedCtdSection: string;
  setSelectedCtdSection: (s: string) => void;
  submissionDossierHierarchy: DossierNode[] | undefined;
  dossierMetrics: Record<string, SectionMetrics>;
  activeDocContent: string;
  activeDocTitle: string;
  submissionType: string;
  projectType: string;
  projectId: string;
  projectName: string;
  phase4Panel: Phase4Panel;
  // Callbacks
  handleSelectDoc: (id: string) => void;
  handleSelectFolder: (folder: string | null) => void;
  setShowNewDoc: (show: boolean) => void;
  handleCutDocument: (art: TreeArtifact) => void;
  handleOpenPlacementForDoc: (art: TreeArtifact, op: string) => void;
  handleCopyCtdPath: (art: TreeArtifact) => void;
  handlePasteHere: (section: string) => void;
  handleSelectSection: (section: string) => void;
  handlePlaceArtifact: ((section: string) => void) | undefined;
  handleViewSectionReqs: (section: string) => void;
  openTransformCanvas: (ctdSection: string, templateKey?: string) => void;
  openProgramTwin: () => void;
  openSubmissionApps: (ctdSection: string) => void;
  handleCreateFromTemplate: (ctdSection: string, templateKey: string) => void;
  setShowNewDocDialog: (show: boolean) => void;
  applyWorkflowTransition: (key: string, ctx?: Record<string, unknown>) => boolean;
  handleOutlineNavigate: (heading: string) => void;
  handleCreateSubsection: (parentPath: string) => void;
  openReviewPulse: () => void;
}

export const WorkspaceLeftRail: React.FC<WorkspaceLeftRailProps> = ({
  isINDWorkspace,
  operatingLayer,
  setOperatingLayer,
  activeRegistry,
  setActiveRegistry,
  leftRailMode,
  setLeftRailMode,
  outlineAvailable,
  activeArtifact,
  loading,
  artifacts,
  selectedDocId,
  selectedFolder,
  pendingMove,
  selectedCtdSection,
  setSelectedCtdSection,
  submissionDossierHierarchy,
  dossierMetrics,
  activeDocContent,
  activeDocTitle,
  submissionType,
  projectType,
  projectId,
  projectName,
  phase4Panel,
  handleSelectDoc,
  handleSelectFolder,
  setShowNewDoc,
  handleCutDocument,
  handleOpenPlacementForDoc,
  handleCopyCtdPath,
  handlePasteHere,
  handleSelectSection,
  handlePlaceArtifact,
  handleViewSectionReqs,
  openTransformCanvas,
  openProgramTwin,
  openSubmissionApps,
  handleCreateFromTemplate,
  setShowNewDocDialog,
  applyWorkflowTransition,
  handleOutlineNavigate,
  handleCreateSubsection,
  openReviewPulse,
}) => (
  <div className="w-[200px] 2xl:w-[240px] border-r border-zinc-200 shrink-0 flex flex-col bg-white">
    {!isINDWorkspace && (
      <div className="grid grid-cols-3 gap-1 p-1.5 border-b border-zinc-200 bg-white">
        {[
          { key: 'documents' as OperatingLayer, label: 'Docs' },
          { key: 'vault' as OperatingLayer, label: 'Vault' },
          { key: 'reports' as OperatingLayer, label: 'Readiness' },
        ].map(layer => (
          <button
            key={layer.key}
            onClick={() => {
              setOperatingLayer(layer.key);
              if (layer.key === 'vault') setActiveRegistry('vault');
              if (layer.key === 'reports') setActiveRegistry('reports');
              if (layer.key === 'documents' && activeRegistry !== 'projects') {
                setActiveRegistry('documents');
              }
            }}
            className={cn(
              'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              operatingLayer === layer.key
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            )}
          >
            {layer.label}
          </button>
        ))}
      </div>
    )}
    {/* Mode toggle tabs */}
    <div className="flex border-b border-zinc-200 shrink-0 bg-zinc-50/60">
      {(isINDWorkspace
        ? [
            {
              key: 'dossier' as LeftRailMode,
              icon: BookOpen,
              label: 'Sections',
              disabled: false,
            },
            {
              key: 'outline' as LeftRailMode,
              icon: List,
              label: 'Outline',
              disabled: !outlineAvailable,
            },
          ]
        : [
            {
              key: 'files' as LeftRailMode,
              icon: Files,
              label: 'Files',
              disabled: false,
            },
            {
              key: 'dossier' as LeftRailMode,
              icon: BookOpen,
              label: 'Dossier',
              disabled: false,
            },
            {
              key: 'templates' as LeftRailMode,
              icon: Layers,
              label: 'Tmpl',
              disabled: false,
            },
            {
              key: 'outline' as LeftRailMode,
              icon: List,
              label: 'Outline',
              disabled: !outlineAvailable,
            },
            {
              key: 'registry' as LeftRailMode,
              icon: Brain,
              label: 'OS',
              disabled: false,
            },
          ]
      ).map(tab => (
        <button
          key={tab.key}
          onClick={() => !tab.disabled && setLeftRailMode(tab.key)}
          disabled={tab.disabled}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors duration-150',
            leftRailMode === tab.key
              ? 'text-stone-900 bg-white border-b-2 border-stone-900'
              : tab.disabled
              ? 'text-stone-400 cursor-not-allowed'
              : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100/60'
          )}
          data-testid={`rail-mode-${tab.key}`}
          title={tab.disabled ? 'Open a document to use Outline' : tab.label}
        >
          <tab.icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{tab.label}</span>
        </button>
      ))}
    </div>

    {/* ── Active document context band ──────────────────────────────── */}
    {activeArtifact && (
      <div
        className="border-b border-stone-200 bg-stone-50/60 px-2.5 py-2 shrink-0"
        data-testid="active-doc-context"
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          <span className="text-xs font-medium text-stone-700 truncate flex-1">
            {activeArtifact.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {activeArtifact.ctdSection && (
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-blue-50 text-stone-700 font-medium">
              {activeArtifact.ctdSection}
            </span>
          )}
          {activeArtifact.templateId && (
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-violet-50 text-stone-700">
              {activeArtifact.templateId.replace('tpl-', '')}
            </span>
          )}
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded-md font-medium',
              activeArtifact.status === 'locked'
                ? 'bg-red-50 text-red-700'
                : activeArtifact.status === 'approved'
                ? 'bg-green-50 text-green-700'
                : activeArtifact.status === 'review'
                ? 'bg-yellow-50 text-yellow-700'
                : 'bg-stone-100 text-stone-500'
            )}
          >
            {activeArtifact.status || 'draft'}
          </span>
          {activeArtifact.version && (
            <span className="text-xs text-stone-400">v{activeArtifact.version}</span>
          )}
        </div>
      </div>
    )}

    {/* Tree content based on mode */}
    {loading && artifacts.length === 0 ? (
      <div className="flex-1 p-4" data-testid="workspace-files-loading">
        <SkeletonText lines={6} label="Loading files" testId="workspace-skeleton" />
      </div>
    ) : leftRailMode === 'files' ? (
      <ProjectFileTree
        artifacts={artifacts}
        selectedId={selectedDocId}
        onSelect={handleSelectDoc}
        onSelectFolder={handleSelectFolder}
        selectedFolder={selectedFolder}
        onCreateNew={() => setShowNewDoc(true)}
        onCutDocument={handleCutDocument}
        onOpenPlacement={art =>
          handleOpenPlacementForDoc(art, art.ctdSection ? 'relocate' : 'place')
        }
        onCopyCtdPath={handleCopyCtdPath}
        pendingMove={pendingMove}
        onPasteHere={pendingMove ? handlePasteHere : undefined}
      />
    ) : leftRailMode === 'dossier' ? (
      <DossierTree
        artifacts={artifacts}
        selectedSection={selectedCtdSection}
        onSelectSection={handleSelectSection}
        onPlaceArtifact={selectedDocId || pendingMove ? handlePlaceArtifact : undefined}
        customHierarchy={submissionDossierHierarchy}
        metrics={dossierMetrics}
        pendingMove={pendingMove}
        onPasteHere={pendingMove ? handlePasteHere : undefined}
        onViewRequirements={handleViewSectionReqs}
        onOpenTransformCanvas={(ctdSection: string) => openTransformCanvas(ctdSection)}
        onOpenProgramTwin={openProgramTwin}
        onOpenSubmissionApps={(ctdSection: string) => openSubmissionApps(ctdSection)}
        onCreateFromTemplate={(ctdSection: string) => {
          setLeftRailMode('templates');
          setSelectedCtdSection(ctdSection);
        }}
        onDraftWithAI={(ctdSection: string) => {
          setSelectedCtdSection(ctdSection);
          setShowNewDocDialog(true);
        }}
        onAttachExisting={(ctdSection: string) => {
          setSelectedCtdSection(ctdSection);
          setLeftRailMode('files');
          applyWorkflowTransition('browse_list', {});
        }}
      />
    ) : leftRailMode === 'outline' ? (
      outlineAvailable ? (
        <DocumentOutlineTree
          content={activeDocContent}
          title={activeDocTitle || activeArtifact?.title || ''}
          templateKey={activeArtifact?.templateId}
          ctdSection={activeArtifact?.ctdSection}
          onNavigate={handleOutlineNavigate}
          onCreateSubsection={handleCreateSubsection}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-stone-400 text-center">Open a document to view its outline</p>
        </div>
      )
    ) : leftRailMode === 'registry' ? (
      <OperatingSystemRegistryPanel
        projectId={projectId}
        projectName={projectName}
        artifacts={artifacts}
        activeRegistry={activeRegistry}
        onRegistryChange={setActiveRegistry}
      />
    ) : (
      <TemplateTree
        submissionType={submissionType || projectType}
        onCreateFromTemplate={handleCreateFromTemplate}
        onOpenTransformCanvas={(ctdSection: string, templateKey: string) =>
          openTransformCanvas(ctdSection, templateKey)
        }
      />
    )}

    {/* Project-level Review Pulse button */}
    <div className="shrink-0 border-t border-stone-200 p-2">
      <button
        onClick={openReviewPulse}
        className={cn(
          'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium transition-colors duration-150',
          phase4Panel === 'pulse'
            ? 'text-rose-700 bg-rose-50'
            : 'text-stone-500 hover:text-rose-600 hover:bg-rose-50'
        )}
        title="Review Pulse — project-wide review status"
      >
        <Activity className="w-3.5 h-3.5" />
        Review Pulse
      </button>
    </div>
  </div>
);
