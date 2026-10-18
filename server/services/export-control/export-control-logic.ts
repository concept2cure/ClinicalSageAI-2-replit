/**
 * Export Control deterministic logic (Capability C2C-26)
 *
 * Pure, DB-free, LLM-free: decide whether the Fundamental Research Exclusion applies
 * and whether an export (including a deemed export to a foreign national) requires a
 * license. The determination follows a deterministic decision table grounded in the
 * EAR (15 CFR 734.8 Fundamental Research Exclusion / NSDD-189), ITAR (22 CFR 120–130,
 * deemed exports under 120.50), and EAR99 vs. listed-ECCN logic. Narrative rationale
 * is advisory; the legal outputs here are deterministic.
 *
 * @module server/services/export-control/export-control-logic
 */

export const EXPORT_CONTROL_BASIS = 'EAR 15 CFR 734.8 (FRE / NSDD-189); ITAR 22 CFR 120–130';

export type ExportJurisdiction = 'itar' | 'ear' | 'ofac' | 'not_subject' | 'pending';
export type ExportLicenseRequired = 'yes' | 'no' | 'unknown';

/** The four screening questions. true / false are answers; null or absent is unanswered — never "no". */
export const SCREENING_QUESTIONS = {
  hasPublicationRestrictions: 'publication restrictions',
  hasProprietaryRestrictions: 'proprietary/access restrictions',
  involvesPhysicalExport: 'physical export',
  involvesForeignNationals: 'foreign-national involvement',
} as const;
export type ScreeningQuestion = keyof typeof SCREENING_QUESTIONS;

export interface ExportControlInput {
  jurisdiction: ExportJurisdiction | string;
  /** USML category (ITAR) or ECCN / 'EAR99' (EAR) — free text. */
  classification?: string | null;
  involvesForeignNationals?: boolean | null;
  hasPublicationRestrictions?: boolean | null;
  hasProprietaryRestrictions?: boolean | null;
  /** True when tangible items/technology physically leave the US (not just information). */
  involvesPhysicalExport?: boolean | null;
}

export interface ExportControlFinding { severity: 'critical' | 'warning' | 'info'; message: string }

export interface ExportControlAssessment {
  /** Whether the Fundamental Research Exclusion applies; null while a question it depends on is unanswered. */
  freApplies: boolean | null;
  licenseRequired: ExportLicenseRequired;
  /** Screening questions not answered. None of them was read as "no". */
  unanswered: ScreeningQuestion[];
  findings: ExportControlFinding[];
  citations: string[];
  basis: string;
}

function isEar99(classification?: string | null): boolean {
  return typeof classification === 'string' && classification.trim().toUpperCase() === 'EAR99';
}
function hasText(s?: string | null): boolean { return typeof s === 'string' && s.trim().length > 0; }

/** The screening questions with no true/false answer, in SCREENING_QUESTIONS order. */
export function unansweredQuestions(input: Partial<Record<ScreeningQuestion, boolean | null>>): ScreeningQuestion[] {
  return (Object.keys(SCREENING_QUESTIONS) as ScreeningQuestion[]).filter((q) => typeof input[q] !== 'boolean');
}
const describeQuestions = (qs: ScreeningQuestion[]) => qs.map((q) => SCREENING_QUESTIONS[q]).join(', ');

/**
 * A restriction or a physical export defeats the FRE on its own; the FRE applies
 * only when all three were answered "no". 2026-10-15: an unanswered one was read
 * as "no", so the FRE "applied" — and EAR cleared with no license — on
 * questions nobody had answered.
 */
function freAppliesFor(input: ExportControlInput, restricted: boolean): boolean | null {
  if (restricted || input.involvesPhysicalExport === true) return false;
  const allAnsweredNo =
    input.hasPublicationRestrictions === false && input.hasProprietaryRestrictions === false && input.involvesPhysicalExport === false;
  return allAnsweredNo ? true : null;
}

/**
 * Deterministic export-control assessment. The Fundamental Research Exclusion
 * applies only to *information* arising from research with no publication or
 * proprietary/access restrictions; it never covers tangible exports or controlled
 * items. Pure. (15 CFR 734.8; NSDD-189; 22 CFR 120–130.)
 */
export function evaluateExportControl(input: ExportControlInput): ExportControlAssessment {
  const findings: ExportControlFinding[] = [];
  const citations: string[] = [];
  const unanswered = unansweredQuestions(input);
  const restricted = input.hasPublicationRestrictions === true || input.hasProprietaryRestrictions === true;
  const freApplies = freAppliesFor(input, restricted);

  if (restricted) {
    findings.push({ severity: 'warning', message: 'Publication or proprietary/access restrictions defeat the Fundamental Research Exclusion (15 CFR 734.8 / NSDD-189).' });
    citations.push('15 CFR 734.8');
  }

  let licenseRequired: ExportLicenseRequired = 'unknown';

  switch (input.jurisdiction) {
    case 'not_subject':
      licenseRequired = 'no';
      findings.push({ severity: 'info', message: 'Project is not subject to ITAR/EAR/OFAC; no export license required.' });
      break;

    case 'itar':
      citations.push('22 CFR 120–130');
      // ITAR has no fundamental-research carve-out for defense articles/services; deemed exports to foreign persons are controlled.
      if (input.involvesForeignNationals === true || input.involvesPhysicalExport === true) {
        licenseRequired = 'yes';
        findings.push({ severity: 'critical', message: 'ITAR-controlled technical data/defense article with a foreign-person or physical export — a DDTC license/agreement is required (deemed export, 22 CFR 120.50).' });
      } else {
        licenseRequired = 'unknown';
        findings.push({ severity: 'warning', message: 'ITAR-controlled; confirm no access by foreign persons before proceeding (deemed-export risk).' });
      }
      break;

    case 'ear':
      citations.push('15 CFR 730–774');
      // Each branch needs its own questions ANSWERED (=== false), not merely not-true.
      if (freApplies === true) {
        licenseRequired = 'no';
        findings.push({ severity: 'info', message: 'EAR information qualifies for the Fundamental Research Exclusion — no license for the resulting information (15 CFR 734.8).' });
      } else if (isEar99(input.classification) && input.involvesForeignNationals === false) {
        licenseRequired = 'no';
        findings.push({ severity: 'info', message: 'EAR99 item with no listed controls and no foreign-national/embargo concern — generally no license required (screen destination/end-user).' });
      } else if (hasText(input.classification) && !isEar99(input.classification) && freApplies === false) {
        licenseRequired = 'yes';
        findings.push({ severity: 'critical', message: `Listed ECCN "${(input.classification as string).trim()}" with restrictions or a foreign-national recipient — check the Commerce Country Chart; a license is likely required (deemed export, 15 CFR 734.13).` });
      } else {
        licenseRequired = 'unknown';
        findings.push({
          severity: 'warning',
          message: hasText(input.classification) && unanswered.length > 0
            ? 'EAR jurisdiction, but an unanswered screening question leaves the license outcome open — answer it before a final determination.'
            : 'EAR jurisdiction but classification incomplete — assign an ECCN/EAR99 before a final determination.',
        });
      }
      break;

    case 'ofac':
      citations.push('31 CFR (OFAC sanctions)');
      licenseRequired = 'yes';
      findings.push({ severity: 'critical', message: 'OFAC-sanctioned country/party involved — an OFAC license is required regardless of the Fundamental Research Exclusion.' });
      break;

    case 'pending':
    default:
      licenseRequired = 'unknown';
      findings.push({ severity: 'warning', message: 'Jurisdiction not yet determined — classify under ITAR/EAR/OFAC before finalizing.' });
      break;
  }

  if (input.involvesForeignNationals === true) {
    findings.push({ severity: 'warning', message: 'Foreign-national participation triggers deemed-export analysis even for domestic work.' });
  }
  if (unanswered.length > 0) {
    findings.push({ severity: 'warning', message: `Not answered: ${describeQuestions(unanswered)}. An unanswered screening question is not read as "no".` });
  }

  return { freApplies, licenseRequired, unanswered, findings, citations, basis: EXPORT_CONTROL_BASIS };
}

// ─── Determination readiness ───────────────────────────────────────────────────

export interface ExportReviewReadinessResult {
  readyToDetermine: boolean;
  blockers: string[];
  findings: ExportControlFinding[];
  assessment: ExportControlAssessment;
}

/**
 * Gate finalizing an export-control determination. Blockers: jurisdiction still
 * pending; a subject (ITAR/EAR) review with no classification; a screening
 * question unanswered (any jurisdiction: the FRE outcome is persisted with the
 * determination); foreign-national involvement with the license outcome still
 * unknown. Pure.
 */
export function evaluateExportReviewReadiness(input: ExportControlInput & { foreignCountries?: string | null }): ExportReviewReadinessResult {
  const assessment = evaluateExportControl(input);
  const blockers: string[] = [];

  if (input.jurisdiction === 'pending') blockers.push('Jurisdiction is still pending — classify under ITAR/EAR/OFAC/not-subject.');
  if (assessment.unanswered.length > 0) {
    blockers.push(`Answer every screening question before determining — not answered: ${describeQuestions(assessment.unanswered)}.`);
  }
  if ((input.jurisdiction === 'itar' || input.jurisdiction === 'ear') && !hasText(input.classification)) {
    blockers.push('A USML category (ITAR) or ECCN/EAR99 (EAR) classification is required before determining.');
  }
  if (input.involvesForeignNationals === true && !hasText(input.foreignCountries)) {
    blockers.push('Foreign-national involvement is flagged — list the countries for the deemed-export analysis.');
  }
  if (assessment.licenseRequired === 'unknown' && input.jurisdiction !== 'not_subject') {
    blockers.push('The license-required outcome is still unknown — resolve the classification/restriction inputs.');
  }

  return { readyToDetermine: blockers.length === 0, blockers, findings: assessment.findings, assessment };
}
