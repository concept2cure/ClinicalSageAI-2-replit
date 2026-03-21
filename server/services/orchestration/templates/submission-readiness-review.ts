/**
 * Workflow Template: Submission Readiness Review
 *
 * Multi-step workflow that:
 * 1. Inspects dossier/module/project state
 * 2. Inventories relevant documents and artifacts
 * 3. Identifies missing, weak, outdated, unvalidated, or unrouted content
 * 4. Runs validation where appropriate
 * 5. Produces a readiness summary with blockers and recommended actions
 */

import { registerWorkflowTemplate } from '../workflow-orchestrator';
import type { WorkflowTemplate } from '../../../../shared/types/orchestration';

const template: WorkflowTemplate = {
  templateId: 'submission_readiness_review',
  name: 'Submission Readiness Review',
  description:
    'Comprehensive review of project/submission readiness. Inspects all documents, artifacts, validations, and module placements to produce a readiness assessment with blockers and next actions.',
  estimatedDurationMinutes: 5,
  applicableModules: ['cmc', 'cer', 'ectd', '510k', 'ind', 'nda'],
  steps: [
    {
      stepId: 'inspect_project_state',
      name: 'Inspect project state',
      description: 'Gather project-level metadata, status, and progress.',
      actionType: 'orchestrator_logic',
      requiresApproval: false,
      stopOnFailure: true,
    },
    {
      stepId: 'inventory_documents',
      name: 'Inventory documents and artifacts',
      description: 'Catalog all documents and artifacts, noting status, module assignment, and version state.',
      actionType: 'orchestrator_logic',
      requiresApproval: false,
      stopOnFailure: false,
    },
    {
      stepId: 'identify_gaps',
      name: 'Identify gaps and weaknesses',
      description: 'Analyze for missing content, low scores, staleness, unvalidated items, and unrouted documents.',
      actionType: 'orchestrator_logic',
      requiresApproval: false,
      stopOnFailure: false,
    },
    {
      stepId: 'compute_readiness',
      name: 'Compute readiness assessment',
      description: 'Calculate overall readiness score, module-level breakdown, and compliance subscores.',
      actionType: 'orchestrator_logic',
      requiresApproval: false,
      stopOnFailure: false,
    },
    {
      stepId: 'generate_recommendations',
      name: 'Generate recommendations',
      description: 'Produce actionable next-step recommendations based on gaps and blockers.',
      actionType: 'orchestrator_logic',
      requiresApproval: false,
      stopOnFailure: false,
    },
  ],
};

registerWorkflowTemplate(template);

export default template;
