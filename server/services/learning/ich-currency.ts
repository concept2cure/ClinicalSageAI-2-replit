/**
 * ICH Currency Check — the eval that feeds the EXISTING ICH corpus.
 *
 * AnA already ships a citable ICH corpus (server/services/ana-ri/
 * ich-guideline-corpus). Today it is hand-maintained, so an entry can silently
 * go stale when ICH publishes a new revision or step change. This module is the
 * cross-reference that catches that drift: it compares harvested ICH knowledge
 * cards against what the corpus currently asserts and emits a concrete,
 * actionable worklist of corpus updates.
 *
 * It is a pure function over (cards, corpus) — no network, fully testable — and
 * is the bridge that turns the learning loop's output into maintenance of the
 * knowledge AnA already serves.
 */

import { ICH_GUIDELINES, getGuideline, type IchGuideline } from '../ana-ri/ich-guideline-corpus.js';
import type { KnowledgeCard } from './knowledge-card.js';

export type CurrencyFinding =
  | 'missing_in_corpus' // card references an ICH code the corpus does not index → add it
  | 'revision_available' // card reports a newer revision than the corpus shows → update code/summary
  | 'status_changed' // card reports a step/status change (e.g. draft → adopted) → update status
  | 'effective_date_known' // card supplies an effective date the corpus lacks → enrich entry
  | 'needs_review' // card reports a withdrawal or a draft → a curator decides how the corpus records it
  | 'undetermined' // card and corpus codes cannot be compared at revision level → not assessed
  | 'in_sync'; // the card's revision is the corpus's (or older) and it reports nothing the corpus lacks

export interface CurrencyItem {
  cardId: string;
  standardCode?: string;
  finding: CurrencyFinding;
  corpusCode?: string;
  detail: string;
  url: string;
}

export interface IchCurrencyReport {
  generatedAt: string;
  /**
   * 'not_assessed' when there was no ICH card with a standard code to compare.
   * An empty worklist then means nothing was compared, not that the corpus is current.
   */
  status: 'assessed' | 'not_assessed';
  /** What was not assessed and why; null when `status` is 'assessed'. */
  notAssessedReason: string | null;
  corpusSize: number;
  ichCardsConsidered: number;
  /** Actionable items only (everything except in_sync). */
  actions: CurrencyItem[];
  inSync: number;
}

/** Bare ICH family+number prefix, e.g. "E6(R3)" → "e6", "Q1A(R2)" → "q1a". */
function familyKey(code: string): string {
  const m = code.trim().toLowerCase().match(/^([a-z]+\d+[a-z]?)/);
  return m ? m[1] : code.trim().toLowerCase();
}

/** Extract the revision integer from a code like "E6(R3)" → 3; undefined if none. */
export function revisionOf(code: string): number | undefined {
  const m = code.match(/\(r(\d+)\)/i);
  return m ? Number(m[1]) : undefined;
}

/** Find the corpus entry whose family matches the card's standard code. */
function matchCorpus(code: string): IchGuideline | undefined {
  const exact = getGuideline(code);
  if (exact) return exact;
  const fam = familyKey(code);
  return ICH_GUIDELINES.find(g => familyKey(g.code) === fam);
}

/**
 * How the card's code stands against the corpus entry's. Revisions compare only
 * when both codes carry one, or the codes are the same.
 */
function compareRevision(code: string, corpusCode: string): 'newer' | 'same' | 'older' | 'uncomparable' {
  if (corpusCode.toUpperCase() === code.toUpperCase()) return 'same';
  const cardRev = revisionOf(code);
  const corpusRev = revisionOf(corpusCode);
  if (cardRev === undefined || corpusRev === undefined) return 'uncomparable';
  if (cardRev > corpusRev) return 'newer';
  return cardRev < corpusRev ? 'older' : 'same';
}

/** A withdrawal or a draft is not decided here: a curator decides how the corpus records it. */
function reviewItem(card: KnowledgeCard, code: string, corpus: IchGuideline | undefined): CurrencyItem {
  const what = card.changeKind === 'withdrawal' ? 'a withdrawal' : 'a draft for consultation';
  return {
    cardId: card.id,
    standardCode: code,
    url: card.url,
    corpusCode: corpus?.code,
    finding: 'needs_review',
    detail: corpus
      ? `Source reports ${what} of ${code}; corpus shows ${corpus.code} as "${corpus.status}". ` +
        'Not compared automatically: a curator decides whether the corpus entry changes.'
      : `Source reports ${what} of ${code}, which the corpus does not index. ` +
        'Not compared automatically: a curator decides whether the corpus records it.',
  };
}

function assess(card: KnowledgeCard): CurrencyItem | null {
  const code = card.standardCode?.trim();
  if (!code) return null;

  const corpus = matchCorpus(code);
  const base = { cardId: card.id, standardCode: code, url: card.url };

  // 2026-10-15: a withdrawal or a draft for consultation fell through to
  // 'in_sync' ("Corpus already reflects …") although nothing compared it, and a
  // draft naming a newer revision was reported 'revision_available' as if it
  // had been adopted.
  if (card.changeKind === 'withdrawal' || card.changeKind === 'draft_for_consultation') {
    return reviewItem(card, code, corpus);
  }

  if (!corpus) {
    return { ...base, finding: 'missing_in_corpus', detail: `ICH ${code} is not indexed in the corpus; add it.` };
  }

  const order = compareRevision(code, corpus.code);
  // 2026-10-15: "E6" against the corpus's "E6(R3)" used to reach 'in_sync'.
  if (order === 'uncomparable') {
    const bare = revisionOf(code) === undefined ? `The card's code ${code}` : `The corpus code ${corpus.code}`;
    return {
      ...base,
      corpusCode: corpus.code,
      finding: 'undetermined',
      detail: `${bare} carries no revision number, so ${code} could not be compared with ${corpus.code}; not assessed.`,
    };
  }

  if (order === 'newer') {
    return {
      ...base,
      corpusCode: corpus.code,
      finding: 'revision_available',
      detail: `Corpus shows ${corpus.code}; source reports newer revision ${code}. Update code + summary.`,
    };
  }

  if (card.changeKind === 'revision' && corpus.status !== 'adopted') {
    return {
      ...base,
      corpusCode: corpus.code,
      finding: 'status_changed',
      detail: `Corpus marks ${corpus.code} as "${corpus.status}"; source reports an adopted revision. Update status.`,
    };
  }

  if (card.effectiveDate) {
    return {
      ...base,
      corpusCode: corpus.code,
      finding: 'effective_date_known',
      detail: `Source supplies effective date ${card.effectiveDate} for ${corpus.code}; corpus does not track dates yet.`,
    };
  }

  return {
    ...base,
    corpusCode: corpus.code,
    finding: 'in_sync',
    detail:
      order === 'older'
        ? `Corpus already shows ${corpus.code}, later than the source's ${code}.`
        : `Corpus shows ${corpus.code}, matching the source's ${code}.`,
  };
}

/**
 * Compare ICH-bodied cards against the live corpus and produce the worklist.
 * Considers only cards whose body is ICH (other bodies feed their own corpora).
 */
export function assessIchCurrency(cards: KnowledgeCard[], now: Date = new Date()): IchCurrencyReport {
  const ichCards = cards.filter(c => c.body === 'ICH' && c.standardCode);
  const assessed = ichCards.map(assess).filter((x): x is CurrencyItem => x !== null);
  const actions = assessed.filter(a => a.finding !== 'in_sync');
  // 2026-10-15: with no ICH card this returned an empty worklist, which reads as
  // "the corpus is current" when nothing had been compared.
  const notAssessed = assessed.length === 0;
  return {
    generatedAt: now.toISOString(),
    status: notAssessed ? 'not_assessed' : 'assessed',
    notAssessedReason: notAssessed
      ? `No ICH knowledge card with a standard code is in the horizon store, so none of the ` +
        `${ICH_GUIDELINES.length} corpus entries was compared with a source.`
      : null,
    corpusSize: ICH_GUIDELINES.length,
    ichCardsConsidered: ichCards.length,
    actions,
    inSync: assessed.length - actions.length,
  };
}
