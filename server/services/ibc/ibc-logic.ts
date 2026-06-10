/**
 * IBC deterministic logic (Capability C2C-07)
 *
 * Pure, DB-free, LLM-free: the risk-group → minimum-BSL mapping, the containment-
 * adequacy gate, the convened-review requirement, and annual-review expiration.
 * Grounded in the NIH Guidelines and the CDC/NIH BMBL; each finding cites its basis.
 *
 * @module server/services/ibc/ibc-logic
 */

import type { BiosafetyLevel, RiskGroup, NihGuidelinesSection } from '../../../shared/schema/ibc';
import { addYears } from '../iacuc/iacuc-logic';

const BSL_RANK: Record<BiosafetyLevel, number> = { 'BSL-1': 1, 'BSL-2': 2, 'BSL-3': 3, 'BSL-4': 4 };
const RG_TO_BSL: Record<RiskGroup, BiosafetyLevel> = { RG1: 'BSL-1', RG2: 'BSL-2', RG3: 'BSL-3', RG4: 'BSL-4' };

/** Risk groups (RG1-4) with the minimum containment they require. BMBL / NIH Guidelines. */
export const RISK_GROUPS: Array<{ riskGroup: RiskGroup; minimumBsl: BiosafetyLevel; description: string; citation: string }> = [
  { riskGroup: 'RG1', minimumBsl: 'BSL-1', description: 'Agents not associated with disease in healthy adults.', citation: 'NIH Guidelines Appendix B-I; BMBL' },
  { riskGroup: 'RG2', minimumBsl: 'BSL-2', description: 'Agents associated with human disease, rarely serious; interventions often available.', citation: 'NIH Guidelines Appendix B-II; BMBL' },
  { riskGroup: 'RG3', minimumBsl: 'BSL-3', description: 'Agents associated with serious/lethal disease; interventions may be available.', citation: 'NIH Guidelines Appendix B-III; BMBL' },
  { riskGroup: 'RG4', minimumBsl: 'BSL-4', description: 'Agents likely to cause serious/lethal disease; interventions usually unavailable.', citation: 'NIH Guidelines Appendix B-IV; BMBL' },
];

/** Minimum BSL required for a risk group. Pure. */
export function minimumBslForRiskGroup(rg: RiskGroup): BiosafetyLevel {
  return RG_TO_BSL[rg];
}

export type IbcFindingSeverity = 'critical' | 'major' | 'minor';
export type IbcRiskFlag = 'high' | 'medium' | 'low';

export interface IbcFinding {
  severity: IbcFindingSeverity;
  message: string;
  basis: string;
}

export interface IbcCompletenessInput {
  declaredBsl: BiosafetyLevel;
  nihGuidelinesSection: NihGuidelinesSection;
  involvesHumanGeneTransfer: boolean;
  agents: Array<{ agentName: string; riskGroup: RiskGroup; requiredBsl: BiosafetyLevel }>;
}

/**
 * Containment-adequacy gate. The declared BSL must meet or exceed the highest
 * containment any agent requires; each agent's required BSL must match its risk
 * group; III-A/B/C and human gene transfer require convened IBC review. Pure —
 * cited findings + risk flag.
 */
export function evaluateContainment(p: IbcCompletenessInput): { findings: IbcFinding[]; riskLevel: IbcRiskFlag; highestRequiredBsl: BiosafetyLevel } {
  const findings: IbcFinding[] = [];
  let highest: BiosafetyLevel = 'BSL-1';

  if (p.agents.length === 0) {
    findings.push({ severity: 'major', message: 'No biological agents are registered.', basis: 'NIH Guidelines Section III; IBC registration' });
  }

  for (const a of p.agents) {
    const expected = minimumBslForRiskGroup(a.riskGroup);
    if (BSL_RANK[a.requiredBsl] < BSL_RANK[expected]) {
      findings.push({ severity: 'major', message: `Agent "${a.agentName}" (${a.riskGroup}) is registered at ${a.requiredBsl} but ${a.riskGroup} requires at least ${expected}.`, basis: 'NIH Guidelines Appendix B; BMBL' });
    }
    const effective = BSL_RANK[a.requiredBsl] >= BSL_RANK[expected] ? a.requiredBsl : expected;
    if (BSL_RANK[effective] > BSL_RANK[highest]) highest = effective;
  }

  if (BSL_RANK[p.declaredBsl] < BSL_RANK[highest]) {
    findings.push({
      severity: 'critical',
      message: `Declared containment ${p.declaredBsl} is below the ${highest} required by the registered agents.`,
      basis: 'NIH Guidelines Appendix B; BMBL containment',
    });
  }

  const requiresConvened = ['III-A', 'III-B', 'III-C'].includes(p.nihGuidelinesSection) || p.involvesHumanGeneTransfer;
  if (requiresConvened) {
    findings.push({
      severity: 'minor',
      message: 'This work (NIH Guidelines III-A/B/C or human gene transfer) requires review and approval by the convened IBC before initiation.',
      basis: 'NIH Guidelines Section III-A/B/C',
    });
  }

  const riskLevel: IbcRiskFlag = findings.some((f) => f.severity === 'critical')
    ? 'high'
    : findings.some((f) => f.severity === 'major')
      ? 'medium'
      : 'low';
  return { findings, riskLevel, highestRequiredBsl: highest };
}

/** Whether approval needs a convened-quorum vote. Pure. */
export function requiresConvenedReview(section: NihGuidelinesSection, involvesHumanGeneTransfer: boolean): boolean {
  return ['III-A', 'III-B', 'III-C'].includes(section) || involvesHumanGeneTransfer;
}

/**
 * Registration expiration. NIH Guidelines require at least annual review of
 * active registrations; approval sets a 1-year expiration. Pure.
 */
export function registrationExpiration(approvalDate: string | null, today: string): { expirationDate: string | null; expired: boolean } {
  if (!approvalDate) return { expirationDate: null, expired: false };
  const expiration = addYears(approvalDate, 1);
  return { expirationDate: expiration, expired: today >= expiration };
}
