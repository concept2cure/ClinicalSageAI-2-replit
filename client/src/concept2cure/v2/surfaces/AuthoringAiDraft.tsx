/**
 * RAG-grounded AI section drafting — the review-and-accept surface for
 * `POST /api/authoring/sections/:id/ai/draft` and `…/ai/draft/accept`.
 *
 * ── What was missing ─────────────────────────────────────────────────────────
 * Both endpoints are built, tenant-scoped and tested
 * (server/routes/__tests__/authoringAiDraftAccept.test.ts,
 * …/authoringAiDraftFallback.test.ts). Neither had a caller anywhere in the
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
 * 1. THE TEMPLATE FALLBACK IS NOT A DRAFT. When no provider yields content the
 *    endpoint answers `success:false, degraded:true, source:'template'` with a
 *    static skeleton full of bracketed placeholders. It deliberately refuses to
 *    call that a generated draft. Rendering it as one — or as an error, which
 *    would discard a scaffold the author may legitimately want — are both
 *    wrong. It is offered, labelled as what it is, and it CANNOT be accepted:
 *    there is no draft candidate behind it and therefore no lineage to record.
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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { I } from '../icons';
import { ApiRequestError, apiRequest, serverMessage } from '@/lib/queryClient';
import type { FireToast } from '../toast';

/** `draft.metadata` as POST …/ai/draft returns it. Every field is optional
 *  because the degraded path returns a deliberately smaller object. */
export interface AiDraftMetadata {
  tone?: string;
  region?: string;
  generated_at?: string;
  model?: string | null;
  provider?: string | null;
  /** Chunks the hybrid search returned above threshold. */
  sourcesRetrieved?: number;
  /** How many of those resolved to a canonical evidence source — i.e. how many
   *  can actually carry a citation. Always ≤ sourcesRetrieved, and the gap is
   *  the interesting number: retrieved-but-unattributable evidence informed the
   *  draft and will appear in no citation. */
  attributableSources?: number;
  retrievalStatus?: 'ok' | 'empty' | 'failed';
  retrievalError?: string | null;
  source?: string;
  degraded?: boolean;
}

/** A generated draft held client-side, pending the author's decision. Nothing
 *  here has touched the section: until accept succeeds the section content is
 *  untouched on the server and in the editor. */
export interface PendingAiDraft {
  /** The section this draft was generated FOR. A draft is only ever accepted
   *  into the section it was drafted from — see the guard in `accept`. */
  sectionId: string;
  /** The text as the model produced it, kept separate from the edit buffer so
   *  "has the author changed it" stays answerable. */
  generated: string;
  /** Present only when the server parked a draft candidate. Absent means the
   *  accept endpoint is unreachable for this draft and citations cannot be
   *  recorded for it. */
  draftId: string | null;
  /** True for the hardcoded-template fallback: a scaffold, not model output. */
  degraded: boolean;
  metadata: AiDraftMetadata;
}

/** The lineage summary POST …/ai/draft/accept returns on success. */
export interface AcceptedAttribution {
  sourceSpans: number;
  authorSpans: number;
  distinctSources: number;
  coverage: number;
}

export interface AuthoringAiDraftProps {
  sectionId: string;
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
  if (d.degraded) {
    return {
      tone: 'warn',
      text:
        'AI generation was unavailable, so this is a static section template — not model-generated content. ' +
        'The bracketed placeholders are literal text that you must replace. It cannot be accepted with citations.',
    };
  }
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
 * A failed request, however it arrived.
 *
 * `apiRequest` THROWS `ApiRequestError` for every non-ok status except 401,
 * which it returns. So a handler that only inspects `res.status` has dead
 * branches for exactly the cases that matter here — the single-use 410 and the
 * fail-closed LINEAGE_REQUIRED rollback both leave by the `catch`, never by the
 * `if`. Both shapes are normalised here so the decision below is written once
 * and cannot be reachable in one path and dead in the other.
 */
export function failureOf(
  e: unknown,
): { status: number; code: string | null; message: string | null } {
  if (e instanceof ApiRequestError) {
    return { status: e.status, code: e.code ?? null, message: e.message || null };
  }
  return { status: 0, code: null, message: e instanceof Error ? e.message : String(e) };
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
  warn: { borderLeftColor: 'var(--warning,#b54708)' },
  error: { borderLeftColor: 'var(--c2c-err,#b42318)' },
};

export function AuthoringAiDraft({
  sectionId,
  sectionCode,
  sectionTitle,
  region: initialRegion,
  docSealed,
  editorDirty,
  onAccepted,
  onClose,
  fireToast,
}: AuthoringAiDraftProps) {
  const [tone, setTone] = useState<string>('professional');
  const [region, setRegion] = useState<string>(initialRegion || 'FDA');
  const [context, setContext] = useState('');
  const [requirements, setRequirements] = useState('');
  const [changeReason, setChangeReason] = useState('');

  const [generating, setGenerating] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [draft, setDraft] = useState<PendingAiDraft | null>(null);
  /** The author's edit buffer, seeded from the generated text. Held apart from
   *  `draft.generated` so `edited` below is a fact, not a guess. */
  const [body, setBody] = useState('');
  /** Why the last accept did not happen, kept on the panel rather than in a
   *  toast that fades: a refusal to record lineage is the one message an
   *  author must still be able to read a minute later. */
  const [refusal, setRefusal] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  /* A draft belongs to the section it was generated from. Switching sections
     discards it rather than leaving it addressable: the accept POSTs to a
     section id, and a draft grounded on §3.2.S evidence must never be
     acceptable into §3.2.P because the panel stayed open. */
  useEffect(() => {
    setDraft(null);
    setBody('');
    setRefusal(null);
  }, [sectionId]);

  const edited = draft != null && body !== draft.generated;

  const generate = useCallback(async () => {
    setGenerating(true);
    setRefusal(null);
    try {
      const res = await apiRequest(
        'POST',
        `/api/authoring/sections/${sectionId}/ai/draft`,
        {
          tone,
          region,
          ...(context.trim() ? { context: context.trim() } : {}),
          ...(requirements.trim() ? { requirements: requirements.trim() } : {}),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | {
            success?: boolean;
            degraded?: boolean;
            draft?: { content?: string; draftId?: string; metadata?: AiDraftMetadata };
            error?: unknown;
            message?: string;
          }
        | null;

      /* The degraded path answers 200 with success:false and a usable body.
         Only a transport/HTTP failure, or a response with no draft in it, is
         an error — treating success:false as one would throw away the
         scaffold the server deliberately chose to return. */
      const content = json?.draft?.content;
      if (!res.ok || typeof content !== 'string' || content.length === 0) {
        fireToast(
          'Couldn’t draft this section — ' +
            (serverMessage(json) ?? `HTTP ${res.status}`) +
            '. Nothing was changed.',
          'error',
        );
        return;
      }

      /* A draftId is honoured only on an affirmative `success: true`. The
         template fallback answers 200/success:false and parks no candidate, so
         today the two always agree — but if they ever disagreed, offering an
         accept for a response the server declined to affirm would write
         content and citations off the back of it. Fail closed: no affirmation,
         no accept, and the panel says the draft cannot carry lineage. */
      const vouched = json?.success === true;
      const next: PendingAiDraft = {
        sectionId,
        generated: content,
        draftId:
          vouched && typeof json?.draft?.draftId === 'string' ? json.draft.draftId : null,
        degraded: json?.degraded === true || json?.draft?.metadata?.degraded === true,
        metadata: json?.draft?.metadata ?? {},
      };
      setDraft(next);
      setBody(content);
    } catch (e) {
      /* Non-ok statuses arrive here, not at the `if` above — apiRequest throws
         them. The degraded template is the one "failure-shaped" answer that
         does NOT come this way: it is HTTP 200, so it reaches the parse and is
         offered as the scaffold it is. */
      const f = failureOf(e);
      fireToast(
        'Couldn’t draft this section — ' +
          (f.message ?? (f.status > 0 ? `HTTP ${f.status}` : 'the request failed')) +
          '. Nothing was changed.',
        'error',
      );
    } finally {
      setGenerating(false);
    }
  }, [sectionId, tone, region, context, requirements, fireToast]);

  const accept = useCallback(async () => {
    if (!draft || !draft.draftId) return;
    /* The panel is section-scoped and resets on switch, but the accept is the
       write — it re-checks rather than trusting that the reset ran. */
    if (draft.sectionId !== sectionId) {
      setRefusal(
        'This draft was generated for a different section and was not accepted. Generate a draft for this section.',
      );
      return;
    }
    setAccepting(true);
    setRefusal(null);
    try {
      const res = await apiRequest(
        'POST',
        `/api/authoring/sections/${sectionId}/ai/draft/accept`,
        {
          draftId: draft.draftId,
          content: body,
          ...(changeReason.trim() ? { changeReason: changeReason.trim() } : {}),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | {
            success?: boolean;
            section?: Record<string, unknown>;
            attribution?: AcceptedAttribution;
            error?: unknown;
            message?: string;
          }
        | null;

      /* 401 is the one failure apiRequest RETURNS rather than throws, so this
         branch is reachable — and it also catches a 200 whose body did not
         carry the saved section, which is a failure however cheerful it looks. */
      if (!res.ok || json?.success !== true || !json.section) {
        const code =
          typeof (json?.error as Record<string, unknown> | undefined)?.code === 'string'
            ? String((json?.error as Record<string, unknown>).code)
            : null;
        const f = describeAcceptFailure(res.status, code, serverMessage(json));
        if (f.clearDraft) {
          setDraft(null);
          setBody('');
        }
        setRefusal(f.text);
        return;
      }

      /* Defaulting the missing summary to zeros would report "0 verified
         citations, 0% quoted" for a save whose lineage the server recorded and
         simply did not summarise — a fabricated zero standing in for an
         unknown. Absence is passed up as absence. */
      const a = json.attribution;
      const attribution: AcceptedAttribution | null =
        a && typeof a.sourceSpans === 'number' && typeof a.coverage === 'number' ? a : null;
      onAccepted(json.section, attribution);
      setDraft(null);
      setBody('');
      onClose();
    } catch (e) {
      /* Where the two outcomes that matter actually land: apiRequest throws
         every non-ok status except 401, so the single-use 410 and the
         fail-closed LINEAGE_REQUIRED rollback arrive as exceptions. */
      const { status, code, message } = failureOf(e);
      const f = describeAcceptFailure(status, code, message);
      if (f.clearDraft) {
        setDraft(null);
        setBody('');
      }
      setRefusal(f.text);
    } finally {
      setAccepting(false);
    }
  }, [draft, sectionId, body, changeReason, onAccepted, onClose]);

  const grounding = draft ? describeGrounding(draft) : null;
  const generator = draft ? describeGenerator(draft.metadata) : null;
  const busy = generating || accepting;

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
      {refusal && (
        <div
          className="scaf-note"
          role="alert"
          data-testid="ai-draft-refusal"
          style={{ margin: 0, fontSize: 12, ...NOTE_TONE.error }}
        >
          {refusal}
        </div>
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
                onChange={e => setTone(e.target.value)}
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
                onChange={e => setRegion(e.target.value)}
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
              onChange={e => setContext(e.target.value)}
              disabled={busy}
              placeholder="What this section needs to establish"
              style={{ height: 28 }}
            />
          </label>
          <label style={{ fontSize: 12, display: 'grid', gap: 3 }}>
            Requirements (optional)
            <input
              value={requirements}
              onChange={e => setRequirements(e.target.value)}
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
              disabled={busy || docSealed}
              data-testid="ai-draft-generate"
              title={
                docSealed
                  ? 'This document is frozen — its content cannot be edited.'
                  : undefined
              }
            >
              {generating ? 'Drafting…' : 'Draft section'}
            </button>
          </div>
        </>
      )}

      {draft && grounding && (
        <>
          {/* ── Grounding: the fact a reviewer needs before reading a word ── */}
          <div
            className="scaf-note"
            role="status"
            data-testid="ai-draft-grounding"
            data-tone={grounding.tone}
            style={{ margin: 0, fontSize: 12, ...NOTE_TONE[grounding.tone] }}
          >
            {grounding.text}
          </div>

          <div style={{ fontSize: 11, opacity: 0.75 }}>
            {draft.degraded
              ? 'Source: hardcoded section template'
              : generator
                ? `Generated by ${generator}`
                : 'The generating model was not reported'}
            {' · not saved'}
          </div>

          {/* A model draft the server could not park cannot reach the accept
              endpoint at all. Say what adopting it would actually record. */}
          {!draft.degraded && !draft.draftId && (
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
                border: '1px solid var(--c2c-line,#e4e7ec)',
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
              style={{ fontSize: 11, color: 'var(--warning,#b54708)' }}
            >
              Edited. The audit record will note that the saved text differs from what the model
              produced, and the citations describe the draft’s origin rather than your wording.
            </div>
          )}

          {editorDirty && draft.draftId && (
            <div
              role="status"
              data-testid="ai-draft-dirty-warning"
              style={{ fontSize: 11, color: 'var(--warning,#b54708)' }}
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
                disabled={accepting || docSealed}
                data-testid="ai-draft-accept"
              >
                {accepting ? 'Saving…' : 'Accept and record citations'}
              </button>
            )}
            {/* Regenerating replaces the buffer, so once the author has edited
                it the control is destructive. It says so on itself rather than
                asking after the fact — the same reason Discard is named
                Discard. */}
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => void generate()}
              disabled={busy || docSealed}
              data-testid="ai-draft-regenerate"
              title={
                edited
                  ? 'Generates a new draft, replacing the text you have edited here.'
                  : 'Generates a new draft, replacing the one shown.'
              }
            >
              {generating
                ? 'Drafting…'
                : edited
                  ? 'Draft again — replaces your edits'
                  : 'Draft again'}
            </button>
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => {
                setDraft(null);
                setBody('');
                setRefusal(null);
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
