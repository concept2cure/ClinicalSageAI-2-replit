/**
 * A drafted section's figures set against the figures the documents it cites state
 * (D2, 2026-10-12). The reachable path for the clinical figure claims engine
 * (server/services/truth-engine/clinical-claims.ts).
 *
 * `draft-figure-check.ts` answers whether a number the section writes is PRESENT in a cited
 * source — the anti-fabrication question, and the right question for that purpose. It cannot
 * answer whether the number AGREES, because it reads neither side's frame: a section that says
 * nausea occurred in 12.0% of patients, citing a CSR table that says 18.0%, leaves 12.0
 * "unverified" and never looks at the 18.0 beside it. A reviewer reads the two documents and sees
 * the contradiction at once. So does this.
 *
 * What it answers, deterministically: for each figure the section and a cited document both state
 * in the SAME frame — same study or pool, population, arm, scope, timepoint, effect measure,
 * interval level and sidedness — do the values agree at the coarser precision as written? Figures
 * whose frames are not identical are reported as not compared with the slot that differs, never as
 * agreement and never as a conflict. A figure with no counterpart is reported as having none.
 *
 * The role each side plays comes from the record (`claimDocRoleOf`: the CTD location, then the
 * catalogued type), and is `other` when the record does not say — which makes no role convention
 * bind.
 *
 * Pure: the caller passes the excerpts the save already verified, so there is one load and one
 * version of each cited document, the same ones `draft-figure-check.ts` reads.
 *
 * This check never corrects a figure and never writes prose. It says which figures disagree and
 * quotes both sides; what to do about it is the author's (CLAUDE.md Rule 2).
 */
import { claimDocRoleOf, type ClaimDocRole } from '../../../shared/ana/clinical-claims-vocabulary';
import { compareClaims, type ClaimReport, type ClaimSource, type Comparison, type ComponentResult, type Loc, type NotCompared } from '../truth-engine/clinical-claims';

/** One cited excerpt, as the save verified it, with the identifiers that give it a role. */
export interface ClaimsExcerpt {
  documentId: string;
  contentHash: string;
  /** The excerpt's text. */
  text: string;
  /** Where the excerpt starts in the document's extracted text (S5d); 0 when absent. */
  start?: number;
  ctdSection?: string | null;
  documentType?: string | null;
}

/**
 * One side of a comparison: where the figure is, and what it says.
 *
 * `quote` is carried only where the author has to read the context to act — a disagreement. A pair
 * that agrees, and a pair that was not compared, keep their values and offsets, which is what the
 * editor shows and what re-reading the text at that version needs. This record is written into the
 * document row and into every CREATE audit row, neither of which can be amended, so it holds what
 * is needed and no more.
 */
export interface ClaimSide {
  /** The figure(s) as that side writes them, canonical. */
  values: string[];
  /** The sentence or row the figure sits in, as written; present on a disagreement. */
  quote?: string;
  /** Character offsets in that side's own text. */
  start: number;
  end: number;
}

export interface SectionClaimSide extends ClaimSide {
  /** The section's heading the figure sits under, when it has one. */
  heading?: string;
}

export interface SourceClaimSide extends ClaimSide {
  documentId: string;
  contentHash: string;
}

export interface ClaimComparison {
  /** `conflict` or `consistent`; a pair that was not compared is in `notCompared`. */
  outcome: 'conflict' | 'consistent';
  /** The measure, in the engine's own label ("incidence:any:pt:nausea", "n:treated"). */
  measure: string;
  /** The arm, where the measure has one. */
  arm?: string;
  /** The engine's one-line account of the pair, with both quotes. */
  detail: string;
  section: SectionClaimSide;
  source: SourceClaimSide;
}

export interface ClaimNotCompared {
  measure?: string;
  /** The reason code; `CLAIM_REASON_COPY` holds the fixed copy for it. */
  reason: string;
  /** The engine's one-line account. */
  why: string;
  section?: SectionClaimSide;
  source?: SourceClaimSide;
}

export interface SectionClaimsCheck {
  /** The role the check read each side as; `other` means no role convention bound. */
  sectionRole: ClaimDocRole;
  sources: Array<{ documentId: string; contentHash: string; role: ClaimDocRole }>;
  /** The report's verdict. There is deliberately no "consistent". */
  verdict: ClaimReport['verdict'];
  /** Pairs actually compared, and how many of them conflict. Always complete. */
  compared: number;
  conflicts: number;
  /** At most CLAIMS_KEPT each, conflicts first; `truncated` says when more were found. */
  comparisons: ClaimComparison[];
  notCompared: ClaimNotCompared[];
  truncated: boolean;
}

/** How many comparisons and not-compared entries one section keeps. The counts are always complete. */
export const CLAIMS_KEPT = 25;

const SECTION_ID = 'section';

/**
 * Check a section's figures against the documents it cites.
 *
 * `sectionCtdCode` is the section's CTD code as the authoring record holds it ("2.7.4"); it gives
 * the section its role and nothing else.
 */
/** The section's figure of a compared pair, and the cited document's, each with its own quote. */
function sidesOf(
  cmp: Comparison,
  excerpts: readonly ClaimsExcerpt[],
): { sec: SectionClaimSide; cit: SourceClaimSide; secOf: (c: ComponentResult) => string; citOf: (c: ComponentResult) => string } | null {
  const sectionIsA = cmp.a.sourceId === SECTION_ID;
  const secSide = sectionIsA ? cmp.a : cmp.b;
  const citSide = sectionIsA ? cmp.b : cmp.a;
  const doc = citedOf(citSide.sourceId, excerpts);
  if (!doc) return null;
  const secOf = (c: ComponentResult) => (sectionIsA ? c.a : c.b);
  const citOf = (c: ComponentResult) => (sectionIsA ? c.b : c.a);
  // The components the pair actually compared; a declined one is reported on its own below.
  const compared = cmp.components.filter((c) => c.result !== 'not_compared');
  const quoted = cmp.outcome === 'conflict';
  return {
    sec: sideOf(secSide, compared.map(secOf).filter(Boolean), quoted),
    cit: atDocument({ ...sideOf(citSide, compared.map(citOf).filter(Boolean), quoted), documentId: doc.documentId, contentHash: doc.contentHash }, doc),
    secOf,
    citOf,
  };
}

/** A source side's offsets in the DOCUMENT's text: in the excerpt, plus where the excerpt starts (S5d). */
function atDocument<T extends { start: number; end: number }>(side: T, doc: ClaimsExcerpt): T {
  const by = doc.start ?? 0;
  return by === 0 ? side : { ...side, start: side.start + by, end: side.end + by };
}

/** Which excerpt a source id names, or undefined for the section itself. */
function citedOf(sourceId: string, excerpts: readonly ClaimsExcerpt[]): ClaimsExcerpt | undefined {
  const m = /^cited:(\d+)$/.exec(sourceId);
  return m ? excerpts[Number(m[1])] : undefined;
}

function sideOf(s: { quote: string; loc: Loc }, values: string[], withQuote = false): SectionClaimSide {
  return {
    values,
    ...(withQuote ? { quote: s.quote } : {}),
    start: s.loc.start,
    end: s.loc.end,
    ...(s.loc.heading ? { heading: s.loc.heading } : {}),
  };
}

/** One compared pair, and any component of it the pair itself declined. */
function readComparison(
  cmp: Comparison,
  excerpts: readonly ClaimsExcerpt[],
): { comparison: ClaimComparison; declined: ClaimNotCompared[] } | null {
  const s = sidesOf(cmp, excerpts);
  if (!s) return null;
  // A component of a compared pair that was itself declined ("<0.001" against "0.0004") is a figure
  // the author still has to resolve, so it is reported rather than hidden inside the pair.
  const declined = cmp.components
    .filter((part) => part.result === 'not_compared')
    .map((part) => ({
      measure: cmp.measureLabel,
      reason: part.reason ?? 'figure_not_read',
      why: `${cmp.measureLabel} (${part.component}): ${cmp.detail}`,
      section: { ...s.sec, values: [s.secOf(part)].filter(Boolean) },
      source: { ...s.cit, values: [s.citOf(part)].filter(Boolean) },
    }));
  return {
    comparison: {
      outcome: cmp.outcome,
      measure: cmp.measureLabel,
      ...(cmp.arm ? { arm: cmp.arm } : {}),
      detail: cmp.detail,
      section: s.sec,
      source: s.cit,
    },
    declined,
  };
}

/** One figure, or pair of figures, the engine did not compare at all. */
function readNotCompared(n: NotCompared, excerpts: readonly ClaimsExcerpt[]): ClaimNotCompared {
  const secSide = n.a.sourceId === SECTION_ID ? n.a : n.b?.sourceId === SECTION_ID ? n.b : undefined;
  const citSide = n.a.sourceId === SECTION_ID ? n.b : n.a;
  const doc = citSide ? citedOf(citSide.sourceId, excerpts) : undefined;
  return {
    ...(n.measureLabel ? { measure: n.measureLabel } : {}),
    reason: n.reason,
    why: n.detail,
    ...(secSide ? { section: sideOf(secSide, secSide.values) } : {}),
    ...(citSide && doc ? { source: atDocument({ ...sideOf(citSide, citSide.values), documentId: doc.documentId, contentHash: doc.contentHash }, doc) } : {}),
  };
}

/** The engine's report, as the record and the editor read it. */
function readReport(report: ClaimReport, excerpts: readonly ClaimsExcerpt[]) {
  const read = report.comparisons.map((cmp) => readComparison(cmp, excerpts)).filter((x): x is NonNullable<typeof x> => !!x);
  return {
    comparisons: read.map((x) => x.comparison),
    notCompared: [...read.flatMap((x) => x.declined), ...report.notCompared.map((n) => readNotCompared(n, excerpts))],
  };
}

/**
 * Check a section's figures against the documents it cites.
 *
 * `sectionCtdCode` is the section's CTD code as the authoring record holds it ("2.7.4"); it gives
 * the section its role and nothing else.
 */
export function checkSectionClaims(
  sectionCtdCode: string | null | undefined,
  sectionText: string,
  excerpts: readonly ClaimsExcerpt[],
): SectionClaimsCheck {
  const sectionRole = claimDocRoleOf({ ctdSection: sectionCtdCode });
  const base: SectionClaimsCheck = {
    sectionRole,
    sources: excerpts.map((e) => ({ documentId: e.documentId, contentHash: e.contentHash, role: claimDocRoleOf(e) })),
    verdict: 'nothing_compared',
    compared: 0,
    conflicts: 0,
    comparisons: [],
    notCompared: [],
    truncated: false,
  };
  if (!sectionText.trim() || excerpts.length === 0) return base;

  // One source id per excerpt, so a comparison names the document it came from.
  const sourceIdOf = (i: number) => `cited:${i}`;
  const claimSources: ClaimSource[] = [
    { id: SECTION_ID, role: sectionRole, text: sectionText },
    ...excerpts.map((e, i) => ({ id: sourceIdOf(i), role: claimDocRoleOf(e), text: e.text })),
  ];
  // Only section-against-document pairs: two cited documents disagreeing with each other is a
  // finding about the Vault, not about this draft, and it is not this check's to report.
  // `withinSource: false`: a section stating the same frame twice is the draft's own consistency,
  // which the editor's section check owns.
  const report = compareClaims(claimSources, {
    pairs: excerpts.map((_, i) => [SECTION_ID, sourceIdOf(i)] as const),
    withinSource: false,
  });

  const { comparisons, notCompared } = readReport(report, excerpts);
  const conflicts = comparisons.filter((c) => c.outcome === 'conflict');
  const kept = [...conflicts, ...comparisons.filter((c) => c.outcome === 'consistent')];
  return {
    ...base,
    verdict: report.verdict,
    compared: comparisons.length,
    conflicts: conflicts.length,
    comparisons: kept.slice(0, CLAIMS_KEPT),
    notCompared: notCompared.slice(0, CLAIMS_KEPT),
    truncated: kept.length > CLAIMS_KEPT || notCompared.length > CLAIMS_KEPT,
  };
}
