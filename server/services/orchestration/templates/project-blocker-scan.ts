/**
 * Workflow Template: Project Blocker Scan
 *
 * Multi-step workflow that:
 * 1. Inspects project tasks, validations, document states, and routing gaps
 * 2. Summarizes top blockers
 * 3. Recommends next best actions
 * 4. Produces a prioritized blocker report
 */

import { registerWorkflowTemplate } from '../workflow-orchestrator';
import type { WorkflowTemplate } from '../../../../shared/types/orchestration';

const template: WorkflowTemplate = {
  templateId: 'project_blocker_scan',
  name: 'Project Blocker Scan',
  description:
    'Scans across all project objects — tasks, documents, validations, module placements — to identify and prioritize blockers, then recommends next actions.',
  estimatedDurationMinutes: 3,
  applicableModules: ['cmc', 'cer', 'ectd', '510k', 'ind', 'nda', 'vault'],
  steps: [
    {
      stepId: 'inspect_state',
      name: 'Inspect project state',
      description: 'Gather comprehensive project state from all object types.',
      actionType: 'orchestrator_logic',
      requiresApproval: false,
      stopOnFailure: true,
    },
    {
      stepId: 'scan_blockers',
      name: 'Scan for blockers',
      description: 'Analyze tasks, validations, document states, and routing gaps for blocking issues.',
      actionType: 'orchestrator_logic',
      requiresApproval: false,
      stopOnFailure: false,
    },
    {
      stepId: 'summarize_blockers',
      name: 'Summarize and prioritize',
      description: 'Compile blocker summary with severity ranking and recommended resolutions.',
      actionType: 'orchestrator_logic',
      requiresApproval: false,
      stopOnFailure: false,
    },
    {
      stepId: 'generate_recommendations',
      name: 'Generate next actions',
      description: 'Produce prioritized next-best-action recommendations.',
      actionType: 'orchestrator_logic',
      requiresApproval: false,
      stopOnFailure: false,
    },
  ],
};

registerWorkflowTemplate(template);

export default template;
