/**
 * Alternatives and chosen paragraphs for the one AnA review panel
 * (docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md, slice 1). Pure.
 *
 * An alternative is one more call to the existing draft route, so it is its own
 * single-use candidate with its own check and turn record. What it asked for is
 * the existing tone vocabulary, and its label says exactly that: the platform's
 * request, never the model's description of its own text.
 *
 * Chosen paragraphs land through the workbench's EditorBridge.propose, the same
 * door AnA's remedy cards use: the governed-write gate, the saved-base check and
 * the application receipt all apply. A paragraph is proposed as AnA drafted it,
 * so the save can verify those words against the alternative's turn record; the
 * person edits it in the editor, where their words are tracked as theirs.
 */
import type { AnaTurnRecordStatus } from '../../components/ana/useAnaChat.types';
import { looksLikeHtml } from './roundTrip';
import type { AiDraftAlternative, AiDraftApproach, AiDraftReviewState, PendingAiDraft } from './authoringDraftTransport';
import type { EditorBridge, EditorBridgeProposal, EditorBridgeProposeResult } from './DocumentWorkbench';
import type { EditorProposalReceipt } from './editorProposalReceipt';
import type { ProposalState } from './proposalLifecycle';
import { ANA_SUGGESTION_AUTHOR_ID } from './anaInsertGate';
import { remedyRefusal } from './authoringRemedies';

export const DRAFT_APPROACHES: ReadonlyArray<{ approach: AiDraftApproach; label: string; asked: string }> = [
  { approach: 'professional', label: 'Professional', asked: 'Asked for a professional tone' },
  { approach: 'concise', label: 'Concise', asked: 'Asked for a concise text' },
  { approach: 'detailed', label: 'Detailed', asked: 'Asked for a detailed text' },
];

export const approachOf = (approach: AiDraftApproach) =>
  DRAFT_APPROACHES.find(a => a.approach === approach) ?? DRAFT_APPROACHES[0];

/** Clears every alternative; spread into any patch that ends the review. */
export const NO_ALTERNATIVES: Pick<AiDraftReviewState, 'alternatives' | 'shownAlternative' | 'pendingApproaches'> = {
  alternatives: undefined, shownAlternative: undefined, pendingApproaches: undefined,
};

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The draft's paragraphs: its markdown blocks, as the model wrote them. */
export function draftParagraphs(text: string): string[] {
  return (text ?? '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/).map(b => b.trim()).filter(Boolean);
}

/** Paragraph and word counts, counted here; a word is a token with a letter or digit in it. */
export function draftShape(text: string): { paragraphs: number; words: number } {
  return {
    paragraphs: draftParagraphs(text).length,
    words: (text ?? '').split(/\s+/).filter(t => /[\p{L}\p{N}]/u.test(t)).length,
  };
}

export function shapeLine(text: string): string {
  const { paragraphs, words } = draftShape(text);
  return `${paragraphs} paragraph${paragraphs === 1 ? '' : 's'} · ${words} word${words === 1 ? '' : 's'}`;
}

/* The innermost blocks that hold text in the saved HTML. A code block is left
   out: it cannot carry a tracked change (suggestions.ts unsupported-content). */
const TEXTBLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, td, th';

/** The saved section's text blocks, as the editor's quote lookup reads them. */
export function savedParagraphs(content: string): string[] {
  if (!(content ?? '').trim()) return [];
  if (!looksLikeHtml(content)) return draftParagraphs(content).map(collapse).filter(Boolean);
  const body = new DOMParser().parseFromString(content, 'text/html').body;
  const out: string[] = [];
  body.querySelectorAll(TEXTBLOCKS).forEach(el => {
    if (el.querySelector(TEXTBLOCKS)) return;
    const text = collapse(el.textContent ?? '');
    if (text) out.push(text);
  });
  return out;
}

const wordSet = (s: string) => new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []));

/** Shared words, as a Dice coefficient over each text's distinct words. */
export function similarity(a: string, b: string): number {
  const A = wordSet(a);
  const B = wordSet(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return (2 * shared) / (A.size + B.size);
}

/** Each draft paragraph's default pair: the most similar current paragraph, the nearer one on a tie. */
export function defaultPairing(draft: readonly string[], current: readonly string[]): number[] {
  return draft.map((paragraph, i) => {
    let best = -1;
    let bestScore = -1;
    current.forEach((candidate, j) => {
      const score = similarity(paragraph, candidate);
      if (score > bestScore || (score === bestScore && Math.abs(j - i) < Math.abs(best - i))) {
        best = j;
        bestScore = score;
      }
    });
    return best;
  });
}

export interface ParagraphPlan {
  proposal: EditorBridgeProposal;
  /** Draft paragraph indexes this proposal carries, in draft order. */
  paragraphs: number[];
  /** The current paragraph it replaces; null for an addition to an empty section. */
  replaces: number | null;
}

/**
 * The proposals for the chosen paragraphs. An empty section takes one
 * insert-empty addition; otherwise each current paragraph that chosen
 * paragraphs are paired with is replaced by them, in draft order. A pair that
 * would change nothing is reported, not proposed.
 */
export function paragraphProposals(input: {
  sectionId: string; baseUpdatedAt: string | null; draft: readonly string[]; chosen: readonly number[];
  current: readonly string[]; pairing: readonly number[];
}): { plans: ParagraphPlan[]; unchanged: number[] } {
  const base = input.baseUpdatedAt ? { baseUpdatedAt: input.baseUpdatedAt } : {};
  const chosen = [...new Set(input.chosen)].filter(i => input.draft[i] !== undefined).sort((a, b) => a - b);
  if (!chosen.length) return { plans: [], unchanged: [] };
  if (!input.current.length) {
    return { plans: [{ replaces: null, paragraphs: chosen, proposal: { sectionId: input.sectionId, ...base,
      operation: 'insert-empty', quote: '', replacement: chosen.map(i => input.draft[i]).join('\n\n') } }], unchanged: [] };
  }
  const groups = new Map<number, number[]>();
  for (const i of chosen) {
    const target = input.pairing[i];
    if (!Number.isInteger(target) || target < 0 || target >= input.current.length) continue;
    groups.set(target, [...(groups.get(target) ?? []), i]);
  }
  const plans: ParagraphPlan[] = [];
  const unchanged: number[] = [];
  for (const [target, paragraphs] of groups) {
    const replacement = paragraphs.map(i => input.draft[i]).join('\n\n');
    if (collapse(replacement) === input.current[target]) { unchanged.push(...paragraphs); continue; }
    plans.push({ replaces: target, paragraphs, proposal: { sectionId: input.sectionId, ...base, quote: input.current[target], replacement } });
  }
  return { plans, unchanged };
}

/** Why one proposal did not land, in this panel's terms. */
export function paragraphRefusal(result: Extract<EditorBridgeProposeResult, { ok: false }>, plan: ParagraphPlan): string {
  const which = plan.paragraphs.map(i => i + 1).join(' and ');
  const lead = `Paragraph${plan.paragraphs.length === 1 ? '' : 's'} ${which} ${plan.paragraphs.length === 1 ? 'was' : 'were'} not added: `;
  const current = plan.replaces === null ? '' : `current paragraph ${plan.replaces + 1}`;
  if (result.reason === 'stale') return `${lead}the saved section changed after these alternatives were drafted. Draft them again.`;
  if (result.reason === 'no-base') return `${lead}this section has no saved version to anchor the change to. Save the section first.`;
  if (result.reason === 'not-found') return plan.replaces === null
    ? `${lead}the section is no longer empty in the editor. Save or discard that text, then draft again.`
    : `${lead}${current} is no longer in the editor as it was saved. Save or discard your changes to it, then add the paragraph again.`;
  if (result.reason === 'ambiguous') return `${lead}the text of ${current} appears more than once in the section. Pair the paragraph with another one, or make the repeated text distinct first.`;
  if (result.reason === 'overlaps-suggestion') return `${lead}${current} already holds pending changes. Review those first.`;
  return lead + remedyRefusal(result);
}

/** The author every chosen paragraph is proposed under: AnA, naming the alternative's turn. */
export function draftParagraphAuthor(record: AnaTurnRecordStatus | undefined) {
  return { id: ANA_SUGGESTION_AUTHOR_ID, name: 'AnA (draft alternative)', ...(record?.status === 'recorded' ? { sourceRecord: record.id } : {}) };
}

/** The workbench's bridge, read at the moment of use: the panel never holds a stale one. */
export interface DraftProposalTarget {
  propose: EditorBridge['propose'];
  getProposalState: (receipt: EditorProposalReceipt) => ProposalState;
  subscribeProposalChanges: (listener: () => void) => () => void;
}
export function proposalTargetOf(current: () => EditorBridge | null): DraftProposalTarget {
  return {
    propose: (proposal, author, record, unfinished) =>
      current()?.propose(proposal, author, record, unfinished) ?? Promise.resolve({ ok: false, reason: 'not-editable' }),
    getProposalState: receipt => current()?.getProposalState?.(receipt) ?? 'unavailable',
    subscribeProposalChanges: listener => current()?.subscribeProposalChanges?.(listener) ?? (() => {}),
  };
}

/* ── Names: what the platform asked for, never the model's description ─── */

const short = (instruction: string) => (instruction.length > 48 ? `${instruction.slice(0, 48).trimEnd()}…` : instruction);
const quoted = (instruction: string) => `“${short(instruction)}”`;

/** The radio label of an entry: its approach, or "Revised:" and the person's instruction. */
export function alternativeLabel(alt: AiDraftAlternative): string {
  return alt.revision ? `Revised: ${short(alt.revision.instruction)}` : approachOf(alt.approach).label;
}

/** An entry as a noun phrase, for legends and descriptions. */
export function alternativeName(list: readonly AiDraftAlternative[], index: number): string {
  const alt = list[index];
  if (!alt) return 'the draft';
  if (alt.revision) return `the revision ${quoted(alt.revision.instruction)}`;
  return alt.single ? 'the draft' : `the ${approachOf(alt.approach).label.toLowerCase()} alternative`;
}

/** What an entry asked for and its shape, counted here. */
export function alternativeDescription(list: readonly AiDraftAlternative[], index: number): string {
  const alt = list[index];
  const asked = alt.revision ? `Revises ${alternativeName(list, alt.revision.from)}` : approachOf(alt.approach).asked;
  return `${asked} · ${shapeLine(alt.draft.generated)}`;
}

/** The index of the entry the shown one revises, or null when it is not a revision. */
export function revisedIndex(state: AiDraftReviewState): number | null {
  const list = state.alternatives ?? [];
  const from = list[state.shownAlternative ?? 0]?.revision?.from;
  return from !== undefined && list[from] ? from : null;
}

/**
 * The text the shown entry is compared with: the saved section, the text it revised as AnA drafted
 * it (rendered), or another entry as it stands in the panel. Null when nothing is compared.
 */
export function comparedText(state: AiDraftReviewState, against: string, savedContent: string,
  render: (markdown: string) => string): string | null {
  if (against === 'saved') return savedContent;
  const from = revisedIndex(state);
  if (against === 'revised') return from === null ? null : render(state.alternatives![from].draft.generated);
  if (!against.startsWith('alternative:')) return null;
  return state.alternatives?.[Number(against.slice(12))]?.body ?? null;
}

/* ── Review state ───────────────────────────────────────────────────────── */

/** What the panel's existing controls say once a set of alternatives is shown. */
export function alternativeWording(state: AiDraftReviewState, edited: boolean) {
  const list = state.alternatives ?? [];
  const shown = list.length ? list[state.shownAlternative ?? 0] ?? null : null;
  /* Three alternatives were asked for; a lone draft listed beside its revisions is still one draft. */
  const set = list.length > 0 && !list[0].single;
  const replaces = edited ? ' — replaces your edits' : '';
  return {
    shown,
    set,
    paragraphLabel: alternativeName(list, state.shownAlternative ?? 0),
    accept: shown?.revision ? 'Accept the whole revision and record citations'
      : set ? 'Accept the whole alternative and record citations' : 'Accept and record citations',
    again: set ? `Draft the alternatives again${replaces}` : `Draft again${replaces}`,
    againTitle: set ? 'Drafts three new alternatives, replacing these, their revisions and any edits you made to them.'
      : shown ? 'Generates a new draft, replacing the one shown, its revisions and any edits you made to them.'
        : edited ? 'Generates a new draft, replacing the text you have edited here.' : 'Generates a new draft, replacing the one shown.',
  };
}

/** Show alternative `index`, keeping the edits of the one shown until now. */
export function showAlternative(state: AiDraftReviewState, index: number): Partial<AiDraftReviewState> | null {
  const list = state.alternatives;
  if (!list?.[index] || state.acceptUnknown) return null;
  const shown = state.shownAlternative ?? 0;
  const kept = list.map((a, i) => (i === shown && state.draft ? { ...a, body: state.body } : a));
  return { alternatives: kept, shownAlternative: index, draft: kept[index].draft, body: kept[index].body, refusal: null };
}

/** An alternative that arrived: the first is shown; later ones join the list without moving the view. */
export function arrivedAlternative(state: AiDraftReviewState, approach: AiDraftApproach, draft: PendingAiDraft,
  pending: AiDraftApproach[], first: boolean): Partial<AiDraftReviewState> {
  const alternative: AiDraftAlternative = { approach, draft, body: draft.generated };
  if (first) {
    return { alternatives: [alternative], shownAlternative: 0, pendingApproaches: pending, draft, body: draft.generated,
      acceptUnknown: false, baseChanged: false, checkedContent: undefined };
  }
  return { alternatives: [...(state.alternatives ?? []), alternative], pendingApproaches: pending };
}

/* ── Revise by instruction (slice 3) ────────────────────────────────────── */

/** Quick instructions, sent exactly as shown; the person may write their own. */
export const QUICK_INSTRUCTIONS: readonly string[] = ['Shorter', 'Follow the SAP wording', 'Use the E3 structure for this heading'];
export const MAX_INSTRUCTION_CHARS = 1000;

/** Why the text shown cannot be revised now, or null when it can. */
export function revisionRefusal(state: AiDraftReviewState, docSealed: boolean): string | null {
  if (docSealed) return 'This document is frozen — its content cannot be edited, so nothing can be revised.';
  if (!state.draft) return null;
  if (!state.draft.draftId) return 'This draft was not retained on the server, so it cannot be revised. Draft the section again.';
  if (state.baseChanged) return 'The saved section changed after this draft was generated. Draft again to revise the current text.';
  return null;
}

/** What a revision is asked for, captured when the person asks: the entry shown, its candidate and its approach. */
export interface RevisionTarget { from: number; fromDraftId: string; approach: AiDraftApproach }
export function revisionTarget(state: AiDraftReviewState, tone: string): RevisionTarget | null {
  if (!state.draft?.draftId || state.acceptUnknown || state.baseChanged) return null;
  const list = state.alternatives;
  const from = list?.length ? state.shownAlternative ?? 0 : 0;
  const approach = list?.length ? list[from]?.approach : approachOf((state.draft.metadata.tone ?? tone) as AiDraftApproach).approach;
  return approach ? { from, fromDraftId: state.draft.draftId, approach } : null;
}

/**
 * A revision that arrived joins the list as a new entry derived from the one it names, and is
 * shown. Nothing it revises is replaced; the entry shown until now keeps its edits. A lone draft
 * is listed first, so the person can go back to it.
 */
export function revisedAlternative(state: AiDraftReviewState, target: RevisionTarget, draft: PendingAiDraft,
  instruction: string): Partial<AiDraftReviewState> {
  const seeded: AiDraftAlternative[] = state.alternatives?.length ? state.alternatives
    : state.draft ? [{ approach: target.approach, draft: state.draft, body: state.body, single: true }] : [];
  const shown = state.shownAlternative ?? 0;
  const kept = seeded.map((a, i) => (i === shown && state.draft ? { ...a, body: state.body } : a));
  const list = [...kept, { approach: target.approach, draft, body: draft.generated, revision: { from: target.from, instruction } }];
  return { alternatives: list, shownAlternative: list.length - 1, draft, body: draft.generated, refusal: null };
}
