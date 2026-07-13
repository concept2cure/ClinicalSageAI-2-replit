/**
 * Shadow-review fixture data -- ported from kit app/shadow-review-data.jsx.
 * Reviewer lenses, illustrative findings, and the VERBATIM deterministic
 * risk aggregation from shadow-review-service.ts.
 */

/* -- Interfaces -- */

export interface ShadowLens {
  id: string;
  label: string;
  agency: string;
  region: string;
  gates: { rtf: string; crl: string };
  blurb: string;
  dims: string[];
}

export interface ShadowFinding {
  dimension: 'rtf' | 'crl' | 'format' | 'nb';
  severity: 'critical' | 'major' | 'minor' | 'info';
  title: string;
  detail?: string;
  basis?: string;
  recommendation?: string;
  leafRef?: string;
}

export interface ShadowSequence {
  code: string;
  app: string;
  seq: string;
  type: string;
  region: string;
  leaves: number;
}

export interface ShadowRisk {
  rtf: number;
  crl: number;
}

/* -- VERBATIM aggregateRisk (deterministic, pure) -- */

const SEVERITY_WEIGHT: Record<string, number> = { critical: 1, major: 0.6, minor: 0.25, info: 0 };

export function shadowAggregateRisk(findings: ShadowFinding[]): ShadowRisk {
  function score(dims: string[]): number {
    const relevant = (findings || []).filter((f) => dims.indexOf(f.dimension) >= 0);
    if (relevant.length === 0) return 0;
    if (relevant.some((f) => f.severity === 'critical')) return 1;
    const sum = relevant.reduce((acc, f) => acc + (SEVERITY_WEIGHT[f.severity] || 0), 0);
    return Math.min(1, Number((sum / (relevant.length + 1) + 0.15 * Math.min(relevant.length, 3)).toFixed(3)));
  }
  return { rtf: score(['rtf', 'format']), crl: score(['crl', 'nb']) };
}

/* -- Severity and dimension maps -- */

export interface SeverityMeta {
  label: string;
  tone: string;
  rank: number;
}

export const SR_SEV: Record<string, SeverityMeta> = {
  critical: { label: 'Critical', tone: 'error', rank: 0 },
  major: { label: 'Major', tone: 'error', rank: 1 },
  minor: { label: 'Minor', tone: 'warning', rank: 2 },
  info: { label: 'Info', tone: 'idle', rank: 3 },
};

export const SR_DIM: Record<string, string> = {
  rtf: 'RTF gate',
  crl: 'CRL gate',
  format: 'Format',
  nb: 'Non-conformity',
};

/* -- Reviewer lenses -- */

export const SHADOW_LENSES: ShadowLens[] = [
  {
    id: 'fda_filing', label: 'FDA filing reviewer', agency: 'FDA', region: 'fda',
    gates: { rtf: 'Refuse-to-File (RTF)', crl: 'Complete Response Letter (CRL)' },
    blurb: 'Simulates the FDA regulatory project manager and review division at the 60-day filing gate and end-of-cycle.',
    dims: ['rtf', 'crl', 'format'],
  },
  {
    id: 'ema_d120', label: 'EMA D120 assessor', agency: 'EMA', region: 'eu',
    gates: { rtf: 'Validation (Day 0)', crl: 'Day-120 List of Questions' },
    blurb: 'Simulates the EMA (Co-)Rapporteur assessment team producing the Day-120 List of Questions.',
    dims: ['rtf', 'crl', 'format'],
  },
  {
    id: 'pmda', label: 'PMDA reviewer', agency: 'PMDA', region: 'jp',
    gates: { rtf: 'Compliance acceptance', crl: 'Interview-form review points' },
    blurb: 'Simulates the PMDA review team and the eCTD-JP compliance check.',
    dims: ['rtf', 'crl', 'format'],
  },
  {
    id: 'nb_mdr', label: 'MDR Notified Body', agency: 'NB (MDR)', region: 'eu',
    gates: { rtf: 'Completeness check', crl: 'Non-conformity (deficiency)' },
    blurb: 'Simulates a Notified Body technical-documentation assessor under EU MDR 2017/745.',
    dims: ['nb', 'format'],
  },
  {
    id: 'nb_ivdr', label: 'IVDR Notified Body', agency: 'NB (IVDR)', region: 'eu',
    gates: { rtf: 'Completeness check', crl: 'Non-conformity (deficiency)' },
    blurb: 'Simulates a Notified Body technical-documentation assessor under EU IVDR 2017/746.',
    dims: ['nb', 'format'],
  },
];

export function shadowLens(id: string): ShadowLens {
  return SHADOW_LENSES.find((l) => l.id === id) || SHADOW_LENSES[0];
}

/* -- Sample sequence -- */

export const SHADOW_SEQUENCE: ShadowSequence = {
  code: 'BX-204', app: 'BLA 761123', seq: '0000', type: 'original', region: 'fda', leaves: 42,
};

/* -- Sample findings per lens -- */

export const SHADOW_FINDINGS: Record<string, ShadowFinding[]> = {
  fda_filing: [
    {
      dimension: 'crl', severity: 'major', title: 'Single pivotal trial without confirmatory support',
      detail: 'Efficacy rests on one pivotal study (BX204-301). The division may question whether a single trial meets the substantial-evidence standard for a full approval without a second adequate and well-controlled study or strong confirmatory evidence.',
      basis: 'FDA 1998 "Providing Clinical Evidence of Effectiveness" guidance; 21 CFR 314.126.',
      recommendation: 'Pre-empt in §2.5.4: argue statistical persuasiveness (p<0.001), internal consistency across subgroups, and mechanistic support; or confirm accelerated-approval framing.',
      leafRef: '2.5.4',
    },
    {
      dimension: 'crl', severity: 'major', title: 'Immunogenicity strategy may be insufficient for a biologic',
      detail: 'ADA assay validation and the neutralizing-antibody tier are summarized but the sampling schedule does not cover the full dosing interval at steady state.',
      basis: 'FDA Immunogenicity Testing guidance (2019); ICH S6(R1).',
      recommendation: 'Reconcile §2.7.2 ADA sampling with the clinical protocol; state the NAb cut-point basis.',
      leafRef: '2.7.2',
    },
    {
      dimension: 'rtf', severity: 'minor', title: 'Financial disclosure (Form 3454/3455) coverage not evident',
      detail: 'The application should certify/disclose financial interests for all clinical investigators in the pivotal study; the filing does not show a complete 3454/3455 set.',
      basis: '21 CFR Part 54; RTF checklist item.',
      recommendation: 'Attach the complete financial disclosure set under §1.3.4 before dispatch.',
      leafRef: '1.3.4',
    },
    {
      dimension: 'format', severity: 'minor', title: 'Hyperlink integrity in §2.5 cross-references',
      detail: 'Several cross-references in the Clinical Overview point to section numbers rather than eCTD leaf hyperlinks, which slows review navigation.',
      basis: 'FDA eCTD Technical Conformance Guide.',
      recommendation: 'Convert §2.5 cross-refs to bookmarked leaf hyperlinks in the compiled backbone.',
      leafRef: '2.5',
    },
    {
      dimension: 'crl', severity: 'minor', title: 'CMC comparability for the post-change lots reads thin',
      detail: '§3.2.S.4 presents comparability against 3 post-change lots; the acceptance criteria for the higher-order structure assays are not fully justified.',
      basis: 'ICH Q5E; FDA CMC review practice.',
      recommendation: 'Strengthen §3.2.S.4 comparability acceptance-criteria justification.',
      leafRef: '3.2.S.4',
    },
  ],
  ema_d120: [
    {
      dimension: 'crl', severity: 'major', title: 'Benefit-risk narrative not aligned to the EU SmPC',
      detail: 'The Day-120 assessors will expect §2.5.6 benefit-risk to map directly to the proposed SmPC §4.1/§4.4; the current overview asserts benefit in language stronger than the SmPC supports.',
      basis: 'EMA benefit-risk methodology; SmPC guideline.',
      recommendation: 'Align §2.5.6 wording to the estimand and the proposed SmPC; soften "establishes".',
      leafRef: '2.5.6',
    },
    {
      dimension: 'crl', severity: 'minor', title: 'Paediatric investigation plan status not stated',
      detail: 'The EU procedure expects a clear PIP compliance statement or waiver reference.',
      basis: 'Regulation (EC) No 1901/2006.',
      recommendation: 'State PIP decision number / waiver in §1.',
      leafRef: '1.0',
    },
    {
      dimension: 'format', severity: 'minor', title: 'EU M1 regional forms incomplete',
      detail: 'EU Module 1 application form and product-information annexes are not fully populated for the validation check.',
      basis: 'EU eCTD M1 specification.',
      recommendation: 'Complete EU M1 before validation submission.',
      leafRef: '1.0',
    },
  ],
  pmda: [
    {
      dimension: 'crl', severity: 'major', title: 'Japanese bridging / ethnic-factor rationale absent',
      detail: 'PMDA will look for an ICH E5 bridging argument or a rationale that the global data are extrapolable to the Japanese population.',
      basis: 'ICH E5(R1); ICH E17.',
      recommendation: 'Add an ethnic-sensitivity assessment and bridging rationale to §2.5.',
      leafRef: '2.5.1',
    },
    {
      dimension: 'format', severity: 'minor', title: 'eCTD-JP multi-byte encoding not confirmed',
      detail: 'PMDA requires UTF-8 with BOM for the JP backbone; the sequence encoding is not stated.',
      basis: 'eCTD-JP notification.',
      recommendation: 'Confirm UTF-8 (BOM) on the JP backbone at compile.',
      leafRef: '—',
    },
  ],
  nb_mdr: [
    {
      dimension: 'nb', severity: 'major', title: 'GSPR checklist has unlinked evidence',
      detail: 'Several General Safety and Performance Requirements cite evidence that is not linked to a document in the technical file.',
      basis: 'EU MDR 2017/745 Annex I / Annex II.',
      recommendation: 'Link every GSPR line to its evidence location before the completeness check.',
      leafRef: 'GSPR',
    },
    {
      dimension: 'nb', severity: 'minor', title: 'Clinical evaluation report predates the last design change',
      detail: 'The CER date is earlier than the most recent design revision; a Notified Body will question currency.',
      basis: 'MDCG 2020-13; MEDDEV 2.7/1 Rev 4.',
      recommendation: 'Re-issue the CER covering the latest design state.',
      leafRef: 'CER',
    },
  ],
  nb_ivdr: [
    {
      dimension: 'nb', severity: 'major', title: 'Performance Evaluation Report missing a pillar',
      detail: 'The PER does not fully evidence scientific validity; a Notified Body will raise a non-conformity.',
      basis: 'EU IVDR 2017/746 Annex XIII.',
      recommendation: 'Complete the scientific-validity pillar of the PER.',
      leafRef: 'PER',
    },
    {
      dimension: 'nb', severity: 'minor', title: 'Analytical performance lacks a claimed metric',
      detail: 'Limit of detection is claimed in the IFU but not evidenced in the analytical performance section.',
      basis: 'IVDR Annex I §9.1.',
      recommendation: 'Add the LoD study to the analytical performance evidence.',
      leafRef: 'AP',
    },
  ],
};
