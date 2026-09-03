import React, { useState, useEffect, useMemo, useRef } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { AnswerLead } from '../AnswerLead';
import { assessmentState } from '../assessmentState';
import type { AnswerLeadProps } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

// GI_META (enum labels/tones/authority ranks), the regulator overlay rules, and
// the deterministic overlay/promotion-gate functions are canonical config +
// computation — kept. Only the fixture DATA (giForSeg / GI_ASSUMPTIONS /
// GI_DECISIONS / the sample program + findings) is retired in favor of the live
// governed-intelligence board.
import {
  GI_META,
  giApplyOverlay,
  giPromotionGate,
} from '../fixtures/governed-intelligence-data';
import type {
  GiFinding,
  GiPromotionGate,
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
       set of cross-references it verified as consistent). */
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
  findings: GiFinding[];
  assumptions: GiAssumption[];
  decisions: GiDecision[];
  checks: GiCheck[];
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
  //  2. resolve(f) — WIRED. Real awaited POST /api/governed-intelligence/
  //     contradictions/:id/review; the local row moves only after the server
  //     confirms the transition.
  //  3. reopen(f) — WIRED, same endpoint with reviewState 'unresolved'.
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

  const [reg, setReg] = useState('FDA');
  // Findings carry transient review-state edits from the (unwired) resolve/reopen
  // actions, so they live in local state seeded from the live board. Seed once per
  // board load (gated on a ref) to avoid the re-seed render loop; a refresh
  // refetch produces a new array identity and re-seeds honestly from persistence.
  const [findings, setFindings] = useState<GiFinding[]>([]);
  const liveFindings = boardData ? boardData.findings : null;
  const seedRef = useRef<GiFinding[] | null>(null);
  useEffect(() => {
    if (liveFindings && liveFindings !== seedRef.current) {
      seedRef.current = liveFindings;
      setFindings(liveFindings.map(f => ({ ...f })));
    }
  }, [liveFindings]);

  const [form, setForm] = useState<{ id: string; label: string; value: string; refs?: unknown[] } | null>(null);
  const [propagating, setPropagating] = useState(false);
  const [toast, fireToast] = useToast();

  /* Resolve one finding WITH AnA — optimistic local flip only (see flag #2). */
  /**
   * Review-state transitions — REAL, awaited, org-scoped writes.
   *
   * Both of these used to be optimistic local flips: the row changed colour,
   * the promotion gate recomputed off it, and nothing was recorded. Reload and
   * a resolved contradiction was open again — on a surface whose whole purpose
   * is to say whether the dossier is clean enough to promote.
   *
   * POST /api/governed-intelligence/contradictions/:id/review
   * (server/routes/assumption-decision-contradiction.ts:247, mounted with
   * authenticateToken at server/bootstrap/register-governance-routes.ts:38)
   * calls contradictionEngineService.transitionReviewState(findingId, orgId,
   * reviewState, userId, notes). The board these rows come from is served by the
   * SAME service, so `f.id` is the id that endpoint expects — the two are not
   * separate id spaces — and 'approved_resolution' / 'unresolved' are both
   * members of its ReviewState union.
   *
   * The local row is updated only after the server confirms, and a failure says
   * so and leaves the finding where it was. A contradiction that silently
   * appears resolved is exactly the failure this surface exists to prevent.
   */
  const [pendingId, setPendingId] = useState<string>('');

  const transition = async (
    f: GiFinding,
    reviewState: 'approved_resolution' | 'unresolved',
    apply: (x: GiFinding) => GiFinding,
    okMsg: string,
  ) => {
    if (pendingId) return;
    setPendingId(f.id);
    try {
      const res = await apiRequest(
        'POST',
        '/api/governed-intelligence/contradictions/' + encodeURIComponent(f.id) + '/review',
        { reviewState },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // This read `json.error` first, so a refusal shaped
        // { error: 'REVIEW_STATE_INVALID', message: '<a real sentence>' } put the
        // enum token into the toast. serverMessage takes the sentence and returns
        // null for codes and infrastructure text; a bare "HTTP 500" is not copy
        // either, so the fallback is a sentence that carries the status.
        const detail =
          serverMessage(json) ?? 'the service refused the update (HTTP ' + res.status + ')';
        fireToast(
          res.status === 404
            ? 'That finding is no longer on the board — refresh to see the current state.'
            : 'Couldn’t update "' + f.title + '" — ' + detail + '. Nothing was changed.',
          'error',
        );
        return;
      }
      setFindings(fs => fs.map(x => (x.id === f.id ? apply(x) : x)));
      fireToast(okMsg);
    } catch (e) {
      // Only ApiRequestError has a message that has been through the envelope
      // reduction; every other throw here is the browser's own "Failed to fetch".
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      const detail = known && (e as Error).message ? (e as Error).message : 'request failed';
      fireToast('Couldn’t reach the contradiction service — ' + detail + '. Nothing was changed.', 'error');
    } finally {
      setPendingId('');
    }
  };

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

  const resolve = (f: GiFinding) =>
    transition(
      f,
      'approved_resolution',
      x => ({ ...x, reviewState: 'approved_resolution', resolvedBy: 'AnA + you', resolvedAt: new Date().toISOString() }),
      'Resolved "' + f.title + '" — recorded against the finding.',
    );

  const reopen = (f: GiFinding) =>
    transition(
      f,
      'unresolved',
      x => ({ ...x, reviewState: 'unresolved', resolvedBy: null }),
      'Re-opened "' + f.title + '" — recorded against the finding.',
    );

  const gate: GiPromotionGate = giPromotionGate(findings, reg);
  const total = findings.length;
  const resolvedN = findings.filter(f => f.reviewState === 'approved_resolution').length;
  const openN = total - resolvedN;
  const hasFindings = total > 0;

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
    unreadable: Boolean(boardState.error),
    scopeExists: Boolean(prog),
    findingCount: openN,
    assessmentRan: hasFindings,
  });
  const clean = giState === 'assessed-clear';
  /** Nothing has ever been detected here, so nothing is known. */
  const neverScanned = giState === 'not-assessed' && Boolean(prog);
  const hasDosage = findings.some(f => f.contradictionType === 'dosage_conflict' && f.reviewState !== 'approved_resolution');

  /* Answer-first lead -- computed from the real gate, in AnA's voice, about the FILING. */
  const lead: AnswerLeadProps | null = (() => {
    if (!prog) return null;
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
    if (gate.blocked) {
      const b = gate.blocking[0];
      return {
        tone: 'urgent' as const, eyebrow: 'AnA — path to a clean filing',
        headline: <>Your <b>{progCode}</b> can't be filed yet -- {gate.blocking.length === 1 ? '1 issue would' : gate.blocking.length + ' issues would'} block it under {reg}.</>,
        body: b.title + '. ' + b.description,
        reassure: 'This is fixable, and I\'ll do the work with you — one governed change and the block clears.',
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
            const el = document.getElementById('gi-f-' + b.id);
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
              'The ' + progCode + ' filing is blocked under ' + reg + ' by "' + b.title +
                '". Walk me through clearing it: what the governed change is, which documents it touches, ' +
                'and what has to be re-approved afterwards.',
            );
          },
        },
      };
    }
    if (gate.needApproval.length) return {
      tone: 'calm' as const, eyebrow: 'AnA — path to a clean filing',
      headline: <>{progCode} won't be blocked under {reg}, but {gate.needApproval.length} {gate.needApproval.length === 1 ? 'item needs' : 'items need'} sign-off before filing.</>,
      body: 'Nothing hard-blocks the submission, but these carry a "requires approval" authority under ' + reg + ' -- get them approved and the filing is clean.',
      reassure: 'You\'re close. I\'ll draft the resolutions and route them for approval.',
      action: { label: 'Resolve the open items with AnA', onClick: () => ask('Draft resolutions for the open ' + progCode + ' contradictions and route them for approval.') },
    };
    return {
      tone: 'calm' as const, eyebrow: 'AnA — path to a clean filing',
      headline: <>{progCode} has {openN} open {openN === 1 ? 'inconsistency' : 'inconsistencies'} to tidy before the filing is perfect.</>,
      body: 'None of them block the submission under ' + reg + ' -- they\'re advisory or review-level — but a perfect filing carries none of them.',
      reassure: 'I\'ll clear them with you so the dossier reads as one coherent story.',
      action: { label: 'Clean them up with AnA', onClick: () => ask('Walk me through resolving the open ' + progCode + ' inconsistencies.') },
    };
  })();

  /* Order findings: open blockers -> approval -> review -> advisory -> resolved. */
  const eff = gate.effective.reduce<Record<string, GiFinding>>((m, f) => { m[f.id] = f; return m; }, {});
  const rank = (f: GiFinding) => {
    if (f.reviewState === 'approved_resolution') return 99;
    const a = eff[f.id];
    return a ? (10 - (GI_META.authority[a.authorityState!]?.rank ?? 0)) : 50;
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
    sub: 'Current value ' + form.value + ' -- cited in ' + (form.refs ? form.refs.length : 0) + ' sections. AnA propagates the change and flags anything locked for re-approval.',
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
    if (boardState.error) {
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
    const verdict = neverScanned
      ? ('not-assessed' as const)
      : clean
        ? ('clear' as const)
        : gate.blocked
          ? ('blocked' as const)
          : ('clear-with-open-items' as const);
    return {
      summary:
        verdict === 'not-assessed'
          ? `Submission gate for ${progCode}: NOT ASSESSED — no contradiction scan has ever reported on this program. That is the absence of a result, not a clean result; consistency across the ${filingLabel} dossier is unknown until a scan runs.`
          : verdict === 'blocked'
            ? `Submission gate for ${progCode}: BLOCKED under ${reg} — ${gate.blocking.length} unresolved contradiction(s) carry a blocks-promotion authority. The filing is held until resolved.`
            : verdict === 'clear-with-open-items'
              ? `Submission gate for ${progCode}: clear under ${reg}, with ${openN} open item(s) (${gate.needApproval.length} needing sign-off, ${gate.needReview.length} needing review) to close for a perfect filing.`
              : `Submission gate for ${progCode}: CLEAR — assessed, with every detected contradiction resolved (${resolvedN}/${total}).`,
      facts: {
        gate: verdict,
        regulator: reg,
        // Counts only in assessed states: a total of 0 next to "not-assessed"
        // would let a never-scanned board read as clean.
        ...(verdict !== 'not-assessed'
          ? {
              blockingCount: gate.blocking.length,
              needApprovalCount: gate.needApproval.length,
              needReviewCount: gate.needReview.length,
              resolvedCount: resolvedN,
              total,
            }
          : {}),
        disclaimer:
          'Running a scan, resolving or reopening findings, and revaluing assumptions (reason-for-change gated) are governed — AnA proposes them in conversation, never through screen controls.',
      },
      availableActions: ['Switch the FDA/EMA overlay (re-scores the gate on screen)'],
    };
  }, [projectId, boardState.loading, boardState.error, boardData, hasBoard, lead, neverScanned, clean, gate, progCode, filingLabel, reg, openN, resolvedN, total]);
  /* The regulator overlay is a client-side re-scoring of the same findings.
     The applied detail states the verdict UNDER THE NEW OVERLAY — recomputed
     through `giPromotionGate`, the same pure function the screen scores with,
     so no second derivation exists to drift. Scans, resolutions and assumption
     revaluations stay governed acts AnA proposes in conversation. */
  useSurfaceActionHandlers('inconsistency', {
    'inconsistency.set-regulator': (params) => {
      const target = params.regulator === 'EMA' ? 'EMA' : 'FDA';
      if (!projectId) {
        return { ok: false, reason: 'The board is project-scoped and no project is open.' };
      }
      if (boardState.loading && !boardData) {
        return { ok: false, reason: 'The inconsistency board is still loading.', retry: true };
      }
      if (boardState.error) {
        return { ok: false, reason: 'The inconsistency board could not be read, so no overlay can be scored against it.' };
      }
      if (reg === target) return { ok: true, detail: `Already showing the ${target} overlay` };
      setReg(target);
      if (neverScanned) {
        return {
          ok: true,
          detail: `Switched to the ${target} overlay — no scan has reported on this filing, so the gate stays NOT ASSESSED under either regulator`,
        };
      }
      const next = giPromotionGate(findings, target);
      return {
        ok: true,
        detail:
          `Switched to the ${target} overlay — the gate re-scores to ` +
          (next.blocked
            ? `BLOCKED (${next.blocking.length} blocking contradiction(s))`
            : `clear, with ${next.needApproval.length} needing sign-off and ${next.needReview.length} needing review`),
      };
    },
  });

  usePublishSurfaceContext('inconsistency', anaContext);

  return (
    <div className="sp">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">AnA {I.dot} Governed intelligence</div>
          <h1 className="sp-title">{prog ? progCode + ' -- path to a clean filing' : 'Cross-document inconsistency'}</h1>
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
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading the inconsistency board...</div>
      ) : boardState.error ? (
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
          <div className={'gi-gate ' + (clean ? 'is-clean' : neverScanned ? 'is-warn' : gate.blocked ? 'is-blocked' : 'is-warn')}>
            <div className="gi-gate-main">
              <span className="gi-gate-ico">{clean ? I.shieldCheck : neverScanned ? I.helpCircle || I.clock : gate.blocked ? I.shieldAlert : I.clock}</span>
              <div>
                <div className="gi-gate-verdict">{clean ? 'Submission gate — CLEAR' : neverScanned ? 'Submission gate — NOT ASSESSED' : gate.blocked ? 'Submission gate — BLOCKED' : 'Submission gate — clear, with open items'}</div>
                <div className="gi-gate-sub">{clean
                  ? 'No contradictions block promotion. ' + progCode + ' can enter the submission sequence.'
                  : neverScanned
                  ? 'No contradiction scan has reported on ' + progCode + '. A gate with nothing behind it is not a pass — run a scan before promoting.'
                  : gate.blocked
                    ? gate.blocking.length + ' unresolved ' + (gate.blocking.length === 1 ? 'contradiction' : 'contradictions') + ' with a "blocks promotion" authority under ' + reg + '. The filing is held until resolved.'
                    : 'Nothing blocks promotion under ' + reg + ', but ' + openN + ' open ' + (openN === 1 ? 'item' : 'items') + ' should be cleared for a perfect filing.'}</div>
              </div>
            </div>
            <div className="gi-gate-side">
              <div className="gi-reg" role="group" aria-label="Regulator overlay">
                {(['FDA', 'EMA'] as const).map(r => (
                  <button key={r} className={'gi-reg-b' + (reg === r ? ' on' : '')} onClick={() => setReg(r)}>{r}</button>
                ))}
              </div>
              <div className="gi-gate-counts">
                <span className="gi-c gi-c-bad">{gate.blocking.length} blocking</span>
                <span className="gi-c gi-c-warn">{gate.needApproval.length} approval</span>
                <span className="gi-c gi-c-rev">{gate.needReview.length} review</span>
                <span className="gi-c gi-c-ok">{resolvedN}/{total} resolved</span>
              </div>
            </div>
          </div>
          {hasDosage
            ? <div className="gi-overlay-note">{I.info} Same dossier, different regulator: the dosage conflict is <b>{reg === 'FDA' ? 'a hard filing block under FDA' : '"requires approval" under EMA — not a hard block'}</b>. AnA re-scores authority from the active regulator's overlay rules.</div>
            : <div className="gi-overlay-note">{I.info} AnA scores every finding's authority from the active regulator's overlay rules — switch <b>{reg}</b> to see how {filingLabel} severity shifts by regulator.</div>}

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
            {ordered.map(f => {
              const a = eff[f.id] || giApplyOverlay(f, reg);
              const done = f.reviewState === 'approved_resolution';
              const auth = GI_META.authority[a.authorityState!] || GI_META.authority.advisory_only;
              return (
                <div id={'gi-f-' + f.id} key={f.id} className={'gi-find' + (done ? ' is-done' : '') + (auth.blocks && !done ? ' is-block' : '')}>
                  <div className="gi-find-top">
                    <span className="sp-sev" data-s={sevS(a.severity)}>{(GI_META.severity[a.severity] || { label: a.severity }).label}</span>
                    <span className="gi-type">{GI_META.type[f.contradictionType] || f.contradictionType}</span>
                    <span className={'gi-auth tone-' + auth.tone}>{done ? 'Resolved' : auth.label}</span>
                    {a.overlayApplied && !done && <span className="gi-ov">{reg} overlay</span>}
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
                    {!done && <button className="sp-primary gi-resolve" onClick={() => void resolve(f)} disabled={pendingId === f.id}>{I.check} {pendingId === f.id ? 'Recording…' : 'Resolve with AnA'}</button>}
                    {done && <button className="sp-ask" onClick={() => void reopen(f)} disabled={pendingId === f.id}>{I.undo} {pendingId === f.id ? 'Recording…' : 'Re-open'}</button>}
                    {/* factId is a documented null on every live finding, so this
                        "change value everywhere" affordance stays hidden until the
                        findings table carries a real fact linkage. */}
                    {!done && f.factId && <button className="sp-ask" onClick={() => {
                      const fact = (window.IC_FACTS || []).find(x => x.id === f.factId);
                      if (fact) setForm(fact);
                    }}>{I.gitCompare} Change value everywhere</button>}
                    {!done && <button className="sp-ask" onClick={() => ask('For the ' + progCode + ' contradiction "' + f.title + '", draft the governed resolution and the decision record, and tell me which documents update.')}>{I.sparkles} Draft resolution</button>}
                    <button className="sp-go" title="Open the source record" onClick={() => open(f.factId ? 'cmc' : 'document-authoring')}>{I.right}</button>
                  </div>
                  {done && <div className="gi-done-line">{I.check} Marked resolved by {f.resolvedBy || 'AnA'} in this view — the governed audit-trail write + re-approval routing is not yet wired.</div>}
                </div>
              );
            })}
          </div>}

          {/* Supporting: where drift starts + how it's decided (secondary) */}
          {hasFindings && <div className="gi-support">
            <div className="pj-card">
              <div className="pj-card-h"><span className="t">Assumption registry</span><span className="s">drift origin</span></div>
              <div className="pj-card-b">
                <p className="gi-support-p">Contradictions like the dropout drift start here — two governed assumptions sharing a category and domain but holding different values.</p>
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
                        <span className="sp-row-b"><span className="sp-row-t">{d.title}</span><span className="sp-row-s">{d.rationale}{d.executedArtifactId ? ' -- artifact #' + d.executedArtifactId + ' v' + d.executedArtifactVersion : ''}</span></span>
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
      <C2CToast msg={toast} />
    </div>
  );
}
