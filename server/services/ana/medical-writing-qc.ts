/**
 * Medical-writing QC analyzers for AnA — deterministic craft checks that an
 * elite medical writer runs on a draft:
 *   - assessReadability: Flesch Reading Ease + Flesch–Kincaid grade vs the
 *     target audience (lay summaries / EU PILs must hit a reading level).
 *   - buildAbbreviationList: extract acronyms, flag those not defined at first
 *     use, and emit the abbreviation table every regulatory document needs.
 *
 * Pure, dependency-free, and English-heuristic (syllables/passive are estimates,
 * not perfect) — fast and unit-testable.
 *
 * @module server/services/ana/medical-writing-qc
 */

// ─────────────────────────────────────────────────────────────────────────────
// Readability
// ─────────────────────────────────────────────────────────────────────────────

export type ReadabilityAudience = 'patient' | 'clinician' | 'regulator' | 'general';

export interface ReadabilityResult {
  words: number;
  sentences: number;
  syllables: number;
  avgWordsPerSentence: number;
  avgSyllablesPerWord: number;
  complexWordPct: number; // % words with ≥3 syllables
  fleschReadingEase: number; // higher = easier (0–100+)
  fleschKincaidGrade: number; // US grade level
  targetAudience: ReadabilityAudience;
  targetMaxGrade: number;
  meetsTarget: boolean;
  verdict: string;
  suggestions: string[];
}

/** Heuristic English syllable count (standard vowel-group method). */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

const AUDIENCE_MAX_GRADE: Record<ReadabilityAudience, number> = {
  patient: 8, // EU CTR lay summaries / health literacy
  general: 10,
  clinician: 16,
  regulator: 18, // expert, but flag if absurdly dense
};

export function assessReadability(
  text: string,
  audience: ReadabilityAudience = 'general'
): ReadabilityResult {
  const sentences = (text.match(/[^.!?]+[.!?]+/g) ?? []).length || (text.trim() ? 1 : 0);
  const wordTokens = text.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  const words = wordTokens.length;
  const syllables = wordTokens.reduce((s, w) => s + countSyllables(w), 0);
  const complexWords = wordTokens.filter(w => countSyllables(w) >= 3).length;

  const wps = words && sentences ? words / sentences : 0;
  const spw = words ? syllables / words : 0;
  const fleschReadingEase = words && sentences ? 206.835 - 1.015 * wps - 84.6 * spw : 0;
  const fleschKincaidGrade = words && sentences ? 0.39 * wps + 11.8 * spw - 15.59 : 0;

  const targetMaxGrade = AUDIENCE_MAX_GRADE[audience];
  const grade = Math.round(fleschKincaidGrade * 10) / 10;
  const meetsTarget = words === 0 ? false : grade <= targetMaxGrade;

  const suggestions: string[] = [];
  if (!meetsTarget) {
    if (wps > 20) suggestions.push(`Shorten sentences (avg ${Math.round(wps)} words/sentence; aim < 20).`);
    if (complexWords / Math.max(words, 1) > 0.15) {
      suggestions.push('Replace multi-syllable jargon with plain alternatives where possible.');
    }
    if (audience === 'patient') {
      suggestions.push('Use natural frequencies (e.g. "1 in 10"), define unavoidable terms, prefer everyday words.');
    }
  }

  const verdict = words === 0
    ? 'No text to assess.'
    : meetsTarget
      ? `Meets the ${audience} target (grade ${grade} ≤ ${targetMaxGrade}).`
      : `Too complex for the ${audience} audience (grade ${grade} > ${targetMaxGrade}).`;

  return {
    words,
    sentences,
    syllables,
    avgWordsPerSentence: Math.round(wps * 10) / 10,
    avgSyllablesPerWord: Math.round(spw * 100) / 100,
    complexWordPct: words ? Math.round((complexWords / words) * 1000) / 10 : 0,
    fleschReadingEase: Math.round(fleschReadingEase * 10) / 10,
    fleschKincaidGrade: grade,
    targetAudience: audience,
    targetMaxGrade,
    meetsTarget,
    verdict,
    suggestions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Abbreviations
// ─────────────────────────────────────────────────────────────────────────────

export interface AbbreviationEntry {
  abbreviation: string;
  count: number;
  firstIndex: number;
  /** A definition (expansion) was detected at/near first use. */
  definedAtFirstUse: boolean;
  /** Best-guess expansion when detected. */
  expansion?: string;
}

export interface AbbreviationReport {
  abbreviations: AbbreviationEntry[];
  /** Abbreviations used without a detected first-use definition. */
  undefinedAbbreviations: string[];
  total: number;
}

// All-caps tokens that are not really abbreviations to define.
const ABBR_STOPWORDS = new Set([
  'I', 'A', 'AND', 'OR', 'THE', 'OF', 'TO', 'IN', 'ON', 'FOR', 'NO', 'NOT', 'OK', 'US', 'EU', 'UK',
]);

/**
 * Extract acronyms (2–6 uppercase letters/digits) and check whether each is
 * defined at first use via the conventional patterns:
 *   "Full Term (ABC)"  or  "ABC (Full Term)".
 */
export function buildAbbreviationList(text: string): AbbreviationReport {
  // Candidate tokens (2–6 chars, letter-initial); an abbreviation is a token
  // with ≥2 uppercase letters — catches all-caps (CSR, PFS) AND mixed-case
  // medical acronyms (DoR, pCR, mTOR), while excluding ordinary words.
  const re = /\b([A-Za-z][A-Za-z0-9]{1,5})\b/g;
  const entries = new Map<string, AbbreviationEntry>();
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const abbr = m[1];
    const uppercaseCount = (abbr.match(/[A-Z]/g) ?? []).length;
    if (uppercaseCount < 2) continue;
    if (ABBR_STOPWORDS.has(abbr.toUpperCase()) || /^\d+$/.test(abbr)) continue;
    const idx = m.index;
    let e = entries.get(abbr);
    if (!e) {
      // Definition patterns around first use.
      const before = text.slice(Math.max(0, idx - 120), idx);
      const after = text.slice(idx + abbr.length, idx + abbr.length + 120);
      // "Full Term (ABC)" — capitalized words immediately before "(ABC)"
      const pre = new RegExp(`((?:[A-Za-z][A-Za-z-]+\\s+){1,6})\\(\\s*$`).exec(before);
      // "ABC (Full Term)"
      const post = /^\s*\(([^)]{3,80})\)/.exec(after);
      let definedAtFirstUse = false;
      let expansion: string | undefined;
      if (pre) {
        definedAtFirstUse = true;
        expansion = pre[1].trim();
      } else if (post && /[a-z]/.test(post[1])) {
        definedAtFirstUse = true;
        expansion = post[1].trim();
      }
      e = { abbreviation: abbr, count: 0, firstIndex: idx, definedAtFirstUse, expansion };
      entries.set(abbr, e);
    }
    e.count++;
  }

  const abbreviations = Array.from(entries.values()).sort((a, b) =>
    a.abbreviation.localeCompare(b.abbreviation)
  );
  return {
    abbreviations,
    undefinedAbbreviations: abbreviations.filter(e => !e.definedAtFirstUse).map(e => e.abbreviation),
    total: abbreviations.length,
  };
}
