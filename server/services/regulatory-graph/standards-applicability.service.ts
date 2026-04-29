/**
 * Standards Applicability Service
 *
 * Recommends, queries, and reports on consensus-standards applicability for a
 * regulatory program. Recommendation is rule-driven (deterministic) — not
 * LLM-driven — so the output is auditable.
 *
 * The catalog lives in `device_test_standards` (canonical, pre-existing).
 * Per-program decisions live in `standards_applicability` (new).
 */

import { eq, inArray } from 'drizzle-orm';

import { db } from '../../db';
import { regulatoryPrograms, evidenceObjects } from '../../../shared/schema/programs';
import { deviceTestStandards } from '../../../shared/schema';
import {
  standardsApplicability,
  type StandardsApplicability,
} from '../../../shared/schema/regulatory-graph';

// Drizzle's InferSelectModel of deviceTestStandards expanded with the new
// fields (kept narrow so the rules below compile against the runtime row).
type Standard = typeof deviceTestStandards.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProgramProfile {
  programType: string;
  productType: string;
  deviceClass: string | null;
  primaryAgency: string;
  targetAgencies: string[];
  // Inferred at recommendation time from program metadata or the device profile
  isSoftware?: boolean;
  isAiMl?: boolean;
  isSterile?: boolean;
  hasPatientContact?: boolean;
  isElectrical?: boolean;
  isIvd?: boolean;
}

export interface StandardRecommendation {
  standard: Standard;
  applicability: 'applies' | 'does_not_apply' | 'conditional' | 'tbd';
  rationale: string;
  /** Higher = more certain. 0..1. */
  confidence: number;
}

export interface ApplicabilityRow {
  applicability: StandardsApplicability;
  standard: Standard;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────────────

interface RuleResult {
  applicability: StandardRecommendation['applicability'];
  rationale: string;
  confidence: number;
}

type Rule = (std: Standard, profile: ProgramProfile) => RuleResult | null;

const productMatches = (std: Standard, profile: ProgramProfile): boolean => {
  const appliesTo = (std.appliesTo ?? []) as string[];
  if (!appliesTo.length) return true; // unknown → don't filter
  if (profile.isIvd && appliesTo.includes('ivd')) return true;
  if (profile.isSoftware && appliesTo.includes('samd')) return true;
  if (profile.isAiMl && appliesTo.includes('ai_ml')) return true;
  if (profile.productType === 'device' && appliesTo.includes('device')) return true;
  if (profile.productType === 'combination' && appliesTo.includes('combination')) return true;
  if (profile.productType === 'ivd' && appliesTo.includes('ivd')) return true;
  return false;
};

/** ISO 13485 / 14971 / 24971 / 15223-1 — universally applicable to medical devices. */
const ruleUniversal: Rule = (std, profile) => {
  if (
    ['ISO 13485:2016', 'ISO 14971:2019', 'ISO/TR 24971:2020', 'ISO 15223-1:2021'].includes(
      std.standardCode
    )
  ) {
    if (productMatches(std, profile)) {
      return {
        applicability: 'applies',
        rationale: `${std.standardCode} is universally applicable to medical-device QMS / risk / labeling.`,
        confidence: 0.95,
      };
    }
  }
  return null;
};

/** Software / SaMD / cybersecurity. */
const ruleSoftware: Rule = (std, profile) => {
  if (std.domain !== 'software' && std.domain !== 'cybersecurity') return null;
  if (!profile.isSoftware && !profile.isAiMl) {
    return {
      applicability: 'does_not_apply',
      rationale: `${std.standardCode} targets software life-cycle / cybersecurity; program is not flagged as software/SaMD/AI-ML.`,
      confidence: 0.85,
    };
  }
  return {
    applicability: 'applies',
    rationale: `${std.standardCode} applies because the program includes software/SaMD or AI-ML functionality.`,
    confidence: 0.9,
  };
};

const ruleElectrical: Rule = (std, profile) => {
  if (std.domain !== 'electrical') return null;
  if (profile.isElectrical === false) {
    return {
      applicability: 'does_not_apply',
      rationale: `${std.standardCode} targets medical electrical equipment; program is not electrical.`,
      confidence: 0.85,
    };
  }
  if (profile.isElectrical === true) {
    return {
      applicability: 'applies',
      rationale: `${std.standardCode} applies to medical electrical equipment.`,
      confidence: 0.9,
    };
  }
  return {
    applicability: 'tbd',
    rationale: `${std.standardCode}: program does not declare whether the device is electrical. Confirm and revisit.`,
    confidence: 0.4,
  };
};

const ruleBiocompatibility: Rule = (std, profile) => {
  if (std.domain !== 'biocompatibility') return null;
  if (profile.hasPatientContact === false) {
    return {
      applicability: 'does_not_apply',
      rationale: `${std.standardCode} applies only when the device has patient contact; profile says it does not.`,
      confidence: 0.85,
    };
  }
  if (profile.hasPatientContact === true) {
    return {
      applicability: 'applies',
      rationale: `${std.standardCode} applies because the device has patient contact.`,
      confidence: 0.9,
    };
  }
  return {
    applicability: 'tbd',
    rationale: `${std.standardCode}: patient-contact status not declared. Confirm and revisit.`,
    confidence: 0.4,
  };
};

const ruleSterilization: Rule = (std, profile) => {
  if (std.domain !== 'sterilization' && std.domain !== 'packaging') return null;
  if (profile.isSterile === false) {
    return {
      applicability: 'does_not_apply',
      rationale: `${std.standardCode} applies to sterile devices; program is not flagged as sterile.`,
      confidence: 0.85,
    };
  }
  if (profile.isSterile === true) {
    return {
      applicability: 'applies',
      rationale: `${std.standardCode} applies because the device is sterile.`,
      confidence: 0.9,
    };
  }
  return {
    applicability: 'tbd',
    rationale: `${std.standardCode}: sterility status not declared. Confirm and revisit.`,
    confidence: 0.4,
  };
};

const ruleIvd: Rule = (std, profile) => {
  if (std.domain !== 'ivd_clinical_performance') return null;
  if (profile.isIvd) {
    return {
      applicability: 'applies',
      rationale: `${std.standardCode} applies because the program is an in vitro diagnostic.`,
      confidence: 0.9,
    };
  }
  return {
    applicability: 'does_not_apply',
    rationale: `${std.standardCode} is IVD-specific; program is not an IVD.`,
    confidence: 0.9,
  };
};

const ruleUsability: Rule = (std, profile) => {
  if (std.domain !== 'usability') return null;
  if (productMatches(std, profile)) {
    return {
      applicability: 'applies',
      rationale: `${std.standardCode} applies; FDA and EU expect usability engineering for nearly all medical devices.`,
      confidence: 0.85,
    };
  }
  return null;
};

const ruleClinicalInvestigation: Rule = (std, profile) => {
  if (std.domain !== 'clinical_investigation') return null;
  const cls = (profile.deviceClass ?? '').toUpperCase();
  if (profile.programType === 'PMA' || cls === 'III') {
    return {
      applicability: 'applies',
      rationale: `${std.standardCode} applies because the program is PMA or Class III.`,
      confidence: 0.9,
    };
  }
  return {
    applicability: 'conditional',
    rationale: `${std.standardCode} applies if a clinical investigation is conducted to support the submission.`,
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
    .from(deviceTestStandards)
    .where(eq(deviceTestStandards.status, 'active'));

  const out: StandardRecommendation[] = [];
  for (const std of standards) {
    let result: RuleResult | null = null;
    for (const rule of RULES) {
      result = rule(std, profile);
      if (result) break;
    }
    if (!result) {
      result = productMatches(std, profile)
        ? {
            applicability: 'tbd',
            rationale: `${std.standardCode}: no deterministic rule fired; needs human review.`,
            confidence: 0.3,
          }
        : {
            applicability: 'does_not_apply',
            rationale: `${std.standardCode}: applies_to does not include this program's product type.`,
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

  const ids = Array.from(new Set(rows.map(r => r.standardId)));
  const standards = await db
    .select()
    .from(deviceTestStandards)
    .where(inArray(deviceTestStandards.id, ids));
  const byId = new Map(standards.map(s => [s.id, s]));

  return rows
    .map(applicability => {
      const standard = byId.get(applicability.standardId);
      return standard ? { applicability, standard } : null;
    })
    .filter((x): x is ApplicabilityRow => x !== null);
}

/**
 * Gap report against an authoritative recommendation set.
 *   - missing: standards the recommender says 'applies' but no row exists
 *   - non_conformant / needs_evidence: rows in those states
 *   - missing_evidence: applies-rows whose primary_evidence_id is null
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
 * (status='approved', not superseded, not expired).
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
