/**
 * WorkflowRunner — Execute and track multi-step orchestration workflows.
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useWorkflowExecution,
  useWorkflowTemplates,
} from '../../hooks/useOrchestration';
import type { WorkflowExecution } from '../../hooks/useOrchestration';

interface WorkflowRunnerProps {
  projectId: number;
  module?: string;
  onComplete?: (execution: WorkflowExecution) => void;
}

const STEP_STATUS_STYLES: Record<string, { bg: string; icon: string }> = {
  pending: { bg: 'bg-stone-200 icon: '○' },
  running: { bg: 'bg-stone-600', icon: '◉' },
  completed: { bg: 'bg-stone-900', icon: '✓' },
  failed: { bg: 'bg-stone-900', icon: '✗' },
  skipped: { bg: 'bg-stone-400', icon: '–' },
};

export function WorkflowRunner({ projectId, module, onComplete }: WorkflowRunnerProps) {
  const { data: templateData } = useWorkflowTemplates();
  const { execute, cancel, reset, execution, isRunning, error } = useWorkflowExecution();
  const [selectedTemplate, setSelectedTemplate] = useState<string>('submission_readiness_review');

  const templates = templateData?.templates || [];

  async function handleRun() {
    const result = await execute({
      templateId: selectedTemplate,
      projectId,
      module,
    });
    if (result && onComplete) {
      onComplete(result);
    }
  }

  return (
    <div className="space-y-4">
      {/* Template selector + run button */}
      {!execution && (
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Workflow
            </label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="w-full h-9 text-sm">
                <SelectValue placeholder="Select workflow" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.templateId} value={t.templateId}>
                    {t.name} ({t.stepCount} steps, ~{t.estimatedDurationMinutes}m)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleRun}
            disabled={isRunning}
          >
            {isRunning ? 'Running...' : 'Run Workflow'}
          </Button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="p-3 rounded-md bg-stone-100 border border-stone-200 text-stone-800 text-sm">
          {error}
        </div>
      )}

      {/* Execution progress */}
      {execution && (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-stone-900">
                {execution.templateId.replace(/_/g, ' ')}
              </h4>
              <p className="text-xs text-stone-500">
                {execution.status === 'running'
                  ? `Step ${execution.currentStepIndex + 1}/${execution.steps.length}`
                  : execution.status}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {execution.status === 'running' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cancel(execution.executionId)}
                  className="text-xs"
                >
                  Cancel
                </Button>
              )}
              {(execution.status === 'completed' || execution.status === 'failed') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reset}
                  className="text-xs"
                >
                  New Run
                </Button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 rounded-full bg-stone-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                execution.status === 'failed' ? 'bg-stone-900' : 'bg-stone-600'
              }`}
              style={{ width: `${execution.progressPercent}%` }}
            />
          </div>

          {/* Steps */}
          <div className="space-y-1">
            {execution.steps.map((step, i) => {
              const style = STEP_STATUS_STYLES[step.status] || STEP_STATUS_STYLES.pending;
              return (
                <div
                  key={step.stepId}
                  className="flex items-center gap-2 py-1"
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs text-white ${style.bg}`}>
                    {step.status === 'running' ? (
                      <span className="animate-pulse">{style.icon}</span>
                    ) : (
                      style.icon
                    )}
                  </span>
                  <span className={`text-sm ${step.status === 'completed' ? 'text-stone-600 : 'text-stone-900
                    {step.name}
                  </span>
                  {step.durationMs && (
                    <span className="text-xs text-stone-400 ml-auto">
                      {(step.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  {step.errors && step.errors.length > 0 && (
                    <span className="text-xs text-stone-900 ml-auto">
                      {step.errors[0].message}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Result summary */}
          {execution.result && (
            <div className="mt-3 p-3 rounded-lg bg-stone-50 border border-stone-200">
              <p className="text-sm text-stone-700">
                {execution.result.summary}
              </p>
              {execution.result.blockers.length > 0 && (
                <div className="mt-2">
                  <span className="text-xs font-medium text-stone-500">
                    {execution.result.blockers.length} blocker(s) found
                  </span>
                </div>
              )}
              {execution.totalDurationMs && (
                <p className="text-xs text-stone-400 mt-1">
                  Completed in {(execution.totalDurationMs / 1000).toFixed(1)}s
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
