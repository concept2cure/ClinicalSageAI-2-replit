/**
 * Pharmacopoeia Corpus — citable index of the major pharmacopoeias and the key
 * general chapters a global pharma/biotech CMC and analytical program relies on,
 * including the PDG / ICH Q4B harmonised chapters (where a single test is
 * interchangeable across the US, EU and Japanese pharmacopoeias).
 *
 * Honesty: compendial chapter numbers and harmonisation status are revised over
 * time; the entries here are real and stable, but the rendered block carries a
 * "confirm against the current pharmacopoeia" caveat. Nothing is fabricated.
 *
 * @module server/services/ana-ri/pharmacopoeia-corpus
 */

export interface Pharmacopoeia {
  code: string;
  name: string;
  region: string;
  publisher: string;
  keywords: string[];
}

/** The major pharmacopoeias referenced in global drug/biologic submissions. */
export const PHARMACOPOEIAS: Pharmacopoeia[] = [
  { code: 'USP-NF', name: 'United States Pharmacopeia – National Formulary', region: 'United States', publisher: 'USP', keywords: ['usp', 'united states', 'us'] },
  { code: 'Ph.Eur.', name: 'European Pharmacopoeia', region: 'Europe', publisher: 'EDQM (Council of Europe)', keywords: ['ph eur', 'european', 'edqm', 'ep'] },
  { code: 'JP', name: 'Japanese Pharmacopoeia', region: 'Japan', publisher: 'MHLW / PMDA', keywords: ['jp', 'japanese', 'japan'] },
  { code: 'BP', name: 'British Pharmacopoeia', region: 'United Kingdom', publisher: 'MHRA / BP Commission', keywords: ['bp', 'british', 'uk'] },
  { code: 'ChP', name: 'Pharmacopoeia of the People’s Republic of China', region: 'China', publisher: 'ChP Commission / NMPA', keywords: ['chp', 'chinese', 'china'] },
  { code: 'IP', name: 'Indian Pharmacopoeia', region: 'India', publisher: 'Indian Pharmacopoeia Commission', keywords: ['ip', 'indian', 'india'] },
  { code: 'Int.Ph.', name: 'The International Pharmacopoeia', region: 'Global (WHO)', publisher: 'World Health Organization', keywords: ['international', 'who'] },
];

export interface PharmacopoeialChapter {
  /** Representative chapter reference (USP form where applicable). */
  code: string;
  title: string;
  topic: string;
  /** PDG/ICH Q4B harmonised (interchangeable across USP / Ph.Eur. / JP). */
  harmonized: boolean;
  /** ICH Q4B annex number where harmonised. */
  q4bAnnex?: string;
  /** Equivalent references in other pharmacopoeias, where well-known. */
  equivalents?: string[];
  keywords: string[];
}

/** Key general chapters. Harmonised entries map to an ICH Q4B annex. */
export const PHARMACOPOEIAL_CHAPTERS: PharmacopoeialChapter[] = [
  {
    code: 'USP <85>',
    title: 'Bacterial Endotoxins Test',
    topic: 'Endotoxins',
    harmonized: true,
    q4bAnnex: 'Annex 14',
    equivalents: ['Ph.Eur. 2.6.14', 'JP 4.01'],
    keywords: ['endotoxin', 'LAL', 'pyrogen', 'bacterial endotoxins'],
  },
  {
    code: 'USP <71>',
    title: 'Sterility Tests',
    topic: 'Sterility',
    harmonized: true,
    q4bAnnex: 'Annex 8',
    equivalents: ['Ph.Eur. 2.6.1', 'JP 4.06'],
    keywords: ['sterility', 'sterile'],
  },
  {
    code: 'USP <61>',
    title: 'Microbiological Examination of Nonsterile Products: Microbial Enumeration Tests',
    topic: 'Microbial enumeration',
    harmonized: true,
    q4bAnnex: 'Annex 4A',
    equivalents: ['Ph.Eur. 2.6.12', 'JP 4.05'],
    keywords: ['microbial', 'bioburden', 'nonsterile', 'enumeration'],
  },
  {
    code: 'USP <62>',
    title: 'Microbiological Examination of Nonsterile Products: Tests for Specified Microorganisms',
    topic: 'Specified microorganisms',
    harmonized: true,
    q4bAnnex: 'Annex 4B',
    equivalents: ['Ph.Eur. 2.6.13', 'JP 4.05'],
    keywords: ['microbial', 'specified microorganisms', 'nonsterile'],
  },
  {
    code: 'USP <711>',
    title: 'Dissolution',
    topic: 'Dissolution',
    harmonized: true,
    q4bAnnex: 'Annex 7',
    equivalents: ['Ph.Eur. 2.9.3', 'JP 6.10'],
    keywords: ['dissolution', 'release'],
  },
  {
    code: 'USP <701>',
    title: 'Disintegration',
    topic: 'Disintegration',
    harmonized: true,
    q4bAnnex: 'Annex 5',
    equivalents: ['Ph.Eur. 2.9.1', 'JP 6.09'],
    keywords: ['disintegration'],
  },
  {
    code: 'USP <905>',
    title: 'Uniformity of Dosage Units',
    topic: 'Content/mass uniformity',
    harmonized: true,
    q4bAnnex: 'Annex 6',
    equivalents: ['Ph.Eur. 2.9.40', 'JP 6.02'],
    keywords: ['uniformity', 'content uniformity', 'dosage units'],
  },
  {
    code: 'USP <788>',
    title: 'Particulate Matter in Injections',
    topic: 'Sub-visible particles',
    harmonized: true,
    q4bAnnex: 'Annex 3',
    equivalents: ['Ph.Eur. 2.9.19', 'JP 6.07'],
    keywords: ['particulate', 'sub-visible', 'particles', 'injections'],
  },
  {
    code: 'USP <281>',
    title: 'Residue on Ignition (Sulfated Ash)',
    topic: 'Residue on ignition',
    harmonized: true,
    q4bAnnex: 'Annex 1',
    equivalents: ['Ph.Eur. 2.4.14', 'JP 2.44'],
    keywords: ['residue on ignition', 'sulphated ash', 'sulfated ash'],
  },
  {
    code: 'USP <616>',
    title: 'Bulk Density and Tapped Density of Powders',
    topic: 'Powder density',
    harmonized: true,
    q4bAnnex: 'Annex 12',
    equivalents: ['Ph.Eur. 2.9.34', 'JP 3.01'],
    keywords: ['bulk density', 'tapped density', 'powder'],
  },
  {
    code: 'USP <467>',
    title: 'Residual Solvents',
    topic: 'Residual solvents',
    harmonized: false,
    keywords: ['residual solvents', 'OVI', 'class 1 solvent'],
  },
  {
    code: 'USP <232>',
    title: 'Elemental Impurities — Limits',
    topic: 'Elemental impurities (limits)',
    harmonized: false,
    keywords: ['elemental impurities', 'heavy metals', 'limits'],
  },
  {
    code: 'USP <233>',
    title: 'Elemental Impurities — Procedures',
    topic: 'Elemental impurities (procedures)',
    harmonized: false,
    keywords: ['elemental impurities', 'ICP-MS', 'ICP-OES', 'procedures'],
  },
  {
    code: 'USP <1225>',
    title: 'Validation of Compendial Procedures',
    topic: 'Method validation',
    harmonized: false,
    keywords: ['validation', 'compendial', 'analytical procedure'],
  },
  {
    code: 'USP <1058>',
    title: 'Analytical Instrument Qualification',
    topic: 'Instrument qualification',
    harmonized: false,
    keywords: ['AIQ', 'instrument qualification', 'IQ OQ PQ'],
  },
  {
    code: 'USP <87>',
    title: 'Biological Reactivity Tests, In Vitro',
    topic: 'Biological reactivity (in vitro)',
    harmonized: false,
    keywords: ['biological reactivity', 'cytotoxicity', 'in vitro'],
  },
  {
    code: 'USP <88>',
    title: 'Biological Reactivity Tests, In Vivo',
    topic: 'Biological reactivity (in vivo)',
    harmonized: false,
    keywords: ['biological reactivity', 'in vivo', 'class VI'],
  },
];

const PHARM_BY_CODE = new Map(PHARMACOPOEIAS.map(p => [p.code.toUpperCase(), p]));
const CHAPTER_BY_CODE = new Map(PHARMACOPOEIAL_CHAPTERS.map(c => [c.code.toUpperCase(), c]));

export function getPharmacopoeia(code: string): Pharmacopoeia | undefined {
  return PHARM_BY_CODE.get(code.trim().toUpperCase());
}

export function getChapter(code: string): PharmacopoeialChapter | undefined {
  return CHAPTER_BY_CODE.get(code.trim().toUpperCase());
}

export function harmonizedChapters(): PharmacopoeialChapter[] {
  return PHARMACOPOEIAL_CHAPTERS.filter(c => c.harmonized);
}

/** Search chapters by code, title, topic or keyword. */
export function searchChapters(query: string, limit = 10): PharmacopoeialChapter[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/[\s,]+/).filter(Boolean);
  const scored = PHARMACOPOEIAL_CHAPTERS.map(c => {
    const hay = `${c.code} ${c.title} ${c.topic} ${c.keywords.join(' ')} ${(c.equivalents ?? []).join(' ')}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (c.code.toLowerCase().includes(t)) score += 4;
      if (c.keywords.some(k => k.toLowerCase() === t)) score += 3;
      if (hay.includes(t)) score += 1;
    }
    return { c, score };
  }).filter(s => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.c);
}

const VERIFY_NOTE =
  '_Compendial chapter numbers and harmonisation status are revised. Confirm against the current pharmacopoeia (and ICH Q4B annex) before citing._';

export function buildPharmacopoeiaBlock(opts: { message?: string; limit?: number }): string {
  const { message, limit = 8 } = opts;
  const hits = message && message.trim() ? searchChapters(message, limit) : [];
  const lines: string[] = ['## Pharmacopoeial Reference'];
  if (hits.length > 0) {
    for (const c of hits) {
      const harm = c.harmonized ? ` · harmonised (ICH Q4B ${c.q4bAnnex})` : '';
      const eq = c.equivalents?.length ? ` — equivalents: ${c.equivalents.join(', ')}` : '';
      lines.push(`- **${c.code}** — ${c.title} _(${c.topic}${harm})_${eq}`);
    }
  } else {
    lines.push(
      `Indexed pharmacopoeias: ${PHARMACOPOEIAS.map(p => p.code).join(', ')}.`,
      `${harmonizedChapters().length} general chapters are PDG/ICH Q4B-harmonised (interchangeable across USP / Ph.Eur. / JP).`,
      'Name a test (e.g. "dissolution", "endotoxin", "uniformity") to pull the chapter and its cross-pharmacopoeial equivalents.'
    );
  }
  lines.push('', VERIFY_NOTE);
  return lines.join('\n');
}

export interface PharmacopoeiaSummary {
  pharmacopoeias: number;
  chapters: number;
  harmonizedChapters: number;
}

export function pharmacopoeiaSummary(): PharmacopoeiaSummary {
  return {
    pharmacopoeias: PHARMACOPOEIAS.length,
    chapters: PHARMACOPOEIAL_CHAPTERS.length,
    harmonizedChapters: harmonizedChapters().length,
  };
}
