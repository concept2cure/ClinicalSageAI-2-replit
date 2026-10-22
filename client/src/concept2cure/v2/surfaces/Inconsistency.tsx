import React, { useState, useMemo, useRef } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { AnswerLead } from '../AnswerLead';
import { assessmentState } from '../assessmentState';
import type { AnswerLeadProps } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

// GI_META is display vocabulary for the enums the engine records. The gate and
// each finding's authority come from the board; nothing on this screen
// re-scores them (governed-intelligence-data.ts records what did, and why it
// was removed).
import { GI_META } from '../fixtures/governed-intelligence-data';
import type {
  GiFinding,
  GiGate,
  GiAssumption,
  GiDecision,
  GiCheck,
} from '../fixtures/governed-intelligence-data';

/* ── Cross-surface data (IC_FACTS from CMC surface, not in our source) ── */
declare global {
  interface Window {
    IC_FACTS?: Array<{ id: string; label: string; value: string; refs?: unknown[] }>;
  }
}

/* ── Live board contract ──────────────────────────────────────────────────
   GET /api/governed-intelligence-inconsistency/projects/:projectId/inconsistency
   (server/routes/governed-intelligence-inconsistency-routes.ts). REAL read-model
   over four org-scoped stores: projects (header), contradiction_findings,
   assumption_records, decision_records. `useLiveData` unwraps the { success,
   data } envelope, so the payload is the board object directly.

   HONESTY (backend gaps returned as documented null/[], never fabricated):
     - program.app / program.filing  → always null (belong to a submission
       record, not the project row).
     - program.code / stage / indication → nullable.
     - finding.factId → always null (no fact-linkage column on the findings
       table), so the CMC "change value everywhere" affordance never appears.
     - checks → always [] (the engine persists detected contradictions, not the
       set of cross-references it verified as consistent).
   `gate` is counted by the server over EVERY finding of the project; `findings`
   is a page of them, most severe first. */
interface GiBoardProgram {
  projectId: number;
  name: string;
  code: string | null;
  stage: string | null;
  indication: string | null;
  app: string | null;
  filing: string | null;
}

interface GiBoard {
  program: GiBoardProgram;
  gate: GiGate;
  findings: GiFinding[];
  assumptions: GiAssumption[];
  decisions: GiDecision[];
  checks: GiCheck[];
}

/* A board finding plus the ledger id of a review decision this screen saw
   committed — present only then, so the audit-trail claim is never made for a
   row read from the board. */
type ReviewedFinding = GiFinding & { auditId?: string | null };

/* A review decision this screen saw committed: what the server returned, and
   the board read it was made over (so a later read takes precedence). */
interface RecordedDecision {
  reviewState: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  auditId: string | null;
  over: GiFinding[] | null;
}

/* POST /contradictions/:id/review response (assumption-decision-contradiction.ts). */
interface ReviewResponse {
  finding?: { reviewState?: string; resolvedBy?: string | null; resolvedAt?: string | null };
  governance?: { auditId?: string };
}

const REVIEW_REASON_MIN = 8;

/* Still on the submission gate: not resolved, not superseded — the review
   states checkPromotionBlocked and the server's gate count both exclude. */
function onGate(f: GiFinding): boolean {
  return f.reviewState !== 'approved_resolution' && f.reviewState !== 'superseded';
}

/* Who the record says resolved it: resolved_by as stored (a user id is shown
   as one — neither the board nor the review response carries a name). Null
   when the row names nobody — never a stand-in. */
function resolverLabel(f: ReviewedFinding): string | null {
  const id = f.resolvedBy == null ? '' : String(f.resolvedBy).trim();
  if (!id) return null;
  return /^\d+$/.test(id) ? 'user ' + id : id;
}

/* Server messages arrive with or without a closing stop; join them as one. */
function asSentence(s: string): string {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : t + '.';
}

function resolvedWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/* What a review POST's answer means for this screen, classified without side
   effects so the transition handler only orchestrates. Only 'recorded' changes
   the row, and only with what the server returned; 'stale', 'unreadable' and
   'unknown' mean this screen's view may be wrong, so the confirmation closes
   and the board is re-read. */
type ReviewOutcome =
  | { kind: 'recorded'; reviewState: string; resolvedBy: string | null; resolvedAt: string | null; auditId: string | null }
  | { kind: 'refused'; status: number; detail: string }
  | { kind: 'stale'; detail: string }
  | { kind: 'unreadable' }
  | { kind: 'unknown'; status: number };

function refusedFallback(status: number): string {
  return 'the service refused the update (HTTP ' + status + ')';
}

/* One wording for a refusal, whichever way it arrives — the reply and the
   thrown error both route through here. A 409 means the finding is already in
   that state — this form was opened from a stale board — so it closes and the
   board is re-read rather than left open to be submitted again. */
function refusal(status: number, detail: string): ReviewOutcome {
  return status === 409 ? { kind: 'stale', detail } : { kind: 'refused', status, detail };
}

function reviewOutcomeFromReply(status: number, ok: boolean, json: ReviewResponse | null): ReviewOutcome {
  if (!ok) {
    // serverMessage takes the sentence and returns null for enum tokens and
    // infrastructure text; a bare "HTTP 500" is not copy, so the fallback is
    // a sentence that carries the status.
    return refusal(status, serverMessage(json) ?? refusedFallback(status));
  }
  const recorded = json?.finding;
  if (!recorded || typeof recorded.reviewState !== 'string') {
    // A 2xx whose body cannot be read says nothing about what was recorded
    // (it may not even be this route's). Claim nothing; re-read.
    return { kind: 'unreadable' };
  }
  return {
    kind: 'recorded',
    reviewState: recorded.reviewState,
    resolvedBy: recorded.resolvedBy ?? null,
    resolvedAt: recorded.resolvedAt ?? null,
    auditId: json?.governance?.auditId ?? null,
  };
}

function reviewOutcomeFromError(e: unknown): ReviewOutcome {
  // ApiRequestError carries a status: the server answered and refused, and
  // its message has been through the envelope reduction. Anything else is
  // the browser's own failure, where the outcome is unknown — so re-read.
  const status = (e as { name?: unknown; status?: unknown })?.name === 'ApiRequestError'
    ? Number((e as { status?: unknown }).status)
    : 0;
  // A gateway error (502/503/504, often a proxy's page, not this route's)
  // or a COMMIT the server could not confirm is not a refusal: the change
  // may have landed. Treated like no answer at all.
  const unknown = status === 0 || status === 502 || status === 503 || status === 504
    || (e as { code?: unknown })?.code === 'OUTCOME_UNKNOWN';
  if (unknown) return { kind: 'unknown', status };
  return refusal(status, (e as Error).message || refusedFallback(status));
}

/* The governed POST; every way it can end comes back as a classified outcome. */
async function postReview(
  id: string,
  reviewState: 'approved_resolution' | 'unresolved',
  reason: string,
): Promise<ReviewOutcome> {
  try {
    const res = await apiRequest(
      'POST',
      '/api/governed-intelligence/contradictions/' + encodeURIComponent(id) + '/review',
      { reviewState, reason },
    );
    const json = (await res.json().catch(() => null)) as ReviewResponse | null;
    return reviewOutcomeFromReply(res.status, res.ok, json);
  } catch (e) {
    return reviewOutcomeFromError(e);
  }
}

/* ── Inline shared helpers (same pattern as Nonclinical.tsx) ── */

/* Current project id — the runtime channel set by Projects.tsx when a project is
   opened (read the same way by CmcModule / ProjectHome / VaultSources). The board
   is project-scoped, so with no project in context there is nothing to load. */
function currentProjectId(): string | null {
  try {
    const p = (window as unknown as { C2C_PROJECT?: { id?: string | number } }).C2C_PROJECT;
    const id = p && p.id != null ? String(p.id).trim() : '';
    return id || null;
  } catch {
    return null;
  }
}

/* ════ Inconsistency -- Governed Intelligence surface ════ */

export function Inconsistency({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const open = (id: string) => {
    if (onNav) onNav(id);
  };

  const projectId = currentProjectId();
  const boardPath = projectId
    ? '/api/governed-intelligence-inconsistency/projects/' + encodeURIComponent(projectId) + '/inconsistency'
    : null;

  // MOCK-ACTION FLAGS (deferred to the actions pass — real endpoints exist):
  //  1. "Re-scan findings" button — WIRED. Runs the real detection scan (POST
  //     /api/governed-intelligence/contradictions/scan/:projectId,
  //     contradictionEngineService.scanProject) and then re-reads the board.
  //  2. resolve(f) — WIRED. A governed confirmation captures the reason, then
  //     POST /api/governed-intelligence/contradictions/:id/review writes the
  //     state change and its audit-trail row in one transaction; the row shows
  //     the resolver the server recorded.
  //  3. reopen(f) — WIRED, same endpoint and ceremony with reviewState 'unresolved'.
  //  4. propagate(v) — "change value everywhere" across the dossier has no single
  //     persisted backing here; the trigger is also unreachable while findings
  //     carry a null factId. Kept guarded + flagged; copy softened.
  const [refresh, setRefresh] = useState(0);
  const boardState = useLiveData<GiBoard>(boardPath, [boardPath, refresh]);
  const boardData = boardState.data;

  const prog = boardData ? boardData.program : null;
  const assumptions = boardData ? boardData.assumptions : [];
  const decisions = boardData ? boardData.decisions : [];
  const checks = boardData ? boardData.checks : [];
  const progCode = prog ? (prog.code || prog.name) : '';
  // program.filing is a documented null (submission-record field) — use a neutral
  // noun rather than fabricating a filing type.
  const filingLabel = (prog && prog.filing) || 'submission';

  /* The rows are the board's, derived in the same render as its gate — they
     used to be copied into state by an effect, one render behind the board, so
     a gate read with the board could name a blocker the list did not hold yet.
     A decision this screen saw committed shows on its row at once, with what
     the server returned, until the board is re-read (the gate is the server's
     count, so a recorded decision re-reads it); after that the row is the
     record's, and keeps the audit-trail line while it is still in that state. */
  const liveFindings = boardData ? boardData.findings : null;
  const liveRef = useRef(liveFindings);
  liveRef.current = liveFindings;
  const [recorded, setRecorded] = useState<Record<string, RecordedDecision>>({});
  const findings: ReviewedFinding[] = useMemo(
    () => (liveFindings ?? []).map((f): ReviewedFinding => {
      const r = recorded[f.id];
      if (!r) return f;
      if (r.over === liveFindings) {
        return { ...f, reviewState: r.reviewState, resolvedBy: r.resolvedBy, resolvedAt: r.resolvedAt, auditId: r.auditId };
      }
      return r.reviewState === f.reviewState ? { ...f, auditId: r.auditId } : f;
    }),
    [liveFindings, recorded],
  );

  const [form, setForm] = useState<{ id: string; label: string; value: string; refs?: unknown[] } | null>(null);
  const [propagating, setPropagating] = useState(false);
  const [toast, fireToast] = useToast();

  /**
   * Review-state transitions — governed, awaited, org-scoped writes.
   *
   * These were optimistic local flips, then a bare POST of `{ reviewState }`
   * whose response was never read: the row was stamped `resolvedBy: 'AnA + you'`
   * — a resolver nobody recorded — and the server wrote no audit row. Resolving
   * a finding takes it off the submission gate, so that was a gate-clearing
   * decision with no reason and no attribution.
   *
   * POST /api/governed-intelligence/contradictions/:id/review
   * (server/routes/assumption-decision-contradiction.ts) now requires a reason,
   * writes the state change and its ledger row in one transaction, and returns
   * the persisted row. The board is served by the SAME service, so `f.id` is the
   * id that endpoint expects.
   *
   * The local row takes the server's reviewState / resolvedBy / resolvedAt and
   * nothing composed here. A refusal says so, keeps the confirmation open with
   * the reason intact, and leaves the finding where it was — except when this
   * screen's view is stale (409, or an outcome it cannot confirm): then the
   * confirmation closes and the board is re-read.
   */
  const [pendingId, setPendingId] = useState<string>('');
  const [reviewing, setReviewing] = useState<{ f: ReviewedFinding; to: 'approved_resolution' | 'unresolved' } | null>(null);

  // Applies a classified outcome (reviewOutcomeFromReply / reviewOutcomeFromError).
  const settleReview = (f: ReviewedFinding, reviewState: 'approved_resolution' | 'unresolved', o: ReviewOutcome) => {
    const verb = reviewState === 'approved_resolution' ? 'resolved' : 're-opened';
    const closeAndReread = (msg: string, tone?: 'error') => {
      setReviewing(null);
      setRefresh(n => n + 1);
      fireToast(msg, tone);
    };
    switch (o.kind) {
      case 'recorded':
        setRecorded(m => ({
          ...m,
          [f.id]: { reviewState: o.reviewState, resolvedBy: o.resolvedBy, resolvedAt: o.resolvedAt, auditId: o.auditId, over: liveRef.current },
        }));
        setReviewing(null);
        setRefresh(n => n + 1);
        fireToast('"' + f.title + '" was ' + verb + ' — recorded on the audit trail with your reason.');
        return;
      case 'refused':
        fireToast(
          o.status === 404
            ? 'That finding is no longer on the board — refresh to see the current state.'
            : '"' + f.title + '" was not ' + verb + ' — ' + asSentence(o.detail) + ' Nothing was changed.',
          'error',
        );
        return;
      case 'stale':
        closeAndReread('"' + f.title + '" was not ' + verb + ' — ' + asSentence(o.detail) + ' Re-reading the board to show what is recorded.', 'error');
        return;
      case 'unreadable':
        closeAndReread('The service answered, but its reply could not be read, so this screen cannot confirm whether "' + f.title + '" was ' + verb + '. Re-reading the board to show what is recorded.');
        return;
      case 'unknown':
        // The form closes too: the re-read may show the decision committed, and
        // a form still open over it would record it a second time.
        closeAndReread(
          (o.status ? 'The contradiction service could not confirm the outcome' : 'Couldn’t reach the contradiction service') +
            ', so this screen cannot confirm whether "' + f.title +
            '" was ' + verb + '. Re-reading the board to show what is recorded.',
          'error',
        );
    }
  };

  const transition = async (f: ReviewedFinding, reviewState: 'approved_resolution' | 'unresolved', reason: string) => {
    if (pendingId) return;
    setPendingId(f.id);
    try {
      settleReview(f, reviewState, await postReview(f.id, reviewState, reason));
    } finally {
      setPendingId('');
    }
  };

  const submitReview = (v: Record<string, string>) => {
    if (!reviewing) return;
    const why = (v.reason || '').trim();
    if (why.length < REVIEW_REASON_MIN) {
      fireToast('Enter a reason of at least ' + REVIEW_REASON_MIN + ' characters — it is recorded with the decision.', 'error');
      return;
    }
    void transition(reviewing.f, reviewing.to, why);
  };

  const REVIEW_FORM: C2CFormConfig | null = reviewing ? (reviewing.to === 'approved_resolution' ? {
    eyebrow: 'Governed decision',
    title: 'Resolve: ' + reviewing.f.title,
    sub: 'Resolving takes this finding off the submission gate. The decision is attributed to you.',
    governed: 'The review state and your reason are written to the audit trail in one transaction — both are recorded, or neither is.',
    submitLabel: pendingId ? 'Recording…' : 'Record resolution',
    fields: [
      { key: 'reason', label: 'Reason for resolution', type: 'textarea', placeholder: 'e.g. IB §5.3 corrected to match the protocol-specified dose', required: true },
    ],
  } : {
    eyebrow: 'Governed decision',
    title: 'Re-open: ' + reviewing.f.title,
    sub: 'Re-opening puts this finding back on the submission gate. The decision is attributed to you.',
    governed: 'The review state and your reason are written to the audit trail in one transaction — both are recorded, or neither is.',
    submitLabel: pendingId ? 'Recording…' : 'Record re-opening',
    fields: [
      { key: 'reason', label: 'Reason for re-opening', type: 'textarea', placeholder: 'e.g. the IB amendment was withdrawn', required: true },
    ],
  }) : null;

  /**
   * "Refresh findings" — a REAL detection scan, then a re-read.
   *
   * This button only ever bumped a counter, re-reading the same read-model
   * board. Nothing re-detected, so a contradiction introduced since the last
   * scan stayed invisible however many times it was pressed — on the surface
   * that decides whether the dossier is clean enough to promote, and under a
   * label ("AnA is checking...") that says detection is happening.
   *
   * POST /api/governed-intelligence/contradictions/scan/:projectId
   * (assumption-decision-contradiction.ts:235) runs
   * contradictionEngineService.scanProject(orgId, projectId) — drift, decision
   * and jurisdiction detection — then the board is re-read to show the result.
   *
   * It takes the SAME projectId the board read already uses, under the same
   * constraint: the read route rejects a non-numeric id with 400 ("A valid
   * numeric projectId is required"), so if the board loaded, this resolves too.
   *
   * A failed scan does not pretend: it says the re-detection did not run, and
   * still re-reads the board so the button remains useful.
   */
  const [scanning, setScanning] = useState(false);
  const runScan = async () => {
    if (!projectId || scanning) return;
    setScanning(true);
    try {
      const res = await apiRequest(
        'POST',
        '/api/governed-intelligence/contradictions/scan/' + encodeURIComponent(projectId),
      );
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        // Same defect as the transition above: `json.error` won over `message`,
        // so a scan refusal showed its enum. The fallback is a sentence rather
        // than a bare status, which is not user copy on its own.
        const detail =
          serverMessage(json) ?? 'the service could not start it (HTTP ' + res.status + ')';
        fireToast('Re-detection didn’t run — ' + detail + '. Showing the last known findings.', 'error');
      }
    } catch (e) {
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      const detail = known && (e as Error).message ? (e as Error).message : 'request failed';
      fireToast(
        'Couldn’t reach the contradiction engine — ' + detail + '. Showing the last known findings.',
        'error',
      );
    } finally {
      setScanning(false);
      setRefresh(n => n + 1);
    }
  };

  // Both open the governed confirmation; nothing is sent until it captures a reason.
  const resolve = (f: ReviewedFinding) => setReviewing({ f, to: 'approved_resolution' });
  const reopen = (f: ReviewedFinding) => setReviewing({ f, to: 'unresolved' });

  /* The submission gate is the server's count over every finding of the
     project (ProjectGate), by the authority each was recorded with: the rule
     checkPromotionBlocked enforces. It used to be computed here, from the page
     of findings this screen holds, after re-scoring each one under an FDA/EMA
     toggle from two hard-coded overlay rules; a blocker past the page was not
     counted, and the EMA rule exists in no organisation's rule table. A board
     without a gate is unreadable, not clear. While the board is re-read, after
     a decision or a scan, the last count is not spoken as a verdict. */
  const gate: GiGate | null = boardData?.gate ?? null;
  const boardFailed = Boolean(boardState.error) || (Boolean(boardData) && !gate);
  const recounting = boardState.loading && Boolean(boardData);
  const total = gate ? gate.total : 0;
  const resolvedN = gate ? gate.resolved : 0;
  const openN = gate ? gate.open : 0;
  const blockingN = gate ? gate.blocking : 0;
  const approvalN = gate ? gate.needApproval : 0;
  const escalationN = gate ? gate.needEscalation : 0;
  const reviewN = gate ? gate.needReview : 0;
  const unrecognizedN = gate ? gate.unrecognized : 0;
  const blocked = Boolean(gate && gate.blocked);
  const hasFindings = total > 0;
  /* The list is a page; say so when it is short of the record. */
  const shownOf = hasFindings && findings.length < total ? findings.length : null;

  /* `clean` used to be `openN === 0`, so a program the engine had NEVER SCANNED
     was indistinguishable from one it had scanned and found nothing wrong. The
     surface then said "AnA scanned your {progCode} -- no contradictions", and
     the hero verdict read "Submission gate — CLEAR". On a submission gate that
     is the most expensive sentence this screen can produce.

     There is no scan-completion record to consult: the board's own contract,
     documented at the top of this file, is that `checks` is ALWAYS [] because
     "the engine persists detected contradictions, not the [checks it ran]". So
     an empty findings array carries no information about whether anything ran.

     What DOES carry it is `hasFindings`. A contradiction that was detected and
     then resolved is positive evidence the engine ran against this program —
     which is exactly the `assessmentRan` input assessmentState.ts asks for, and
     is why clearance is now gated on it rather than on the absence of open
     items. total === 0 is not-assessed; total > 0 with openN === 0 is genuinely
     assessed and clear. */
  const giState = assessmentState({
    loading: boardState.loading,
    unreadable: boardFailed,
    scopeExists: Boolean(prog),
    findingCount: openN,
    assessmentRan: hasFindings,
  });
  const clean = giState === 'assessed-clear';
  /** Nothing has ever been detected here, so nothing is known. */
  const neverScanned = giState === 'not-assessed' && Boolean(prog);

  /* Answer-first lead -- computed from the real gate, in AnA's voice, about the FILING. */
  const lead: AnswerLeadProps | null = (() => {
    if (!prog || !gate) return null;
    /* A re-read is in flight: the count on screen is the previous one. */
    if (recounting) return {
      tone: 'calm' as const, eyebrow: 'AnA — path to a clean filing',
      headline: <>Re-counting the submission gate for <b>{progCode}</b>…</>,
      body: 'The governed record is being read again. The verdict follows when the count returns.',
    };
    /* Nothing has ever been detected against this program, and the board keeps
       no record of what was checked — so the honest answer is that no scan has
       reported, not that the filing is consistent. */
    if (neverScanned) return {
      tone: 'calm' as const, eyebrow: 'AnA — path to a clean filing',
      headline: <>No contradiction scan has reported on <b>{progCode}</b>.</>,
      body: 'The governed record holds no contradiction findings for this filing — neither open nor resolved. That is the absence of a result, not a clean result: consistency across the ' + filingLabel + ' dossier is unknown until a scan runs against it.',
      action: { label: 'Ask AnA to scan this filing for contradictions', onClick: () => ask('Scan the governed record for this filing and report every cross-reference contradiction you find, or state plainly that you found none.') },
      secondary: 'Or work the record below.',
    };
    if (clean) return {
      tone: 'good' as const, eyebrow: 'AnA — path to a clean filing',
      headline: <>The <b>{progCode}</b> is clean — every contradiction resolved.</>,
      body: 'Nothing in the governed record contradicts anything else. This filing is ready to promote into the submission sequence.',
      reassure: 'This is what submission-ready looks like. I\'ll keep watching as new content lands.',
      /* NAVIGATION, and the label now says so. It used to read "Promote to
         submission sequence" on a control that only opens another surface —
         the same overclaim as the old "Route for signature".

         NOT WIRED, deliberately, and this is the reason so nobody re-runs the
         investigation. Two routes look like they promote, and both fail:

         • regulatorySubmissions `POST /projects/:id/sequences` — the URL says
           projects and sequences, and its own error string says "Failed to
           create submission sequence". It does neither: `:id` is resolved by
           loadSubmissionByParam (a SUBMISSION id), and the row it inserts is a
           `stageGates`, not a sequence. Wrong entity and wrong artifact, behind
           a name that reads exactly right.
         • submissions `POST /:id/sequences` — genuinely creates an eCTD
           sequence via createSequence({ submissionId: id }), but takes a
           SUBMISSION id.

         This surface holds `projectId` (a projects.id — the same one the board
         read and the contradiction scan use) and no submission id. Bridging
         project → submission is not a wiring detail: a programme can carry an
         IND, an NDA and supplements at once, so WHICH submission a clean
         dossier promotes into is a product decision. Guessing it would file
         against the wrong application. */
      action: { label: 'Open the submission centre', onClick: () => open('submission-center') },
    };
    if (blocked) {
      /* The gate counts every finding and the list holds a page of them, so
         the blocker named here is the first one on the page, if it is there. */
      const b = findings.find(f => f.authorityState === 'blocks_promotion' && onGate(f));
      return {
        tone: 'urgent' as const, eyebrow: 'AnA — path to a clean filing',
        headline: <>Your <b>{progCode}</b> can't be filed yet — {blockingN === 1 ? '1 issue blocks it' : blockingN + ' issues block it'}.</>,
        body: b
          ? b.title + '. ' + b.description
          : 'The ' + (blockingN === 1 ? 'finding that blocks it is' : 'findings that block it are') + ' not among the ' + findings.length + ' listed below.',
        reassure: 'This is fixable, and I\'ll work through it with you — each blocker clears through a governed resolution.',
        /* ── Was a 1.6-second outline and nothing else ────────────────────
           The blocking finding is almost always below the fold, so the one
           thing this button did was flash a border on a card the user could
           not see — no scroll, no explanation, and the word "how" answered by
           nothing.

           It now brings the finding onto the screen, moves focus to it (so a
           keyboard or screen-reader user arrives there too, which the outline
           never did), and asks AnA for the governed resolution of THAT finding
           by name — which is what "show me how to clear it" promises. */
        action: {
          label: 'Show me how to clear it',
          onClick: () => {
            const el = b ? document.getElementById('gi-f-' + b.id) : null;
            /* Asking AnA is the part that matters; moving the viewport is a
               courtesy. `scrollIntoView` is absent in jsdom and in some
               embedded webviews, and an unguarded call there throws out of the
               click handler — so the guidance would never be requested. */
            try {
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.setAttribute('tabindex', '-1');
                el.focus({ preventScroll: true });
              }
            } catch { /* no scrollIntoView here — the ask below still runs */ }
            ask(
              (b
                ? 'The ' + progCode + ' filing is blocked by "' + b.title + '". Walk me through clearing it: '
                : 'The ' + progCode + ' filing is blocked by ' + blockingN + ' contradiction(s) with a blocks-promotion authority. Name them, and walk me through clearing each: ') +
                'what the governed change is, which documents it touches, ' +
                'and what has to be re-approved afterwards.',
            );
          },
        },
      };
    }
    if (approvalN) return {
      tone: 'calm' as const, eyebrow: 'AnA — path to a clean filing',
      headline: <>Nothing blocks {progCode}, but {approvalN} {approvalN === 1 ? 'item needs' : 'items need'} sign-off before filing.</>,
      body: 'These carry a "requires approval" authority, and the promotion check names them until they are resolved.',
      reassure: 'You\'re close. I\'ll draft the resolutions and route them for approval.',
      action: { label: 'Resolve the open items with AnA', onClick: () => ask('Draft resolutions for the open ' + progCode + ' contradictions and route them for approval.') },
    };
    return {
      tone: 'calm' as const, eyebrow: 'AnA — path to a clean filing',
      headline: <>{progCode} has {openN} open {openN === 1 ? 'inconsistency' : 'inconsistencies'} to tidy before the filing is perfect.</>,
      body: (escalationN
        ? escalationN + ' of them ' + (escalationN === 1 ? 'requires' : 'require') + ' escalation; none blocks the submission or needs sign-off'
        : 'None of them blocks the submission or needs sign-off — they are advisory or review-level') +
        ' — but a perfect filing carries none of them.',
      reassure: 'I\'ll clear them with you so the dossier reads as one coherent story.',
      action: { label: 'Clean them up with AnA', onClick: () => ask('Walk me through resolving the open ' + progCode + ' inconsistencies.') },
    };
  })();

  /* Order findings: open blockers -> approval -> review -> advisory ->
     superseded -> resolved, by the authority each was recorded with. */
  const rank = (f: GiFinding) => {
    if (f.reviewState === 'approved_resolution') return 99;
    if (!onGate(f)) return 50;
    return 10 - (GI_META.authority[f.authorityState]?.rank ?? 0);
  };
  const ordered = [...findings].sort((a, b) => rank(a) - rank(b) || ((GI_META.severity[b.severity] ? 1 : 0) - (GI_META.severity[a.severity] ? 1 : 0)));

  const sevS = (s: string) => (GI_META.severity[s] || { s: 'low' }).s;
  /**
   * Change a governed assumption's value — POST /api/governed-intelligence/
   * assumptions/:id/revalue.
   *
   * This used to fire the toast "cross-dossier propagation is not yet wired"
   * and stop there: a user filled in a new value AND a mandatory reason for
   * change on a form headed "Governed change", pressed Propagate change, and
   * nothing was propagated, nothing was recorded, and nothing was audited.
   *
   * The propagation was wired the whole time — superseding an assumption calls
   * propagateChange, which marks every downstream object stale. What was
   * missing was any call to it. The route does both writes (record the
   * replacement, supersede the original by it) in one request, so a failure
   * cannot leave an orphan replacement behind.
   */
  const propagate = async (v: Record<string, string>) => {
    const nv = (v.value || '').trim();
    const why = (v.reason || '').trim();
    if (!nv || !form || propagating) return;
    if (why.length < 8) {
      fireToast('Enter a reason for change of at least 8 characters — it is recorded on the supersession.', 'error');
      return;
    }
    setPropagating(true);
    try {
      const res = await apiRequest(
        'POST',
        '/api/governed-intelligence/assumptions/' + encodeURIComponent(form.id) + '/revalue',
        { newValue: nv, reason: why },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        fireToast(
          'The value was not changed — ' +
            (serverMessage(json) ?? `the server refused it (HTTP ${res.status})`) +
            '. ' + form.label + ' is still ' + form.value + '.',
          'error',
        );
        return;
      }
      setForm(null);
      setRefresh((n) => n + 1);
      fireToast(
        form.label + ' is now ' + nv + '. The previous assumption is superseded and everything downstream of it is flagged stale.',
      );
    } catch (e) {
      fireToast(
        'The value was not changed — ' + (e instanceof Error ? e.message : String(e)) +
          '. ' + form.label + ' is still ' + form.value + '.',
        'error',
      );
    } finally {
      setPropagating(false);
    }
  };

  const PROP_FORM: C2CFormConfig | null = form ? {
    eyebrow: 'Governed change',
    title: 'Change ' + form.label,
    sub: 'Current value ' + form.value + ' — cited in ' + (form.refs ? form.refs.length : 0) + ' sections. AnA propagates the change and flags anything locked for re-approval.',
    governed: 'Governed change — draft sections update inline; approved/locked sections are flagged for re-approval, all on the audit trail.',
    submitLabel: propagating ? 'Propagating…' : 'Propagate change',
    fields: [
      { key: 'value', label: 'New value', type: 'text', placeholder: form.value, required: true },
      { key: 'reason', label: 'Reason for change', type: 'textarea', placeholder: 'e.g. reconcile to the Protocol-specified dose', required: true },
    ],
  } : null;

  const hasBoard = Boolean(boardData && prog);

  /* WHAT ANA SEES HERE. A submission gate is the most expensive place to be
     confidently wrong, so the payload obeys the same law as the render:
     never-scanned is NOT clear, a failed read is NOT empty, and counts are
     published only in assessed states — an openN of 0 must never be readable
     as "clear" when nothing has ever scanned. The branches mirror the render's
     four gates, then the existing giState / clean / neverScanned derivations. */
  const anaContext = useMemo(() => {
    if (!projectId) {
      return {
        summary:
          'Cross-document inconsistency board: the board is project-scoped and no project is open — nothing can be read.',
      };
    }
    if (boardState.loading && !boardData) {
      return { summary: 'Cross-document inconsistency board for this project, still loading.' };
    }
    if (boardFailed) {
      // Fail-closed, stated: on this surface an empty findings set means
      // "ready to file", so a read failure must never be shown as clean.
      return {
        summary:
          'Cross-document inconsistency board: the governed-intelligence read-model did not respond; it fails closed — a read failure is never shown as clean, so the submission-gate verdict is unknown.',
      };
    }
    if (!hasBoard || !lead) {
      return {
        summary:
          'Cross-document inconsistency board: no inconsistency data for this project yet — no findings, assumption records or decision records are recorded.',
      };
    }
    if (recounting) {
      return {
        summary: `Cross-document inconsistency board for ${progCode}: the board is being re-read after a decision or a scan, so the submission-gate verdict is not yet known.`,
      };
    }
    const verdict = neverScanned
      ? ('not-assessed' as const)
      : clean
        ? ('clear' as const)
        : blocked
          ? ('blocked' as const)
          : ('clear-with-open-items' as const);
    return {
      summary:
        verdict === 'not-assessed'
          ? `Submission gate for ${progCode}: NOT ASSESSED — no contradiction scan has ever reported on this program. That is the absence of a result, not a clean result; consistency across the ${filingLabel} dossier is unknown until a scan runs.`
          : verdict === 'blocked'
            ? `Submission gate for ${progCode}: BLOCKED — ${blockingN} unresolved contradiction(s) carry a blocks-promotion authority. The filing is held until resolved.`
            : verdict === 'clear-with-open-items'
              ? `Submission gate for ${progCode}: clear, with ${openN} open item(s) (${approvalN} needing sign-off, ${escalationN} needing escalation, ${reviewN} needing review) to close for a perfect filing.`
              : `Submission gate for ${progCode}: CLEAR — assessed, with every detected contradiction resolved (${resolvedN}/${total}).`,
      facts: {
        gate: verdict,
        // Counts only in assessed states: a total of 0 next to "not-assessed"
        // would let a never-scanned board read as clean.
        ...(verdict !== 'not-assessed'
          ? {
              blockingCount: blockingN,
              needApprovalCount: approvalN,
              needEscalationCount: escalationN,
              needReviewCount: reviewN,
              resolvedCount: resolvedN,
              total,
              // The findings AnA can see are a page; the counts are the record's.
              findingsListed: findings.length,
            }
          : {}),
        disclaimer:
          'Running a scan, resolving or reopening findings, and revaluing assumptions (reason-for-change gated) are governed — AnA proposes them in conversation, never through screen controls.',
      },
    };
  }, [projectId, boardState.loading, boardFailed, boardData, hasBoard, lead, neverScanned, clean, recounting, blocked, blockingN, approvalN, escalationN, reviewN, findings.length, progCode, filingLabel, openN, resolvedN, total]);

  usePublishSurfaceContext('inconsistency', anaContext);

  return (
    <div className="sp">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">AnA {I.dot} Governed intelligence</div>
          <h1 className="sp-title">{prog ? progCode + ' — path to a clean filing' : 'Cross-document inconsistency'}</h1>
          <p className="sp-state">{prog ? <>{prog.name}{prog.stage ? <> {I.dot} {prog.stage}</> : null}. </> : null}AnA continuously scans every governed record — sections, specs, data and labeling — for anything that contradicts anything else, and clears it with you before it can reach a reviewer.</p>
        </div>
        <button className="sp-primary" onClick={() => void runScan()} disabled={boardState.loading || scanning || !projectId}>{(boardState.loading || scanning) ? I.rotateCcw : I.sparkles} {scanning ? 'AnA is checking...' : boardState.loading ? 'Loading findings...' : 'Re-scan findings'}</button>
      </div>

      {!projectId ? (
        <EmptyState
          icon={I.folder}
          title="No project selected"
          hint="Open a project to see its cross-document contradiction board. The board reads that project's governed findings, assumption registry, and decision records."
        />
      ) : boardState.loading && !boardData ? (
        <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading the inconsistency board...</div>
      ) : boardFailed ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the inconsistency board"
          hint="The governed-intelligence read-model didn't respond. It fails closed on purpose — an empty findings set means 'ready to file', so a read failure is never shown as clean. Sign in and retry, or check the service is reachable."
        />
      ) : !hasBoard || !lead ? (
        <EmptyState
          icon={I.fileText}
          title="No inconsistency data for this project yet"
          hint="Once this project's governed records are scanned, detected contradictions, the assumption registry, and decision records appear here."
        />
      ) : (
        <>
          <AnswerLead {...lead} />

          {/* Submission gate: the hero verdict -- can this filing go? */}
          <div className={'gi-gate ' + (recounting ? 'is-warn' : clean ? 'is-clean' : neverScanned ? 'is-warn' : blocked ? 'is-blocked' : 'is-warn')}>
            <div className="gi-gate-main">
              <span className="gi-gate-ico">{recounting ? I.rotateCcw : clean ? I.shieldCheck : neverScanned ? I.help : blocked ? I.shieldAlert : I.clock}</span>
              <div>
                <div className="gi-gate-verdict">{recounting ? 'Submission gate — re-counting' : clean ? 'Submission gate — CLEAR' : neverScanned ? 'Submission gate — NOT ASSESSED' : blocked ? 'Submission gate — BLOCKED' : 'Submission gate — clear, with open items'}</div>
                <div className="gi-gate-sub">{recounting
                  ? 'The governed record is being read again. The verdict follows when the count returns.'
                  : clean
                  ? 'No contradictions block promotion. ' + progCode + ' can enter the submission sequence.'
                  : neverScanned
                  ? 'No contradiction scan has reported on ' + progCode + '. A gate with nothing behind it is not a pass — run a scan before promoting.'
                  : blocked
                    ? blockingN + ' unresolved ' + (blockingN === 1 ? 'contradiction' : 'contradictions') + ' with a "blocks promotion" authority. The filing is held until resolved.'
                    : 'Nothing blocks promotion, but ' + openN + ' open ' + (openN === 1 ? 'item' : 'items') + ' should be cleared for a perfect filing.'}</div>
              </div>
            </div>
            {!recounting && <div className="gi-gate-side">
              <div className="gi-gate-counts">
                <span className="gi-c gi-c-bad">{blockingN} blocking</span>
                <span className="gi-c gi-c-warn">{approvalN} approval</span>
                {escalationN > 0 && <span className="gi-c gi-c-warn">{escalationN} escalation</span>}
                <span className="gi-c gi-c-rev">{reviewN} review</span>
                {unrecognizedN > 0 && <span className="gi-c gi-c-warn" title="Open findings whose recorded authority this screen does not recognise">{unrecognizedN} unrecognised</span>}
                <span className="gi-c gi-c-ok">{resolvedN}/{total} resolved</span>
              </div>
            </div>}
          </div>
          <div className="gi-overlay-note">{I.info} Each finding carries the severity and authority the contradiction engine recorded when it detected it, including any regulator overlay rule your organization has configured. The gate counts every finding recorded for {progCode}, by the rule the promotion check enforces — not only the ones listed below.</div>

          {/* The cross-reference record. Three different things to say here, and
              this card used to say only one.

              WHAT IT USED TO CLAIM: with `checks` empty — which the board
              contract at the top of this file documents as ALWAYS, because the
              engine persists detected contradictions and not the references it
              verified — it rendered "No contradictions across this project's
              governed records / AnA found nothing that contradicts anything
              else". That is a clearance claim, and its only condition was
              `total === 0`. A project the engine has never run against also has
              `total === 0`, so on a never-scanned board this card asserted that
              AnA had looked and found nothing — a few elements below the gate
              panel which, in that same state, correctly reads "Submission gate
              — NOT ASSESSED". Two panels on one screen, opposite claims.

              `giState` — computed above from the same live read that feeds the
              gate and the AnswerLead, and which both of those already branch on
              — is the discriminator this card now branches on as well.

              On `assessed-clear` being kept rather than deleted: it is not
              reachable while this card renders, because the card renders only
              when `!hasFindings` and `assessmentRan` on this board IS
              `hasFindings`. Gating the reassuring copy on the state that would
              earn it, instead of on emptiness, is the fix; if the board ever
              carries a scan record the copy is then correct rather than
              retro-fitted. The states that ARE reachable here are
              `not-assessed` and — while a re-scan refetches over the rows
              already read — `loading`, and each now says what is true of it. */}
          {!hasFindings && (
            <div className="pj-card gi-checks">
              <div className="pj-card-h"><span className="t">What AnA checked</span><span className="s">{checks.length > 0 ? checks.length + ' cross-references ' + String(I.dot) + ' all consistent' : 'no scan record'}</span></div>
              <div className="pj-card-b">
                {checks.length > 0 ? (
                  <div className="sp-list">
                    {checks.map((c, i) => (
                      <div key={i} className="sp-row">
                        <span className="gi-check-ok">{I.check}</span>
                        <span className="sp-row-b"><span className="sp-row-t">{c.k}</span><span className="sp-row-s">{c.detail}</span></span>
                        <span className="rd-chip tone-ok">consistent</span>
                      </div>
                    ))}
                  </div>
                ) : giState === 'assessed-clear' ? (
                  <EmptyState
                    icon={I.shieldCheck}
                    title="No contradictions across this project's governed records"
                    hint="AnA found nothing that contradicts anything else. The itemized list of every cross-reference it verified isn't persisted yet, so only detected contradictions are enumerated here."
                  />
                ) : giState === 'loading' ? (
                  <EmptyState
                    busy
                    icon={I.clock}
                    title="Re-reading the contradiction board"
                    hint="The read is still in flight. Nothing on this card is settled until it returns."
                  />
                ) : (
                  <EmptyState
                    icon={I.clock}
                    title="No contradiction scan has reported on this project"
                    hint={'The board holds no contradiction findings for ' + progCode + ' — neither open nor resolved — and it records only the contradictions the engine detects, never the cross-references it verified as consistent. So there is nothing here showing that the governed records agree; there is nothing here at all.'}
                  />
                )}
                {/* The same conditional applies to the note beneath: "AnA re-runs
                    these checks every time content changes" describes the upkeep
                    of a check set that, in the never-scanned state, does not
                    exist — and the card's own subtitle two lines above says so
                    ("no scan record"). */}
                <div className="scaf-note" style={{ marginTop: 12 }}>{checks.length > 0 || giState === 'assessed-clear'
                  ? 'AnA re-runs these checks every time content changes. The moment a value disagrees with another governed record, it surfaces here as a contradiction with a consequence — before it can reach a reviewer.'
                  : 'Once a scan has run, each value that disagrees with another governed record appears here as a contradiction — naming the two records, and what the disagreement costs.'}</div>
              </div>
            </div>
          )}

          {hasFindings && <div className="gi-findings">
            {shownOf !== null && <div className="scaf-note" role="note">Showing the {shownOf} most severe of {total} recorded findings. The gate above counts all of them.</div>}
            {ordered.map(f => {
              const done = f.reviewState === 'approved_resolution';
              const live = onGate(f);
              /* The authority as recorded. A value this screen has no label for
                 is shown as stored — it used to be relabelled "Advisory". */
              const auth = GI_META.authority[f.authorityState] ||
                { label: f.authorityState || 'No authority recorded', tone: 'warn', blocks: false, rank: 0 };
              return (
                <div id={'gi-f-' + f.id} key={f.id} className={'gi-find' + (done ? ' is-done' : '') + (auth.blocks && live ? ' is-block' : '')}>
                  <div className="gi-find-top">
                    <span className="sp-sev" data-s={sevS(f.severity)}>{(GI_META.severity[f.severity] || { label: f.severity }).label}</span>
                    <span className="gi-type">{GI_META.type[f.contradictionType] || f.contradictionType}</span>
                    <span className={'gi-auth tone-' + auth.tone}>{done ? 'Resolved' : live ? auth.label : 'Superseded'}</span>
                    {f.overlayRuleId && live && (
                      <span className="gi-ov" title={'Scored by your organization’s ' + (f.regulatorBody || 'regulator') + ' overlay rule when this finding was detected'}>
                        {f.regulatorBody ? f.regulatorBody + ' overlay' : 'Regulator overlay'}
                      </span>
                    )}
                    <span className="gi-conf">{Math.round(f.confidenceScore * 100)}% {I.dot} {GI_META.source[f.sourceClassification]}</span>
                  </div>
                  <div className="gi-find-title">{f.title}</div>
                  <div className="gi-xref">
                    <span className="gi-obj"><span className="gi-obj-k">{f.objectA.type}</span>{f.objectA.label}</span>
                    <span className="gi-vs">{I.gitCompare}</span>
                    <span className="gi-obj"><span className="gi-obj-k">{f.objectB.type}</span>{f.objectB.label}</span>
                  </div>
                  <div className="gi-desc">{f.description}</div>
                  <div className="gi-meta">
                    <span title="Truth hierarchy level (1 = highest authority record)">Truth level {f.truthHierarchyLevel}</span>
                    <span>{GI_META.llmRole[f.llmRole]}</span>
                    {f.deterministicRule && <span className="gi-rule">{f.deterministicRule}</span>}
                    <span>Consequence {I.dot} {String(f.consequenceType || '').replace(/_/g, ' ')}</span>
                  </div>
                  <div className="gi-find-actions">
                    {!done && <button className="sp-primary gi-resolve" onClick={() => resolve(f)} disabled={pendingId === f.id}>{I.check} {pendingId === f.id ? 'Recording…' : 'Resolve'}</button>}
                    {done && <button className="sp-ask" onClick={() => reopen(f)} disabled={pendingId === f.id}>{I.undo} {pendingId === f.id ? 'Recording…' : 'Re-open'}</button>}
                    {/* factId is a documented null on every live finding, so this
                        "change value everywhere" affordance stays hidden until the
                        findings table carries a real fact linkage. */}
                    {!done && f.factId && <button className="sp-ask" onClick={() => {
                      const fact = (window.IC_FACTS || []).find(x => x.id === f.factId);
                      if (fact) setForm(fact);
                    }}>{I.gitCompare} Change value everywhere</button>}
                    {!done && <button className="sp-ask" onClick={() => ask('For the ' + progCode + ' contradiction "' + f.title + '", draft the governed resolution and the decision record, and tell me which documents update.')}>{I.sparkles} Draft resolution</button>}
                    <button className="sp-go" title="Open the source record" aria-label="Open the source record" onClick={() => open(f.factId ? 'cmc' : 'document-authoring')}>{I.right}</button>
                  </div>
                  {/* The resolver is the one the record names, and a row naming
                      nobody says so. The audit-trail sentence is claimed
                      only for a decision this screen saw committed (auditId); a
                      row read from the board may predate the governed write.
                      Re-approval routing is still not triggered from here. */}
                  {done && (() => {
                    const who = resolverLabel(f);
                    const when = resolvedWhen(f.resolvedAt);
                    return (
                      <div className="gi-done-line">
                        {I.check} {who ? 'Resolved by ' + who : 'Resolved — the record names no resolver'}{when ? ' · ' + when : ''}
                        {f.auditId ? ' — recorded on the audit trail with the reason given.' : '.'}
                        {' '}Documents this resolution touches are not routed for re-approval from this screen.
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>}

          {/* Supporting: where drift starts + how it's decided (secondary) */}
          {hasFindings && <div className="gi-support">
            <div className="pj-card">
              <div className="pj-card-h"><span className="t">Assumption registry</span><span className="s">drift origin</span></div>
              <div className="pj-card-b">
                <p className="gi-support-p">Assumption-drift contradictions start here — two governed assumptions sharing a category and domain but holding different values.</p>
                {assumptions.length > 0 ? (
                  <div className="sp-list">
                    {assumptions.map(a => (
                      <div key={a.id} className="sp-row">
                        <span className="sp-tag">{a.category}</span>
                        <span className="sp-row-b"><span className="sp-row-t">{a.title} {I.dot} <b style={{ color: 'var(--accent-200)' }}>{a.assumedValue}</b></span><span className="sp-row-s">{a.domainTrack} {I.dot} {a.source}</span></span>
                        <span className="rd-chip tone-ok">{a.status}</span>
                        {/* The governed-change form is reachable from HERE, on a
                            row that carries a real assumption id. Its other
                            trigger sits behind `f.factId`, which the findings
                            table documents as null on every live row — so the
                            form had a real backend and no way in. A superseded
                            record cannot be re-valued; change the one that
                            replaced it. */}
                        {a.status !== 'superseded' && (
                          <button
                            className="sp-ask"
                            title={'Change ' + a.title + ' and flag everything downstream of it'}
                            onClick={() => setForm({ id: a.id, label: a.title, value: a.assumedValue })}
                          >
                            {I.gitCompare} Change value
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={I.fileText} title="No assumption records yet" hint="Governed assumptions for this project appear here once recorded." />
                )}
              </div>
            </div>
            <div className="pj-card">
              <div className="pj-card-h"><span className="t">Decision records</span><span className="s">governed resolution</span></div>
              <div className="pj-card-b">
                <p className="gi-support-p">Every resolution AnA proposes becomes a decision record — proposed {'->'} approved {'->'} executed, linked to the exact artifact version it changed.</p>
                {decisions.length > 0 ? (
                  <div className="sp-list">
                    {decisions.map(d => (
                      <div key={d.id} className="sp-row">
                        <span className={'gi-dec-st st-' + d.actionState}>{d.actionState}</span>
                        <span className="sp-row-b"><span className="sp-row-t">{d.title}</span><span className="sp-row-s">{d.rationale}{d.executedArtifactId ? ' — artifact #' + d.executedArtifactId + ' v' + d.executedArtifactVersion : ''}</span></span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={I.fileText} title="No decision records yet" hint="Governed resolutions for this project appear here as AnA proposes and you approve them." />
                )}
              </div>
            </div>
          </div>}
        </>
      )}

      {form && PROP_FORM && <C2CForm config={PROP_FORM} onCancel={() => setForm(null)} onSubmit={propagate} />}
      {reviewing && REVIEW_FORM && (
        <C2CForm
          key={reviewing.f.id + ':' + reviewing.to}
          config={REVIEW_FORM}
          onCancel={() => { if (!pendingId) setReviewing(null); }}
          onSubmit={submitReview}
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}
