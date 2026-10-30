/**
 * RAG-grounded AI section drafting — the review-and-accept surface for
 * `POST /api/authoring/sections/:id/ai/draft` and `…/ai/draft/accept`.
 *
 * ── What was missing ─────────────────────────────────────────────────────────
 * Both endpoints are built, tenant-scoped and tested
 * (server/routes/__tests__/authoringAiDraftAccept.test.ts,
 * …/authoringAiDraftNoProvider.test.ts). Neither had a caller anywhere in the
 * client. The one path in the product that records SPAN-LEVEL SOURCE LINEAGE
 * for generated text — the draft's retrieved chunks and the accepted words
 * committed in a single transaction by `enforceSourceAndAuthorLineage` — could
 * not be reached by a human being.
 *
 * That is not a missing feature. Text drafted any other way and saved through
 * PATCH /sections/:id is recorded as author-original, because that is the only
 * lineage a plain save can honestly assert. So the absence of this screen did
 * not merely hide a capability: it meant every AI-assisted section in the
 * product carried provenance that named a person for words a model produced.
 *
 * ── The four things this panel must not get wrong ────────────────────────────
 *
 * 1. NO PROVIDER IS A REFUSAL, NOT A DRAFT. A deployment with no AI provider
 *    answers 503 GATEWAY_UNAVAILABLE and no body (VSR-001 §8 F-10). The
 *    endpoint used to answer 200 with a hardcoded section skeleton flagged
 *    `degraded`, and this panel offered it as a scaffold; that path is gone
 *    from the server and from here. The refusal is said in the persistent
 *    alert, in the words AnA uses for the same code, and nothing that looks
 *    like a draft is rendered.
 *
 * 2. "RETRIEVAL FAILED" AND "NOTHING RETRIEVED" ARE OPPOSITE FACTS. Both leave
 *    `sourcesRetrieved: 0`. One says the Data Room holds nothing relevant — a
 *    finding about the corpus. The other says the search did not run to
 *    completion — a finding about nothing at all, on a draft that is ungrounded
 *    without anyone having decided it should be. The server separates them in
 *    `retrievalStatus`; collapsing them here would rebuild, in the display
 *    layer, the exact defect the endpoint was fixed to remove.
 *
 * 3. A DRAFT WITHOUT `draftId` CANNOT CARRY CITATIONS. Attribution prep is
 *    best-effort by design (it must never break drafting), so a model draft can
 *    arrive with no parked candidate. Adopting it is still possible — through a
 *    normal save — but that records the author as its sole origin. The panel
 *    says so before the click, not after.
 *
 * 4. AN EDITED DRAFT IS NOT THE MODEL'S WORDS. The accept endpoint takes the
 *    author's `content` and records `draft_modified_on_accept` when it differs
 *    from what was generated, precisely so "accepted AI draft" cannot vouch for
 *    text the model never wrote. The panel surfaces that state while it is
 *    still a choice.
 *
 * The draft candidate is SINGLE-USE — `consumeDraftCandidate` claims it with
 * DELETE … RETURNING inside the accept transaction. A 410 is therefore an
 * ordinary outcome (accepted in another tab, or expired), not an error to
 * apologise for, and the only honest recovery is to generate again.
 */
import React, { useEffect, useRef } from 'react';
import { I } from '../icons';
import type { FireToast } from '../toast';
import { AnaActivity } from '../AnaActivity';
import { AnswerCheckRows } from '../../components/ana/AnswerCheckRows';
import type { AnswerCheckView } from '../../components/ana/anaAnswerCheck';
import type { AnaTurnRecordStatus } from '../../components/ana/useAnaChat.types';

import { useAuthoringDraftReview } from '../editor/useAuthoringDraftReview';
import { AuthoredHtml } from '../editor/AuthoredHtml';
import { AlternativeReview, AlternativesPicker } from '../editor/DraftAlternatives';
import { NO_ALTERNATIVES, alternativeWording, type DraftProposalTarget } from '../editor/draftAlternatives';
import { PassageAlternatives } from '../editor/DraftPassage';
import type { PassageRequest } from '../editor/draftPassage';
import type { AcceptedAttribution, AiDraftGenerationInputs, AiDraftMetadata, AiDraftReviewSession, PendingAiDraft } from '../editor/authoringDraftTransport';
export { failureOf, createEmptyAiDraftReviewState } from '../editor/authoringDraftTransport';
export type { AcceptedAttribution, AiDraftGenerationInputs, AiDraftMetadata, AiDraftReviewState, AiDraftReviewSession, PendingAiDraft } from '../editor/authoringDraftTransport';

export interface AuthoringAiDraftProps {
  sectionId: string;
  /** Exact parent and project for receipt validation and read-only recovery. */
  docId?: string;
  programId?: string | null;
  /** The build coordinator owns these buffers across review switches. */
  reviewSession?: AiDraftReviewSession;
  sectionCode: string;
  sectionTitle: string;
  /** Region passed to the generator. The endpoint defaults to 'FDA'. */
  region?: string;
  /** A frozen document cannot be edited, so it cannot be drafted into either. */
  docSealed: boolean;
  /** The editor has unsaved changes. Accepting replaces the section content
   *  server-side and remounts the canvas, so those edits would be lost. */
  editorDirty: boolean;
  /** Called after the server confirms the accept, with the saved section row
   *  and the lineage summary. The host refreshes the canvas from this. */
  /** Called after the server confirms the accept. `attribution` is null when
   *  the server confirmed the save but sent no lineage summary — which is a
   *  different fact from a summary of zero, and must not be rendered as one. */
  onAccepted: (section: Record<string, unknown>, attribution: AcceptedAttribution | null) => void;
  onClose: () => void;
  fireToast: FireToast;
  /** The saved section as the editor loaded it: compared against, and paired with, chosen paragraphs. */
  savedContent?: string;
  savedUpdatedAt?: string | null;
  /** The workbench's own proposal door (EditorBridge.propose); absent, paragraphs cannot be added. */
  proposals?: DraftProposalTarget;
  /** A passage selected in the editor: the panel offers alternatives for it alone (slice 4). */
  passage?: PassageRequest | null;
  /** Back from the passage to drafting the section. */
  onPassageClose?: () => void;
}

const TONES = ['professional', 'concise', 'detailed'] as const;
const REGIONS = ['FDA', 'EMA', 'PMDA', 'MHRA', 'Health Canada'] as const;

/**
 * The grounding statement for a draft, in the words a reviewer needs.
 *
 * Returned as a tone plus a sentence rather than a formatted string so the
 * caller can weight the three cases differently — a retrieval OUTAGE is not a
 * footnote, and must not be styled like one.
 */
export function describeGrounding(
  d: PendingAiDraft,
): { tone: 'ok' | 'warn' | 'error'; text: string } {
  const m = d.metadata;
  const retrieved = typeof m.sourcesRetrieved === 'number' ? m.sourcesRetrieved : 0;
  const attributable = typeof m.attributableSources === 'number' ? m.attributableSources : 0;

  if (m.retrievalStatus === 'failed') {
    return {
      tone: 'error',
      text:
        'Data Room retrieval failed, so this draft was written without your evidence' +
        (m.retrievalError ? ` (${m.retrievalError})` : '') +
        '. That is not the same as having no evidence: the search did not complete, so nothing here is grounded ' +
        'and no claim in it has been checked against a source.',
    };
  }
  if (retrieved === 0) {
    return {
      tone: 'warn',
      text:
        'No Data Room source met the relevance threshold, so this draft is not grounded in your evidence. ' +
        'Every claim in it is unverified and carries no citation.',
    };
  }
  const plural = retrieved === 1 ? '' : 's';
  if (attributable === 0) {
    return {
      tone: 'warn',
      text:
        `Drafted from ${retrieved} Data Room source${plural}, none of which resolved to a citable evidence record. ` +
        'The draft was informed by that evidence and will carry no citation to it.',
    };
  }
  if (attributable < retrieved) {
    return {
      tone: 'warn',
      text:
        `Drafted from ${retrieved} Data Room source${plural}; ${attributable} can carry citations. ` +
        `The other ${retrieved - attributable} informed this text and will appear in no citation.`,
    };
  }
  return {
    tone: 'ok',
    text: `Drafted from ${retrieved} Data Room source${plural}, all of which can carry citations.`,
  };
}

/** Model and provider, or an honest silence. Never invented. */
function describeGenerator(m: AiDraftMetadata): string | null {
  const parts = [m.model, m.provider].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * What to tell the author when an accept did not happen, and whether the draft
 * can still be retried.
 *
 * Two of these are not errors in the ordinary sense and must not be worded like
 * one. A 410 means the candidate was claimed — single-use, by design — so the
 * draft is genuinely gone and holding on to it would leave a button that can
 * only fail. A LINEAGE_REQUIRED 500 means the server refused to save content it
 * could not record provenance for and rolled BOTH back together; the candidate
 * survives that rollback, so the draft must survive it here too or a correct
 * retry becomes impossible.
 */
export function describeAcceptFailure(
  status: number,
  code: string | null,
  message: string | null,
): { text: string; clearDraft: boolean } {
  if (status === 410 || code === 'DRAFT_EXPIRED') {
    return {
      clearDraft: true,
      text:
        'This draft was already accepted or has expired, so it was not applied. ' +
        'The section is unchanged. Generate a new draft to continue.',
    };
  }
  if (code === 'SECTION_BASE_CHANGED') {
    return { clearDraft: false, text: 'The saved section changed after this candidate was generated. It was not replaced. Read the current saved section and generate a new candidate; this candidate remains available for comparison.' };
  }
  if (code === 'LINEAGE_REQUIRED') {
    return {
      clearDraft: false,
      text:
        'Not saved: the draft’s source and author lineage could not be recorded, so the content ' +
        'was rolled back with it. Content is not saved without provenance. The section is unchanged.',
    };
  }
  if (status === 401) {
    return {
      clearDraft: false,
      text: 'Not saved — your session isn’t authenticated. The section is unchanged.',
    };
  }
  return {
    clearDraft: false,
    text:
      'Not saved — ' +
      (message && message.trim() ? message : status > 0 ? `HTTP ${status}` : 'the request failed') +
      '. The section is unchanged.',
  };
}

const NOTE_TONE: Record<'ok' | 'warn' | 'error', React.CSSProperties> = {
  ok: {},
  warn: { borderLeftColor: 'var(--warning)' },
  error: { borderLeftColor: 'var(--error)' },
};

/**
 * What the engine found in the draft, before the accept (round 12, RT-6): the
 * check of the draft AS GENERATED against the evidence the model was shown.
 * A draft with no check says so; edits since are said to be unchecked.
 */
function DraftCheck({ check, edited }: { check: AnswerCheckView | null; edited: boolean }) {
  return (
    <div className="ana-grounding" data-testid="ai-draft-check" style={{ margin: 0, fontSize: 12 }}>
      {check ? (
        <>
          <div style={{ fontSize: 11, opacity: 0.75 }}>
            Checked as drafted, against the Data Room sources it was given
            {edited ? ' — your edits are not checked' : ''}
          </div>
          <AnswerCheckRows check={check} />
        </>
      ) : (
        <div>This draft was not checked against its sources.</div>
      )}
    </div>
  );
}

/** Grounding, model, check and record for one draft: the facts a reviewer needs before reading a word. */
function DraftFacts({ draft, edited }: { draft: PendingAiDraft; edited: boolean }) {
  const grounding = describeGrounding(draft);
  const generator = describeGenerator(draft.metadata);
  return (
    <>
      <div className="scaf-note" role="status" data-testid="ai-draft-grounding" data-tone={grounding.tone}
        style={{ margin: 0, fontSize: 12, ...NOTE_TONE[grounding.tone] }}>
        {grounding.text}
      </div>
      <div style={{ fontSize: 11, opacity: 0.75 }}>
        {generator ? `Generated by ${generator}` : 'The generating model was not reported'}
        {' · not saved'}
      </div>
      <DraftCheck check={draft.check} edited={edited} />
      <DraftRecord turnRecord={draft.turnRecord} />
    </>
  );
}

/** Whether the draft's turn was filed: said when it was not, never implied when unknown. */
function DraftRecord({ turnRecord }: { turnRecord: AnaTurnRecordStatus | undefined }) {
  if (turnRecord?.status === 'recorded') return null;
  return (
    <div data-testid="ai-draft-record" style={{ fontSize: 11, opacity: 0.75 }}>
      {turnRecord?.status === 'not_recorded'
        ? `Not recorded — ${turnRecord.reason}`
        : 'Whether this draft’s turn was recorded was not reported.'}
    </div>
  );
}

export function AuthoringAiDraft({
  sectionId,
  docId,
  programId,
  reviewSession,
  sectionCode,
  sectionTitle,
  region: initialRegion,
  docSealed,
  editorDirty,
  onAccepted,
  onClose,
  fireToast,
  savedContent = '',
  savedUpdatedAt = null,
  proposals,
  passage = null,
  onPassageClose,
}: AuthoringAiDraftProps) {
  const review = useAuthoringDraftReview({ sectionId, docId, programId, reviewSession, docSealed, editorDirty,
    onAccepted, onClose, fireToast, describeAcceptFailure });
  const defaults: AiDraftGenerationInputs = { tone: 'professional', region: initialRegion || 'FDA', context: '', requirements: '' };
  const { tone, region, context, requirements } = { ...defaults, ...review.state.generationInputs };
  const setInputs = (next: Partial<AiDraftGenerationInputs>) => review.setGenerationInputs(next, defaults);
  const { draft, body, changeReason, refusal, acceptUnknown, baseChanged, checkedContent } = review.state;
  const { generating, generatingSince, accepting, checking, phase } = review;
  const generateAlternatives = () => review.generateAlternatives({ tone, region, context, requirements });
  const setBody = (value: string) => review.patch({ body: value });
  const setChangeReason = (value: string) => review.patch({ changeReason: value });
  const generate = () => review.generate({ tone, region, context, requirements });
  const accept = review.accept;
  const edited = draft != null && body !== draft.generated;
  const wording = alternativeWording(review.state, edited);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const passageShown = !!passage && passage.sectionId === sectionId;
  /* On opening, and on coming back from a passage, focus goes to the panel's heading. */
  useEffect(() => { if (!passageShown) headingRef.current?.focus(); }, [passageShown]);

  const grounding = draft ? describeGrounding(draft) : null;
  const busy = generating || accepting || checking;
  if (passage && passageShown) {
    return <PassageAlternatives key={passage.requestId} passage={passage} docId={docId} programId={programId} sectionCode={sectionCode}
      region={region} docSealed={docSealed} editorDirty={editorDirty} savedUpdatedAt={savedUpdatedAt} target={proposals}
      sources={reviewSession?.sources} fireToast={fireToast} onBack={() => onPassageClose?.()} onClose={onClose} renderFacts={d => <DraftFacts draft={d} edited={false} />} />;
  }

  return (
    <section
      className="scaf-note"
      data-testid="ai-draft-panel"
      aria-labelledby="ai-draft-h"
      style={{ marginBottom: 12, display: 'grid', gap: 10 }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <h2
          id="ai-draft-h"
          ref={headingRef}
          tabIndex={-1}
          style={{ fontSize: 13, fontWeight: 600, margin: 0 }}
        >
          {I.sparkles} Draft {sectionCode} from Data Room sources
        </h2>
        <span style={{ flex: 1 }} />
        <button className="nda-open" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>

      {/* Rendered OUTSIDE the draft block on purpose. A 410 clears the draft —
          the candidate is single-use and was already claimed — and an earlier
          version of this panel kept the refusal inside that block, so the one
          message explaining why nothing happened unmounted together with the
          thing it was explaining. The author saw the form reset and no reason.
          A refusal outlives the draft that caused it. */}
      {refusal && !accepting && (
        <div
          className="scaf-note"
          role="alert"
          data-testid="ai-draft-refusal"
          style={{ margin: 0, fontSize: 12, ...NOTE_TONE.error }}
        >
          {refusal}
          {acceptUnknown && docId && <button type="button" className="btn ghost" disabled={busy}
            onClick={() => void review.checkSaved()}>{checking ? 'Checking saved section…' : 'Check saved section'}</button>}
          {acceptUnknown && !docId && <p>Open the exact saved section in the document editor to reconcile this outcome before drafting again.</p>}
        </div>
      )}
      {checkedContent !== undefined && <details className="ed-provline ed-source-notice" data-testid="ai-draft-saved-check">
        <summary>Saved text from latest check</summary>
        <div className="ed-source-detail">
          <p>Read from this exact saved section. This read does not identify which request wrote it; the candidate remains held for reconciliation.</p>
          {checkedContent ? <AuthoredHtml html={checkedContent} /> : <p>The saved section contains no text.</p>}
        </div>
      </details>}

      {/* The wait, in the same live record AnA shows everywhere else: what is
            running, a pulse, and a clock — never a percentage, which the
            request cannot know. Its polite live region is what a screen-reader
            user hears; the button label alone said nothing to them. */}
      {generating && (
        <AnaActivity
          streaming
          phase={phase ?? `Retrieving Data Room evidence and drafting ${sectionCode}…`}
          startedAt={generatingSince ?? undefined}
        />
      )}

      {!draft && (
        <>
          <p style={{ fontSize: 12, margin: 0, opacity: 0.85 }}>
            Retrieves evidence from this project’s Data Room and drafts{' '}
            <b>
              {sectionCode} {sectionTitle}
            </b>{' '}
            from it. Nothing is saved until you accept the result — and accepting records the
            verified source spans behind the text, which a normal save cannot do.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, display: 'grid', gap: 3 }}>
              Tone
              <select
                value={tone}
                onChange={e => setInputs({ tone: e.target.value })}
                disabled={busy}
                style={{ height: 28 }}
              >
                {TONES.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, display: 'grid', gap: 3 }}>
              Region
              <select
                value={region}
                onChange={e => setInputs({ region: e.target.value })}
                disabled={busy}
                style={{ height: 28 }}
              >
                {REGIONS.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label style={{ fontSize: 12, display: 'grid', gap: 3 }}>
            Context (optional)
            <input
              value={context}
              onChange={e => setInputs({ context: e.target.value })}
              disabled={busy}
              placeholder="What this section needs to establish"
              style={{ height: 28 }}
            />
          </label>
          <label style={{ fontSize: 12, display: 'grid', gap: 3 }}>
            Requirements (optional)
            <input
              value={requirements}
              onChange={e => setInputs({ requirements: e.target.value })}
              disabled={busy}
              placeholder="Constraints the draft must satisfy"
              style={{ height: 28 }}
            />
          </label>
          <div>
            <button
              className="btn primary"
              style={{ height: 30 }}
              onClick={() => void generate()}
              disabled={busy || docSealed || !!acceptUnknown}
              data-testid="ai-draft-generate"
              title={
                docSealed
                  ? 'This document is frozen — its content cannot be edited.'
                  : undefined
              }
            >
              {generating ? 'Drafting…' : 'Draft section'}
            </button>{' '}
            <button className="btn ghost" style={{ height: 30 }} onClick={() => void generateAlternatives()}
              disabled={busy || docSealed || !!acceptUnknown} data-testid="ai-draft-alternatives"
              title={docSealed ? 'This document is frozen — its content cannot be edited.' : undefined}>
              Draft three alternatives
            </button>
          </div>
          <p style={{ fontSize: 11, margin: 0, color: 'var(--text-300)' }}>
            Three alternatives ask for a professional, a concise and a detailed text in turn. Region, context and
            requirements apply to each. Each is a separate draft with its own check.
          </p>
        </>
      )}

      {draft && grounding && (
        <>
          <AlternativesPicker state={review.state} accepting={accepting} onShow={review.showAlternative} />
          <DraftFacts draft={draft} edited={edited} />
          <AlternativeReview state={review.state} draft={draft} label={wording.paragraphLabel} edited={edited} savedContent={savedContent}
            savedUpdatedAt={savedUpdatedAt} target={proposals} busy={busy} docSealed={docSealed}
            onRevise={instruction => void review.revise(instruction, { tone, region, context, requirements })} />

          {/* A model draft the server could not park cannot reach the accept
              endpoint at all. Say what adopting it would actually record. */}
          {!draft.draftId && (
            <div
              className="scaf-note"
              role="status"
              data-testid="ai-draft-no-lineage"
              style={{ margin: 0, fontSize: 12, ...NOTE_TONE.warn }}
            >
              This draft’s sources could not be resolved to citable evidence records, so it cannot
              be accepted with source lineage. Copy it into the section and save if you want it —
              that records you as the sole author of the text.
            </div>
          )}

          {/* The wrapping label IS the accessible name. An aria-label here
              would override the visible text with a different string, which is
              the Label-in-Name failure (WCAG 2.5.3) — so the visible text
              carries the section instead. */}
          <label style={{ fontSize: 12, display: 'grid', gap: 3 }}>
            {`Proposed content for ${sectionCode} — edit before accepting if you want to`}
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              disabled={accepting}
              rows={18}
              data-testid="ai-draft-body"
              style={{
                width: '100%',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                lineHeight: 1.5,
                padding: 8,
                border: '1px solid var(--border)',
                borderRadius: 6,
                resize: 'vertical',
              }}
            />
          </label>

          {/* §4 above: the moment the text stops being the model's, the record
              stops being able to say it is. Shown while it is still a choice. */}
          {edited && (
            <div
              role="status"
              data-testid="ai-draft-edited"
              style={{ fontSize: 11, color: 'var(--warning)' }}
            >
              Edited. The audit record will note that the saved text differs from what the model
              produced, and the citations describe the draft’s origin rather than your wording.
            </div>
          )}

          {editorDirty && draft.draftId && (
            <div
              role="status"
              data-testid="ai-draft-dirty-warning"
              style={{ fontSize: 11, color: 'var(--warning)' }}
            >
              The editor has unsaved changes. Accepting replaces the section content, and those
              unsaved edits are not part of this draft.
            </div>
          )}

          {draft.draftId && (
            <label style={{ fontSize: 12, display: 'grid', gap: 3 }}>
              Reason for change (optional — recorded on the audit trail)
              <input
                value={changeReason}
                onChange={e => setChangeReason(e.target.value)}
                disabled={accepting}
                placeholder="Accepted AI draft"
                style={{ height: 28 }}
              />
            </label>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {draft.draftId && (
              <button
                className="btn primary"
                style={{ height: 30 }}
                onClick={() => void accept()}
                disabled={busy || docSealed || editorDirty || !!acceptUnknown || !!baseChanged || draft.sectionId !== sectionId}
                data-testid="ai-draft-accept"
              >
                {accepting ? 'Saving…' : wording.accept}
              </button>
            )}
            {/* Regenerating replaces the buffer, so once the author has edited
                it the control is destructive. It says so on itself rather than
                asking after the fact — the same reason Discard is named
                Discard. */}
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => void (wording.set ? generateAlternatives() : generate())}
              disabled={busy || docSealed || !!acceptUnknown}
              data-testid="ai-draft-regenerate"
              title={wording.againTitle}
            >
              {generating ? 'Drafting…' : wording.again}
            </button>
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => {
                review.patch({ draft: null, body: '', refusal: null, acceptUnknown: false, baseChanged: false, checkedContent: undefined, ...NO_ALTERNATIVES });
              }}
              disabled={busy}
              data-testid="ai-draft-discard"
            >
              Discard
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default AuthoringAiDraft;
