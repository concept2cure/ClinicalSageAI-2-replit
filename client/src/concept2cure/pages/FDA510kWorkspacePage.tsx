/**
 * FDA510kWorkspacePage — AnA-primary 510(k) submission workspace.
 *
 * Hybrid layout (chat-first, zero capability loss):
 *   1. Slim back/title header with a view toggle (AI guide | Structured form)
 *   2. Seven-stage progress strip reading live from /api/510k-workflow
 *   3. Body:
 *        - Default: AnaPersistentPanel full-width with device-submission
 *          suggested actions. AnA guides the user through the submission.
 *        - On demand: Enhanced510kIntakeWorkflow (the original 7-stage
 *          wizard) — all existing capabilities remain reachable.
 */

import React, { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useTenantContext } from '@/contexts/TenantContext';
import { ErrorBoundary } from '@/concept2cure/components/ErrorBoundary';
import { ErrorState } from '@/components/ui/statesV2';
import { cn } from '@/lib/utils';
import AnaPersistentPanel from '@/concept2cure/components/chat/AnaPersistentPanel';
// @ts-expect-error — JSX component without .d.ts; real implementation, typed at boundary
import Enhanced510kIntakeWorkflow from '@/components/510k/Enhanced510kIntakeWorkflow';

interface FDA510kWorkspacePageProps {
  embedded?: boolean;
  projectId?: string;
  projectName?: string;
  onBackToProject?: () => void;
  initialDocumentType?: string;
}

type ViewMode = 'chat' | 'form';

const STAGES: { id: string; name: string }[] = [
  { id: 'setup', name: 'Setup' },
  { id: 'strategy', name: 'Strategy' },
  { id: 'evidence_plan', name: 'Evidence Plan' },
  { id: 'evidence', name: 'Evidence' },
  { id: 'authoring', name: 'Author' },
  { id: 'estar_rta', name: 'eSTAR & RTA' },
  { id: 'submit_ai', name: 'Submit' },
];

const SUGGESTED_ACTIONS = [
  {
    id: 'dev-510k-predicate',
    label: 'Find predicate devices',
    description: 'Search the FDA 510(k) database for comparable cleared devices',
  },
  {
    id: 'dev-510k-ifu',
    label: 'Draft Indications for Use',
    description: 'Write the FDA 3881 IFU statement for this device',
  },
  {
    id: 'dev-510k-se',
    label: 'Build substantial equivalence',
    description: 'Compare this device to its primary predicate across technological characteristics',
  },
  {
    id: 'dev-510k-compliance',
    label: 'Check 510(k) compliance',
    description: 'Scan the submission for RTA and eSTAR deficiencies',
  },
  {
    id: 'dev-510k-estar',
    label: 'Prepare eSTAR package',
    description: 'Assemble the eSTAR submission package for the FDA gateway',
  },
];

export const FDA510kWorkspacePage: React.FC<FDA510kWorkspacePageProps> = ({
  projectId,
  projectName,
  onBackToProject,
}) => {
  const { toast } = useToast();
  const { currentOrganization } = useTenantContext();
  const organizationId = currentOrganization?.id ? String(currentOrganization.id) : undefined;
  const [view, setView] = useState<ViewMode>('chat');

  const { data: workflowResponse } = useQuery<{
    workflow?: { currentStep?: string; completedSteps?: string[] };
  } | null>({
    queryKey: ['/api/510k-workflow', projectId],
    queryFn: async () => {
      if (!projectId || !organizationId) return null;
      try {
        const response = await apiRequest(
          'GET',
          `/api/510k-workflow/${projectId}?organizationId=${organizationId}`
        );
        return await response.json();
      } catch {
        return null;
      }
    },
    enabled: !!projectId && !!organizationId,
    staleTime: 30_000,
  });

  const currentStageId = workflowResponse?.workflow?.currentStep ?? 'setup';
  const currentStageIdx = Math.max(
    0,
    STAGES.findIndex(s => s.id === currentStageId)
  );
  const completedCount = workflowResponse?.workflow?.completedSteps?.length ?? 0;
  const overallPct = Math.round((completedCount / STAGES.length) * 100);

  const handleSave = useCallback(
    async (data: Record<string, unknown>) => {
      if (!projectId) return;
      try {
        await apiRequest('POST', `/api/510k-workflow/${projectId}`, data);
        toast({ title: 'Progress saved', description: '510(k) workflow data saved.' });
      } catch {
        localStorage.setItem(`510k-workflow-${projectId}`, JSON.stringify(data));
        toast({
          title: 'Saved locally',
          description:
            'Server unavailable. Progress saved to local storage and will sync when the connection is restored.',
          variant: 'destructive',
        });
      }
    },
    [projectId, toast]
  );

  const handleComplete = useCallback(() => {
    toast({
      title: 'Workflow complete',
      description: '510(k) submission package is ready for review.',
    });
    onBackToProject?.();
  }, [toast, onBackToProject]);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden" data-testid="fda510k-workspace">
      {/* Header — back + title + view toggle */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-stone-100 bg-stone-50/50">
        {onBackToProject && (
          <>
            <button
              onClick={onBackToProject}
              className="text-[12px] text-stone-500 hover:text-stone-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40 rounded px-1"
            >
              &larr; Back to project
            </button>
            <span className="text-[12px] text-stone-300" aria-hidden="true">|</span>
          </>
        )}
        <span className="text-[12px] font-medium text-stone-700">
          510(k){projectName ? ` — ${projectName}` : ''}
        </span>

        <div
          className="ml-auto flex items-center gap-0.5 bg-stone-100/70 rounded p-0.5"
          role="tablist"
          aria-label="Workspace view"
        >
          <button
            role="tab"
            aria-selected={view === 'chat'}
            onClick={() => setView('chat')}
            className={cn(
              'px-2.5 py-1 text-[11px] rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40',
              view === 'chat'
                ? 'bg-white text-stone-800 shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            )}
            data-testid="fda510k-view-chat"
          >
            AI guide
          </button>
          <button
            role="tab"
            aria-selected={view === 'form'}
            onClick={() => setView('form')}
            className={cn(
              'px-2.5 py-1 text-[11px] rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40',
              view === 'form'
                ? 'bg-white text-stone-800 shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            )}
            data-testid="fda510k-view-form"
          >
            Structured form
          </button>
        </div>
      </div>

      {/* Slim progress strip — 7-stage overview */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-stone-100 bg-white">
        <span className="text-[11px] font-medium text-stone-700 whitespace-nowrap">
          Stage {currentStageIdx}: {STAGES[currentStageIdx]?.name ?? 'Setup'}
        </span>
        <div
          className="flex-1 flex items-center gap-1"
          role="progressbar"
          aria-valuenow={overallPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Overall 510(k) progress"
        >
          {STAGES.map((s, i) => (
            <div
              key={s.id}
              title={s.name}
              aria-label={s.name}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                i < currentStageIdx
                  ? 'bg-stone-600'
                  : i === currentStageIdx
                  ? 'bg-stone-400'
                  : 'bg-stone-100'
              )}
            />
          ))}
        </div>
        <span className="text-[11px] text-stone-500 tabular-nums whitespace-nowrap">
          {overallPct}%
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        <ErrorBoundary
          fallback={
            <div className="flex-1 p-8">
              <ErrorState
                title="510(k) workspace failed to load"
                message="An error occurred while rendering the workspace. Try refreshing the page."
                testId="fda510k-error"
              />
            </div>
          }
        >
          {view === 'chat' ? (
            <AnaPersistentPanel
              mode="full"
              contextProfile={{
                productType: 'device',
                screenName: '510k-workspace',
                activeProject: projectName,
                projectId,
                organizationId,
                moduleContext: {
                  submissionType: '510K',
                  currentStage: currentStageId,
                  completedSteps: workflowResponse?.workflow?.completedSteps ?? [],
                },
              }}
              greeting={`Ready to build the 510(k)${projectName ? ` for ${projectName}` : ''}. What would you like to work on?`}
              suggestedActions={SUGGESTED_ACTIONS}
            />
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <Enhanced510kIntakeWorkflow
                projectId={projectId}
                organizationId={organizationId}
                existingProject={projectName ? { name: projectName } : undefined}
                onSave={handleSave}
                onComplete={handleComplete}
              />
            </div>
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default FDA510kWorkspacePage;
