/**
 * CTD / eCTD module-structure advisor for AnA.
 *
 * Encodes the ICH M4 Common Technical Document organization (Modules 1–5) and
 * the principal sections within each, so AnA can tell teams where a given
 * document belongs in a submission and QC dossier completeness. Includes the key
 * Module 2 summaries (QOS, nonclinical/clinical overviews & summaries) and a
 * free-text "where does this go?" placement helper.
 *
 * Deterministic, dependency-free, data-driven. The granular ICH eCTD heading
 * numbers evolve; treat section numbers as a guide and confirm against the
 * current ICH M4/eCTD specification.
 *
 * @module server/services/ana/ctd-structure
 */

export interface CtdModule {
  id: string;
  number: 1 | 2 | 3 | 4 | 5;
  label: string;
  regional: boolean;
  summary: string;
  sections: string[];
  /** lowercase keywords that route a document into this module */
  placementCues: string[];
  aliases?: string[];
}

const MODULES: CtdModule[] = [
  {
    id: 'm1',
    number: 1,
    label: 'Module 1 — Administrative & regional information',
    regional: true,
    summary: 'Region-specific administrative documents — NOT part of the harmonized CTD; differs FDA vs EU vs PMDA.',
    sections: [
      'Cover letter & application forms (e.g., FDA 356h / EU application form)',
      'Administrative information & prescribing information / labeling (SmPC, PIL, USPI)',
      'Risk-management / REMS materials (region-specific)',
      'Patent / exclusivity, environmental assessment (regional)',
    ],
    placementCues: ['cover letter', 'application form', '356h', 'label', 'labeling', 'smpc', 'prescribing information', 'rems', 'administrative'],
    aliases: ['module 1', 'm1', 'regional'],
  },
  {
    id: 'm2',
    number: 2,
    label: 'Module 2 — Common Technical Document summaries',
    regional: false,
    summary: 'Overviews and summaries that bridge the detailed data in Modules 3–5.',
    sections: [
      '2.1 CTD Table of Contents; 2.2 Introduction',
      '2.3 Quality Overall Summary (QOS)',
      '2.4 Nonclinical Overview; 2.6 Nonclinical Written & Tabulated Summaries',
      '2.5 Clinical Overview; 2.7 Clinical Summary (biopharm, clin pharm, efficacy, safety)',
    ],
    placementCues: ['overview', 'summary', 'qos', 'quality overall summary', 'clinical overview', 'clinical summary', 'nonclinical overview', 'tabulated summary'],
    aliases: ['module 2', 'm2', 'summaries'],
  },
  {
    id: 'm3',
    number: 3,
    label: 'Module 3 — Quality (CMC)',
    regional: false,
    summary: 'Chemistry, manufacturing and controls for drug substance and drug product.',
    sections: [
      '3.2.S Drug Substance (manufacture, characterization, control, stability)',
      '3.2.P Drug Product (description, development, manufacture, control, stability)',
      '3.2.A Appendices (facilities, adventitious agents); 3.2.R Regional quality info',
      '3.3 Literature references',
    ],
    placementCues: ['cmc', 'manufactur', 'drug substance', 'drug product', 'specification', 'stability', 'quality', 'analytical method', 'batch', 'impurit', 'formulation'],
    aliases: ['module 3', 'm3', 'quality', 'cmc'],
  },
  {
    id: 'm4',
    number: 4,
    label: 'Module 4 — Nonclinical study reports',
    regional: false,
    summary: 'The nonclinical (preclinical) study reports.',
    sections: [
      '4.2.1 Pharmacology (primary/secondary PD, safety pharmacology, PD interactions)',
      '4.2.2 Pharmacokinetics (ADME, toxicokinetics)',
      '4.2.3 Toxicology (single/repeat-dose, genotoxicity, carcinogenicity, repro/dev tox, local tolerance)',
      '4.3 Literature references',
    ],
    placementCues: ['nonclinical', 'preclinical', 'toxicology', 'tox study', 'pharmacology', 'genotoxicity', 'carcinogenicity', 'animal', 'adme', 'toxicokinetic'],
    aliases: ['module 4', 'm4', 'nonclinical', 'preclinical'],
  },
  {
    id: 'm5',
    number: 5,
    label: 'Module 5 — Clinical study reports',
    regional: false,
    summary: 'The clinical study reports and supporting clinical data.',
    sections: [
      '5.2 Tabular listing of all clinical studies',
      '5.3.1 Biopharmaceutic studies (BA/BE)',
      '5.3.3 Clinical pharmacology (PK/PD) studies',
      '5.3.5 Efficacy & safety study reports (CSRs) — controlled & uncontrolled',
      '5.3.6 Post-marketing experience; 5.4 Literature references',
    ],
    placementCues: ['clinical study report', 'csr', 'phase 1', 'phase 2', 'phase 3', 'efficacy', 'safety study', 'bioequivalence', 'pk study', 'pharmacokinetic study', 'clinical trial report', 'protocol'],
    aliases: ['module 5', 'm5', 'clinical'],
  },
];

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

function findModule(key?: string): CtdModule | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    MODULES.find(m => m.id === k) ||
    MODULES.find(m => String(m.number) === k) ||
    MODULES.find(m => m.aliases?.some(a => a.toLowerCase() === k)) ||
    MODULES.find(m => m.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(m.id))
  );
}

/** Route a free-text document description to the best-fit module(s). */
function placeDocument(description: string): { id: string; number: number; label: string; score: number }[] {
  const lc = description.toLowerCase();
  return MODULES
    .map(m => ({ id: m.id, number: m.number, label: m.label, score: m.placementCues.filter(c => lc.includes(c)).length }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

export interface CtdQuery {
  module?: string; // m1..m5, number, or alias
  document?: string; // free-text "where does this go?"
}

export interface CtdResult {
  resolved: { module: string | null };
  module: CtdModule | null;
  placement: { id: string; number: number; label: string; score: number }[];
  brief: string;
}

export function listCtdModules() {
  return MODULES.map(m => ({ id: m.id, number: m.number, label: m.label, regional: m.regional }));
}

export function adviseCtdStructure(q: CtdQuery): CtdResult {
  const mod = findModule(q.module) ?? null;
  const placement = q.document ? placeDocument(q.document) : [];
  const parts: string[] = [];

  if (mod) {
    parts.push(`# ${mod.label}${mod.regional ? '  _(region-specific)_' : ''}`);
    parts.push(`\n${mod.summary}`);
    parts.push(bullets('Key sections', mod.sections));
  } else if (placement.length) {
    const top = placement[0];
    const topMod = MODULES.find(m => m.id === top.id)!;
    parts.push(`# Suggested placement: ${topMod.label}`);
    parts.push(`\n_Routed from the document description (matched ${top.score} cue${top.score === 1 ? '' : 's'})._`);
    parts.push(bullets('Key sections', topMod.sections));
    if (placement.length > 1) {
      parts.push(bullets('Other possible modules', placement.slice(1).map(p => p.label)));
    }
  } else {
    parts.push('# CTD / eCTD structure (ICH M4)');
    for (const m of MODULES) parts.push(`\n## ${m.label}${m.regional ? ' _(regional)_' : ''}\n${m.summary}`);
  }

  parts.push(
    '\n## Note\nSection numbers follow ICH M4 and evolve with the eCTD specification — confirm granular ' +
      'headings against the current ICH/region guidance. Module 1 content is region-specific (FDA/EU/PMDA differ).'
  );

  return {
    resolved: { module: mod?.id ?? null },
    module: mod,
    placement,
    brief: parts.filter(Boolean).join('\n'),
  };
}
