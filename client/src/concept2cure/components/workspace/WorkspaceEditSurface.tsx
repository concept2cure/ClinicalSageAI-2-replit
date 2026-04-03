/**
 * WorkspaceEditSurface — Edit mode rendering (EditorPanel with lazy loading).
 * Extracted from ProjectWorkspaceShell center pane (else / edit branch).
 */

import React, { lazy, Suspense } from 'react';
// @ts-expect-error -- error-boundary is a .jsx file without type declarations
import ErrorBoundary from '@/components/ui/error-boundary';
import { LoadingState } from '@/components/ui/statesV2';

const EditorPanel = lazy(() => import('../editor/EditorPanel').then(m => ({ default: m.default })));

export interface WorkspaceEditSurfaceProps {
  projectId: string;
  submissionType?: string;
  projectType?: string;
  initialContent?: string;
  initialTitle?: string;
  initialCtdSection?: string;
  initialTemplateId?: string;
  onInitialContentConsumed?: () => void;
  openArtifactId?: string;
  onOpenArtifactConsumed?: () => void;
  onContentChange: (content: string, title: string) => void;
  editorInitialInspector: 'compare' | 'provenance' | 'audit' | null;
  editorContainerRef: React.RefObject<HTMLDivElement>;
}

export const WorkspaceEditSurface: React.FC<WorkspaceEditSurfaceProps> = ({
  projectId,
  submissionType,
  projectType,
  initialContent,
  initialTitle,
  initialCtdSection,
  initialTemplateId,
  onInitialContentConsumed,
  openArtifactId,
  onOpenArtifactConsumed,
  onContentChange,
  editorInitialInspector,
  editorContainerRef,
}) => {
  return (
    <div ref={editorContainerRef} className="flex-1 flex min-h-0 min-w-0">
      <ErrorBoundary>
        <Suspense
          fallback={
            <div
              className="flex-1 flex flex-col items-center justify-center gap-3"
              data-testid="editor-loading"
            >
              <LoadingState message="Loading editor..." size="sm" testId="editor-suspense" />
            </div>
          }
        >
          <EditorPanel
            projectId={projectId}
            submissionType={submissionType || projectType}
            initialContent={initialContent}
            initialTitle={initialTitle}
            initialCtdSection={initialCtdSection}
            initialTemplateId={initialTemplateId}
            onInitialContentConsumed={onInitialContentConsumed}
            openArtifactId={openArtifactId}
            onOpenArtifactConsumed={onOpenArtifactConsumed}
            onContentChange={onContentChange}
            initialInspector={editorInitialInspector}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
};
