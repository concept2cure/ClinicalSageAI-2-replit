/**
 * Alternatives for a selected passage, inside the one AnA review panel (surfaces/AuthoringAiDraft.tsx;
 * docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md, slice 4). The existing draft route drafts up to
 * three replacements of exactly the passage, one per tone, each with its own check and turn record.
 * The one the person chooses lands as AnA's tracked replacement of the selection through the
 * workbench's own proposal door. Reading, switching and comparing change nothing; nothing is saved,
 * accepted or approved here.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { RedlineText } from '../RedlineText';
import { AnaActivity } from '../AnaActivity';
import type { FireToast } from '../toast';
import { renderSafeMarkdown } from '../../components/ana/renderSafeMarkdown';
import { anaInsertRefusal } from './anaInsertGate';
import type { PendingAiDraft } from './authoringDraftTransport';
import type { AssemblySourceManifest } from '@shared/authoring/assembly-sources';
import type { EditorProposalReceipt } from './editorProposalReceipt';
import { draftParagraphAuthor, type DraftProposalTarget } from './draftAlternatives';
import { passageProposal, passageRefusal, type PassageRequest } from './draftPassage';
import { AlternativesPicker, useFocusReturn, useProposalStates } from './DraftAlternatives';
import { useAuthoringDraftReview } from './useAuthoringDraftReview';

const NOTE: React.CSSProperties = { margin: 0, fontSize: 12 };
const QUIET: React.CSSProperties = { fontSize: 11, color: 'var(--text-300)' };
const PASSAGE_NOTE = 'AnA drafts three replacements for this passage only, asking for a professional, a concise and a detailed text in turn; '
  + 'each is a separate draft with its own check. The one you choose replaces exactly the selected passage as AnA’s tracked change, '
  + 'for you to accept, reject or edit in the editor before you save. It carries no source citations. '
  + 'AnA does not supply figures: the check names any figure the sources shown do not hold.';
const REPLACE_NOTE = 'Nothing is saved or accepted. The change waits in the editor for your decision.';
const notAccepted = () => ({ text: 'A passage alternative is added as a tracked change, not accepted here.', clearDraft: false });

export interface PassageAlternativesProps {
  passage: PassageRequest;
  docId?: string;
  programId?: string | null;
  sectionCode: string;
  region: string;
  docSealed: boolean;
  editorDirty: boolean;
  savedUpdatedAt: string | null;
  target?: DraftProposalTarget;
  /** The section's selected-source manifest, when it is drafted from one; the passage is drafted from the same sources. */
  sources?: AssemblySourceManifest;
  fireToast: FireToast;
  /** Back to drafting the whole section; the section's review is as it was. */
  onBack: () => void;
  onClose: () => void;
  /** The panel's own grounding, model, check and record lines for one draft. */
  renderFacts: (draft: PendingAiDraft) => React.ReactNode;
}

export function PassageAlternatives(props: PassageAlternativesProps) {
  const { passage, sectionCode, docSealed, target } = props;
  const review = useAuthoringDraftReview({ sectionId: passage.sectionId, docId: props.docId, programId: props.programId,
    passage, sources: props.sources, docSealed, editorDirty: props.editorDirty, onAccepted: () => undefined, onClose: props.onClose,
    fireToast: props.fireToast, describeAcceptFailure: notAccepted });
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  const { draft, refusal, alternatives } = review.state;
  const busy = review.generating;
  const pressed = useFocusReturn(busy);
  const ask = (control: HTMLElement) => {
    pressed(control);
    void review.generateAlternatives({ tone: 'professional', region: props.region, context: '', requirements: '' });
  };
  return (
    <section className="scaf-note" data-testid="ai-draft-passage-panel" aria-labelledby={headingId}
      style={{ marginBottom: 12, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h2 id={headingId} ref={headingRef} tabIndex={-1} style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
          {`Alternatives for a passage of ${sectionCode}`}
        </h2>
        <span style={{ flex: 1 }} />
        <button type="button" className="nda-open" onClick={props.onBack} disabled={busy}>Back to drafting the section</button>
        <button type="button" className="nda-open" onClick={props.onClose} disabled={busy}>Close</button>
      </div>
      <blockquote style={{ margin: 0, paddingLeft: 10, borderLeft: '3px solid var(--border)', fontSize: 13 }}>{passage.quote}</blockquote>
      <p role="note" data-testid="ai-draft-passage-note" style={NOTE}>{PASSAGE_NOTE}</p>
      {refusal && <div className="scaf-note" role="alert" data-testid="ai-draft-passage-refusal" style={{ ...NOTE, color: 'var(--error)' }}>{refusal}</div>}
      {busy && <AnaActivity streaming phase={review.phase ?? `Drafting alternatives for the passage of ${sectionCode}…`}
        startedAt={review.generatingSince ?? undefined} />}
      <div>
        <button type="button" className={alternatives?.length ? 'btn ghost' : 'btn primary'} style={{ height: 30 }} onClick={e => ask(e.currentTarget)}
          disabled={busy || docSealed} title={docSealed ? 'This document is frozen — its content cannot be edited.' : undefined}>
          {alternatives?.length ? 'Draft the alternatives again' : 'Draft three alternatives for this passage'}
        </button>
      </div>
      {draft && alternatives?.length ? (
        <>
          <AlternativesPicker state={review.state} accepting={false} onShow={review.showAlternative} />
          {props.renderFacts(draft)}
          <PassageReplace draft={draft} passage={passage} savedUpdatedAt={props.savedUpdatedAt} target={target} busy={busy || docSealed} />
        </>
      ) : null}
    </section>
  );
}

/** The shown alternative against the passage, and the one act: replace the selection as a tracked change. */
function PassageReplace({ draft, passage, savedUpdatedAt, target, busy }: {
  draft: PendingAiDraft; passage: PassageRequest; savedUpdatedAt: string | null; target?: DraftProposalTarget; busy: boolean;
}) {
  const noteId = useId();
  const html = useMemo(() => renderSafeMarkdown(draft.generated), [draft.generated]);
  const [receipt, setReceipt] = useState<EditorProposalReceipt | null | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  useEffect(() => { setFailure(null); }, [draft.generated]);
  const [state] = useProposalStates(receipt ? [receipt] : [], target);
  const refused = !target ? 'Open this section in the document editor to replace the passage.' : anaInsertRefusal(draft.turnRecord, false);
  const pressed = useFocusReturn(proposing);
  const replace = async (control: HTMLElement) => {
    if (!target || refused || proposing) return;
    pressed(control);
    setProposing(true);
    setFailure(null);
    try {
      const result = await target.propose(passageProposal({ sectionId: passage.sectionId, baseUpdatedAt: savedUpdatedAt, passage,
        replacement: draft.generated }), draftParagraphAuthor(draft.turnRecord), draft.turnRecord, false);
      if (result.ok) setReceipt(result.receipt ?? null);
      else setFailure(passageRefusal(result));
    } finally { setProposing(false); }
  };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <RedlineText previous={passage.quote} current={html} label="Changes this alternative makes to the selected passage"
        identicalNote="Reads the same as the selected passage." />
      <div>
        <button type="button" className="btn primary" style={{ height: 30 }} onClick={e => void replace(e.currentTarget)}
          disabled={busy || proposing || !!refused} aria-describedby={noteId}>
          Replace the selected passage with this alternative
        </button>
      </div>
      <p id={noteId} data-testid="ai-draft-passage-replace-note" style={refused ? NOTE : QUIET}>{refused ?? REPLACE_NOTE}</p>
      <p role="status" style={NOTE}>
        {receipt !== undefined
          ? `The alternative is in the editor as a tracked change. ${!receipt || state === 'pending'
            ? 'Review it there, then save with your reason for change.' : 'It has already been reviewed in the editor.'} Nothing was saved or accepted.`
          : ''}
      </p>
      {failure && <p role="alert" style={{ ...NOTE, color: 'var(--error)' }}>{failure}</p>}
    </div>
  );
}
