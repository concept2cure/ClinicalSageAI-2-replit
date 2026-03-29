/**
 * WorkflowRunner — Execute and track multi-step orchestration workflows.
 */
import React, { useState } from 'react';
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
  pending: { bg: 'bg-gray-200 dark:bg-gray-700', icon: '○' },
  running: { bg: 'bg-stone-600', icon: '◉' },
  completed: { bg: 'bg-green-500', icon: '✓' },
  failed: { bg: 'bg-red-500', icon: '✗' },
  skipped: { bg: 'bg-gray-400', icon: '–' },
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
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Workflow
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-2 text-gray-900 dark:text-gray-100"
            >
              {templates.map((t) => (
                <option key={t.templateId} value={t.templateId}>
                  {t.name} ({t.stepCount} steps, ~{t.estimatedDurationMinutes}m)
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="px-4 py-2 rounded-md bg-stone-700 text-white text-sm font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? 'Running...' : 'Run Workflow'}
          </button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Execution progress */}
      {execution && (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {execution.templateId.replace(/_/g, ' ')}
              </h4>
              <p className="text-xs text-gray-500">
                {execution.status === 'running'
                  ? `Step ${execution.currentStepIndex + 1}/${execution.steps.length}`
                  : execution.status}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {execution.status === 'running' && (
                <button
                  onClick={() => cancel(execution.executionId)}
                  className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              )}
              {(execution.status === 'completed' || execution.status === 'failed') && (
                <button
                  onClick={reset}
                  className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  New Run
                </button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                execution.status === 'failed' ? 'bg-red-500' : 'bg-stone-600'
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
                  <span className={`text-sm ${step.status === 'completed' ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                    {step.name}
                  </span>
                  {step.durationMs && (
                    <span className="text-xs text-gray-400 ml-auto">
                      {(step.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  {step.errors && step.errors.length > 0 && (
                    <span className="text-xs text-red-500 ml-auto">
                      {step.errors[0].message}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Result summary */}
          {execution.result && (
            <div className="mt-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {execution.result.summary}
              </p>
              {execution.result.blockers.length > 0 && (
                <div className="mt-2">
                  <span className="text-xs font-medium text-gray-500">
                    {execution.result.blockers.length} blocker(s) found
                  </span>
                </div>
              )}
              {execution.totalDurationMs && (
                <p className="text-xs text-gray-400 mt-1">
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
