/**
 * VALIDATE-COMPLETENESS Engine — Submission Readiness Assessment
 *
 * Provides:
 * - CTD completeness checklist per submission type, from the canonical
 *   required-section profile
 * - RTF risk scoring
 * - Go/No-Go decision framework
 * - Gap analysis with remediation guidance
 *
 * ── 2026-10-05 (g-validate-completeness-canonical) ───────────────────────────
 * This engine kept its own requirement table, and every RTF/CRL prediction
 * (scoreSubmissionDraft, the report-os pre-mortem) inherited its errors:
 *   - blockers were chosen by `c.module <= '3'`, so an NDA missing all of
 *     Modules 4 and 5 had zero blockers and read 'conditional_go', and an empty
 *     IVDR file (module 'A') did too;
 *   - presence was a substring match: '3.2.S.1.1' and '1.10' both satisfied
 *     '1.1 Forms (FDA 356h)';
 *   - US Module 1 numbers were wrong (EA at 1.14, patent at 1.12, right of
 *     reference at 1.12.2, Paragraph IV at 1.12.1 — FDA's Pre-IND
 *     correspondence);
 *   - TYPE_MAP sent an EU MAA to the FDA NDA table (356h, no RMP) and CTA to
 *     IND, which in turn fell through to the NDA table;
 *   - devices got invented CTD-like "modules 1-6" and FDA 3601, the user-fee
 *     cover sheet, as their "application form"; the IVDR list filed PMPF under
 *     Annex XIV.
 *
 * Deleted: the commonCTD / ANDA / 505(b)(2) / device / IVDR / MAA literal
 * arrays, TYPE_MAP (MAA→NDA, CTA→IND), the substring match and the module
 * split. Now:
 *   - requirements: `ectd/required-sections.requiredSectionProfileFor` — the
 *     one profile the eCTD leaf validator reads (Module 1 from the region
 *     profile, Modules 2-5 per ICH M4);
 *   - presence: `ectd/section-code-match.sectionMatches` (exact or a
 *     descendant on a separator boundary);
 *   - every missing required section is a blocker — the profile carries no
 *     criticality, and refusal to file is incompleteness on its face;
 *   - a type with no profile (ANDA, 505(b)(2), CTA, a non-home region, an
 *     unknown string) is `not_assessed`. Devices (510(k), De Novo, PMA) point
 *     at the eSTAR filing-readiness engine and EU MDR/IVDR at the tech-doc
 *     engine (DECISIONS.md #13), because a CTD-code checklist cannot represent
 *     their slots.
 *
 * @module server/services/validate-completeness-engine
 */

import { createScopedLogger } from '../utils/logger';
import { resolveToRegistryEntry, resolveToRegistryId, type RegulatoryApplicationType } from '../../shared/regulatory/submission-type-bridge.js';
import {
  requiredSectionProfileFor,
  type ProfiledSubmissionType,
  type RequiredSectionProfile,
  type RequiredSectionRegion,
} from './ectd/required-sections';
import { sectionMatches } from './ectd/section-code-match';
import { getSubmissionRegionProfile } from './region-profiles/region-profile-service';
import { CTD_AUTHORING_GUIDANCE } from './ind/ctd/authoring-guidance';
import type { CTDSection } from './regional-ctd-templates';

const log = createScopedLogger('validate-completeness');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidateInput {
  submissionType: string;
  /** Sections present in the submission (CTD codes, bare or 'm'-prefixed). */
  presentSections: string[];
  /** Optional: section quality scores (0-100), keyed by the required section code. */
  sectionScores?: Record<string, number>;
  /** Optional: known issues from HARMONIZE */
  harmonizeIssueCount?: number;
  /** Optional: known escalations */
  openEscalations?: number;
  /**
   * Target agency. When given, it must be the profile's home region (an NDA
   * with 'EMA' is not assessed — never judged against another region's set).
   */
  targetAgency?: string;
}

export interface CompletenessCheckItem {
  /** CTD module ('1'..'5'), from the section code. */
  module: string;
  section: string;
  description: string;
  required: boolean;
  present: boolean;
  qualityScore: number | null;
  status: 'complete' | 'present_needs_review' | 'missing_required';
  remediation?: string;
}

export interface RTFRiskAssessment {
  overallRTFRisk: 'low' | 'medium' | 'high' | 'critical';
  rtfScore: number;
  /** Every missing required section, `${code}: ${title}`. Each is a blocker. */
  missingCritical: string[];
  weakSections: string[];
}

export interface GoNoGoDecision {
  /** 'not_assessed': no canonical required-section profile for this type/region. */
  decision: 'go' | 'conditional_go' | 'no_go' | 'not_assessed';
  /** Null when not assessed — never a 0/0. */
  readinessScore: number | null;
  rationale: string;
  conditions: string[];
  blockers: string[];
  risks: string[];
}

/** The engine that does assess a type this engine cannot. */
export interface CompletenessAssessor {
  /** Exported function name. */
  engine: string;
  /** Repo-relative module path. */
  module: string;
  /** The route that reaches it. */
  route: string;
}

export type CompletenessAssessment =
  | {
      status: 'assessed';
      profile: { submissionType: ProfiledSubmissionType; region: RequiredSectionRegion; basis: string };
    }
  | {
      status: 'not_assessed';
      reason: string;
      /** Where this type IS assessed, or null when nothing in the platform does. */
      assessWith: CompletenessAssessor | null;
    };

interface CompletenessResultBase {
  submissionType: string;
  targetAgency: string;
}

export interface AssessedCompletenessResult extends CompletenessResultBase {
  assessment: Extract<CompletenessAssessment, { status: 'assessed' }>;
  checklist: CompletenessCheckItem[];
  rtfRisk: RTFRiskAssessment;
  goNoGo: GoNoGoDecision;
  summary: {
    totalSections: number;
    completeSections: number;
    missingSections: number;
    readinessPercentage: number;
  };
}

export interface NotAssessedCompletenessResult extends CompletenessResultBase {
  assessment: Extract<CompletenessAssessment, { status: 'not_assessed' }>;
  checklist: [];
  rtfRisk: null;
  goNoGo: GoNoGoDecision;
  summary: null;
}

export type ValidateCompletenessResult = AssessedCompletenessResult | NotAssessedCompletenessResult;

export function isCompletenessAssessed(r: ValidateCompletenessResult): r is AssessedCompletenessResult {
  return r.assessment.status === 'assessed';
}

// ─── Where unprofiled device types are assessed ──────────────────────────────

const ESTAR_FILING_READINESS: CompletenessAssessor = {
  engine: 'assessEstarFilingReadiness',
  module: 'server/services/pathway-engines/estar/estar-filing-readiness.ts',
  route: 'POST /api/510k/estar/filing-readiness',
};

function euTechDoc(regulation: 'mdr' | 'ivdr'): CompletenessAssessor {
  return {
    engine: 'assembleTechDoc',
    module: 'server/services/pathway-engines/mdr-ivdr/tech-doc-assembler.ts',
    route: `GET /api/submissions/sequences/:seqId/technical-file?regulation=${regulation}`,
  };
}

/** Home agency of each profiled region, reported for every assessed result. */
const REGION_AGENCY: Readonly<Record<RequiredSectionRegion, string>> = { fda: 'FDA', eu: 'EMA', jp: 'PMDA' };

/**
 * Registry ids whose completeness another engine DOES assess — an explicit
 * allow-list, never a category or segment rule.
 *
 * Review fix (2026-10-05, round 1): the first cut routed by category/segment,
 * so US_EUA and US_HDE pointed at eSTAR (whose assessContent handles only
 * 510k / de_novo / pma / q_sub / ide / 513g), and every EU device or IVD
 * entry — MIR, FSCA, vigilance, PSUR, trend report, clinical investigation,
 * performance study, NB / Art. 48 consultation, CER, DoC, significant change —
 * pointed at the Annex II/III technical-file assembler, with a reason that
 * called each "a device pathway assessed by" an engine that does not assess
 * it. Any id not listed here gets `assessWith: null` and the plain
 * no-profile reason.
 *
 * eSTAR: estar-filing-readiness `assessContent` maps 510(k) (device and IVD
 * variant), De Novo, PMA (original and supplements, PMA_KEY_TO_TYPE) and IDE.
 * Tech doc: tech-doc-assembler `EuRegulation` is 'mdr' | 'ivdr' — the MDR
 * Annex II/III and IVDR Annex II/III technical documentation, and nothing
 * else. EU_IVDR_TECHDOC is the bridge's alias target for 'IVDR_TD' and has no
 * registry entry, which is why this keys on the resolved id, not the entry.
 */
const ASSESSOR_BY_REGISTRY_ID: Readonly<Record<string, CompletenessAssessor>> = {
  US_510K: ESTAR_FILING_READINESS,
  US_510K_MOD: ESTAR_FILING_READINESS,
  US_510K_IVD: ESTAR_FILING_READINESS,
  US_DE_NOVO: ESTAR_FILING_READINESS,
  US_DE_NOVO_IVD: ESTAR_FILING_READINESS,
  US_PMA: ESTAR_FILING_READINESS,
  US_PMA_IVD: ESTAR_FILING_READINESS,
  US_PMA_SUPP: ESTAR_FILING_READINESS,
  US_IDE: ESTAR_FILING_READINESS,
  EU_MDR_TECHDOC: euTechDoc('mdr'),
  EU_MDR_CLASS_I: euTechDoc('mdr'),
  EU_MDR_CLASS_IIA: euTechDoc('mdr'),
  EU_MDR_CLASS_IIB: euTechDoc('mdr'),
  EU_MDR_CLASS_III: euTechDoc('mdr'),
  EU_IVDR: euTechDoc('ivdr'),
  EU_IVDR_TECHDOC: euTechDoc('ivdr'),
  EU_IVDR_CLASS_A: euTechDoc('ivdr'),
  EU_IVDR_CLASS_B: euTechDoc('ivdr'),
  EU_IVDR_CLASS_CD: euTechDoc('ivdr'),
};

function assessorFor(submissionType: string): CompletenessAssessor | null {
  const id = resolveToRegistryId(submissionType);
  return (id && ASSESSOR_BY_REGISTRY_ID[id]) || null;
}

// ─── Section titles (from the canonical records, never a local table) ────────

function moduleOf(code: string): string {
  return /^([1-5])\./.exec(code)?.[1] ?? '';
}

const module1TitleCache = new Map<RequiredSectionRegion, Map<string, string>>();

function module1Titles(region: RequiredSectionRegion): Map<string, string> {
  let titles = module1TitleCache.get(region);
  if (titles) return titles;
  titles = new Map();
  const walk = (sections: CTDSection[]): void => {
    for (const s of sections) {
      titles!.set(s.number, s.title);
      if (s.childSections?.length) walk(s.childSections);
    }
  };
  walk(getSubmissionRegionProfile(region)?.module1Sections ?? []);
  module1TitleCache.set(region, titles);
  return titles;
}

/**
 * Module 1 titles come from the region profile; Modules 2-5 from the CTD
 * authoring record, exact key only (its nearest-node fallback would title
 * '3.2.S' with a child's heading). A code neither record titles is shown by
 * its number alone.
 */
function titleFor(code: string, region: RequiredSectionRegion): string {
  const title = moduleOf(code) === '1' ? module1Titles(region).get(code) : CTD_AUTHORING_GUIDANCE[code]?.title;
  return title ?? `CTD section ${code}`;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class ValidateCompletenessEngine {

  async validate(input: ValidateInput): Promise<ValidateCompletenessResult> {
    log.info(`VALIDATE-COMPLETENESS: ${input.submissionType}, ${input.presentSections.length} sections`);

    const entry = resolveToRegistryEntry(input.submissionType);
    const profile = this.resolveProfile(input, entry);
    if (!profile) return this.notAssessed(input, entry);

    const checklist = this.buildChecklist(profile, input);
    const rtfRisk = this.assessRTFRisk(checklist, input);
    const goNoGo = this.buildGoNoGo(checklist, rtfRisk, input);

    const completeSections = checklist.filter(c => c.status === 'complete').length;
    const missingSections = checklist.filter(c => c.status === 'missing_required').length;

    return {
      submissionType: input.submissionType,
      // A profile resolved only for the home region (or none named), so the
      // home agency is the normalized form of whatever the caller sent.
      targetAgency: REGION_AGENCY[profile.region],
      assessment: {
        status: 'assessed',
        profile: { submissionType: profile.submissionType, region: profile.region, basis: profile.basis },
      },
      checklist,
      rtfRisk,
      goNoGo,
      summary: {
        totalSections: checklist.length,
        completeSections,
        missingSections,
        readinessPercentage: Math.round((completeSections / checklist.length) * 100),
      },
    };
  }

  /**
   * The caller's string first ('NDA', 'JNDA', 'eu_maa'), then the registry's
   * application type for an id the profile does not alias ('US_IND' → 'IND').
   * The region is passed only when the caller named one, so an MAA sent with
   * no agency is judged as the EU MAA it is rather than against FDA.
   */
  private resolveProfile(input: ValidateInput, entry: RegulatoryApplicationType | null): RequiredSectionProfile | null {
    const region = input.targetAgency?.trim() || null;
    const direct = requiredSectionProfileFor(input.submissionType, region);
    if (direct) return direct;
    if (!entry) return null;
    return requiredSectionProfileFor(entry.applicationType, region ?? entry.agency);
  }

  private notAssessed(input: ValidateInput, entry: RegulatoryApplicationType | null): NotAssessedCompletenessResult {
    const assessWith = assessorFor(input.submissionType);
    const label = entry?.displayName ? `${input.submissionType} (${entry.displayName})` : input.submissionType;
    const agency = input.targetAgency?.trim() || null;
    const where = agency ? ` for ${agency}` : '';
    const reason = assessWith
      ? `${label} is a device pathway; its completeness is assessed by ${assessWith.engine} (${assessWith.module}), not by a CTD section checklist.`
      : `No canonical required-section profile exists for ${label}${where}. Completeness was not assessed; no checklist or score is produced.`;
    return {
      submissionType: input.submissionType,
      targetAgency: agency ?? entry?.agency ?? 'unspecified',
      assessment: { status: 'not_assessed', reason, assessWith },
      checklist: [],
      rtfRisk: null,
      goNoGo: {
        decision: 'not_assessed',
        readinessScore: null,
        rationale: `Not assessed. ${reason}`,
        conditions: assessWith ? [`Assess with ${assessWith.engine}: ${assessWith.route}`] : [],
        blockers: [],
        risks: [],
      },
      summary: null,
    };
  }

  private buildChecklist(profile: RequiredSectionProfile, input: ValidateInput): CompletenessCheckItem[] {
    return [...profile.sections].map(section => {
      const description = titleFor(section, profile.region);
      const present = input.presentSections.some(s => sectionMatches(s, section));
      const qualityScore = input.sectionScores?.[section] ?? null;
      const needsReview = present && qualityScore !== null && qualityScore < 70;

      const status: CompletenessCheckItem['status'] = !present
        ? 'missing_required'
        : needsReview ? 'present_needs_review' : 'complete';

      return {
        module: moduleOf(section),
        section,
        description,
        required: true,
        present,
        qualityScore,
        status,
        remediation: status === 'missing_required'
          ? `BLOCKER: ${section} ${description} is required for ${input.submissionType} (${profile.basis}). Prepare and include before filing.`
          : status === 'present_needs_review'
            ? `Quality score ${qualityScore}/100 is below threshold. Review and strengthen this section.`
            : undefined,
      };
    });
  }

  private assessRTFRisk(checklist: CompletenessCheckItem[], input: ValidateInput): RTFRiskAssessment {
    const missingCritical = checklist
      .filter(c => c.status === 'missing_required')
      .map(c => `${c.section}: ${c.description}`);

    const weakSections = checklist
      .filter(c => c.status === 'present_needs_review')
      .map(c => `${c.section}: ${c.description} (score: ${c.qualityScore})`);

    // RTF score: 0 = definitely RTF, 100 = no RTF risk
    let rtfScore = 100;
    rtfScore -= missingCritical.length * 20;
    rtfScore -= weakSections.length * 5;
    if (input.harmonizeIssueCount) rtfScore -= Math.min(input.harmonizeIssueCount * 3, 15);
    if (input.openEscalations) rtfScore -= Math.min(input.openEscalations * 5, 20);
    rtfScore = Math.max(0, Math.min(100, rtfScore));

    const overallRTFRisk: RTFRiskAssessment['overallRTFRisk'] =
      rtfScore < 30 ? 'critical'
        : rtfScore < 50 ? 'high'
          : rtfScore < 75 ? 'medium'
            : 'low';

    return { overallRTFRisk, rtfScore, missingCritical, weakSections };
  }

  private buildGoNoGo(
    checklist: CompletenessCheckItem[],
    rtfRisk: RTFRiskAssessment,
    input: ValidateInput
  ): GoNoGoDecision {
    const blockers = rtfRisk.missingCritical.slice();
    if (input.openEscalations && input.openEscalations > 0) {
      blockers.push(`${input.openEscalations} open escalation(s) require resolution`);
    }

    const risks = rtfRisk.weakSections.map(s => `Low quality: ${s}`);

    if (input.harmonizeIssueCount && input.harmonizeIssueCount > 0) {
      risks.push(`${input.harmonizeIssueCount} HARMONIZE consistency issue(s) detected`);
    }

    const readinessScore = Math.round(
      (checklist.filter(c => c.status === 'complete').length / checklist.length) * 100
    );

    let decision: GoNoGoDecision['decision'];
    let rationale: string;
    const conditions: string[] = [];

    if (blockers.length > 0) {
      decision = 'no_go';
      rationale = `${blockers.length} blocking issue(s) prevent submission. Required sections are missing or unresolved escalations exist.`;
    } else if (risks.length > 3 || rtfRisk.overallRTFRisk === 'high') {
      decision = 'conditional_go';
      rationale = `Every required section is present, but ${risks.length} risk(s) require mitigation before filing.`;
      conditions.push(
        'Address all high-priority consistency issues from HARMONIZE check',
        'Complete quality review for sections below threshold',
        'Obtain function head sign-off on risk acceptance memo',
      );
    } else {
      decision = 'go';
      rationale = `Every required section is present. ${readinessScore}% completeness with ${risks.length} minor risk(s).`;
      if (risks.length > 0) {
        conditions.push('Document accepted risks in submission risk register');
      }
    }

    return { decision, readinessScore, rationale, conditions, blockers, risks };
  }
}

export const validateCompletenessEngine = new ValidateCompletenessEngine();
