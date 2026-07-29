/**
 * GCP / informed-consent advisor for AnA.
 *
 * Encodes the Good Clinical Practice essentials (ICH E6(R2)) and the required
 * elements of informed consent (ICH E6(R2) §4.8 and US 21 CFR 50.25 / 45 CFR
 * 46.116), plus the principal GCP responsibility domains and inspection-readiness
 * pitfalls. Lets AnA QC a consent form for required elements and brief teams on
 * GCP obligations grounded in the actual guideline.
 *
 * Deterministic, dependency-free, data-driven. Advisory only — IRB/EC review is
 * authoritative for any specific consent document.
 *
 * @module server/services/ana/gcp-consent
 */

/** A required element of informed consent, with detection cues for QC. */
export interface ConsentElement {
  id: string;
  label: string;
  basis: string; // citation
  required: boolean; // basic (true) vs additional/when-appropriate (false)
  cues: string[]; // lowercase phrases that suggest the element is present
}

/** A GCP responsibility/topic domain. */
export interface GcpDomain {
  id: string;
  label: string;
  basis: string;
  points: string[];
  aliases?: string[];
}

const CONSENT_ELEMENTS: ConsentElement[] = [
  { id: 'research_statement', label: 'Statement that the study involves research', basis: '21 CFR 50.25(a)(1); ICH E6(R2) 4.8.10(a)', required: true, cues: ['research', 'study', 'investigational', 'clinical trial'] },
  { id: 'purpose', label: 'Purpose and expected duration of participation', basis: '21 CFR 50.25(a)(1); ICH E6(R2) 4.8.10(b)', required: true, cues: ['purpose', 'duration', 'how long', 'expected to last', 'weeks', 'months'] },
  { id: 'procedures', label: 'Description of procedures (and which are experimental)', basis: '21 CFR 50.25(a)(1)', required: true, cues: ['procedure', 'visits', 'blood', 'sample', 'experimental', 'randomi'] },
  { id: 'risks', label: 'Reasonably foreseeable risks/discomforts', basis: '21 CFR 50.25(a)(2); ICH E6(R2) 4.8.10(g)', required: true, cues: ['risk', 'side effect', 'discomfort', 'adverse'] },
  { id: 'benefits', label: 'Expected benefits (to subject or others)', basis: '21 CFR 50.25(a)(3); ICH E6(R2) 4.8.10(h)', required: true, cues: ['benefit', 'may help', 'no direct benefit'] },
  { id: 'alternatives', label: 'Appropriate alternative treatments/procedures', basis: '21 CFR 50.25(a)(4); ICH E6(R2) 4.8.10(i)', required: true, cues: ['alternative', 'other treatment', 'instead', 'option'] },
  { id: 'confidentiality', label: 'Extent of confidentiality of records', basis: '21 CFR 50.25(a)(5); ICH E6(R2) 4.8.10(o)', required: true, cues: ['confidential', 'privacy', 'records', 'data protection', 'anonym'] },
  { id: 'compensation_injury', label: 'Compensation/treatment if injury occurs (>minimal risk)', basis: '21 CFR 50.25(a)(6)', required: true, cues: ['injury', 'compensation', 'if you are harmed', 'medical treatment'] },
  { id: 'contacts', label: 'Whom to contact (questions, rights, injury)', basis: '21 CFR 50.25(a)(7); ICH E6(R2) 4.8.10(p)', required: true, cues: ['contact', 'phone', 'questions', 'irb', 'ethics committee', 'rights'] },
  { id: 'voluntary', label: 'Participation is voluntary; refusal/withdrawal has no penalty', basis: '21 CFR 50.25(a)(8); ICH E6(R2) 4.8.10(m)', required: true, cues: ['voluntary', 'withdraw', 'refuse', 'no penalty', 'free to', 'at any time'] },
  // Additional / when-appropriate elements:
  { id: 'unforeseeable_risks', label: 'Possibility of currently unforeseeable risks', basis: '21 CFR 50.25(b)(1)', required: false, cues: ['unforeseeable', 'currently unknown', 'not yet known'] },
  { id: 'new_findings', label: 'Significant new findings will be provided', basis: '21 CFR 50.25(b)(5); ICH E6(R2) 4.8.10(l)', required: false, cues: ['new findings', 'new information', 'will be told', 'kept informed'] },
  { id: 'costs', label: 'Additional costs to the subject', basis: '21 CFR 50.25(b)(3)', required: false, cues: ['cost', 'expense', 'you will pay', 'no cost to you'] },
  { id: 'number_subjects', label: 'Approximate number of subjects', basis: '21 CFR 50.25(b)(6)', required: false, cues: ['number of subjects', 'participants will', 'people will take part'] },
];

const GCP_DOMAINS: GcpDomain[] = [
  {
    id: 'principles',
    label: 'ICH E6(R2) GCP principles',
    basis: 'ICH E6(R2) §2',
    points: [
      'Trials conducted per the Declaration of Helsinki and GCP.',
      'Benefits must justify risks before and during the trial.',
      'Rights, safety and well-being of subjects prevail over interests of science/society.',
      'Freely given informed consent from every subject before participation.',
      'Quality/risk-based approach: build quality into design and conduct (R2 addendum).',
    ],
    aliases: ['gcp principles', 'e6 principles'],
  },
  {
    id: 'sponsor',
    label: 'Sponsor responsibilities',
    basis: 'ICH E6(R2) §5',
    points: [
      'Quality management incl. risk-based quality management and critical-to-quality factors (R2).',
      'Trial oversight, including of CROs (delegation does not transfer accountability).',
      'Risk-based monitoring; data integrity (ALCOA+); safety reporting.',
      'TMF maintained; investigational product accountability.',
    ],
    aliases: ['sponsor', 'monitoring', 'rbm'],
  },
  {
    id: 'investigator',
    label: 'Investigator responsibilities',
    basis: 'ICH E6(R2) §4',
    points: [
      'Qualified, adequate resources, and adherence to the protocol.',
      'Informed consent obtained per §4.8 before any trial procedures.',
      'Medical care of subjects; AE/SAE reporting to sponsor/IRB-EC.',
      'Accurate, attributable source records; IP accountability at site.',
    ],
    aliases: ['investigator', 'site', 'pi'],
  },
  {
    id: 'irb_ec',
    label: 'IRB/IEC responsibilities',
    basis: 'ICH E6(R2) §3',
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
  completenessScore: number; // % of required elements detected
  brief: string;
}

/** QC a consent-form draft for the required elements of informed consent. */
export function reviewInformedConsent(text: string): ConsentReviewResult {
  const lc = (text || '').toLowerCase();
  const present: { id: string; label: string }[] = [];
  const missingRequired: { id: string; label: string; basis: string }[] = [];
  const missingAdditional: { id: string; label: string; basis: string }[] = [];

  for (const el of CONSENT_ELEMENTS) {
    const found = el.cues.some(c => lc.includes(c));
    if (found) {
      present.push({ id: el.id, label: el.label });
    } else if (el.required) {
      missingRequired.push({ id: el.id, label: el.label, basis: el.basis });
    } else {
      missingAdditional.push({ id: el.id, label: el.label, basis: el.basis });
    }
  }

  const requiredTotal = CONSENT_ELEMENTS.filter(e => e.required).length;
  const requiredPresent = requiredTotal - missingRequired.length;
  const completenessScore = Math.round((requiredPresent / requiredTotal) * 100);

  const parts: string[] = [];
  parts.push(`# Informed-consent QC — ${completenessScore}% of required elements detected`);
  parts.push(`\n_Detection is cue-based and advisory; IRB/EC review is authoritative._`);
  parts.push(bullets('Required elements MISSING (address before IRB/EC submission)', missingRequired.map(m => `${m.label} — ${m.basis}`)));
  parts.push(bullets('Additional/when-appropriate elements not detected', missingAdditional.map(m => `${m.label} — ${m.basis}`)));
  parts.push(bullets('Detected elements', present.map(p => p.label)));

  return { present, missingRequired, missingAdditional, completenessScore, brief: parts.filter(Boolean).join('\n') };
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
    parts.push('# Good Clinical Practice (ICH E6(R2))');
    for (const d of GCP_DOMAINS) {
      parts.push(`\n## ${d.label}  _(${d.basis})_`);
      parts.push(d.points.map(p => `- ${p}`).join('\n'));
    }
  }
  return { resolved: { domain: domain?.id ?? null }, domain, brief: parts.filter(Boolean).join('\n') };
}
