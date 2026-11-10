/**
 * Clinical-trial-application (CTA / IND) requirements expert — global.
 *
 * Before a sponsor may start a clinical trial, each major health authority
 * requires a clinical-trial-authorization application with a market-specific
 * set of components: an application form, the protocol, an Investigator's
 * Brochure, quality (CMC) data, nonclinical/clinical summaries, and various
 * region-specific declarations. This service encodes the required application
 * components per market and assesses a sponsor's package against them —
 * surfacing exactly which components are missing before submission.
 *
 * Markets: FDA (US IND), EMA (EU CTA via CTIS), PMDA (JP CTN / 治験届),
 * HEALTH_CANADA (CA CTA, Division 5), MHRA (UK CTA, Combined Review).
 * Other market component-presence checks retain their existing behavior. The
 * MHRA list projects the shared UK preparation outline, including permitted
 * alternatives; labels alone cannot resolve its date or document applicability.
 * This assessment is not authority to start a trial.
 *
 * Pure / deterministic — no DB, no IO.
 *
 * Reference: FDA IND — 21 CFR 312.23; EU clinical-trial application — Clinical
 * Trials Regulation (EU) 536/2014 (CTIS); PMDA Clinical Trial Notification
 * (CTN, 治験届); Health Canada CTA — Food and Drug Regulations Division 5
 * (incl. form HC/SC 3011); MHRA UK CTA — Combined Review (IRAS), post-Brexit.
 *
 * @module server/services/global-ri/clinical-trial-application-requirements
 */

import {
  sectionBlueprint as ukCtaSections,
  outlineBasis as ukCtaBasis,
  outlineLimitations as ukCtaLimitations,
} from '../../../shared/regulatory/uk-cta-authoring.js';
import type { RegulatoryBasis } from '../../../shared/regulatory/regulatory-basis.js';

export type CtaMarket = 'FDA' | 'EMA' | 'PMDA' | 'HEALTH_CANADA' | 'MHRA';

export interface CtaComponent {
  /** Stable component code (e.g. 'us_ind_1571'). */
  code: string;
  /** Human label. */
  label: string;
  /** Preparation guidance, including alternatives and unresolved conditions. */
  guidance?: string;
}

/** Required clinical-trial-application components for an initial CTA/IND, by market. */
export const CTA_REQUIREMENTS: Record<CtaMarket, CtaComponent[]> = {
  FDA: [
    { code: 'us_ind_1571', label: 'Form FDA 1571 (cover sheet — Investigational New Drug Application)' },
    { code: 'us_ind_toc', label: 'Table of contents' },
    { code: 'us_ind_intro_plan', label: 'Introductory statement and general investigational plan' },
    { code: 'us_ind_ib', label: "Investigator's Brochure" },
    { code: 'us_ind_protocol', label: 'Protocol(s)' },
    { code: 'us_ind_cmc', label: 'Chemistry, manufacturing, and control (CMC) information' },
    { code: 'us_ind_pharm_tox', label: 'Pharmacology and toxicology information' },
    { code: 'us_ind_prev_human', label: 'Previous human experience with the investigational drug' },
    { code: 'us_ind_1572', label: 'Form FDA 1572 (Statement of Investigator)' },
  ],
  EMA: [
    { code: 'eu_cta_cover_letter', label: 'Cover letter' },
    { code: 'eu_cta_application_form', label: 'EU application form' },
    { code: 'eu_cta_protocol', label: 'Protocol' },
    { code: 'eu_cta_ib', label: "Investigator's Brochure" },
    { code: 'eu_cta_impd', label: 'Investigational Medicinal Product Dossier (IMPD — quality, nonclinical, clinical)' },
    { code: 'eu_cta_gmp', label: 'GMP / manufacturing authorisation documentation' },
    { code: 'eu_cta_consent', label: 'Subject information sheet and informed consent form' },
    { code: 'eu_cta_investigator_suitability', label: 'Suitability of the investigator and trial sites' },
  ],
  PMDA: [
    { code: 'jp_ctn_form', label: 'Clinical Trial Notification form (治験届)' },
    { code: 'jp_ctn_protocol', label: 'Protocol' },
    { code: 'jp_ctn_ib', label: "Investigator's Brochure" },
    { code: 'jp_ctn_cmc', label: 'CMC / quality data' },
    { code: 'jp_ctn_nonclinical', label: 'Nonclinical data summary' },
  ],
  HEALTH_CANADA: [
    { code: 'ca_cta_hc3011', label: 'Clinical Trial Application form (HC/SC 3011)' },
    { code: 'ca_cta_protocol', label: 'Protocol' },
    { code: 'ca_cta_ib', label: "Investigator's Brochure" },
    { code: 'ca_cta_cmc', label: 'Chemistry and manufacturing information (QOS-CE)' },
    { code: 'ca_cta_psear', label: 'Protocol Safety and Efficacy Assessment' },
  ],
  MHRA: ukCtaSections.sections.filter((section) => section.required).map((section) => ({
    code: section.code, label: section.title, guidance: section.guidance,
  })),
};

export type CtaFindingSeverity = 'error' | 'warning';

export interface CtaFinding {
  severity: CtaFindingSeverity;
  /** MISSING_COMPONENT / UNKNOWN_MARKET / EXTRA_COMPONENT / MHRA_APPLICABILITY_UNASSESSED. */
  code: string;
  message: string;
  /** The component code the finding concerns, when applicable. */
  component?: string;
}

export interface CtaReadinessResult {
  market: CtaMarket;
  ready: boolean;
  /** All required components for the market. */
  required: CtaComponent[];
  /** Required component codes the sponsor has not provided. */
  missing: string[];
  findings: CtaFinding[];
  counts: { errors: number; warnings: number };
  /** A labels-only UK assessment has no initial date or product/alternative facts. */
  applicability?: { state: 'unassessed'; basis: RegulatoryBasis; limitations: readonly string[] };
}

export interface CtaReadinessInput {
  market: CtaMarket;
  /** Component codes the sponsor has assembled (from CTA_REQUIREMENTS). */
  providedComponents: string[];
}

/**
 * Assess a sponsor's clinical-trial-application components against the market's
 * required set. A missing required component is a blocking error; an
 * unrecognized provided code is an informational warning; an unknown market is
 * a blocking error. UK labels cannot determine initial-date transition,
 * product scope or conditional alternatives, so MHRA always remains unassessed.
 * ready ⇔ no errors; this is package preparation, not approval to start a trial.
 * Pure / deterministic; findings ordered by component code then severity.
 */
export function assessCtaReadiness(input: CtaReadinessInput): CtaReadinessResult {
  const required = CTA_REQUIREMENTS[input.market];

  if (!required) {
    return {
      market: input.market,
      ready: false,
      required: [],
      missing: [],
      findings: [{ severity: 'error', code: 'UNKNOWN_MARKET', message: `No clinical-trial-application requirements modeled for market "${input.market}".` }],
      counts: { errors: 1, warnings: 0 },
    };
  }

  const provided = new Set((input.providedComponents ?? []).map((c) => String(c)));
  const recognized = input.market === 'MHRA' ? ukCtaSections.sections : required;
  const recognizedCodes = new Set(recognized.map((row) => row.code));
  const findings: CtaFinding[] = [];

  const missing: string[] = [];
  for (const comp of required) {
    if (!provided.has(comp.code)) {
      missing.push(comp.code);
      const prefix = input.market === 'MHRA' ? 'Missing baseline UK CTA preparation row' : 'Missing required CTA/IND component';
      findings.push({ severity: 'error', code: 'MISSING_COMPONENT', message: `${prefix}: ${comp.label}.`, component: comp.code });
    }
  }

  for (const code of provided) {
    if (!recognizedCodes.has(code)) {
      findings.push({ severity: 'warning', code: 'EXTRA_COMPONENT', message: `Provided component "${code}" is not in the ${input.market} required CTA/IND set; confirm relevance.`, component: code });
    }
  }

  const applicability = input.market === 'MHRA' ? {
    state: 'unassessed' as const, basis: ukCtaBasis, limitations: ukCtaLimitations,
  } : undefined;
  if (applicability) findings.push({
    severity: 'error', code: 'MHRA_APPLICABILITY_UNASSESSED',
    message: 'UK CTA preparation remains unassessed: confirm the initial application submission date and old/new-rule transition, medicinal-product scope, conditional documents and permitted alternatives. Component labels alone cannot establish package readiness. This assessment does not authorise a trial to start; verify joint MHRA and REC approval separately.',
  });

  findings.sort((a, b) => {
    const ca = a.component ?? '';
    const cb = b.component ?? '';
    if (ca !== cb) return ca.localeCompare(cb);
    return a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1;
  });

  const errors = findings.filter((f) => f.severity === 'error').length;

  return {
    market: input.market,
    ready: errors === 0,
    required,
    missing,
    findings,
    counts: { errors, warnings: findings.length - errors },
    ...(applicability ? { applicability } : {}),
  };
}

/** List the required CTA/IND components for a market (for a checklist UI). */
export function getCtaRequirements(market: CtaMarket): CtaComponent[] {
  return CTA_REQUIREMENTS[market] ?? [];
}
