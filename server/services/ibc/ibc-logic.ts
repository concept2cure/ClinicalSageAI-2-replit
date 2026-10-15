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
/** 'undetermined': no critical finding, but a check that could raise one did not run. */
export type IbcRiskFlag = 'high' | 'medium' | 'low' | 'undetermined';

export interface IbcFinding {
  severity: IbcFindingSeverity;
  message: string;
  basis: string;
}

export interface IbcCompletenessInput {
  declaredBsl: BiosafetyLevel;
  /** NULL means NOT RECORDED, not 'not_applicable'. */
  nihGuidelinesSection: NihGuidelinesSection | null;
  /** NULL means NOT RECORDED, not "no". */
  involvesHumanGeneTransfer: boolean | null;
  agents: Array<{ agentName: string; riskGroup: RiskGroup; requiredBsl: BiosafetyLevel }>;
}

const CHECK_AGENT_LEVEL = "each agent registered at or above its risk group's containment (NIH Guidelines Appendix B; BMBL)";
const CHECK_CONTAINMENT = 'declared containment at or above the highest level the agents require (BMBL)';
const CHECK_CONVENED = 'whether the work needs convened-IBC review (NIH Guidelines III-A/B/C, human gene transfer)';

/**
 * Containment-adequacy gate. The declared BSL must meet or exceed the highest
 * containment any agent requires; each agent's required BSL must match its risk
 * group; III-A/B/C and human gene transfer require convened IBC review. Pure —
 * cited findings, the checks that ran and the ones that could not, a risk flag.
 *
 * 2026-10-15: with no agents it reported highestRequiredBsl 'BSL-1', a level
 * nobody derived; an unrecorded section or gene-transfer answer read as
 * "convened review not required". Both are now reported as not assessed.
 */
export function evaluateContainment(p: IbcCompletenessInput): {
  findings: IbcFinding[];
  riskLevel: IbcRiskFlag;
  highestRequiredBsl: BiosafetyLevel | null;
  checksRun: string[];
  notAssessed: string[];
} {
  const findings: IbcFinding[] = [];
  const checksRun: string[] = [CHECK_AGENT_LEVEL];
  const notAssessed: string[] = [];

  if (p.agents.length === 0) {
    findings.push({ severity: 'major', message: 'No biological agents are registered.', basis: 'NIH Guidelines Section III; IBC registration' });
  }
  const highest = highestAgentLevel(p.agents, findings);

  if (highest === null) {
    notAssessed.push(`${CHECK_CONTAINMENT}: no agents are registered, so no required level was derived`);
  } else {
    checksRun.push(CHECK_CONTAINMENT);
    if (BSL_RANK[p.declaredBsl] < BSL_RANK[highest]) {
      findings.push({
        severity: 'critical',
        message: `Declared containment ${p.declaredBsl} is below the ${highest} required by the registered agents.`,
        basis: 'NIH Guidelines Appendix B; BMBL containment',
      });
    }
  }

  const convened = convenedReviewCheck(p);
  if ('notAssessed' in convened) {
    notAssessed.push(convened.notAssessed);
  } else {
    checksRun.push(CHECK_CONVENED);
    if (convened.finding) findings.push(convened.finding);
  }

  // Only the containment check can raise a critical finding; the convened-review
  // check raises a minor one, so its absence does not unsettle the flag.
  const riskLevel: IbcRiskFlag = findings.some((f) => f.severity === 'critical')
    ? 'high'
    : highest === null
      ? 'undetermined'
      : findings.some((f) => f.severity === 'major')
        ? 'medium'
        : 'low';
  return { findings, riskLevel, highestRequiredBsl: highest, checksRun, notAssessed };
}

/**
 * The highest level the agents require (each never below its risk group's
 * minimum), or null with no agents. Records a finding for each agent
 * registered below its risk group.
 */
function highestAgentLevel(agents: IbcCompletenessInput['agents'], findings: IbcFinding[]): BiosafetyLevel | null {
  let highest: BiosafetyLevel | null = null;
  for (const a of agents) {
    const expected = minimumBslForRiskGroup(a.riskGroup);
    if (BSL_RANK[a.requiredBsl] < BSL_RANK[expected]) {
      findings.push({ severity: 'major', message: `Agent "${a.agentName}" (${a.riskGroup}) is registered at ${a.requiredBsl} but ${a.riskGroup} requires at least ${expected}.`, basis: 'NIH Guidelines Appendix B; BMBL' });
    }
    const effective = BSL_RANK[a.requiredBsl] >= BSL_RANK[expected] ? a.requiredBsl : expected;
    if (highest === null || BSL_RANK[effective] > BSL_RANK[highest]) highest = effective;
  }
  return highest;
}

/** The convened-review check: a minor finding when required, not assessed when the record cannot say. */
function convenedReviewCheck(p: IbcCompletenessInput): { finding: IbcFinding | null } | { notAssessed: string } {
  const convened = requiresConvenedReview(p.nihGuidelinesSection, p.involvesHumanGeneTransfer);
  if (convened === null) {
    const missing = [
      p.nihGuidelinesSection == null ? 'the NIH Guidelines section' : null,
      p.involvesHumanGeneTransfer == null ? 'whether it involves human gene transfer' : null,
    ].filter(Boolean).join(' and ');
    return { notAssessed: `${CHECK_CONVENED}: ${missing} is not recorded` };
  }
  return {
    finding: convened
      ? { severity: 'minor', message: 'This work (NIH Guidelines III-A/B/C or human gene transfer) requires review and approval by the convened IBC before initiation.', basis: 'NIH Guidelines Section III-A/B/C' }
      : null,
  };
}

/**
 * Whether approval needs a convened-quorum vote. Pure and three-valued: `null`
 * when the record cannot say. III-A/B/C or human gene transfer each make it
 * required on their own; "not required" needs both facts recorded.
 */
export function requiresConvenedReview(section: NihGuidelinesSection | null, involvesHumanGeneTransfer: boolean | null): boolean | null {
  if ((section != null && ['III-A', 'III-B', 'III-C'].includes(section)) || involvesHumanGeneTransfer === true) return true;
  if (section == null || involvesHumanGeneTransfer == null) return null;
  return false;
}

export type RegistrationExpiration =
  | { undetermined: false; expirationDate: string; expired: boolean }
  | { undetermined: true; reason: string; expirationDate: null; expired: null };

/**
 * Registration expiration. NIH Guidelines require at least annual review of
 * active registrations; approval sets a 1-year expiration. Pure. With no
 * approval date recorded the expiry is undetermined; it used to come back
 * `expired: false` (2026-10-15).
 */
export function registrationExpiration(approvalDate: string | null, today: string): RegistrationExpiration {
  if (!approvalDate) {
    return { undetermined: true, reason: 'No approval date is recorded, so expiry cannot be determined.', expirationDate: null, expired: null };
  }
  const expiration = addYears(approvalDate, 1);
  return { undetermined: false, expirationDate: expiration, expired: today >= expiration };
}
