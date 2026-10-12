/**
 * Does the document agree with itself? (D2, 2026-10-12.)
 *
 * `section-claims-check.ts` sets a section's figures against the figures the documents it CITES
 * state. It needs cited sources, so it runs where a section has them — at the save of an AnA draft.
 * A document a person wrote, imported, or edited by hand after that save carries no such record,
 * and nothing checked it.
 *
 * This check needs nothing outside the document: the same figure, in the same frame, stated twice in
 * two different sections, with two different values. A CSR synopsis that disagrees with its own
 * body; a 2.7.4 whose overall-profile paragraph disagrees with its per-study one. It is among the
 * oldest findings in medical writing, and it is the one ICH E3 §1 asks of a CSR directly — every
 * number in the text agrees with the table it came from.
 *
 * The engine already answers it: `compareWithin` pairs claims whose frames are identical and whose
 * sections differ (37 cases of the corpus's synopsis-body lens). The work here is to hand it the
 * document as one source with its section headings intact, so each claim carries the section it
 * came from, and to read the result back per section.
 *
 * Two figures are compared only when their frames are identical — study or pool, population, arm,
 * scope, timepoint, effect measure, interval level and sidedness. Figures whose frames differ are
 * not compared and are not reported here: this check answers one question, and a frame difference
 * inside one document is usually two legitimately different figures, not a finding. Nothing is
 * corrected and no prose is written (CLAUDE.md Rule 2).
 */
import type { ClaimDocRole } from '../../../shared/ana/clinical-claims-vocabulary';
import { compareClaims, type ClaimReport, type Loc } from '../truth-engine/clinical-claims';

/** One section of the document, as the authoring record holds it. */
export interface ConsistencySection {
  /** The CTD code ("2.7.4.1"); the engine reads it as the section a figure sits in. */
  code: string;
  title: string;
  /** The section's readable text (`sectionReadableText`). */
  text: string;
}

/** One side of a within-document comparison. */
export interface ConsistencySide {
  /** The section code the figure sits in, as given. */
  section: string;
  /** The figure(s) as that side writes them, canonical. */
  values: string[];
  /** The sentence or row the figure sits in; carried on a disagreement. */
  quote?: string;
  /** Character offsets within that section's own text. */
  start: number;
  end: number;
}

export interface ConsistencyComparison {
  outcome: 'conflict' | 'consistent';
  /** The measure, in the engine's own label ("incidence:any:pt:nausea"). */
  measure: string;
  arm?: string;
  /** The engine's one-line account, with both quotes. */
  detail: string;
  a: ConsistencySide;
  b: ConsistencySide;
}

export interface DocumentConsistencyCheck {
  /** The role the document was read as. */
  role: ClaimDocRole;
  /** The report's verdict. There is deliberately no "consistent". */
  verdict: ClaimReport['verdict'];
  /** Pairs compared across sections, and how many disagree. Always complete. */
  compared: number;
  conflicts: number;
  /** At most CONSISTENCY_KEPT, disagreements first. */
  comparisons: ConsistencyComparison[];
  truncated: boolean;
}

/** How many comparisons one document keeps. The counts are always complete. */
export const CONSISTENCY_KEPT = 25;

const DOC_ID = 'document';

const empty = (role: ClaimDocRole): DocumentConsistencyCheck => ({
  role,
  verdict: 'nothing_compared',
  compared: 0,
  conflicts: 0,
  comparisons: [],
  truncated: false,
});

/**
 * The document as one source: each section as its heading line — the CTD code and the title, which
 * is how the engine reads a section number — then its text. The offsets each section occupies are
 * kept, so a claim's position names the section it came from and the offsets reported are within
 * that section rather than within the concatenation.
 */
function oneSource(sections: readonly ConsistencySection[]): { text: string; at: Array<{ code: string; start: number; end: number }> } {
  let text = '';
  const at: Array<{ code: string; start: number; end: number }> = [];
  for (const s of sections) {
    const heading = `${s.code} ${s.title}`.trim();
    text += `${heading}\n`;
    const start = text.length;
    text += `${s.text}\n\n`;
    at.push({ code: s.code, start, end: text.length });
  }
  return { text, at };
}

export function checkDocumentFigureConsistency(
  role: ClaimDocRole,
  sections: readonly ConsistencySection[],
): DocumentConsistencyCheck {
  const withText = sections.filter((s) => s.text.trim());
  // A short circuit, not a correctness guard: `compareWithin` already pairs only claims whose
  // sections differ, so one section with text can produce no pair. Reverting this changes no
  // result — it only spends an engine run to reach the same answer.
  if (withText.length < 2) return empty(role);

  const { text, at } = oneSource(withText);
  const sectionOf = (loc: Loc): { code: string; start: number } | undefined => {
    const hit = at.find((s) => loc.start >= s.start && loc.start < s.end);
    return hit ? { code: hit.code, start: hit.start } : undefined;
  };

  const report = compareClaims([{ id: DOC_ID, role, text }], { withinSource: true });

  const comparisons: ConsistencyComparison[] = [];
  for (const cmp of report.withinSource) {
    const sa = sectionOf(cmp.a.loc);
    const sb = sectionOf(cmp.b.loc);
    /* A figure outside every section's range sits in a heading line, and a pair the engine read as
       two sections that are one authoring section (two sections filed under the same code, or a
       heading the engine named by its title rather than its number) is not a disagreement between
       two places in the document. The engine's own `a.section !== b.section` is the first guard;
       this is the second, over the codes the authoring record actually holds. No corpus case
       reaches it, so reverting it changes no result today — it is here because the engine's section
       is its own reading of the text and this one is the record's. */
    if (!sa || !sb || sa.code === sb.code) continue;
    const quoted = cmp.outcome === 'conflict';
    const compared = cmp.components.filter((c) => c.result !== 'not_compared');
    const side = (s: { quote: string; loc: Loc }, base: { code: string; start: number }, values: string[]): ConsistencySide => ({
      section: base.code,
      values,
      ...(quoted ? { quote: s.quote } : {}),
      start: s.loc.start - base.start,
      end: s.loc.end - base.start,
    });
    comparisons.push({
      outcome: cmp.outcome,
      measure: cmp.measureLabel,
      ...(cmp.arm ? { arm: cmp.arm } : {}),
      detail: cmp.detail,
      a: side(cmp.a, sa, compared.map((c) => c.a).filter(Boolean)),
      b: side(cmp.b, sb, compared.map((c) => c.b).filter(Boolean)),
    });
  }

  const conflicts = comparisons.filter((c) => c.outcome === 'conflict');
  const kept = [...conflicts, ...comparisons.filter((c) => c.outcome === 'consistent')];
  return {
    role,
    /* The verdict describes the comparisons in THIS record, not the engine's own count: a pair the
       section mapping above dropped is not in this record, and a record that says "conflicts found"
       with no conflict listed is the kind of report this engine exists to prevent. The two agree on
       every corpus case, so reverting this to `report.verdict` changes no result today; the
       invariant is asserted instead — the verdict and the list can never disagree. */
    verdict: conflicts.length > 0 ? 'conflicts_found' : comparisons.length > 0 ? 'no_conflict_among_compared' : 'nothing_compared',
    compared: comparisons.length,
    conflicts: conflicts.length,
    comparisons: kept.slice(0, CONSISTENCY_KEPT),
    truncated: kept.length > CONSISTENCY_KEPT,
  };
}
