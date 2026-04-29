/**
 * Standards Applicability Service
 *
 * Recommends, queries, and reports on consensus-standards applicability for a
 * program. Recommendation is rule-driven (deterministic) — not LLM-driven —
 * so the output is auditable. The rules below are intentionally conservative:
 * they propose `applies` only when the program profile clearly maps; otherwise
 * they propose `tbd` and surface the rationale for a human to decide.
 */

import { and, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import { regulatoryPrograms, evidenceObjects } from '../../../shared/schema/programs';
import {
  regulatoryStandards,
  standardsApplicability,
  type RegulatoryStandard,
  type StandardsApplicability,
} from '../../../shared/schema/regulatory-graph';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProgramProfile {
  programType: string;
  productType: string;
  deviceClass: string | null;
  primaryAgency: string;
  targetAgencies: string[];
  // Inferred at recommendation time from the program metadata or device profile
  isSoftware?: boolean;
  isAiMl?: boolean;
  isSterile?: boolean;
  hasPatientContact?: boolean;
  isElectrical?: boolean;
  isIvd?: boolean;
}

export interface StandardRecommendation {
  standard: RegulatoryStandard;
  applicability: 'applies' | 'does_not_apply' | 'conditional' | 'tbd';
  rationale: string;
  /** Higher = more certain the standard applies. 0..1. */
  confidence: number;
}

export interface ApplicabilityRow {
  applicability: StandardsApplicability;
  standard: RegulatoryStandard;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommendation rules
// ─────────────────────────────────────────────────────────────────────────────

interface RuleResult {
  applicability: StandardRecommendation['applicability'];
  rationale: string;
  confidence: number;
}

type Rule = (std: RegulatoryStandard, profile: ProgramProfile) => RuleResult | null;

const productMatches = (std: RegulatoryStandard, profile: ProgramProfile): boolean => {
  const appliesTo = (std.appliesTo ?? []) as string[];
  if (!appliesTo.length) return true;
  if (profile.isIvd && appliesTo.includes('ivd')) return true;
  if (profile.isSoftware && appliesTo.includes('samd')) return true;
  if (profile.isAiMl && appliesTo.includes('ai_ml')) return true;
  if (profile.productType === 'device' && appliesTo.includes('device')) return true;
  if (profile.productType === 'combination' && appliesTo.includes('combination')) return true;
  if (profile.productType === 'ivd' && appliesTo.includes('ivd')) return true;
  return false;
};

/** ISO 13485 / 14971 / 15223-1 — universally applicable to medical devices. */
const ruleUniversal: Rule = (std, profile) => {
  if (['ISO 13485:2016', 'ISO 14971:2019', 'ISO/TR 24971:2020', 'ISO 15223-1:2021'].includes(std.code)) {
    if (productMatches(std, profile)) {
      return {
        applicability: 'applies',
        rationale: `${std.code} is universally applicable to medical-device QMS / risk / labeling.`,
        confidence: 0.95,
      };
    }
  }
  return null;
};

/** Software / SaMD / AI-ML standards. */
const ruleSoftware: Rule = (std, profile) => {
  if (std.domain !== 'software' && std.domain !== 'cybersecurity') return null;
  if (!profile.isSoftware && !profile.isAiMl) {
    return {
      applicability: 'does_not_apply',
      rationale: `${std.code} targets software life-cycle / cybersecurity; program is not flagged as software/SaMD/AI-ML.`,
      confidence: 0.85,
    };
  }
  return {
    applicability: 'applies',
    rationale: `${std.code} applies because the program includes software/SaMD or AI-ML functionality.`,
    confidence: 0.9,
  };
};

/** Electrical safety + EMC. */
const ruleElectrical: Rule = (std, profile) => {
  if (std.domain !== 'electrical') return null;
  if (profile.isElectrical === false) {
    return {
      applicability: 'does_not_apply',
      rationale: `${std.code} targets medical electrical equipment; program is not electrical.`,
      confidence: 0.85,
    };
  }
  if (profile.isElectrical === true) {
    return {
      applicability: 'applies',
      rationale: `${std.code} applies to medical electrical equipment.`,
      confidence: 0.9,
    };
  }
  return {
    applicability: 'tbd',
    rationale: `${std.code}: program does not declare whether the device is electrical. Confirm and revisit.`,
    confidence: 0.4,
  };
};

/** Biocompatibility. */
const ruleBiocompatibility: Rule = (std, profile) => {
  if (std.domain !== 'biocompatibility') return null;
  if (profile.hasPatientContact === false) {
    return {
      applicability: 'does_not_apply',
      rationale: `${std.code} applies only when the device has patient contact; profile says it does not.`,
      confidence: 0.85,
    };
  }
  if (profile.hasPatientContact === true) {
    return {
      applicability: 'applies',
      rationale: `${std.code} applies because the device has patient contact.`,
      confidence: 0.9,
    };
  }
  return {
    applicability: 'tbd',
    rationale: `${std.code}: patient-contact status not declared. Confirm and revisit.`,
    confidence: 0.4,
  };
};

/** Sterilization. */
const ruleSterilization: Rule = (std, profile) => {
  if (std.domain !== 'sterilization' && std.domain !== 'packaging') return null;
  if (profile.isSterile === false) {
    return {
      applicability: 'does_not_apply',
      rationale: `${std.code} applies to sterile devices; program is not flagged as sterile.`,
      confidence: 0.85,
    };
  }
  if (profile.isSterile === true) {
    return {
      applicability: 'applies',
      rationale: `${std.code} applies because the device is sterile.`,
      confidence: 0.9,
    };
  }
  return {
    applicability: 'tbd',
    rationale: `${std.code}: sterility status not declared. Confirm and revisit.`,
    confidence: 0.4,
  };
};

/** IVD-specific (ISO 20916, CLSI). */
const ruleIvd: Rule = (std, profile) => {
  if (std.domain !== 'ivd_clinical_performance') return null;
  if (profile.isIvd) {
    return {
      applicability: 'applies',
      rationale: `${std.code} applies because the program is an in vitro diagnostic.`,
      confidence: 0.9,
    };
  }
  return {
    applicability: 'does_not_apply',
    rationale: `${std.code} is IVD-specific; program is not an IVD.`,
    confidence: 0.9,
  };
};

/** Usability — applies to most devices, harder to dismiss confidently. */
const ruleUsability: Rule = (std, profile) => {
  if (std.domain !== 'usability') return null;
  if (productMatches(std, profile)) {
    return {
      applicability: 'applies',
      rationale: `${std.code} applies; FDA and EU expect usability engineering for nearly all medical devices.`,
      confidence: 0.85,
    };
  }
  return null;
};

/** Clinical investigation — expected for high-risk devices, conditional otherwise. */
const ruleClinicalInvestigation: Rule = (std, profile) => {
  if (std.domain !== 'clinical_investigation') return null;
  const cls = (profile.deviceClass ?? '').toUpperCase();
  if (profile.programType === 'PMA' || cls === 'III') {
    return {
      applicability: 'applies',
      rationale: `${std.code} applies because the program is PMA or Class III.`,
      confidence: 0.9,
    };
  }
  return {
    applicability: 'conditional',
    rationale: `${std.code} applies if a clinical investigation is conducted to support the submission.`,
    confidence: 0.6,
  };
};

const RULES: Rule[] = [
  ruleUniversal,
  ruleSoftware,
  ruleElectrical,
  ruleBiocompatibility,
  ruleSterilization,
  ruleIvd,
  ruleUsability,
  ruleClinicalInvestigation,
];

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recommend applicability for every active standard given a program profile.
 * Pure function over the rules; no DB writes.
 */
export async function recommendApplicability(
  profile: ProgramProfile
): Promise<StandardRecommendation[]> {
  const standards = await db
    .select()
    .from(regulatoryStandards)
    .where(eq(regulatoryStandards.status, 'active'));

  const out: StandardRecommendation[] = [];
  for (const std of standards) {
    let result: RuleResult | null = null;
    for (const rule of RULES) {
      result = rule(std, profile);
      if (result) break;
    }
    if (!result) {
      // Fallback: if product type matches, mark conditional; else does_not_apply.
      result = productMatches(std, profile)
        ? {
            applicability: 'tbd',
            rationale: `${std.code}: no deterministic rule fired; needs human review.`,
            confidence: 0.3,
          }
        : {
            applicability: 'does_not_apply',
            rationale: `${std.code}: appliesTo does not include this program's product type.`,
            confidence: 0.7,
          };
    }
    out.push({ standard: std, ...result });
  }
  return out;
}

/**
 * Build a ProgramProfile from a regulatory_programs row plus optional caller
 * overrides. Caller overrides win — the program record is sparse, so most
 * software/electrical/sterile/etc. flags must come from the device profile or
 * the operator.
 */
export async function buildProgramProfile(
  programId: string,
  overrides: Partial<ProgramProfile> = {}
): Promise<ProgramProfile | null> {
  const rows = await db
    .select()
    .from(regulatoryPrograms)
    .where(eq(regulatoryPrograms.id, programId))
    .limit(1);
  const program = rows[0];
  if (!program) return null;

  return {
    programType: program.programType,
    productType: program.productType,
    deviceClass: program.deviceClass ?? null,
    primaryAgency: program.primaryAgency,
    targetAgencies: (program.targetAgencies ?? []) as string[],
    isIvd: program.productType === 'ivd',
    ...overrides,
  };
}

/** Read all current applicability rows for a program with their standards. */
export async function listProgramApplicability(programId: string): Promise<ApplicabilityRow[]> {
  const rows = await db
    .select()
    .from(standardsApplicability)
    .where(eq(standardsApplicability.programId, programId));
  if (!rows.length) return [];

  const ids = rows.map(r => r.standardId);
  const standards = await db
    .select()
    .from(regulatoryStandards)
    .where(sql`${regulatoryStandards.id} = ANY(${ids})`);
  const byId = new Map(standards.map(s => [s.id, s]));

  return rows
    .map(applicability => {
      const standard = byId.get(applicability.standardId);
      return standard ? { applicability, standard } : null;
    })
    .filter((x): x is ApplicabilityRow => x !== null);
}

/**
 * Gap report against an authoritative recommendation set:
 *   - missing: standards the recommender says 'applies' that the program has
 *     not recorded an applicability row for
 *   - non_conformant: rows whose conformance_status is 'non_conformant' or 'needs_evidence'
 *   - missing_evidence: rows whose applicability is 'applies' but primary_evidence_id is null
 */
export async function applicabilityGapReport(programId: string, profile: ProgramProfile) {
  const [recommendations, current] = await Promise.all([
    recommendApplicability(profile),
    listProgramApplicability(programId),
  ]);

  const currentByStdId = new Map(current.map(c => [c.applicability.standardId, c]));

  const missing = recommendations.filter(
    r => r.applicability === 'applies' && !currentByStdId.has(r.standard.id)
  );

  const nonConformant = current.filter(c =>
    ['non_conformant', 'needs_evidence'].includes(c.applicability.conformanceStatus)
  );

  const missingEvidence = current.filter(
    c =>
      c.applicability.applicability === 'applies' &&
      !c.applicability.primaryEvidenceId
  );

  return {
    programId,
    missing,
    nonConformant,
    missingEvidence,
    summary: {
      missingCount: missing.length,
      nonConformantCount: nonConformant.length,
      missingEvidenceCount: missingEvidence.length,
    },
  };
}

/**
 * Check whether an applicability row's primary evidence is current
 * (status='approved', not superseded). Surface stale conformance for the
 * living-file engine.
 */
export async function checkConformanceFreshness(applicabilityId: string) {
  const rows = await db
    .select()
    .from(standardsApplicability)
    .where(eq(standardsApplicability.id, applicabilityId))
    .limit(1);
  const app = rows[0];
  if (!app) return null;
  if (!app.primaryEvidenceId) {
    return { applicabilityId, fresh: false, reason: 'no_primary_evidence' as const };
  }
  const evRows = await db
    .select()
    .from(evidenceObjects)
    .where(eq(evidenceObjects.id, app.primaryEvidenceId))
    .limit(1);
  const ev = evRows[0];
  if (!ev) return { applicabilityId, fresh: false, reason: 'evidence_missing' as const };
  if (ev.status === 'superseded') {
    return { applicabilityId, fresh: false, reason: 'evidence_superseded' as const, evidence: ev };
  }
  if (ev.status !== 'approved') {
    return { applicabilityId, fresh: false, reason: 'evidence_not_approved' as const, evidence: ev };
  }
  if (ev.validUntil && ev.validUntil.getTime() < Date.now()) {
    return { applicabilityId, fresh: false, reason: 'evidence_expired' as const, evidence: ev };
  }
  return { applicabilityId, fresh: true as const, evidence: ev };
}
