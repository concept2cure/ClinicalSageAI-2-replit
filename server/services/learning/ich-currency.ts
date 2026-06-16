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
  | 'in_sync'; // corpus already reflects the card

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

function assess(card: KnowledgeCard): CurrencyItem | null {
  const code = card.standardCode?.trim();
  if (!code) return null;

  const corpus = matchCorpus(code);
  const base = { cardId: card.id, standardCode: code, url: card.url };

  if (!corpus) {
    return { ...base, finding: 'missing_in_corpus', detail: `ICH ${code} is not indexed in the corpus; add it.` };
  }

  const cardRev = revisionOf(code);
  const corpusRev = revisionOf(corpus.code);
  if (cardRev !== undefined && corpusRev !== undefined && cardRev > corpusRev) {
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

  return { ...base, corpusCode: corpus.code, finding: 'in_sync', detail: `Corpus already reflects ${corpus.code}.` };
}

/**
 * Compare ICH-bodied cards against the live corpus and produce the worklist.
 * Considers only cards whose body is ICH (other bodies feed their own corpora).
 */
export function assessIchCurrency(cards: KnowledgeCard[], now: Date = new Date()): IchCurrencyReport {
  const ichCards = cards.filter(c => c.body === 'ICH' && c.standardCode);
  const assessed = ichCards.map(assess).filter((x): x is CurrencyItem => x !== null);
  const actions = assessed.filter(a => a.finding !== 'in_sync');
  return {
    generatedAt: now.toISOString(),
    corpusSize: ICH_GUIDELINES.length,
    ichCardsConsidered: ichCards.length,
    actions,
    inSync: assessed.length - actions.length,
  };
}
