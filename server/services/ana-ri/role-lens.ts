/**
 * Role lens — frame the enrichment for the audience.
 *
 * persona.ts carries a role overlay that shapes AnA's identity for the turn.
 * This module is narrower and works on the enrichment packs specifically: when
 * AnA is about to deliver industry wisdom, a challenge, a decision framework,
 * an orientation, or agency tactics, the same content should LAND differently
 * for a CEO than for a regulatory-affairs lead than for an investor.
 *
 * The lens does not change what is true; it changes what leads, what gets
 * emphasis, and what detail is kept versus compressed.
 *
 * Read by:
 *   - context-enrichment.ts (appended once when a role is known and at least
 *     one pack block fired this turn)
 *
 * NOT a prompt template. Structured data; the builder emits Markdown.
 * Tone floor (enforced by ana-ri.test.ts): no emoji, no exclamation marks.
 *
 * @module server/services/ana-ri/role-lens
 */

import type { UserRole } from './persona.js';

interface RoleLens {
  audience: string;
  /** What to lead with and emphasize for this audience. */
  emphasize: string;
  /** What to compress or hold back for this audience. */
  compress: string;
}

const ROLE_LENSES: Record<Exclude<UserRole, 'general'>, RoleLens> = {
  ceo: {
    audience: 'a biotech CEO',
    emphasize:
      'the decision, the timeline impact, the cost, and the go/no-go — lead with the bottom line and what it means for the program and the board narrative',
    compress: 'procedural detail and citations, unless one is the crux of the decision',
  },
  ra_lead: {
    audience: 'a regulatory-affairs lead',
    emphasize:
      'precedent, defensibility, procedural sequencing, and exact citations — assume sophistication and expect them to push back',
    compress: 'background explanation of concepts they already own',
  },
  medical_writer: {
    audience: 'a medical writer',
    emphasize:
      'section architecture, argument flow, and concrete text — show the rewrite, not just the critique',
    compress: 'program-level strategy that does not change the words on the page',
  },
  clinical_lead: {
    audience: 'a clinical lead',
    emphasize:
      'endpoint rationale, protocol defensibility, the safety and efficacy argument, and how the clinical evidence ties to regulatory consequence',
    compress: 'CMC and manufacturing detail that is not gating the clinical question',
  },
  cmc_lead: {
    audience: 'a CMC lead',
    emphasize:
      'control strategy, comparability, specification rationale, and Module 3 defensibility',
    compress: 'clinical narrative that does not bear on the manufacturing question',
  },
  investor: {
    audience: 'an investor or due-diligence analyst',
    emphasize:
      'probability of approval, timeline realism, the fragility of each claim, and the de-risking milestones with dates — be honest about what is strong and what is weak',
    compress: 'operational and authoring detail that does not move the risk profile',
  },
};

/**
 * Build a one-paragraph audience-framing directive for the enrichment packs.
 * Returns '' for the general role (no specific lens) or an unknown role.
 */
export function buildRoleLensBlock(role: UserRole): string {
  if (role === 'general') return '';
  const lens = ROLE_LENSES[role as Exclude<UserRole, 'general'>];
  if (!lens) return '';
  return (
    `\n\n## Audience lens — frame this for ${lens.audience}\n` +
    `The wisdom, challenge, framework, orientation, or tactics in this context are for ${lens.audience}. ` +
    `When you deliver them, emphasize ${lens.emphasize}. Compress ${lens.compress}. ` +
    'The substance does not change for the audience — only what leads and what gets the detail.'
  );
}

export function hasRoleLens(role: UserRole | undefined): boolean {
  return !!role && role !== 'general' && role in ROLE_LENSES;
}
