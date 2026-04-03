/**
 * WorkspaceBrowseSurface — Browse mode rendering (document list, reports, IND evidence).
 * Extracted from ProjectWorkspaceShell center pane (mode === 'browse').
 */

import React from 'react';
import { DocumentListPane } from './DocumentListPane';
import { IndEvidenceAskPanel } from './IndEvidenceAskPanel';
import ReportCenter from '../reports/ReportCenter';
import { getSectionLabel } from '../../models/ctdHierarchy';
import type { TreeArtifact } from './ProjectFileTree';
import type { PlacementOperation } from './PlacementDialog';
import type { LeftRailMode } from './workspaceShellControllers';

export interface WorkspaceBrowseSurfaceProps {
  projectId: string;
  activeLayer: string;
  isINDWorkspace: boolean;
  leftRailMode: LeftRailMode;
  selectedCtdSection?: string;
  browseLabel: string;
  browseDocs: TreeArtifact[];
  selectedDocId?: string;
  onSelectDoc: (doc: TreeArtifact) => void;
  onShowNewDoc: () => void;
  onCreateSectionDraftWithRI?: () => void;
  onDialogCreateFromTemplate: (templateId: string, title: string, ctdSection?: string) => void;
  onDialogCreateBlank: (title: string, ctdSection?: string) => void;
  onCutDocument: (art: TreeArtifact) => void;
  onCopyCtdPath: (art: TreeArtifact) => void;
  onOpenPlacementForDoc: (art: TreeArtifact, op: PlacementOperation) => void;
}

export const WorkspaceBrowseSurface: React.FC<WorkspaceBrowseSurfaceProps> = ({
  projectId,
  activeLayer,
  isINDWorkspace,
  leftRailMode,
  selectedCtdSection,
  browseLabel,
  browseDocs,
  selectedDocId,
  onSelectDoc,
  onShowNewDoc,
  onCreateSectionDraftWithRI,
  onDialogCreateFromTemplate,
  onDialogCreateBlank,
  onCutDocument,
  onCopyCtdPath,
  onOpenPlacementForDoc,
}) => {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {activeLayer === 'reports' ? (
        <div className="flex-1 overflow-y-auto">
          <ReportCenter projectId={projectId} />
        </div>
      ) : (
        <>
          {isINDWorkspace && leftRailMode === 'dossier' && (
            <div className="px-4 pt-3">
              <IndEvidenceAskPanel
                projectId={projectId}
                sectionCode={selectedCtdSection}
                sectionTitle={selectedCtdSection ? getSectionLabel(selectedCtdSection) : undefined}
              />
            </div>
          )}
          <div className="flex-1 min-h-0">
            <DocumentListPane
              folderLabel={browseLabel}
              documents={browseDocs}
              selectedId={selectedDocId}
              onSelect={onSelectDoc}
              onCreateNew={onShowNewDoc}
              onAIDraft={
                leftRailMode === 'dossier' && selectedCtdSection
                  ? onCreateSectionDraftWithRI
                  : undefined
              }
              onStartFromTemplate={
                leftRailMode === 'dossier' && selectedCtdSection
                  ? () =>
                      onDialogCreateFromTemplate(
                        'clinical-overview',
                        `${selectedCtdSection} — ${getSectionLabel(selectedCtdSection!)}`,
                        selectedCtdSection
                      )
                  : undefined
              }
              onWriteManually={
                leftRailMode === 'dossier' && selectedCtdSection
                  ? () =>
                      onDialogCreateBlank(
                        `${selectedCtdSection} — ${getSectionLabel(selectedCtdSection!)}`,
                        selectedCtdSection
                      )
                  : undefined
              }
              sectionAIDraftable={leftRailMode === 'dossier' && !!selectedCtdSection}
              onCutDocument={onCutDocument}
              onCopyCtdPath={onCopyCtdPath}
              onOpenPlacement={onOpenPlacementForDoc}
            />
          </div>
        </>
      )}
    </div>
  );
};
