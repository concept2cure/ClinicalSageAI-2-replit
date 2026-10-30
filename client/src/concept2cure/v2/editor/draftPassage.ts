/**
 * Alternatives for a selected passage (docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md, slice 4).
 *
 * The editor reads the selection as the proposal door will resolve it: the quote inside one text
 * block, and up to PASSAGE_CONTEXT_CHARS of text either side, read as `locateProposal` reads
 * context. A selection the door would not land in exactly one place is refused here, before any
 * draft is asked for. The replacement the person chooses goes through the same door
 * (EditorBridge.propose → suggestions.ts proposeReplacement) as AnA's other tracked changes, under
 * the governed-write gate and the saved-base check. Pure apart from reading the editor state.
 */
import type { Editor } from '@tiptap/core';
import { MAX_PASSAGE_CHARS, PASSAGE_CONTEXT_CHARS, type DraftPassage } from '@shared/authoring/draft-passage';
import { locateProposal } from './proposalAnchor';
import { remedyRefusal } from './authoringRemedies';
import type { EditorBridgeProposal, EditorBridgeProposeResult } from './DocumentWorkbench';

export { PASSAGE_CONTEXT_CHARS };

/** A passage as the editor offers it: one request of the person's. */
export interface OfferedPassage extends DraftPassage { requestId: number }
/** A passage the person asked alternatives for, in the section it was selected in. */
export interface PassageRequest extends OfferedPassage { sectionId: string }

const NOTHING = 'Select the words you want alternatives for, then choose Offer alternatives.';
const ACROSS = 'Select text within one paragraph, heading, list item or table cell. An alternative replaces words in one place.';
const TOO_LONG = `The selection is longer than ${MAX_PASSAGE_CHARS} characters. Select a shorter passage, or draft the whole section from sources.`;
const AMBIGUOUS = 'These words read the same, with the same text around them, in more than one place in the section. Select a longer passage so it names one place.';
const PENDING = 'The selection holds pending tracked changes. Accept or reject them first, then ask again.';
const UNSUPPORTED = 'The selection could not be matched to one stretch of editable text. Select words within one paragraph, outside citations, references and images.';

export type PassageRead = { ok: true; passage: DraftPassage } | { ok: false; reason: string };

/** The selection as a passage the proposal door can land in exactly one place, or why not. */
export function editorPassage(editor: Pick<Editor, 'state'>): PassageRead {
  const { doc, selection } = editor.state;
  const { from, to } = selection;
  if (selection.empty) return { ok: false, reason: NOTHING };
  const start = doc.resolve(from);
  if (!start.parent.isTextblock || !start.sameParent(doc.resolve(to))) return { ok: false, reason: ACROSS };
  const raw = doc.textBetween(from, to, ' ', ' ');
  const quote = raw.trim();
  if (!quote) return { ok: false, reason: NOTHING };
  if (quote.length > MAX_PASSAGE_CHARS) return { ok: false, reason: TOO_LONG };
  const { insertion, deletion } = doc.type.schema.marks;
  let pending = false;
  doc.nodesBetween(from, to, node => {
    if (node.isInline && node.marks.some(m => m.type === insertion || m.type === deletion)) pending = true;
    return !pending;
  });
  if (pending) return { ok: false, reason: PENDING };
  // Whitespace trimmed from the selection belongs to the text around it.
  const lead = raw.length - raw.trimStart().length;
  const trail = raw.length - raw.trimEnd().length;
  const before = doc.textBetween(0, from, ' ', ' ') + raw.slice(0, lead);
  const after = raw.slice(raw.length - trail) + doc.textBetween(to, doc.content.size, ' ', ' ');
  const passage = { quote, prefix: before.slice(-PASSAGE_CONTEXT_CHARS), suffix: after.slice(0, PASSAGE_CONTEXT_CHARS) };
  const located = locateProposal(doc, { ...passage, replacement: '' });
  if (located === 'ambiguous') return { ok: false, reason: AMBIGUOUS };
  if (located === 'overlaps-suggestion') return { ok: false, reason: PENDING };
  if (typeof located === 'string') return { ok: false, reason: UNSUPPORTED };
  return { ok: true, passage };
}

let requests = 0;
/** The editor's "Offer alternatives": the passage to the host, or the reason in the editor's notice. */
export function offerSelectedPassage(editor: Pick<Editor, 'state'> | null, offer: ((passage: OfferedPassage) => void) | null,
  notify: (text: string | null) => void): void {
  if (!editor || !offer) return;
  const read = editorPassage(editor);
  if (read.ok === false) { notify(read.reason); return; }
  notify(null);
  offer({ ...read.passage, requestId: ++requests });
}

/** The chosen alternative as the proposal door takes it: a replacement of exactly the passage. */
export function passageProposal(input: { sectionId: string; baseUpdatedAt: string | null; passage: DraftPassage; replacement: string }): EditorBridgeProposal {
  const { quote, prefix, suffix } = input.passage;
  return { sectionId: input.sectionId, ...(input.baseUpdatedAt ? { baseUpdatedAt: input.baseUpdatedAt } : {}),
    operation: 'replace', quote, prefix, suffix, replacement: input.replacement };
}

/** Whether the passage an answer names is exactly the passage asked about. */
export function samePassage(asked: DraftPassage, answered: DraftPassage | undefined): boolean {
  return !!answered && answered.quote === asked.quote && answered.prefix === asked.prefix && answered.suffix === asked.suffix;
}

/** Why the replacement did not land, in this panel's terms. */
export function passageRefusal(result: Extract<EditorBridgeProposeResult, { ok: false }>): string {
  const lead = 'The alternative was not added: ';
  if (result.reason === 'stale') return `${lead}the saved section changed after these alternatives were drafted. Select the passage again and ask again.`;
  if (result.reason === 'no-base') return `${lead}this section has no saved version to anchor the change to. Save the section first.`;
  if (result.reason === 'not-found') return `${lead}the selected passage is no longer in the editor as it was selected. Select it again and ask again.`;
  if (result.reason === 'ambiguous') return `${lead}the selected passage now reads the same in more than one place. Select a longer passage and ask again.`;
  if (result.reason === 'overlaps-suggestion') return `${lead}the selected passage already holds a pending change. Accept or reject it in the editor first.`;
  return lead + remedyRefusal(result);
}
