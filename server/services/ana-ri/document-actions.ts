/**
 * AnA RI — Document Consequence Action Map
 *
 * Every meaningful AnA interaction must produce a governed document artifact.
 * This module defines the action types, templates, and hooks for artifact generation.
 *
 * @module server/services/ana-ri/document-actions
 */

import type { IntentLens } from './persona.js';

// ─────────────────────────────────────────────────────────────────────────────
// Document Action Types
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentActionType =
  | 'risk_memo'
  | 'deficiency_preemption_memo'
  | 'evidence_memo'
  | 'strategy_note'
  | 'reviewer_question_brief'
  | 'rewritten_section'
  | 'revised_artifact'
  | 'attach_to_dossier';

export interface DocumentAction {
  type: DocumentActionType;
  label: string;
  description: string;
  icon: string;
  /** Template structure for the artifact */
  template: ActionArtifactOutline;
  /** When this action is most relevant */
  relevantLenses: IntentLens[];
}

/* Was `DocumentTemplate` — the fourth export of that name in server/services,
   each a different shape. This one is neither a registry nor a catalog: it is
   the heading outline an AnA quick-action scaffolds its artifact from, local to
   this file. Named for what it is so a reader who greps the noun lands on the
   module that owns it (intelligence/template-registry.ts). */
export interface ActionArtifactOutline {
  title: string;
  sections: Array<{
    heading: string;
    description: string;
    required: boolean;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Definitions
// ─────────────────────────────────────────────────────────────────────────────

export const DOCUMENT_ACTIONS: Record<DocumentActionType, DocumentAction> = {
  risk_memo: {
    type: 'risk_memo',
    label: 'Create Risk Memo',
    description: 'Generate a severity-ranked regulatory risk assessment with mitigations',
    icon: 'AlertTriangle',
    relevantLenses: ['audit', 'risk', 'auto'],
    template: {
      title: 'Regulatory Risk Assessment Memo',
      sections: [
        { heading: 'Executive Summary', description: 'One-paragraph risk overview', required: true },
        { heading: 'Critical Risks', description: 'Severity: Critical — Must address before submission', required: true },
        { heading: 'Major Risks', description: 'Severity: Major — Should address, may trigger deficiency', required: true },
        { heading: 'Minor Risks', description: 'Severity: Minor — Addressable in response', required: false },
        { heading: 'Mitigation Strategy', description: 'Specific actions to reduce each risk', required: true },
        { heading: 'Evidence Gaps', description: 'Missing data that creates vulnerability', required: true },
        { heading: 'Timeline Impact', description: 'How risks affect submission timeline', required: false },
        { heading: 'Recommendation', description: 'Go/no-go assessment with conditions', required: true },
      ],
    },
  },

  deficiency_preemption_memo: {
    type: 'deficiency_preemption_memo',
    label: 'Create Deficiency Preemption Memo',
    description: 'Anticipate likely reviewer questions and prepare evidence-backed responses',
    icon: 'Shield',
    relevantLenses: ['audit', 'risk', 'auto'],
    template: {
      title: 'Deficiency Preemption Memo',
      sections: [
        { heading: 'Submission Context', description: 'Product, pathway, and submission stage', required: true },
        { heading: 'Anticipated Deficiencies', description: 'Ranked list of likely reviewer objections', required: true },
        { heading: 'Prepared Responses', description: 'Evidence-backed response for each anticipated deficiency', required: true },
        { heading: 'Supporting Evidence Inventory', description: 'Available evidence mapped to each response', required: true },
        { heading: 'Evidence Gaps', description: 'Responses that lack sufficient supporting data', required: true },
        { heading: 'Recommended Pre-Submission Actions', description: 'Steps to strengthen position before submission', required: true },
      ],
    },
  },

  evidence_memo: {
    type: 'evidence_memo',
    label: 'Create Evidence Memo',
    description: 'Map what evidence exists, what is missing, and what needs strengthening',
    icon: 'FileSearch',
    relevantLenses: ['audit', 'improve', 'compare', 'auto'],
    template: {
      title: 'Evidence Assessment Memo',
      sections: [
        { heading: 'Evidence Overview', description: 'Summary of available evidence and its strength', required: true },
        { heading: 'Strong Evidence', description: 'Well-supported claims with robust data', required: true },
        { heading: 'Weak Evidence', description: 'Claims with insufficient or marginal support', required: true },
        { heading: 'Missing Evidence', description: 'Gaps where no supporting data exists', required: true },
        { heading: 'Evidence Quality Assessment', description: 'KNOWN vs INFERRED vs MISSING classification', required: true },
        { heading: 'Strengthening Recommendations', description: 'Actions to improve evidence package', required: true },
      ],
    },
  },

  strategy_note: {
    type: 'strategy_note',
    label: 'Create Strategy Note',
    description: 'Regulatory pathway recommendation with argument hierarchy',
    icon: 'Target',
    relevantLenses: ['strategy', 'risk', 'auto'],
    template: {
      title: 'Regulatory Strategy Note',
      sections: [
        { heading: 'Strategic Assessment', description: 'Current position and pathway analysis', required: true },
        { heading: 'Recommended Pathway', description: 'Optimal regulatory route with justification', required: true },
        { heading: 'Argument Hierarchy', description: 'Priority ordering of regulatory arguments', required: true },
        { heading: 'Agency-Specific Considerations', description: 'FDA vs EMA vs other agency nuances', required: false },
        { heading: 'Timeline and Milestones', description: 'Key dates and dependencies', required: true },
        { heading: 'Risk-Benefit Positioning', description: 'How to frame the benefit-risk argument', required: true },
        { heading: 'Competitive Context', description: 'Regulatory landscape for similar products', required: false },
      ],
    },
  },

  reviewer_question_brief: {
    type: 'reviewer_question_brief',
    label: 'Create Reviewer Question Brief',
    description: 'Likely reviewer questions with evidence-backed answers',
    icon: 'HelpCircle',
    relevantLenses: ['audit', 'risk', 'auto'],
    template: {
      title: 'Reviewer Question Anticipation Brief',
      sections: [
        { heading: 'Context', description: 'Submission type, stage, and key issues', required: true },
        { heading: 'High-Priority Questions', description: 'Most likely reviewer questions with prepared answers', required: true },
        { heading: 'Medium-Priority Questions', description: 'Possible but less likely questions', required: true },
        { heading: 'Supporting Data References', description: 'Where to find evidence for each answer', required: true },
        { heading: 'Response Strategy', description: 'Tone and approach for addressing each question type', required: true },
      ],
    },
  },

  rewritten_section: {
    type: 'rewritten_section',
    label: 'Rewrite Section',
    description: 'Rewrite a document section to be submission-defensible',
    icon: 'PenTool',
    relevantLenses: ['improve', 'audit', 'auto'],
    template: {
      title: 'Section Rewrite',
      sections: [
        { heading: 'Original Assessment', description: 'What is wrong with the current version', required: true },
        { heading: 'Rewritten Section', description: 'The improved, submission-defensible version', required: true },
        { heading: 'Change Rationale', description: 'Why each change was made', required: true },
        { heading: 'Remaining Issues', description: 'What still needs attention beyond the rewrite', required: false },
      ],
    },
  },

  revised_artifact: {
    type: 'revised_artifact',
    label: 'Revise Document',
    description: 'Produce a revised version of the complete document or section',
    icon: 'FileEdit',
    relevantLenses: ['improve', 'audit', 'auto'],
    template: {
      title: 'Revised Document',
      sections: [
        { heading: 'Revision Summary', description: 'What was changed and why', required: true },
        { heading: 'Revised Content', description: 'The complete revised document or section', required: true },
        { heading: 'Tracked Changes', description: 'Key differences from original', required: true },
      ],
    },
  },

  attach_to_dossier: {
    type: 'attach_to_dossier',
    label: 'Attach to Dossier',
    description: 'Save this analysis as a governed document in the project dossier',
    icon: 'FolderPlus',
    relevantLenses: ['audit', 'improve', 'risk', 'strategy', 'compare', 'auto'],
    template: {
      title: 'Dossier Attachment',
      sections: [
        { heading: 'Document Classification', description: 'Type and purpose of the attached document', required: true },
        { heading: 'Content', description: 'The document content to attach', required: true },
        { heading: 'Metadata', description: 'Author, date, version, status', required: true },
      ],
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Context Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the document action context for the system prompt.
 * Tells AnA what document actions are available and when to use them.
 */
export function buildDocumentActionContext(lens: IntentLens): string {
  const relevantActions = Object.values(DOCUMENT_ACTIONS).filter(
    action => action.relevantLenses.includes(lens) || action.relevantLenses.includes('auto')
  );

  const lines: string[] = [
    '## AVAILABLE DOCUMENT ACTIONS',
    '',
    'At the end of every substantive response, recommend one or more of these document actions:',
    '',
  ];

  for (const action of relevantActions) {
    lines.push(`- **${action.label}**: ${action.description}`);
  }

  lines.push('');
  lines.push('When recommending actions, format them as:');
  lines.push('');
  lines.push('---');
  lines.push('**Recommended Actions:**');
  for (const action of relevantActions.slice(0, 3)) {
    lines.push(`- [ ] ${action.label} — ${action.description}`);
  }

  return lines.join('\n');
}

/**
 * Get document actions relevant to a specific intent lens.
 */
export function getActionsForLens(lens: IntentLens): DocumentAction[] {
  return Object.values(DOCUMENT_ACTIONS).filter(
    action => action.relevantLenses.includes(lens) || action.relevantLenses.includes('auto')
  );
}

/**
 * Get all available document actions.
 */
export function getAllActions(): DocumentAction[] {
  return Object.values(DOCUMENT_ACTIONS);
}

/**
 * Get a specific document action by type.
 */
export function getAction(type: DocumentActionType): DocumentAction {
  return DOCUMENT_ACTIONS[type];
}
