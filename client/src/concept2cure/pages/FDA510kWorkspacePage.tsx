/**
 * FDA510kWorkspacePage — Embedded 510(k) submission workspace.
 *
 * Wraps Enhanced510kIntakeWorkflow (the real 7-stage workflow with predicate
 * search, SE comparison, compliance checks, and eSTAR assembly) inside the
 * embedded module interface so ZenApp can render it when the user navigates
 * to /concept2cure/project/:id/510k.
 */

import React, { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ErrorBoundary } from '@/concept2cure/components/ErrorBoundary';
import { ErrorState } from '@/components/ui/statesV2';
// @ts-expect-error — JSX component without .d.ts; real implementation, typed at boundary
import Enhanced510kIntakeWorkflow from '@/components/510k/Enhanced510kIntakeWorkflow';

interface FDA510kWorkspacePageProps {
  embedded?: boolean;
  projectId?: string;
  projectName?: string;
  onBackToProject?: () => void;
  initialDocumentType?: string;
}

export const FDA510kWorkspacePage: React.FC<FDA510kWorkspacePageProps> = ({
  projectId,
  projectName,
  onBackToProject,
}) => {
  const { toast } = useToast();

  const handleSave = useCallback(
    async (data: Record<string, unknown>) => {
      if (!projectId) return;
      try {
        await apiRequest('PUT', `/api/fda510k-unified/${projectId}/workflow`, data);
        toast({ title: 'Progress saved', description: '510(k) workflow data saved.' });
      } catch {
        localStorage.setItem(`510k-workflow-${projectId}`, JSON.stringify(data));
        toast({
          title: 'Saved locally',
          description: 'Server unavailable. Progress saved to local storage and will sync when the connection is restored.',
          variant: 'destructive',
        });
      }
    },
    [projectId, toast]
  );

  const handleComplete = useCallback(() => {
    toast({ title: 'Workflow complete', description: '510(k) submission package is ready for review.' });
    onBackToProject?.();
  }, [toast, onBackToProject]);

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto">
      {onBackToProject && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-stone-100 bg-stone-50/50">
          <button
            onClick={onBackToProject}
            className="text-[12px] text-stone-500 hover:text-stone-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40 rounded px-1"
          >
            &larr; Back to project
          </button>
          <span className="text-[12px] text-stone-300">|</span>
          <span className="text-[12px] font-medium text-stone-700">
            510(k) Submission Workspace{projectName ? ` — ${projectName}` : ''}
          </span>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ErrorBoundary
          fallback={
            <div className="p-8">
              <ErrorState
                title="510(k) workspace failed to load"
                message="An error occurred while rendering the workflow. Try refreshing the page."
                testId="fda510k-error"
              />
            </div>
          }
        >
          <Enhanced510kIntakeWorkflow
            projectId={projectId}
            organizationId={projectId}
            onSave={handleSave}
            onComplete={handleComplete}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default FDA510kWorkspacePage;
