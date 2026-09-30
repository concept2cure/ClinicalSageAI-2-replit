/**
 * In-document terminology & value consistency — pure, no I/O.
 *
 * "Consistency is law" is a stated medical-writing rule, but nothing enforced it
 * WITHIN a single authored document: the same governed quantity stated two ways
 * (186 vs 184 subjects), or one abbreviation expanded two different ways, slips
 * through. cross-artifact-consistency catches divergence ACROSS documents; this
 * catches it inside one draft, before it ships. Deterministic and total so it
 * can gate a draft in the Writing Precision Gate.
 *
 * Ported from abandoned PR #1003 (dc25698fb) onto v2, with the value check
 * narrowed to document-level quantities — see checkValueConsistency.
 *
 * @module server/services/ana/terminology-consistency
 */

import { extractNumericalFacts } from '../intelligence/cross-artifact-consistency';

export interface ConsistencyFinding {
  kind: 'value_inconsistency' | 'abbreviation_conflict' | 'term_inconsistency';
  label: string;
  /** The distinct competing values/expansions/terms found for this label. */
  variants: string[];
  /** Short surrounding snippets so the writer can locate each occurrence. */
  evidence: string[];
  severity: 'high' | 'medium';
}

export interface ConsistencyReport {
  findings: ConsistencyFinding[];
  valueInconsistencies: number;
  abbreviationConflicts: number;
  termInconsistencies: number;
  ok: boolean;
}

/**
 * Groups of interchangeable terms where mixing variants within one document is a
 * genuine consistency defect: US/UK spelling drift, and a few interchangeable
 * clinical nouns. Deliberately excludes near-synonyms with distinct regulatory
 * meaning (e.g. adverse event vs adverse reaction) to avoid false positives.
 */
const TERM_VARIANT_GROUPS: { label: string; variants: RegExp[] }[] = [
  { label: 'randomize/randomise', variants: [/\brandomiz(?:e|ed|ing|ation)\b/i, /\brandomis(?:e|ed|ing|ation)\b/i] },
  { label: 'analyze/analyse', variants: [/\banalyz(?:e|ed|ing)\b/i, /\banalys(?:e|ed|ing)\b/i] },
  { label: 'tumor/tumour', variants: [/\btumors?\b/i, /\btumours?\b/i] },
  { label: 'hematologic/haematologic', variants: [/\bhematolog\w*\b/i, /\bhaematolog\w*\b/i] },
  { label: 'esophag/oesophag', variants: [/\besophag\w*\b/i, /\boesophag\w*\b/i] },
  { label: 'subject/participant', variants: [/\bsubjects?\b/i, /\bparticipants?\b/i] },
];

/**
 * Detect interchangeable-term drift within one document (e.g. "randomized" and
 * "randomised", or "subject" and "participant", both used). A group fires only
 * when ≥2 of its variants each appear.
 */
export function checkPreferredTermConsistency(text: string): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];
  for (const group of TERM_VARIANT_GROUPS) {
    const present = group.variants
      .map(re => text.match(new RegExp(re, re.flags.includes('g') ? re.flags : re.flags + 'g')))
      .map(m => (m ? [...new Set(m.map(s => s.toLowerCase()))] : []));
    const variantsHit = present.filter(hits => hits.length > 0);
    if (variantsHit.length < 2) continue;
    findings.push({
      kind: 'term_inconsistency',
      label: group.label,
      variants: variantsHit.flat(),
      evidence: variantsHit.flat().slice(0, 4),
      severity: 'medium',
    });
  }
  return findings;
}

/** Normalize a numeric string for comparison (strip thousands separators, trim). */
function normNumber(v: string): string {
  return v.replace(/,/g, '').trim();
}

/**
 * Which extracted facts denote ONE quantity per document, so two values are a
 * contradiction rather than two different things.
 *
 * The shared extractor was built for comparison ACROSS documents, where "p" or
 * "n" in one draft is matched against the same label elsewhere. Inside one
 * document most of its labels are legitimately multi-valued: a p-value and a CI
 * per endpoint, n per arm and per analysis set, a dose per cohort, a visit per
 * week. Grouping by bare label (as abandoned PR #1003 did) flagged every real
 * results section HIGH — "N=186 randomized … N=184 completed" is two
 * populations, not a contradiction. A finding that is usually wrong is noise
 * dressed as a verdict, so the in-document check is narrowed to quantities a
 * document states once:
 *   - sample_size, but only when introduced by a population-defining keyword
 *     (sample size / enrolled / randomized), each keyword its own quantity —
 *     never a bare n/N, which is per arm, per set, per subgroup;
 *   - mrsd (a single maximum recommended starting dose);
 *   - shelf_life (per product; a multi-presentation document should state it
 *     per presentation in a table, where this prose check does not look).
 */
const SAMPLE_SIZE_KEYWORD = /^(sample\s+size|enrolled|randomi[sz]ed)\b/i;
const SINGLETON_LABELS = new Set(['mrsd', 'shelf_life']);

function singletonKey(text: string, f: { label: string; offset: number }): string | null {
  if (SINGLETON_LABELS.has(f.label)) return f.label;
  if (f.label !== 'sample_size') return null;
  const kw = SAMPLE_SIZE_KEYWORD.exec(text.slice(f.offset));
  if (!kw) return null;
  return `sample_size:${kw[1].toLowerCase().replace(/\s+/g, ' ').replace('randomised', 'randomized')}`;
}

/**
 * The same document-level quantity stated with two different values inside one
 * document. Uses the shared extractor so a value here is judged by the same
 * rule the citation scanner and dossier reconciler use.
 */
export function checkValueConsistency(text: string): ConsistencyFinding[] {
  const facts = extractNumericalFacts(text);
  const byKey = new Map<string, { value: string; context: string }[]>();
  for (const f of facts) {
    const key = singletonKey(text, f);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push({ value: normNumber(f.value), context: f.context });
    byKey.set(key, list);
  }

  const findings: ConsistencyFinding[] = [];
  for (const [label, occurrences] of byKey) {
    const distinct = [...new Set(occurrences.map(o => o.value))];
    if (distinct.length < 2) continue;
    // One representative snippet per distinct value.
    const evidence = distinct.map(v => occurrences.find(o => o.value === v)!.context);
    findings.push({
      kind: 'value_inconsistency',
      label,
      variants: distinct,
      evidence,
      severity: 'high', // a self-contradictory number is a reviewer red flag
    });
  }
  return findings;
}

// "Full Term (ABC)" or "ABC (Full Term)" — capture the expansion paired with an
// acronym so conflicting expansions of the same acronym can be detected.
const DEFINED_BEFORE = /\b((?:[A-Z][A-Za-z-]+\s+){1,6})\(([A-Z][A-Za-z0-9]{1,5})\)/g;
const DEFINED_AFTER = /\b([A-Z][A-Za-z0-9]{1,5})\s+\(((?:[A-Za-z][A-Za-z-]+\s*){1,6})\)/g;

/** The same acronym given two different expansions in one document. */
export function checkAbbreviationConsistency(text: string): ConsistencyFinding[] {
  const expansions = new Map<string, Set<string>>();
  const add = (abbr: string, expansion: string) => {
    const norm = expansion.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!norm) return;
    const set = expansions.get(abbr) ?? new Set<string>();
    set.add(norm);
    expansions.set(abbr, set);
  };

  let m: RegExpExecArray | null;
  DEFINED_BEFORE.lastIndex = 0;
  while ((m = DEFINED_BEFORE.exec(text)) !== null) add(m[2], m[1]);
  DEFINED_AFTER.lastIndex = 0;
  while ((m = DEFINED_AFTER.exec(text)) !== null) add(m[1], m[2]);

  const findings: ConsistencyFinding[] = [];
  for (const [abbr, set] of expansions) {
    // "Median Progression-Free Survival (PFS)" and "Progression-Free Survival
    // (PFS)" are one expansion with a leading word the capture swept in: an
    // expansion that ends with another is not a conflict.
    const list = [...set];
    const distinct = list.filter(e => !list.some(o => o !== e && e.endsWith(` ${o}`)));
    if (distinct.length < 2) continue;
    set.clear();
    distinct.forEach(e => set.add(e));
    findings.push({
      kind: 'abbreviation_conflict',
      label: abbr,
      variants: [...set],
      evidence: [...set].map(e => `${abbr} = "${e}"`),
      severity: 'medium',
    });
  }
  return findings;
}

/** Run all in-document consistency checks. */
export function checkTerminologyConsistency(text: string): ConsistencyReport {
  const value = checkValueConsistency(text);
  const abbr = checkAbbreviationConsistency(text);
  const term = checkPreferredTermConsistency(text);
  const findings = [...value, ...abbr, ...term];
  return {
    findings,
    valueInconsistencies: value.length,
    abbreviationConflicts: abbr.length,
    termInconsistencies: term.length,
    ok: findings.length === 0,
  };
}
