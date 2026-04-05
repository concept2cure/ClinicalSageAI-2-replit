/**
 * ProjectWorkspaceRouter — Type definitions and thin wrapper for
 * consolidated project-scoped workspace views.
 */
import React, { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { LoadingState } from '@/components/ui/statesV2';

export type WorkspaceView =
  | 'documents'
  | 'vault'
  | 'review'
  | 'submissions'
  | 'dossier-map'
  | 'section-workspace'
  | 'csr-workflow'
  | 'ind-checklist'
  | 'template-library'
  | 'editor'
  | 'regulatory-workspace'
  | 'biostatistics'
  | 'precedent-intelligence'
  | 'review-readiness'
  | 'report-engine'
  | 'safety-narrative'
  | 'vault-workspace'
  | 'task-board';

interface WorkspaceFrameProps {
  view: WorkspaceView;
  children: React.ReactNode;
}

const ModuleLoading = () => (
  <div className="flex-1 flex items-center justify-center">
    <LoadingState size="sm" message="" />
  </div>
);

/**
 * Consistent frame for all workspace views: ErrorBoundary + Suspense + container.
 */
export function WorkspaceFrame({ view, children }: WorkspaceFrameProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto" data-testid={`workspace-${view}`}>
      <ErrorBoundary>
        <Suspense fallback={<ModuleLoading />}>
          {children}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

export default WorkspaceFrame;
