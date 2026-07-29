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

export interface ExportControlInput {
  jurisdiction: ExportJurisdiction | string;
  /** USML category (ITAR) or ECCN / 'EAR99' (EAR) — free text. */
  classification?: string | null;
  involvesForeignNationals?: boolean;
  hasPublicationRestrictions?: boolean;
  hasProprietaryRestrictions?: boolean;
  /** True when tangible items/technology physically leave the US (not just information). */
  involvesPhysicalExport?: boolean;
}

export interface ExportControlFinding { severity: 'critical' | 'warning' | 'info'; message: string }

export interface ExportControlAssessment {
  /** Whether the Fundamental Research Exclusion applies to the project's information. */
  freApplies: boolean;
  licenseRequired: ExportLicenseRequired;
  findings: ExportControlFinding[];
  citations: string[];
  basis: string;
}

function isEar99(classification?: string | null): boolean {
  return typeof classification === 'string' && classification.trim().toUpperCase() === 'EAR99';
}
function hasText(s?: string | null): boolean { return typeof s === 'string' && s.trim().length > 0; }

/**
 * Deterministic export-control assessment. The Fundamental Research Exclusion
 * applies only to *information* arising from research with no publication or
 * proprietary/access restrictions; it never covers tangible exports or controlled
 * items. Pure. (15 CFR 734.8; NSDD-189; 22 CFR 120–130.)
 */
export function evaluateExportControl(input: ExportControlInput): ExportControlAssessment {
  const findings: ExportControlFinding[] = [];
  const citations: string[] = [];
  const restricted = input.hasPublicationRestrictions === true || input.hasProprietaryRestrictions === true;
  const freApplies = !restricted && !(input.involvesPhysicalExport === true);

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
      if (freApplies && !input.involvesPhysicalExport) {
        licenseRequired = 'no';
        findings.push({ severity: 'info', message: 'EAR information qualifies for the Fundamental Research Exclusion — no license for the resulting information (15 CFR 734.8).' });
      } else if (isEar99(input.classification) && input.involvesForeignNationals !== true) {
        licenseRequired = 'no';
        findings.push({ severity: 'info', message: 'EAR99 item with no listed controls and no foreign-national/embargo concern — generally no license required (screen destination/end-user).' });
      } else if (hasText(input.classification) && !isEar99(input.classification)) {
        licenseRequired = 'yes';
        findings.push({ severity: 'critical', message: `Listed ECCN "${(input.classification as string).trim()}" with restrictions or a foreign-national recipient — check the Commerce Country Chart; a license is likely required (deemed export, 15 CFR 734.13).` });
      } else {
        licenseRequired = 'unknown';
        findings.push({ severity: 'warning', message: 'EAR jurisdiction but classification incomplete — assign an ECCN/EAR99 before a final determination.' });
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

  return { freApplies, licenseRequired, findings, citations, basis: EXPORT_CONTROL_BASIS };
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
 * pending; a subject (ITAR/EAR) review with no classification; foreign-national
 * involvement with the license outcome still unknown. Pure.
 */
export function evaluateExportReviewReadiness(input: ExportControlInput & { foreignCountries?: string | null }): ExportReviewReadinessResult {
  const assessment = evaluateExportControl(input);
  const blockers: string[] = [];

  if (input.jurisdiction === 'pending') blockers.push('Jurisdiction is still pending — classify under ITAR/EAR/OFAC/not-subject.');
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
