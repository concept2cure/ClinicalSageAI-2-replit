/**
 * @fileoverview Live projection of the governed nonclinical registry into the
 * Module 2.6 summary / Module 4 placement / SEND-readiness view the
 * `Nonclinical.tsx` surface renders.
 * @module server/services/nonclinical/m26-m4-view
 *
 * Pure, DB-free, deterministic. The governed `nonclinical_studies` +
 * `send_datasets` rows are the audited record; this module projects them
 * through the EXISTING composers/logic — it does not re-derive regulatory
 * content:
 *   - `buildM26NonclinicalSummaries` (server/services/preclinical) supplies the
 *     authoritative M2.6 completeness + gap list.
 *   - `mapStudyTypeToM24` buckets studies into pharmacology / PK / toxicology so
 *     the 2.6.2–2.6.7 subsection readiness matches the composer's own bucketing.
 *   - `ctdSectionFor` places each study in its Module 4 4.2.x section; per-section
 *     readiness is the fraction of studies FINALIZED (from the governed `status`),
 *     never a fabricated percentage.
 *   - `evaluateSendReadiness` rolls the per-study SEND gate up to a package view.
 *
 * A study set that is empty yields the honest ICH M4S skeleton (every data-bearing
 * subsection `missing`, the expected categories listed as gaps) — the route uses
 * this as its fail-closed / unprovisioned response.
 *
 * @compliance ICH M4S(R2); ICH M3(R2); CDISC SENDIG 3.x; FDA Study Data TCG.
 */

import type { NonclinicalStudyType, SendValidationStatus } from '../../../shared/schema/nonclinical';
import { buildM26NonclinicalSummaries } from '../preclinical/m26-nonclinical-summaries';
import { mapStudyTypeToM24, type NonclinicalStudyInput } from '../preclinical/nonclinical-m24-adapter';
import { ctdSectionFor, evaluateSendReadiness, sendInScope, type SendRiskLevel } from './nonclinical-logic';

/** Latest SEND dataset facts for a study (null when none is attached). */
export interface StudySendFacts {
  domainsPresent: string[];
  defineXmlPresent: boolean;
  nsdrcPresent: boolean;
  validationStatus: SendValidationStatus;
  validatorErrorCount: number;
}

/** A governed `nonclinical_studies` row (+ its latest SEND dataset) as consumed here. */
export interface GovernedStudyRow {
  studyNumber: string;
  studyType: NonclinicalStudyType;
  species: string | null;
  glpCompliant: boolean;
  noael: string | null;
  durationLabel: string | null;
  keyFinding: string | null;
  /** Governed lifecycle status; '4.2.x readiness' counts `finalized`. */
  status: string;
  send: StudySendFacts | null;
}

/** M2.6 subsection row for the surface (matches `NcM26Section`). */
export interface M26SectionRow {
  n: string;
  l: string;
  /** 'complete' (rendered) | 'missing' — pill-styled by the surface. */
  st: 'complete' | 'missing';
  note?: string;
}

/** Module 4 placement row for the surface (matches `NcM4Placement`). */
export interface M4PlacementRow {
  code: string;
  l: string;
  /** Finalized studies / total studies in this 4.2.x bucket, 0–100. */
  pct: number;
  note?: string;
}

export interface SendRollup {
  /** Number of in-scope (SEND-mandated) studies. */
  inScope: number;
  /** In-scope studies whose SEND package is validation-ready (risk 'low'). */
  validated: number;
  /** Union of required SEND domains missing across in-scope studies. */
  missingDomains: string[];
  /** Worst per-study risk across in-scope studies; 'none' when none in scope. */
  risk: SendRiskLevel | 'none';
}

export interface NonclinicalSummaryView {
  m26: M26SectionRow[];
  m4: M4PlacementRow[];
  send: SendRollup;
  /** M2.6 completeness (0–100) from the real composer. */
  completeness: number;
  /** Missing nonclinical categories from the real composer. */
  gaps: string[];
  /** True when at least one governed study fed the view. */
  provisioned: boolean;
}

/** The seven ICH M4S Module 2.6 subsections, in draft order. */
const M26_SUBSECTIONS: Array<{ n: string; l: string; bucket: 'intro' | 'pharm' | 'pk' | 'tox' }> = [
  { n: '2.6.1', l: 'Introduction', bucket: 'intro' },
  { n: '2.6.2', l: 'Pharmacology written summary', bucket: 'pharm' },
  { n: '2.6.3', l: 'Pharmacology tabulated summary', bucket: 'pharm' },
  { n: '2.6.4', l: 'Pharmacokinetics written summary', bucket: 'pk' },
  { n: '2.6.5', l: 'Pharmacokinetics tabulated summary', bucket: 'pk' },
  { n: '2.6.6', l: 'Toxicology written summary', bucket: 'tox' },
  { n: '2.6.7', l: 'Toxicology tabulated summary', bucket: 'tox' },
];

const M4_GROUPS: Array<{ code: string; l: string }> = [
  { code: '4.2.1', l: 'Pharmacology study reports' },
  { code: '4.2.2', l: 'Pharmacokinetic study reports' },
  { code: '4.2.3', l: 'Toxicology study reports' },
];

/**
 * Normalize a governed `NonclinicalStudyType` to a token the M2.4 adapter's
 * `mapStudyTypeToM24` recognizes. The adapter was written for the ungoverned
 * `ctd_nonclinical_studies` enum and does not know the governed `adme_pk`
 * spelling (it would fall through to 'toxicology'); every other governed value
 * maps acceptably. Applying this before both the composer call and our bucketing
 * keeps the M2.6 completeness and the per-subsection readiness consistent.
 */
function normalizeGovernedType(t: NonclinicalStudyType): string {
  return t === 'adme_pk' ? 'pharmacokinetics' : t;
}

function toStudyInput(r: GovernedStudyRow): NonclinicalStudyInput {
  return {
    studyId: r.studyNumber,
    studyType: normalizeGovernedType(r.studyType),
    species: r.species,
    glpCompliant: r.glpCompliant,
    noael: r.noael,
    primaryFinding: r.keyFinding ?? undefined,
    duration: r.durationLabel ?? undefined,
    reportSection: ctdSectionFor(r.studyType),
  };
}

/** Top-level 4.2.x group ('4.2.1'|'4.2.2'|'4.2.3') for a study. */
function m4Group(studyType: NonclinicalStudyType): string {
  return ctdSectionFor(studyType).split('.').slice(0, 3).join('.');
}

const RISK_RANK: Record<SendRiskLevel, number> = { low: 1, medium: 2, high: 3 };

/**
 * Project the governed study set into the surface's M2.6 / M4 / SEND view.
 * Deterministic; an empty `studies` set returns the honest all-missing skeleton.
 */
export function assembleNonclinicalSummary(
  studies: GovernedStudyRow[],
  opts: { drugSubstanceName?: string; indication?: string } = {},
): NonclinicalSummaryView {
  const inputs = studies.map(toStudyInput);

  // Authoritative M2.6 rollup from the real composer (completeness + gaps).
  const composed = buildM26NonclinicalSummaries({
    studies: inputs,
    drugSubstanceName: opts.drugSubstanceName,
    indication: opts.indication,
  });

  // Bucket by the composer's own M2.4 category so subsection readiness matches it.
  const categories = studies.map((s) => mapStudyTypeToM24(normalizeGovernedType(s.studyType)));
  const hasPharm = categories.some((c) => c === 'pharmacology' || c === 'safety_pharmacology');
  const hasPk = categories.some((c) => c === 'pharmacokinetics');
  const hasTox = categories.some(
    (c) => c === 'toxicology' || c === 'genotoxicity' || c === 'carcinogenicity' || c === 'reproductive_tox',
  );
  const present: Record<'intro' | 'pharm' | 'pk' | 'tox', boolean> = {
    intro: true, // 2.6.1 is always renderable boilerplate
    pharm: hasPharm,
    pk: hasPk,
    tox: hasTox,
  };
  const missingNote: Record<'pharm' | 'pk' | 'tox', string> = {
    pharm: 'No pharmacology / safety-pharmacology study in the registry.',
    pk: 'No pharmacokinetics / ADME study in the registry.',
    tox: 'No toxicology study in the registry (required per ICH M3(R2)).',
  };

  const m26: M26SectionRow[] = M26_SUBSECTIONS.map((s) => {
    if (present[s.bucket]) return { n: s.n, l: s.l, st: 'complete' };
    return { n: s.n, l: s.l, st: 'missing', note: missingNote[s.bucket as 'pharm' | 'pk' | 'tox'] };
  });

  // Module 4 placement — finalized / total per 4.2.x group (honest readiness).
  const m4: M4PlacementRow[] = M4_GROUPS.map((g) => {
    const inGroup = studies.filter((s) => m4Group(s.studyType) === g.code);
    if (inGroup.length === 0) return { code: g.code, l: g.l, pct: 0, note: 'No studies placed yet.' };
    const finalized = inGroup.filter((s) => s.status === 'finalized').length;
    return {
      code: g.code,
      l: g.l,
      pct: Math.round((finalized / inGroup.length) * 100),
      note: `${finalized}/${inGroup.length} report(s) finalized.`,
    };
  });

  // SEND readiness rollup across in-scope studies.
  const inScopeStudies = studies.filter((s) => sendInScope(s.studyType));
  const missingDomainSet = new Set<string>();
  let validated = 0;
  let worst = 0;
  for (const s of inScopeStudies) {
    const facts: StudySendFacts = s.send ?? {
      domainsPresent: [],
      defineXmlPresent: false,
      nsdrcPresent: false,
      validationStatus: 'not_validated',
      validatorErrorCount: 0,
    };
    const verdict = evaluateSendReadiness({ studyType: s.studyType, ...facts });
    verdict.missingDomains.forEach((d) => missingDomainSet.add(d));
    if (verdict.riskLevel === 'low') validated += 1;
    worst = Math.max(worst, RISK_RANK[verdict.riskLevel]);
  }
  const risk: SendRiskLevel | 'none' =
    inScopeStudies.length === 0 ? 'none' : worst >= 3 ? 'high' : worst === 2 ? 'medium' : 'low';

  const send: SendRollup = {
    inScope: inScopeStudies.length,
    validated,
    missingDomains: [...missingDomainSet].sort(),
    risk,
  };

  return {
    m26,
    m4,
    send,
    completeness: composed.completeness,
    gaps: composed.gaps,
    provisioned: studies.length > 0,
  };
}
