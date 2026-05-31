/**
 * ClinicalTrials.gov v2 → CSR record normalizer.
 *
 * A pure, deterministic mapping from a ClinicalTrials.gov API v2 study object to
 * the platform's CSR insert shapes (`csr_reports` + `csr_details`). No network,
 * no database, no randomness — given the same study it always produces the same
 * records, which makes the corpus reproducible and the function unit-testable
 * against fixtures.
 *
 * Honesty contract: every field that the source does not provide is left null /
 * omitted. We never invent a sponsor, a sample size, an endpoint, or a design.
 * The only derived value is `successHint`, and it is explicitly a coarse,
 * source-grounded mapping of the registry status (not an outcome judgment) and
 * is null whenever the status does not map cleanly.
 */

import type { CtgovStudy } from './ctgov-types';

/** Shape inserted into csr_reports (matches server/data-importer.ts reportValues). */
export interface NormalizedCsrReport {
  title: string;
  sponsor: string;
  indication: string;
  phase: string;
  status: string;
  date: string | null;
  summary: string | null;
}

/** Shape inserted into csr_details (matches server/data-importer.ts detailValues). */
export interface NormalizedCsrDetails {
  studyDesign: string | null;
  primaryObjective: string | null;
  endpoints: { primary: string[]; secondary: string[] } | null;
  treatmentArms: Array<{ label: string; type: string | null; description: string | null }> | null;
  inclusionCriteria: string | null;
  exclusionCriteria: string | null;
  sampleSize: number | null;
  statisticalMethods: string | null;
  studyDuration: string | null;
  results: null;
}

export interface NormalizedStudy {
  /** Stable external identifier (NCT id) used for dedupe. Null if the source lacks one. */
  nctId: string | null;
  report: NormalizedCsrReport;
  details: NormalizedCsrDetails;
  /**
   * Coarse, source-grounded success signal derived from registry status, for
   * training/benchmarking. 1 = completed, 0 = terminated/withdrawn/suspended,
   * null = ongoing/unknown (not assessable). This is registry status, NOT an
   * efficacy or approval outcome.
   */
  successHint: 0 | 1 | null;
}

/** Normalize a free-text registry phase list into a single human-readable phase. */
export function normalizePhase(phases: string[] | undefined): string {
  if (!phases || phases.length === 0) return 'Not specified';
  const cleaned = phases
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      const m = p.match(/PHASE\s*([1-4])/i);
      if (m) return `Phase ${m[1]}`;
      if (/EARLY_PHASE1/i.test(p) || /EARLY PHASE 1/i.test(p)) return 'Early Phase 1';
      if (/^NA$/i.test(p) || /NOT_APPLICABLE/i.test(p)) return 'Not applicable';
      return p;
    });
  return cleaned.join('/');
}

/** Map ClinicalTrials.gov overallStatus to a coarse success hint (or null). */
export function statusToSuccessHint(overallStatus: string | undefined): 0 | 1 | null {
  if (!overallStatus) return null;
  const s = overallStatus.toUpperCase();
  if (s === 'COMPLETED') return 1;
  if (s === 'TERMINATED' || s === 'WITHDRAWN' || s === 'SUSPENDED') return 0;
  // RECRUITING, ACTIVE_NOT_RECRUITING, ENROLLING_BY_INVITATION, NOT_YET_RECRUITING,
  // UNKNOWN, etc. — outcome not assessable from status.
  return null;
}

/** Compose a readable study-design string from the v2 designInfo block. */
function buildStudyDesign(study: CtgovStudy): string | null {
  const design = study.protocolSection?.designModule;
  if (!design) return null;
  const parts: string[] = [];
  if (design.studyType) parts.push(design.studyType.toLowerCase());
  const info = design.designInfo;
  if (info?.allocation) parts.push(info.allocation.replace(/_/g, ' ').toLowerCase());
  if (info?.interventionModel)
    parts.push(info.interventionModel.replace(/_/g, ' ').toLowerCase());
  const masking = info?.maskingInfo?.masking;
  if (masking) parts.push(`${masking.replace(/_/g, ' ').toLowerCase()} masking`);
  if (info?.primaryPurpose)
    parts.push(`${info.primaryPurpose.replace(/_/g, ' ').toLowerCase()} purpose`);
  return parts.length ? parts.join(', ') : null;
}

/**
 * Split a ClinicalTrials.gov eligibility-criteria blob into inclusion and
 * exclusion narratives. The registry stores both in one free-text field with
 * conventional "Inclusion Criteria:" / "Exclusion Criteria:" headers.
 */
export function splitEligibility(blob: string | undefined): {
  inclusion: string | null;
  exclusion: string | null;
} {
  if (!blob || !blob.trim()) return { inclusion: null, exclusion: null };
  const text = blob.replace(/\r\n/g, '\n');
  const exclIdx = text.search(/exclusion criteria\s*:?/i);
  if (exclIdx === -1) {
    const incl = text.replace(/inclusion criteria\s*:?/i, '').trim();
    return { inclusion: incl || null, exclusion: null };
  }
  const inclPart = text
    .slice(0, exclIdx)
    .replace(/inclusion criteria\s*:?/i, '')
    .trim();
  const exclPart = text
    .slice(exclIdx)
    .replace(/exclusion criteria\s*:?/i, '')
    .trim();
  return { inclusion: inclPart || null, exclusion: exclPart || null };
}

/** Compute a study-duration string from start and completion dates, if present. */
function buildDuration(study: CtgovStudy): string | null {
  const status = study.protocolSection?.statusModule;
  const start = status?.startDateStruct?.date;
  const end =
    status?.completionDateStruct?.date ?? status?.primaryCompletionDateStruct?.date;
  if (!start || !end) return null;
  const startDate = new Date(start.length === 7 ? `${start}-01` : start);
  const endDate = new Date(end.length === 7 ? `${end}-01` : end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  const weeks = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
  if (weeks <= 0) return null;
  return `${weeks} weeks`;
}

/**
 * Normalize a single CT.gov v2 study into CSR insert records. Pure and
 * deterministic; returns null only if the study has no usable identification.
 */
export function normalizeCtgovStudy(study: CtgovStudy): NormalizedStudy | null {
  const protocol = study.protocolSection;
  if (!protocol) return null;

  const ident = protocol.identificationModule;
  const nctId = ident?.nctId ?? null;
  const title = ident?.briefTitle ?? ident?.officialTitle ?? null;
  // Without at least a title or an NCT id there is nothing to store honestly.
  if (!title && !nctId) return null;

  const conditions = protocol.conditionsModule?.conditions ?? [];
  const indication = conditions.length ? conditions.join(', ') : 'Not specified';
  const sponsor = protocol.sponsorCollaboratorsModule?.leadSponsor?.name ?? 'Unknown sponsor';
  const phase = normalizePhase(protocol.designModule?.phases);
  const overallStatus = protocol.statusModule?.overallStatus;

  const primaryOutcomes = (protocol.outcomesModule?.primaryOutcomes ?? [])
    .map(o => o.measure?.trim())
    .filter((m): m is string => Boolean(m));
  const secondaryOutcomes = (protocol.outcomesModule?.secondaryOutcomes ?? [])
    .map(o => o.measure?.trim())
    .filter((m): m is string => Boolean(m));
  const endpoints =
    primaryOutcomes.length || secondaryOutcomes.length
      ? { primary: primaryOutcomes, secondary: secondaryOutcomes }
      : null;

  const arms = (protocol.armsInterventionsModule?.armGroups ?? [])
    .map(a => ({
      label: a.label?.trim() ?? '',
      type: a.type?.replace(/_/g, ' ').toLowerCase() ?? null,
      description: a.description?.trim() ?? null,
    }))
    .filter(a => a.label);

  const eligibility = splitEligibility(protocol.eligibilityModule?.eligibilityCriteria);
  const enrollment = protocol.designModule?.enrollmentInfo?.count;

  const report: NormalizedCsrReport = {
    title: title ?? nctId ?? 'Untitled study',
    sponsor,
    indication,
    phase,
    status: overallStatus ? overallStatus.replace(/_/g, ' ').toLowerCase() : 'unknown',
    date:
      protocol.statusModule?.completionDateStruct?.date ??
      protocol.statusModule?.startDateStruct?.date ??
      null,
    summary: protocol.descriptionModule?.briefSummary?.trim() ?? null,
  };

  const details: NormalizedCsrDetails = {
    studyDesign: buildStudyDesign(study),
    primaryObjective: primaryOutcomes.length ? primaryOutcomes[0] : null,
    endpoints,
    treatmentArms: arms.length ? arms : null,
    inclusionCriteria: eligibility.inclusion,
    exclusionCriteria: eligibility.exclusion,
    sampleSize: typeof enrollment === 'number' && enrollment > 0 ? enrollment : null,
    statisticalMethods: null, // not present in the registry; do not fabricate
    studyDuration: buildDuration(study),
    results: null,
  };

  return {
    nctId,
    report,
    details,
    successHint: statusToSuccessHint(overallStatus),
  };
}

/** Normalize a batch, dropping studies that cannot be represented honestly. */
export function normalizeCtgovStudies(studies: CtgovStudy[]): NormalizedStudy[] {
  const out: NormalizedStudy[] = [];
  for (const s of studies) {
    const n = normalizeCtgovStudy(s);
    if (n) out.push(n);
  }
  return out;
}
