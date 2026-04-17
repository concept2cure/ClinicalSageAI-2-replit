/**
 * FDA510kWorkspacePage — Embedded 510(k) submission workspace.
 *
 * Wraps Enhanced510kIntakeWorkflow (the real 7-stage workflow with predicate
 * search, SE comparison, compliance checks, and eSTAR assembly) inside the
 * embedded module interface so ZenApp can render it when the user navigates
 * to /concept2cure/project/:id/510k.
 *
 * Previously this route incorrectly rendered CERV2Page (a CER generator).
 * This page fixes the routing to render the actual 510(k) workflow.
 */

import React, { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
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
          description: 'Backend unavailable — progress saved to local storage.',
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
        <div className="flex items-center gap-2 px-4 py-2 border-b border-stone-100 bg-stone-50/50">
          <button
            onClick={onBackToProject}
            className="text-xs text-stone-500 hover:text-stone-700 transition-colors"
          >
            &larr; Back to project
          </button>
          <span className="text-xs text-stone-400">|</span>
          <span className="text-xs font-medium text-stone-700">
            510(k) Workspace{projectName ? ` — ${projectName}` : ''}
          </span>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Enhanced510kIntakeWorkflow
          projectId={projectId}
          onSave={handleSave}
          onComplete={handleComplete}
        />
      </div>
    </div>
  );
};

export default FDA510kWorkspacePage;
