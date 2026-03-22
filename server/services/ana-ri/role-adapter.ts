/**
 * AnA RI — Role-Adaptive Response System
 *
 * Adapts AnA's output tone, emphasis, and structure based on the user's role.
 * The adaptation is silent — users don't see or select modes — but the output
 * is visibly tuned to their decision context.
 *
 * @module server/services/ana-ri/role-adapter
 */

import type { UserRole } from './persona.js';
import type { SubmissionType } from './deficiency-taxonomy.js';

// ─────────────────────────────────────────────────────────────────────────────
// Role-Specific Response Templates
// ─────────────────────────────────────────────────────────────────────────────

export interface RoleResponseTemplate {
  role: UserRole;
  /** What this role cares about most */
  priorities: string[];
  /** What to lead with in responses */
  leadWith: string;
  /** What to emphasize */
  emphasize: string[];
  /** What to de-emphasize */
  deemphasize: string[];
  /** Tone guidance */
  tone: string;
  /** Specific output sections to include for this role */
  specialSections: string[];
}

export const ROLE_TEMPLATES: Record<UserRole, RoleResponseTemplate> = {
  ceo: {
    role: 'ceo',
    priorities: ['program risk', 'timeline impact', 'investor narrative', 'board readiness'],
    leadWith: 'Risk exposure and strategic implications',
    emphasize: [
      'What threatens the program timeline or approval',
      'Investor-facing risk signals',
      'Competitive positioning implications',
      'Board-level decision points',
      'De-risking milestones and inflection points',
    ],
    deemphasize: [
      'Technical regulatory detail (summarize instead)',
      'Procedural steps (provide high-level timeline)',
      'Document-level edits (focus on strategic implications)',
    ],
    tone: 'Direct, executive-level. Use clear risk language. Avoid jargon that obscures decision-making.',
    specialSections: ['Program Risk Summary', 'Investor Signal', 'Timeline Impact', 'Board-Ready Summary'],
  },

  ra_lead: {
    role: 'ra_lead',
    priorities: ['submission defensibility', 'pathway logic', 'agency interaction', 'procedural compliance'],
    leadWith: 'Regulatory defensibility assessment',
    emphasize: [
      'Specific regulatory citations and cross-references',
      'Agency precedent and review history',
      'Procedural compliance gaps',
      'Pre-submission meeting strategy',
      'Multi-region submission harmonization',
    ],
    deemphasize: [
      'Business strategy (they know it)',
      'Basic regulatory education (they are experts)',
    ],
    tone: 'Precise, collegial between experts. Use proper regulatory terminology. Expect sophistication.',
    specialSections: ['Regulatory Assessment', 'Submission Readiness', 'Agency Interaction Strategy', 'Cross-Reference Check'],
  },

  medical_writer: {
    role: 'medical_writer',
    priorities: ['narrative quality', 'section architecture', 'argument flow', 'regulatory prose standards'],
    leadWith: 'Narrative assessment and concrete improvements',
    emphasize: [
      'Specific text improvements with before/after',
      'Section structure and information flow',
      'Tone and voice consistency',
      'Evidence integration quality',
      'Regulatory prose conventions',
    ],
    deemphasize: [
      'High-level strategy (focus on the document)',
      'Business implications',
    ],
    tone: 'Constructive, craft-focused. Show improvements rather than just critiquing. Treat writing as a discipline.',
    specialSections: ['Narrative Assessment', 'Section Architecture', 'Rewrite Recommendations', 'Style Notes'],
  },

  clinical_lead: {
    role: 'clinical_lead',
    priorities: ['endpoint defensibility', 'protocol design', 'safety narrative', 'statistical rigor'],
    leadWith: 'Clinical evidence strength and endpoint defensibility',
    emphasize: [
      'Endpoint selection rationale and regulatory precedent',
      'Protocol design considerations',
      'Safety signal characterization',
      'Efficacy argument hierarchy',
      'Comparator and control strategy',
    ],
    deemphasize: [
      'Administrative regulatory details',
      'Manufacturing and CMC aspects',
    ],
    tone: 'Scientific, evidence-focused. Connect clinical decisions to regulatory consequences.',
    specialSections: ['Clinical Evidence Assessment', 'Endpoint Analysis', 'Safety Narrative', 'Statistical Defensibility'],
  },

  cmc_lead: {
    role: 'cmc_lead',
    priorities: ['control strategy', 'process validation', 'specification justification', 'manufacturing risk'],
    leadWith: 'CMC defensibility and control strategy coherence',
    emphasize: [
      'Control strategy completeness',
      'Process validation adequacy',
      'Specification rationale and justification',
      'Comparability and analytical bridging',
      'Supply chain and manufacturing risk',
    ],
    deemphasize: [
      'Clinical development details',
      'Nonclinical aspects (unless relevant to CMC)',
    ],
    tone: 'Technical, quality-focused. Reference ICH Q guidelines. Focus on Module 3 defensibility.',
    specialSections: ['CMC Assessment', 'Control Strategy Review', 'Specification Analysis', 'Manufacturing Risk'],
  },

  investor: {
    role: 'investor',
    priorities: ['regulatory probability', 'timeline realism', 'hidden risks', 'competitive landscape'],
    leadWith: 'Probability of regulatory success and key risks',
    emphasize: [
      'Probability of approval assessment',
      'Hidden regulatory risks that may not be obvious',
      'Timeline realism vs management projections',
      'Competitive regulatory landscape',
      'De-risking milestones',
      'Precedent analysis for similar products',
    ],
    deemphasize: [
      'Document-level details',
      'Procedural regulatory steps',
    ],
    tone: 'Candid, analytical. Be honest about both strengths and weaknesses. Flag what the pitch deck might not mention.',
    specialSections: ['Regulatory Probability', 'Risk Profile', 'Timeline Reality Check', 'Competitive Intelligence'],
  },

  general: {
    role: 'general',
    priorities: ['comprehensive coverage', 'accessibility', 'actionable guidance'],
    leadWith: 'Clear assessment with actionable recommendations',
    emphasize: [
      'Balanced strategic and tactical guidance',
      'Clear explanations of regulatory concepts',
      'Specific next steps',
    ],
    deemphasize: [],
    tone: 'Professional, helpful, thorough. Balance depth with accessibility.',
    specialSections: ['Overall Assessment', 'Key Findings', 'Recommendations'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Context Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build role-adaptive context for the system prompt.
 */
export function buildRoleAdaptiveContext(
  role: UserRole,
  submissionType: SubmissionType | null
): string {
  const template = ROLE_TEMPLATES[role];

  const lines: string[] = [
    `## ROLE-ADAPTIVE OUTPUT GUIDANCE`,
    '',
    `**User Role:** ${role.replace('_', ' ').toUpperCase()}`,
    `**Lead with:** ${template.leadWith}`,
    `**Tone:** ${template.tone}`,
    '',
    '**Emphasize:**',
    ...template.emphasize.map(e => `- ${e}`),
    '',
  ];

  if (template.deemphasize.length > 0) {
    lines.push('**De-emphasize:**');
    lines.push(...template.deemphasize.map(d => `- ${d}`));
    lines.push('');
  }

  lines.push('**Include these sections when relevant:**');
  lines.push(...template.specialSections.map(s => `- ${s}`));

  // Add role-specific output structure instructions
  lines.push('');
  lines.push('**Output structure for this role:**');
  switch (role) {
    case 'ceo':
      lines.push('- Lead with a one-line risk verdict (green/yellow/red signal)');
      lines.push('- Use executive summary format — no more than 3 paragraphs before action items');
      lines.push('- Include a "Board-Ready Summary" section that could be pasted into a board deck');
      lines.push('- Quantify risks where possible: probability, timeline impact, cost exposure');
      lines.push('- End with "CEO Decision Required" items if applicable');
      break;
    case 'ra_lead':
      lines.push('- Lead with regulatory defensibility assessment (strong/adequate/weak/deficient)');
      lines.push('- Cite specific regulatory references (21 CFR, ICH, guidance documents) inline');
      lines.push('- Include a "Regulatory Cross-Reference" table mapping claims to citations');
      lines.push('- Flag submission readiness gaps with specific remediation steps');
      lines.push('- Use regulatory terminology precisely — do not simplify for non-experts');
      break;
    case 'medical_writer':
      lines.push('- Lead with narrative quality assessment (structure, flow, persuasion)');
      lines.push('- Show concrete before/after text comparisons for every critique');
      lines.push('- Include a "Section Architecture" analysis with recommended restructuring');
      lines.push('- Identify tone inconsistencies and provide corrected language');
      lines.push('- End with a "Rewrite Priority" list ordered by impact on reviewer perception');
      break;
    case 'clinical_lead':
      lines.push('- Lead with endpoint defensibility assessment');
      lines.push('- Include a "Clinical Evidence Map" showing strength of each claim');
      lines.push('- Flag statistical defensibility issues with specific concerns');
      lines.push('- Connect every recommendation to its regulatory consequence');
      lines.push('- Include "Safety Narrative" section addressing signal characterization');
      break;
    case 'cmc_lead':
      lines.push('- Lead with control strategy coherence assessment');
      lines.push('- Include Module 3 section references for every finding');
      lines.push('- Map each concern to specific ICH Q guidelines (Q1-Q12)');
      lines.push('- Include "Specification Justification" analysis if relevant');
      lines.push('- Flag comparability/bridging gaps that could delay approval');
      break;
    case 'investor':
      lines.push('- Lead with a probability-of-success assessment (high/medium/low with rationale)');
      lines.push('- Include "Hidden Risk" section covering what management presentations may omit');
      lines.push('- Add "Timeline Reality Check" comparing claimed vs realistic timelines');
      lines.push('- Include competitive regulatory landscape context');
      lines.push('- End with "Due Diligence Red Flags" and "De-Risking Milestones"');
      break;
    default:
      lines.push('- Use balanced structure with both strategic overview and actionable detail');
      break;
  }

  return lines.join('\n');
}

/**
 * Get the role template for a given role.
 */
export function getRoleTemplate(role: UserRole): RoleResponseTemplate {
  return ROLE_TEMPLATES[role];
}

/**
 * Infer user role from contextual signals.
 */
export function inferRole(signals: {
  screenName?: string;
  title?: string;
  department?: string;
  recentActions?: string[];
}): UserRole {
  const { screenName, title, department } = signals;

  // Screen-based inference
  if (screenName) {
    const s = screenName.toLowerCase();
    if (s.includes('cmc')) return 'cmc_lead';
    if (s.includes('clinical') || s.includes('biostat')) return 'clinical_lead';
    if (s.includes('author') || s.includes('document-builder')) return 'medical_writer';
    if (s.includes('command-center')) return 'ceo';
  }

  // Title-based inference
  if (title) {
    const t = title.toLowerCase();
    if (t.includes('ceo') || t.includes('chief') || t.includes('president') || t.includes('founder')) return 'ceo';
    if (t.includes('regulatory') || t.includes('ra ')) return 'ra_lead';
    if (t.includes('writer') || t.includes('writing')) return 'medical_writer';
    if (t.includes('clinical')) return 'clinical_lead';
    if (t.includes('cmc') || t.includes('quality') || t.includes('manufacturing')) return 'cmc_lead';
    if (t.includes('invest') || t.includes('analyst') || t.includes('diligence')) return 'investor';
  }

  // Department-based inference
  if (department) {
    const d = department.toLowerCase();
    if (d.includes('regulatory')) return 'ra_lead';
    if (d.includes('clinical')) return 'clinical_lead';
    if (d.includes('cmc') || d.includes('quality')) return 'cmc_lead';
    if (d.includes('medical writing')) return 'medical_writer';
  }

  return 'general';
}
