/**
 * Product-labeling structure advisor for AnA.
 *
 * Encodes the section architecture of the two principal product labels — the US
 * Prescribing Information (FDA PLR, 21 CFR 201.56/201.57) and the EU Summary of
 * Product Characteristics (SmPC, per the EMA QRD template / Article 11) — so AnA
 * can place content in the right section, QC label completeness, and cross-map
 * between US and EU sections.
 *
 * Deterministic, dependency-free, data-driven. Advisory — the authoritative
 * label content is the approved label; confirm wording with regulatory/labeling.
 *
 * @module server/services/ana/labeling-structure
 */

import { smpcQrdSections, SMPC_QRD_BASIS } from '../labeling/smpc-qrd-catalog';

export type LabelFormat = 'uspi' | 'smpc';

export interface LabelSection {
  number: string;
  label: string;
  /** lowercase cues that route content into this section */
  cues: string[];
  /** id of the cross-mapped section in the other format, if any */
  crossMap?: string;
}

export interface LabelTemplate {
  id: LabelFormat;
  label: string;
  basis: string;
  sections: LabelSection[];
  notes: string[];
  aliases?: string[];
}

const USPI_SECTIONS: LabelSection[] = [
  { number: 'HL', label: 'Highlights of Prescribing Information', cues: ['highlights', 'boxed warning', 'recent major changes'], crossMap: '—' },
  { number: '1', label: 'Indications and Usage', cues: ['indication', 'indicated for', 'usage', 'treatment of'], crossMap: '4.1' },
  { number: '2', label: 'Dosage and Administration', cues: ['dose', 'dosage', 'administration', 'mg', 'titration', 'how to take'], crossMap: '4.2' },
  { number: '3', label: 'Dosage Forms and Strengths', cues: ['dosage form', 'strength', 'tablet', 'capsule', 'injection', 'mg/ml'], crossMap: '6.1' },
  { number: '4', label: 'Contraindications', cues: ['contraindication', 'must not', 'do not use in'], crossMap: '4.3' },
  { number: '5', label: 'Warnings and Precautions', cues: ['warning', 'precaution', 'risk of', 'monitor for', 'caution'], crossMap: '4.4' },
  { number: '6', label: 'Adverse Reactions', cues: ['adverse reaction', 'side effect', 'adverse event', 'most common'], crossMap: '4.8' },
  { number: '7', label: 'Drug Interactions', cues: ['interaction', 'concomitant', 'co-administration', 'cyp'], crossMap: '4.5' },
  { number: '8', label: 'Use in Specific Populations', cues: ['pregnancy', 'lactation', 'pediatric', 'geriatric', 'renal impairment', 'hepatic impairment', 'specific population'], crossMap: '4.6' },
  { number: '9', label: 'Drug Abuse and Dependence', cues: ['abuse', 'dependence', 'controlled substance', 'withdrawal'], crossMap: '—' },
  { number: '10', label: 'Overdosage', cues: ['overdose', 'overdosage'], crossMap: '4.9' },
  { number: '11', label: 'Description', cues: ['chemical', 'molecular formula', 'structure', 'description', 'cas'], crossMap: '6.1' },
  { number: '12', label: 'Clinical Pharmacology', cues: ['mechanism of action', 'pharmacodynamic', 'pharmacokinetic', 'absorption', 'metabolism', 'clinical pharmacology'], crossMap: '5.1' },
  { number: '13', label: 'Nonclinical Toxicology', cues: ['carcinogenesis', 'mutagenesis', 'fertility', 'animal toxicology'], crossMap: '5.3' },
  { number: '14', label: 'Clinical Studies', cues: ['clinical study', 'clinical trial', 'efficacy', 'primary endpoint result'], crossMap: '5.1' },
  { number: '15', label: 'References', cues: ['reference'], crossMap: '—' },
  { number: '16', label: 'How Supplied/Storage and Handling', cues: ['how supplied', 'storage', 'store at', 'handling', 'ndc'], crossMap: '6.4' },
  { number: '17', label: 'Patient Counseling Information', cues: ['counsel', 'advise patient', 'patient information', 'instruct'], crossMap: 'PL' },
];

/**
 * Placement cues and US cross-maps for the SmPC, keyed by QRD section number.
 * Platform convention, not regulator text. The numbers and headings come from
 * the one SmPC record (`server/services/labeling/smpc-qrd-catalog.ts`); a
 * top-level heading that only groups sub-sections (4, 5, 6) has no cues, so
 * content is placed in its sub-sections.
 */
const SMPC_CUES: Record<string, { cues: string[]; crossMap?: string }> = {
  '1': { cues: ['name of', 'product name', 'invented name'], crossMap: 'HL' },
  '2': { cues: ['composition', 'each tablet contains', 'active substance', 'excipient with known effect'], crossMap: '11' },
  '3': { cues: ['pharmaceutical form', 'appearance', 'white tablet'], crossMap: '3' },
  '4.1': { cues: ['indication', 'indicated for', 'treatment of'], crossMap: '1' },
  '4.2': { cues: ['posology', 'dose', 'dosage', 'method of administration'], crossMap: '2' },
  '4.3': { cues: ['contraindication', 'must not', 'hypersensitivity to'], crossMap: '4' },
  '4.4': { cues: ['warning', 'precaution', 'special warning', 'monitor'], crossMap: '5' },
  '4.5': { cues: ['interaction', 'concomitant', 'co-administration'], crossMap: '7' },
  '4.6': { cues: ['pregnancy', 'lactation', 'breast-feeding', 'fertility'], crossMap: '8' },
  '4.7': { cues: ['drive', 'machines', 'driving'], crossMap: '—' },
  '4.8': { cues: ['undesirable effect', 'adverse reaction', 'side effect', 'adverse event'], crossMap: '6' },
  '4.9': { cues: ['overdose', 'overdosage'], crossMap: '10' },
  '5.1': { cues: ['mechanism of action', 'pharmacodynamic', 'clinical efficacy', 'atc code'], crossMap: '12' },
  '5.2': { cues: ['pharmacokinetic', 'absorption', 'distribution', 'metabolism', 'elimination'], crossMap: '12' },
  '5.3': { cues: ['preclinical', 'nonclinical', 'carcinogenic', 'genotoxic'], crossMap: '13' },
  '6.1': { cues: ['excipient', 'list of excipients'], crossMap: '11' },
  '6.2': { cues: ['incompatib', 'must not be mixed', 'diluent'], crossMap: '—' },
  '6.3': { cues: ['shelf life', 'shelf-life', 'expiry', 'after first opening', 'after reconstitution'], crossMap: '16' },
  '6.4': { cues: ['storage', 'store at', 'do not freeze'], crossMap: '16' },
  '6.5': { cues: ['container', 'blister', 'vial', 'pack size', 'bottle'], crossMap: '16' },
  '6.6': { cues: ['disposal', 'dispose', 'handling', 'reconstitut', 'dilution'], crossMap: '16' },
  '7': { cues: ['marketing authorisation holder', 'mah'], crossMap: '—' },
  '8': { cues: ['marketing authorisation number', 'eu/1/'], crossMap: '—' },
  '9': { cues: ['date of first authorisation', 'renewal of the authorisation'], crossMap: '—' },
  '10': { cues: ['date of revision', 'revision of the text'], crossMap: '—' },
};

const SMPC_SECTIONS: LabelSection[] = smpcQrdSections().map((s) => ({
  number: s.number,
  label: s.title,
  cues: SMPC_CUES[s.number]?.cues ?? [],
  crossMap: SMPC_CUES[s.number]?.crossMap,
}));

const TEMPLATES: LabelTemplate[] = [
  {
    id: 'uspi',
    label: 'US Prescribing Information (USPI / PLR)',
    basis: 'FDA Physician Labeling Rule; 21 CFR 201.56 & 201.57',
    sections: USPI_SECTIONS,
    notes: ['Highlights + Table of Contents required under PLR', 'Boxed Warning (if any) appears first', 'Pregnancy/Lactation follow PLLR narrative format (no letter categories)'],
    aliases: ['uspi', 'pi', 'prescribing information', 'us label', 'plr'],
  },
  {
    id: 'smpc',
    label: 'EU Summary of Product Characteristics (SmPC)',
    basis: `${SMPC_QRD_BASIS.ref} (heading wording: ${SMPC_QRD_BASIS.confidence}); Directive 2001/83/EC Article 11`,
    sections: SMPC_SECTIONS,
    notes: ['Fixed QRD section numbering, sections 1–10; 11 (Dosimetry) and 12 (Instructions for preparation of radiopharmaceuticals) for radiopharmaceuticals only', 'Section 4.8 follows MedDRA SOC + frequency convention', 'Black-triangle (▼) for additional monitoring where applicable'],
    aliases: ['smpc', 'spc', 'eu label', 'summary of product characteristics', 'qrd'],
  },
];

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

function findTemplate(key?: string): LabelTemplate | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    TEMPLATES.find(t => t.id === k) ||
    TEMPLATES.find(t => t.aliases?.some(a => a.toLowerCase() === k)) ||
    TEMPLATES.find(t => t.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(t.id))
  );
}

function placeContent(tpl: LabelTemplate, content: string): { number: string; label: string; score: number }[] {
  const lc = content.toLowerCase();
  return tpl.sections
    .map(s => ({ number: s.number, label: s.label, score: s.cues.filter(c => lc.includes(c)).length }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

export interface LabelingQuery {
  format?: string; // uspi | smpc
  content?: string; // free-text "which section?"
}

export interface LabelingResult {
  resolved: { format: LabelFormat | null };
  template: { id: LabelFormat; label: string; basis: string } | null;
  placement: { number: string; label: string; score: number; crossMap?: string }[];
  brief: string;
}

export function listLabelTemplates() {
  return TEMPLATES.map(t => ({ id: t.id, label: t.label, sections: t.sections.length }));
}

export function adviseLabelingStructure(q: LabelingQuery): LabelingResult {
  const tpl = findTemplate(q.format) ?? null;
  const parts: string[] = [];
  let placement: { number: string; label: string; score: number; crossMap?: string }[] = [];

  if (tpl && q.content) {
    const ranked = placeContent(tpl, q.content);
    placement = ranked.map(r => {
      const sec = tpl.sections.find(s => s.number === r.number);
      return { ...r, crossMap: sec?.crossMap };
    });
    parts.push(`# Labeling placement (${tpl.label})`);
    if (placement.length) {
      const top = placement[0];
      parts.push(`\n**Suggested section.** ${top.number} — ${top.label}` + (top.crossMap && top.crossMap !== '—' ? ` (cross-maps to ${top.crossMap} in the other format)` : ''));
      if (placement.length > 1) parts.push(bullets('Other candidate sections', placement.slice(1).map(p => `${p.number} — ${p.label}`)));
    } else {
      parts.push('\n_No section cue matched — review the full section list._');
    }
  } else if (tpl) {
    parts.push(`# ${tpl.label}`);
    parts.push(`\n**Basis.** ${tpl.basis}`);
    parts.push(bullets('Sections', tpl.sections.map(s => `${s.number}. ${s.label}`)));
    parts.push(bullets('Notes', tpl.notes));
  } else {
    parts.push('# Product-labeling structure');
    for (const t of TEMPLATES) parts.push(`\n## ${t.label}  _(${t.basis})_\n${t.sections.length} sections.`);
  }

  parts.push(
    '\n## Note\nAdvisory only — the approved label is authoritative; confirm wording with regulatory/labeling. ' +
      'Screen any claim-like content with screen_promotional_language.'
  );

  return {
    resolved: { format: tpl?.id ?? null },
    template: tpl ? { id: tpl.id, label: tpl.label, basis: tpl.basis } : null,
    placement,
    brief: parts.filter(Boolean).join('\n'),
  };
}
