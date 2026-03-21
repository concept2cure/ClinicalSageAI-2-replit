/**
 * Workflow Template: Draft → Validate → Route
 *
 * Multi-step workflow that:
 * 1. Analyzes what content is missing or needs drafting
 * 2. Runs validation on existing or newly drafted content
 * 3. Exposes validation findings
 * 4. Allows or performs a revision pass where safe
 * 5. Routes output to the proper module location
 */

import { registerWorkflowTemplate } from '../workflow-orchestrator';
import type { WorkflowTemplate } from '../../../../shared/types/orchestration';

const template: WorkflowTemplate = {
  templateId: 'draft_validate_route',
  name: 'Draft, Validate & Route',
  description:
    'End-to-end content pipeline: identify what needs drafting, validate content, surface findings, run AI-assisted refinement, and route to the correct CTD module.',
  estimatedDurationMinutes: 10,
  applicableModules: ['cmc', 'cer', 'ectd', '510k', 'ind', 'nda'],
  steps: [
    {
      stepId: 'inspect_state',
      name: 'Inspect current state',
      description: 'Assess project and document state to determine what needs drafting.',
      actionType: 'orchestrator_logic',
      requiresApproval: false,
      stopOnFailure: true,
    },
    {
      stepId: 'prepare_draft_plan',
      name: 'Prepare draft plan',
      description: 'Identify documents that need creation, modules missing content, and unvalidated items.',
      actionType: 'orchestrator_logic',
      requiresApproval: false,
      stopOnFailure: false,
    },
    {
      stepId: 'run_validation_pass',
      name: 'Run validation',
      description: 'Execute validation on target documents to surface compliance findings.',
      actionType: 'run_validation',
      requiresApproval: false,
      stopOnFailure: false,
      timeoutMs: 60000,
    },
    {
      stepId: 'generate_recommendations',
      name: 'Generate refinement recommendations',
      description: 'Produce recommendations based on validation findings and gaps.',
      actionType: 'orchestrator_logic',
      requiresApproval: false,
      stopOnFailure: false,
    },
    {
      stepId: 'compile_results',
      name: 'Compile results',
      description: 'Aggregate all findings, drafted content, and routing recommendations.',
      actionType: 'orchestrator_logic',
      requiresApproval: false,
      stopOnFailure: false,
    },
  ],
};

registerWorkflowTemplate(template);

export default template;
