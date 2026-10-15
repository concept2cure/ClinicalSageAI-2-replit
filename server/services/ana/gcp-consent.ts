/**
 * GCP / informed-consent advisor for AnA.
 *
 * Encodes the Good Clinical Practice essentials (ICH E6(R3)) and the elements
 * of informed consent in US 21 CFR 50.25 (with the ClinicalTrials.gov statement,
 * 50.25(c)), plus the principal GCP responsibility domains. Lets AnA QC a
 * consent form for required elements and brief teams on GCP obligations.
 *
 * Deterministic, dependency-free, data-driven. Advisory only — IRB/EC review is
 * authoritative for any specific consent document.
 *
 * 2026-10-08 (D2, AnA's document expertise): the check missed 50.25(c), the
 * ClinicalTrials.gov statement an applicable clinical trial's consent must
 * carry, and the additional elements 50.25(b)(2) and (b)(4). Its cues were
 * single words, so "study" credited the research statement and "records"
 * credited confidentiality, whose specific requirement (FDA may inspect the
 * records) was never looked for. Each element now names the wording that
 * satisfies it, every pattern of which must occur in the text. It cited ICH
 * E6(R2), which E6(R3) superseded on 2025-01-06 (currency fact
 * ich-e6r3-gcp-step4). The CFR and ICH citations are recall: they were written
 * where eCFR and ich.org were not reachable, and say so in `basisNote`.
 *
 * @module server/services/ana/gcp-consent
 */
import {
  consentElementCitation,
  consentElementsFor,
  type ConsentApplicability,
} from '../../../shared/regulatory/informed-consent-elements';


/** A required element of informed consent, with the wording that satisfies it. */
export interface ConsentElement {
  id: string;
  label: string;
  basis: string; // citation
  required: boolean; // basic (true) vs additional/when-appropriate (false)
  /** Every pattern must occur somewhere in the consent text for the element to be found. */
  all: RegExp[];
}

/** A GCP responsibility/topic domain. */
export interface GcpDomain {
  id: string;
  label: string;
  basis: string;
  points: string[];
  aliases?: string[];
}

/** The provenance of every citation in this module. */
export const CONSENT_BASIS_NOTE =
  '21 CFR 50.25 and ICH E6(R3) citations are recall: not checked against the regulator’s text from this environment.';

const E6R3_CONSENT = 'ICH E6(R3) Annex 1 §2.8 (Informed Consent of Trial Participants)';

/**
 * The FDA (21 CFR 50) elements, from the one record
 * (shared/regulatory/informed-consent-elements.ts). Applicability decides what
 * the review may call missing: 50.25(c) only for an applicable clinical trial.
 */
const CONSENT_ELEMENTS: Array<ConsentElement & { applicability: ConsentApplicability }> = consentElementsFor('fda').map((el) => ({
  id: el.id,
  label: el.label,
  basis: ['research_statement', 'voluntary'].includes(el.id) ? `${consentElementCitation(el)}; ${E6R3_CONSENT}` : consentElementCitation(el),
  required: el.applicability === 'required',
  applicability: el.applicability,
  all: el.all,
}));

const GCP_DOMAINS: GcpDomain[] = [
  {
    id: 'principles',
    label: 'ICH E6(R3) GCP principles',
    basis: 'ICH E6(R3) Principles of GCP',
    points: [
      'Trials conducted per the ethical principles of the Declaration of Helsinki and GCP.',
      'Benefits must justify risks before and during the trial.',
      'Rights, safety and well-being of participants prevail over interests of science/society.',
      'Freely given informed consent from every participant before participation.',
      'Quality by design: critical-to-quality factors identified and risks managed proportionately.',
    ],
    aliases: ['gcp principles', 'e6 principles'],
  },
  {
    id: 'sponsor',
    label: 'Sponsor responsibilities',
    basis: 'ICH E6(R3) Annex 1, sponsor',
    points: [
      'Quality management with proportionate, risk-based approaches to critical-to-quality factors.',
      'Trial oversight, including of service providers (delegation does not transfer accountability).',
      'Risk-based monitoring; data governance and integrity; safety reporting.',
      'Essential records maintained; investigational product accountability.',
    ],
    aliases: ['sponsor', 'monitoring', 'rbm'],
  },
  {
    id: 'investigator',
    label: 'Investigator responsibilities',
    basis: 'ICH E6(R3) Annex 1, investigator',
    points: [
      'Qualified, adequate resources, and adherence to the protocol.',
      'Informed consent obtained before any trial procedures.',
      'Medical care of participants; AE/SAE reporting to sponsor/IRB-EC.',
      'Accurate, attributable source records; IP accountability at site.',
    ],
    aliases: ['investigator', 'site', 'pi'],
  },
  {
    id: 'irb_ec',
    label: 'IRB/IEC responsibilities',
    basis: 'ICH E6(R3) Annex 1, IRB/IEC',
    points: [
      'Safeguard rights/safety/well-being; review protocol, consent, and recruitment.',
      'Continuing review at intervals appropriate to risk.',
      'Independent composition and documented procedures.',
    ],
    aliases: ['irb', 'iec', 'ethics committee', 'ec'],
  },
];

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

function findDomain(key?: string): GcpDomain | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    GCP_DOMAINS.find(d => d.id === k) ||
    GCP_DOMAINS.find(d => d.aliases?.some(a => a.toLowerCase() === k)) ||
    GCP_DOMAINS.find(d => d.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(d.id))
  );
}

export interface ConsentReviewResult {
  present: { id: string; label: string }[];
  missingRequired: { id: string; label: string; basis: string }[];
  missingAdditional: { id: string; label: string; basis: string }[];
  /** Elements that apply only in a case the caller did not state (50.25(c): an applicable clinical trial). */
  conditional: { id: string; label: string; basis: string; condition: string }[];
  /** Share of required elements whose wording was found (a count, not a compliance score). */
  completenessScore: number;
  brief: string;
}

/** QC a consent-form draft for the required elements of informed consent. */
export function reviewInformedConsent(
  text: string,
  opts: { applicableClinicalTrial?: boolean | null } = {},
): ConsentReviewResult {
  const present: { id: string; label: string }[] = [];
  const missingRequired: { id: string; label: string; basis: string }[] = [];
  const missingAdditional: { id: string; label: string; basis: string }[] = [];
  const conditional: ConsentReviewResult['conditional'] = [];
  const act = opts.applicableClinicalTrial;
  const elements = CONSENT_ELEMENTS
    .filter(el => !(el.applicability === 'applicable_clinical_trial' && act === false))
    .map(el => (el.applicability === 'applicable_clinical_trial' && act === true ? { ...el, required: true } : el));

  for (const el of elements) {
    const found = el.all.every(re => re.test(text || ''));
    if (found) {
      present.push({ id: el.id, label: el.label });
    } else if (el.applicability === 'applicable_clinical_trial' && act == null) {
      conditional.push({ id: el.id, label: el.label, basis: el.basis, condition: 'Required if this is an applicable clinical trial (42 U.S.C. 282(j)); its status was not stated.' });
    } else if (el.required) {
      missingRequired.push({ id: el.id, label: el.label, basis: el.basis });
    } else {
      missingAdditional.push({ id: el.id, label: el.label, basis: el.basis });
    }
  }

  const requiredTotal = elements.filter(e => e.required).length;
  const requiredPresent = requiredTotal - missingRequired.length;
  const completenessScore = Math.round((requiredPresent / requiredTotal) * 100);

  const parts: string[] = [];
  parts.push(`# Informed-consent QC — ${requiredPresent} of ${requiredTotal} required elements found in the wording`);
  parts.push(`\n_The check looks for the wording each element needs; an element not found is one to read for, not a verdict. IRB/EC review is authoritative. ${CONSENT_BASIS_NOTE}_`);
  parts.push(bullets('Required elements not found (address before IRB/EC submission)', missingRequired.map(m => `${m.label} — ${m.basis}`)));
  parts.push(bullets('Applies only in a case not stated — not assessed', conditional.map(m => `${m.label} — ${m.basis}. ${m.condition}`)));
  parts.push(bullets('Additional/when-appropriate elements not found', missingAdditional.map(m => `${m.label} — ${m.basis}`)));
  parts.push(bullets('Elements found', present.map(p => p.label)));

  return { present, missingRequired, missingAdditional, conditional, completenessScore, brief: parts.filter(Boolean).join('\n') };
}

export interface GcpGuidanceResult {
  resolved: { domain: string | null };
  domain: GcpDomain | null;
  brief: string;
}

export function listGcpDomains() {
  return {
    domains: GCP_DOMAINS.map(d => ({ id: d.id, label: d.label })),
    consentElements: CONSENT_ELEMENTS.map(e => ({ id: e.id, label: e.label, required: e.required })),
  };
}

/** Brief on a GCP responsibility domain (or all, if unspecified). */
export function adviseGcp(domainKey?: string): GcpGuidanceResult {
  const domain = findDomain(domainKey) ?? null;
  const parts: string[] = [];
  if (domain) {
    parts.push(`# GCP: ${domain.label}`);
    parts.push(`\n**Basis.** ${domain.basis}`);
    parts.push(bullets('Key points', domain.points));
  } else {
    parts.push('# Good Clinical Practice (ICH E6(R3), in force since 2025-01-06; E6(R2) (superseded))');
    for (const d of GCP_DOMAINS) {
      parts.push(`\n## ${d.label}  _(${d.basis})_`);
      parts.push(d.points.map(p => `- ${p}`).join('\n'));
    }
  }
  return { resolved: { domain: domain?.id ?? null }, domain, brief: parts.filter(Boolean).join('\n') };
}
