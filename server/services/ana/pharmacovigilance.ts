/**
 * Pharmacovigilance aggregate-reporting & signal-management advisor for AnA.
 *
 * Encodes the principal PV deliverables — DSUR (ICH E2F, development-stage),
 * PBRER/PSUR (ICH E2C(R2), post-authorization), expedited ICSR reporting
 * (ICH E2A/E2B), and the signal-management cycle (GVP Module IX) — with their
 * purpose, scope, cadence, key sections and common pitfalls. Lets AnA scaffold
 * and QC safety reports grounded in the actual ICH/GVP frameworks.
 *
 * Deterministic, dependency-free, data-driven. Advisory — reporting obligations
 * are jurisdiction- and product-specific; confirm against current regulations.
 *
 * @module server/services/ana/pharmacovigilance
 */

export interface PvDeliverable {
  id: string;
  label: string;
  basis: string;
  stage: 'development' | 'post-authorization' | 'both';
  purpose: string;
  cadence: string;
  sections: string[];
  commonPitfalls: string[];
  aliases?: string[];
}

const DELIVERABLES: PvDeliverable[] = [
  {
    id: 'dsur',
    label: 'DSUR — Development Safety Update Report',
    basis: 'ICH E2F',
    stage: 'development',
    purpose: 'Annual review of the safety of an investigational drug across all ongoing clinical trials worldwide.',
    cadence: 'Annually, based on the Development International Birth Date (DIBD).',
    sections: [
      'Worldwide marketing-authorization status',
      'Actions taken for safety reasons',
      'Changes to reference safety information (e.g., IB/DCSI)',
      'Inventory of clinical trials ongoing/completed during the period',
      'Cumulative & interval subject exposure',
      'Line listings & summary tabulations of SAEs',
      'Significant findings; overall safety assessment; conclusions',
    ],
    commonPitfalls: ['Missing the DIBD-based due date', 'Reference safety information not reconciled', 'Exposure figures not cumulative'],
    aliases: ['dsur', 'development safety update report'],
  },
  {
    id: 'pbrer',
    label: 'PBRER / PSUR — Periodic Benefit-Risk Evaluation Report',
    basis: 'ICH E2C(R2)',
    stage: 'post-authorization',
    purpose: 'Periodic, comprehensive benefit-risk evaluation of an authorized product in the post-marketing setting.',
    cadence: 'Per the EU reference dates list (EURD) / agency schedule (e.g., 6-monthly, annually, then less frequently).',
    sections: [
      'Worldwide marketing-authorization status',
      'Estimated exposure (clinical trial + post-marketing)',
      'Summary tabulations of adverse events',
      'Signal evaluation (new/ongoing/closed)',
      'Benefit evaluation; integrated benefit-risk analysis by indication',
      'Conclusions and actions',
    ],
    commonPitfalls: ['Treating it as a line-listing dump rather than an integrated benefit-risk evaluation', 'Missing the EURD-based data-lock/submission date', 'Signals not reconciled with the RMP'],
    aliases: ['pbrer', 'psur', 'periodic benefit-risk evaluation report', 'periodic safety update report'],
  },
  {
    id: 'icsr',
    label: 'ICSR expedited reporting — Individual Case Safety Report',
    basis: 'ICH E2A (definitions) / E2B (format)',
    stage: 'both',
    purpose: 'Expedited reporting of individual serious, unexpected, related adverse events (SUSARs) and other reportable cases.',
    cadence: 'Expedited: typically within 7 days (fatal/life-threatening SUSARs) or 15 days (other serious), per regulation.',
    sections: [
      'Valid case: identifiable reporter, identifiable patient, suspect product, adverse event',
      'Seriousness, expectedness, causality assessment',
      'E2B(R3) structured electronic submission (to FDA FAERS / EudraVigilance)',
    ],
    commonPitfalls: ['Misclassifying seriousness/expectedness (the clock depends on it)', 'Incomplete "valid case" minimum criteria', 'Late submission against the 7/15-day clock'],
    aliases: ['icsr', 'susar', 'expedited reporting', 'case report'],
  },
  {
    id: 'signal_management',
    label: 'Signal management cycle (GVP Module IX)',
    basis: 'GVP Module IX',
    stage: 'post-authorization',
    purpose: 'Systematic detection, validation, assessment, prioritization and action on safety signals.',
    cadence: 'Continuous, with documented periodic review (e.g., EudraVigilance signal detection).',
    sections: [
      'Signal detection (quantitative disproportionality + qualitative review)',
      'Signal validation (is there enough evidence to warrant analysis?)',
      'Signal prioritization & assessment',
      'Recommendation/action (e.g., label change, RMP update, further study)',
      'Documentation and tracking',
    ],
    commonPitfalls: ['Detection without a closed loop to action/documentation', 'Over-reliance on disproportionality without clinical assessment', 'Signals not feeding the PBRER/RMP'],
    aliases: ['signal management', 'signal detection', 'gvp module ix'],
  },
];

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

function findDeliverable(key?: string): PvDeliverable | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    DELIVERABLES.find(d => d.id === k) ||
    DELIVERABLES.find(d => d.aliases?.some(a => a.toLowerCase() === k)) ||
    DELIVERABLES.find(d => d.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(d.id))
  );
}

export interface PvQuery {
  deliverable?: string;
  stage?: string; // development | post-authorization
}

export interface PvResult {
  resolved: { deliverable: string | null; stage: string | null };
  deliverable: PvDeliverable | null;
  candidates: { id: string; label: string; stage: string }[];
  brief: string;
}

export function listPvDeliverables() {
  return DELIVERABLES.map(d => ({ id: d.id, label: d.label, stage: d.stage, basis: d.basis }));
}

function normStage(v?: string): 'development' | 'post-authorization' | undefined {
  const k = v?.trim().toLowerCase();
  if (k === 'development' || k === 'clinical' || k === 'investigational') return 'development';
  if (k === 'post-authorization' || k === 'post-authorisation' || k === 'post-marketing' || k === 'marketed') return 'post-authorization';
  return undefined;
}

export function advisePharmacovigilance(q: PvQuery): PvResult {
  const stage = normStage(q.stage);
  const direct = findDeliverable(q.deliverable) ?? null;
  const candidates = DELIVERABLES.filter(d => (stage ? d.stage === stage || d.stage === 'both' : true));

  const parts: string[] = [];
  if (direct) {
    parts.push(`# Pharmacovigilance deliverable: ${direct.label}`);
    parts.push(`\n**Basis.** ${direct.basis}`);
    parts.push(`**Purpose.** ${direct.purpose}`);
    parts.push(`**Cadence.** ${direct.cadence}`);
    parts.push(bullets('Key sections / content', direct.sections));
    parts.push(bullets('Common pitfalls', direct.commonPitfalls));
  } else {
    const scope = stage ? ` (${stage})` : '';
    parts.push(`# Pharmacovigilance aggregate reporting & signal management${scope}`);
    for (const d of candidates) parts.push(`\n## ${d.label}  _(${d.basis})_\n**Purpose.** ${d.purpose}\n**Cadence.** ${d.cadence}`);
  }

  parts.push(
    '\n## Note\nAdvisory only — reporting clocks and schedules are jurisdiction-/product-specific (FDA vs EU ' +
      'EURD). Signals must feed the PBRER and RMP; narrate individual events with draft_safety_narrative and ' +
      'comparative analyses with narrate_statistical_result.'
  );

  return {
    resolved: { deliverable: direct?.id ?? null, stage: stage ?? null },
    deliverable: direct,
    candidates: candidates.map(d => ({ id: d.id, label: d.label, stage: d.stage })),
    brief: parts.filter(Boolean).join('\n'),
  };
}
