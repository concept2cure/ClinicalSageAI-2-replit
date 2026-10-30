import React, { useMemo, useEffect } from 'react';

import { listedChoices, notifySurfaceActionReady, useSurfaceActionHandlers, type SurfaceActionHandler } from '../surfaceActions';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { ApiRequestError, apiRequest, extractApiError, serverMessage } from '@/lib/queryClient';
import { useAuthUser } from '@/services/portal/authService';
import { canGovernedWrite } from '@shared/constants/permissions';
import { EsignModal, esignSignerOf, type EsigSignedManifest } from '../../_shared/components/EsignModal';
import type { EsigMeaning } from '../../hooks/useEsignature';
import { AnswerLead, UnresolvedLead } from '../AnswerLead';
import { assessmentStateFor, hasAnswer, mayReassure, type AssessmentState } from '../assessmentState';
import type { SurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import {
  ProjectRefused,
  ReadRefused,
  useProjectScopedRead,
  type ProjectReadOptions,
  type ProjectReadStatus,
  type ProjectScopedRead,
} from '../projectScopedRead';
import '../styles/project-home-v2.css';
// SEV_LABELS / PROB_LABELS / RISK_ENUMS are canonical ISO 14971 reference config
// (the severity + probability scales and the control/status/source enums that
// mirror the backend's zod validators) — kept. RISK_ROWS was the display DATA
// fixture and is gone: the register reads the real risk file.
import { RISK_ENUMS, SEV_LABELS, PROB_LABELS } from '../fixtures/risk-data';
import type { RiskRow, RiskControl } from '../fixtures/risk-data';
import { C2CToast, useToast, type FireToast } from '../toast';
import { SignedContentLine, signedContentForAna, signedContentWords, type SignedRecordRead } from '../SignedContentState';
import { riskControlsForAna, riskItemPath, riskRowsBelongToProject, useRiskOwnedState, useRiskReadOwner, useRiskRecordRead, useRiskToast, type RiskRecordRead } from './riskRecordRead';
import type { DataReadOwner } from '../dataConnect';

/* ════ The ISO 14971 risk register ════

   One register (D2, fold F1 slice B, 2026-10-29;
   docs/design/DEVICE_FOLDS_2026-10-29.md F1, "Work" item 4;
   docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1b-engineering-parity/), mounted by
   Engineering (../../mdx/surfaces/EngineeringSurface.tsx) for its project only,
   once its own route has admitted the project. It was drawn inside the Risk
   screen, which mounted it too until it folded into Engineering (fold F1c,
   2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/grant-continuity-and-f1c-f2/).

   Every read and write names the open project: GET /api/mdx/risk-items
   ?program_id=, the hazard POST's `programId`. The route admits the project
   first (server/routes/mdx-risk-management.ts, slice A). An answer not keyed to
   the project, and a refused one, say so and draw no hazard. A role that
   cannot write (canGovernedWrite; the routes' requireEditorAccess) is offered
   no write control. AnA's matrix actions register under the screen the
   register is on: `risk.*` or `device-engineering.*`
   (shared/navigation/surface-actions.ts). */

/* Raw risk_items row as returned by GET /api/mdx/risk-items (server
   mdx-risk-management.ts — SELECT * FROM risk_items, org-scoped). severity and
   probability are integers on the ISO 14971 1..5 scale; every column that can be
   NULL in the table is typed `| null` here and mapped null-safe by mapRiskItems,
   so the surface never fabricates a value the backend did not return. */
export interface RawRiskItem {
  id: number;
  program_id?: string | null;
  ref_code: string | null;
  hazard: string;
  hazardous_situation: string | null;
  harm: string;
  sequence_of_events: string | null;
  severity: number;
  probability: number;
  detectability: number | null;
  residual_probability: number | null;
  control_strategy: string | null;
  source: string | null;
  status: string;
  acceptable: boolean | null;
}

/* Stable empty seed for the optimistic-row store while the live risk file is
   loading or unavailable. Feeding a module-level constant into the re-seed
   effect keeps it from thrashing ("Maximum update depth exceeded"). */
const EMPTY_ROWS: RiskRow[] = [];

/**
 * Map the raw `risk_items` rows the backend returns (GET /api/mdx/risk-items —
 * DB columns, numeric severity/probability 1..5) onto the RiskRow display
 * contract the surface renders. This is the read-side inverse of addHazard's
 * write path (`severity = SEV_LABELS.indexOf(sev) + 1`), so a label written by
 * the surface round-trips back to the same label. Residual acceptability is
 * taken from the server's authoritative `acceptable` boolean — never inferred
 * from the risk product — so the surface never overstates that a hazard is
 * Acceptable.
 *
 * Returns null unless the payload is a non-empty list of rows that actually
 * carry the risk_items signature (hazard + harm strings, severity/probability
 * integers in 1..5); a display-shaped row (string `sev`/`prob`, no numeric
 * `severity`) maps to null too. The caller maps that null to a stable empty
 * list, so the surface shows its honest empty state rather than half-mapped
 * safety data — never a fixture. All-or-nothing: one row failing the signature
 * fails the whole batch, so a partially-adopted risk file is never shown.
 * Exported for unit coverage.
 */
export function mapRiskItems(payload: unknown): RiskRow[] | null {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data)
      : null;
  if (!Array.isArray(list) || list.length === 0) return null;

  const inScale = (n: unknown): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5;
  const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' && v ? v : fallback;

  const out: RiskRow[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    // Signature gate — a risk_items row, not the display fixture or some other
    // envelope. Any row that fails fails the whole batch (all-or-nothing so the
    // surface never shows a partially-adopted risk file).
    if (!str(r.hazard) || !str(r.harm)) return null;
    if (!inScale(r.severity) || !inScale(r.probability)) return null;

    const sev = SEV_LABELS[r.severity - 1];
    const prob = PROB_LABELS[r.probability - 1];
    const status = str(r.status, 'open');
    out.push({
      id: str(r.ref_code) || 'HZ-' + String(r.id ?? out.length + 1).padStart(2, '0'),
      dbId: typeof r.id === 'number' ? r.id : undefined,
      hazard: str(r.hazard),
      situation: str(r.hazardous_situation),
      harm: str(r.harm),
      seq: str(r.sequence_of_events),
      sev,
      prob,
      probR: inScale(r.residual_probability) ? PROB_LABELS[r.residual_probability - 1] : prob,
      det: inScale(r.detectability) ? r.detectability : 3,
      strategy: str(r.control_strategy, 'design_reduce'),
      source: str(r.source, 'other'),
      status,
      ctrl: '',
      ver: '',
      res: r.acceptable === true ? 'Acceptable' : 'Investigation',
      open: status === 'open' || status === 'mitigating',
      controls: [],
    });
  }
  return out.length ? out : null;
}

/* The mdx-risk-management POST/PATCH wrap the single row as { data: row }
   (ok/created). Unwrap it so mapRiskItems (a list mapper) can adopt it. */
function envRow(json: unknown): unknown {
  return json && typeof json === 'object' && 'data' in json ? (json as { data: unknown }).data : json;
}

/* Trailing punctuation removed: every toast below appends its own
   ". Nothing was saved." clause, so a message already ending in a full stop
   would render a doubled period. */
function clause(text: string): string {
  return text.replace(/[.\s]+$/, '');
}

/* The human sentence for a failed write, reduced for display.

   This used to read the body's `error` field FIRST, so against the envelope
   { error: 'VALIDATION_FAILED', message: '<a real sentence>' } the enum won and
   the toast showed the token. It also fell back to a bare `HTTP <status>`, which
   is a status code rather than user copy. extractApiError takes the sentence
   wherever the envelope put it — rejecting enum tokens and driver text — and
   substitutes a status-keyed sentence when the server sent none. */
function errText(json: unknown, status: number): string {
  return clause(extractApiError(json, status).message);
}

/* A caught throw is only safe to render when it is an ApiRequestError: its
   message has already been through the same reduction as errText above.
   Anything else reaching here is a browser-native fetch rejection, whose
   message ("Failed to fetch", "Load failed") is not user copy. */
function thrownClause(e: unknown): string {
  const known = (e as { name?: unknown })?.name === 'ApiRequestError';
  return known && (e as Error).message ? clause((e as Error).message) : 'the risk file could not be reached';
}

/* ── Accepting residual risk: an electronic signature (D2, 2026-10-29) ──────
   The server signs the acceptance. PATCH /api/mdx/risk-items/:id with status
   `accepted` runs the platform's signing ceremony
   (server/routes/mdx-risk-management.ts → signGovernedAct): signing authority,
   then the password and any enrolled second factor, then the status, the
   ledger pair and the signature row on one transaction. So "Accept residual"
   opens the shared signature dialog (EsignModal, on useEsignature), as the
   labeling translation approval does, and no longer sends a bare status. */

/** The meanings the server's acceptance takes (DECISION_ACT_MEANINGS). */
const RESIDUAL_ACCEPTANCE_MEANINGS: ReadonlyArray<EsigMeaning> = ['approval', 'responsibility'];
const NOTHING_SIGNED = 'Nothing was signed.';
const UNCONFIRMED_ACCEPTANCE =
  'The server did not confirm the acceptance. Reload the risk file and check the hazard before you sign again.';

/** The server's sentence, ending once with "Nothing was signed." (the ceremony's refusals already do). */
function refusedSigning(message: string): Error {
  return new Error(message.trimEnd().endsWith(NOTHING_SIGNED) ? message : `${message} ${NOTHING_SIGNED}`);
}

type SignInput = { meaning: EsigMeaning; reason: string; password: string; totp?: string };

/**
 * Send the signed acceptance. A coded refusal (4xx) is thrown as the server's
 * sentence and the dialog stays open. A dropped connection or a server error
 * may have come after the commit, so it says the outcome is unconfirmed rather
 * than "nothing was signed". The time shown is the signature row's.
 */
export async function postResidualAcceptance(
  dbId: number,
  input: SignInput,
  programId?: string | null,
): Promise<{ row: unknown; manifest: EsigSignedManifest }> {
  let res: Response;
  try {
    res = await apiRequest('PATCH', riskItemPath(dbId, programId), {
      status: 'accepted',
      meaning: input.meaning,
      reason: input.reason,
      password: input.password,
      ...(input.totp ? { mfaToken: input.totp } : {}),
    });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status < 500) throw refusedSigning(e.message);
    throw new Error(UNCONFIRMED_ACCEPTANCE, { cause: e });
  }
  const json = (await res.json().catch(() => null)) as { data?: unknown; signedAt?: string; sha256Chain?: string } | null;
  // apiRequest hands a 401 back rather than throwing: the ceremony refused the password or code.
  if (res.status === 401) {
    throw refusedSigning(serverMessage(json) ?? 'Your password or code was not verified. Re-enter them and sign again.');
  }
  if (!res.ok || !json?.signedAt) throw new Error(UNCONFIRMED_ACCEPTANCE);
  return {
    row: json.data ?? null,
    manifest: {
      meaning: input.meaning,
      reason: input.reason,
      signedAt: json.signedAt,
      ...(json.sha256Chain ? { hash: json.sha256Chain } : {}),
    },
  };
}

/* ── The register's derived figures ─────────────────────────────────────── */

const sevI = (s: string) => Math.max(0, SEV_LABELS.indexOf(s as (typeof SEV_LABELS)[number]));
const probI = (p: string) => Math.max(0, PROB_LABELS.indexOf(p as (typeof PROB_LABELS)[number]));
const riskProduct = (r: RiskRow, resid: boolean) => (sevI(r.sev) + 1) * (probI(resid ? (r.probR || r.prob) : r.prob) + 1);
/* A RECORDED residual-risk determination: the server's authoritative
   `acceptable` boolean (mapped to res === 'Acceptable') or the accepted
   status. Nothing here is inferred from a risk product. */
const isAccepted = (r: RiskRow) => r.status === 'accepted' || r.res === 'Acceptable';
/* The hazards standing between this register and a clean residual-risk
   picture: no recorded acceptance, or a residual score in the unacceptable
   band even though one was recorded. */
const isOutstanding = (r: RiskRow) => !isAccepted(r) || riskProduct(r, true) >= 15;

export interface RiskSummary {
  total: number;
  open: number;
  accepted: number;
  highResidual: number;
  outstanding: number;
  firstOutstanding: RiskRow | null;
  avgInitial: string;
  avgResidual: string;
}

/**
 * The register's counts. `outstanding` is the finding count the narrative
 * speaks from. It used to speak from `highResidual === 0 && open === 0` — two
 * filters that are EMPTY over a register whose residual risk nobody has
 * evaluated at all (five hazards, status 'verified', acceptable NULL, every
 * score under 15), so the surface cleared itself over exactly the state it
 * exists to surface. `outstanding` counts those five.
 */
export function riskSummaryOf(rows: RiskRow[]): RiskSummary {
  const total = rows.length;
  return {
    total,
    open: rows.filter(r => r.status === 'open' || r.status === 'mitigating').length,
    accepted: rows.filter(isAccepted).length,
    highResidual: rows.filter(r => riskProduct(r, true) >= 15).length,
    outstanding: rows.filter(isOutstanding).length,
    firstOutstanding: rows.find(isOutstanding) ?? null,
    avgInitial: (rows.reduce((s, r) => s + riskProduct(r, false), 0) / (total || 1)).toFixed(1),
    avgResidual: (rows.reduce((s, r) => s + riskProduct(r, true), 0) / (total || 1)).toFixed(1),
  };
}

type MatrixView = 'initial' | 'residual';
type AnaContext = Omit<SurfaceContext, 'surfaceId'>;

/* What AnA can see of the register.
   She knew the user was on "risk" and nothing else — not how many hazards are
   open, how many carry a high residual score, or which one is selected — so
   "what still needs mitigation?" required the user to read their own risk
   file back to her.

   A failed read publishes the failure. `rows` is EMPTY_ROWS both when the
   governed risk file is genuinely empty and when the read threw, and
   "0 open risks" over an outage is the most dangerous sentence this surface
   could produce: it reads as a clean risk file to the person accountable for
   one. A read refused for the project, or not keyed to it, is the same. */
const UNREAD_CONTEXT: Partial<Record<ProjectReadStatus, AnaContext>> = {
  loading: { summary: 'The risk file is still loading; nothing on screen is final yet.' },
  idle: { summary: 'No project is open, so no risk file is read on this screen.' },
  error: {
    summary:
      'The risk file could not be read, so this screen shows no hazards because of a failure, not because none are recorded.',
    availableActions: ['Retry the risk-file read'],
  },
  refused: {
    summary:
      'The open project was not admitted for this risk-file read, so no hazard was read and nothing on this screen is a statement about its risk file.',
  },
  unkeyed: {
    summary:
      'The risk-file read was not tied to the open project, so this screen is showing no hazards because of a failure, not because none are recorded.',
    availableActions: ['Retry the risk-file read'],
  },
};

const WRITE_ACTIONS = ['Add a hazard to the governed risk file', 'Add a control to the selected hazard'];

/* What the summary says of the selected hazard's acceptance signature, as the drawer shows it. */
function acceptanceSentence(s: SignedRecordRead | null): string {
  if (!s) return '';
  return s.reading
    ? '. Its residual-risk acceptance signature is still being read'
    : `. Its residual-risk acceptance signature: ${signedContentWords(s.facet)}`;
}

function riskAnaContext(x: {
  status: ProjectReadStatus; summary: RiskSummary; view: MatrixView; row: RiskRow | undefined;
  riskState: AssessmentState; canWrite: boolean; signature: SignedRecordRead | null; controls: RiskRecordRead;
}): AnaContext {
  const { summary, view, row } = x;
  const unread = UNREAD_CONTEXT[x.status];
  if (unread) return unread;
  /* A read that succeeded and returned nothing. The counts below are all zero
     in that state, and "0 open, 0 accepted, 0 with a residual score of 15 or
     more" is what AnA would otherwise repeat back to the person accountable
     for the risk file — three zeros that read as a clean file and mean an
     empty one. The mean scores are worse: `total || 1` makes them "0.0" for a
     register with nothing in it. */
  if (summary.total === 0) {
    return {
      summary:
        'No hazards are recorded in the ISO 14971 risk file, so no hazard analysis or residual-risk evaluation has been carried out here. ' +
        'This is an unexamined risk file, not a clear one — say nothing about residual risk or benefit-risk from it.',
      availableActions: x.canWrite ? ['Add the first hazard to the governed risk file'] : [],
    };
  }
  return {
    summary:
      `Risk management (ISO 14971): ${summary.total} hazard(s) — ${summary.open} open or mitigating, ` +
      `${summary.accepted} accepted, ${summary.highResidual} with a residual score of 15 or more. ` +
      `${summary.outstanding} hazard(s) carry no recorded acceptable residual risk or sit in the unacceptable band. ` +
      `The overall benefit-risk conclusion is a documented manufacturer decision and is not recorded here. ` +
      `Mean score ${summary.avgInitial} initial, ${summary.avgResidual} residual. ` +
      `Matrix showing ${view} risk` +
      (row ? `; "${row.id} — ${row.hazard || 'hazard'}" selected` : '') +
      acceptanceSentence(x.signature),
    facts: {
      totalHazards: summary.total,
      openOrMitigating: summary.open,
      accepted: summary.accepted,
      highResidual: summary.highResidual,
      withoutRecordedAcceptance: summary.outstanding,
      residualRiskState: x.riskState,
      meanInitialScore: summary.avgInitial,
      meanResidualScore: summary.avgResidual,
      matrixView: view,
      selected: row
        ? {
            id: row.id, hazard: row.hazard, severity: row.sev,
            probability: row.prob, residualProbability: row.probR ?? null,
            status: row.status, residualAcceptability: row.res ?? null,
            residualAcceptanceSignature: x.signature ? signedContentForAna(x.signature.facet, x.signature.reading) : null,
            controls: riskControlsForAna(x.controls, row.controls),
          }
        : null,
    },
    availableActions: [
      'Open a hazard to see its severity, probability and controls',
      ...(x.canWrite ? WRITE_ACTIONS : []),
      'Switch the matrix between initial and residual risk',
    ],
  };
}

/* ── AnA's hands on the register — the surface-action bus ─────────────────
   Registered under the screen the register is on, device-engineering (the
   Risk screen's `risk` registration went with it, fold F1c). Every handler drives the SAME state
   the human's own controls drive (setView, setSel via the matrix dots);
   hazards resolve against the REAL risk file with honest misses. Accepting
   residual risk, adding hazards, and adding controls stay governed human
   acts, untouched. */

type Refusal = { ok: false; reason: string; retry?: boolean };

/* Why the register cannot be acted on yet, by the read's state, or nothing. */
const HELD: Partial<Record<ProjectReadStatus, Refusal>> = {
  // The register renders only once the read settles; until it does a refusal
  // would be false, so the bus holds the directive instead.
  loading: { ok: false, reason: 'The risk file is still loading.', retry: true },
  error: { ok: false, reason: 'The risk file could not be read.' },
  refused: { ok: false, reason: 'The open project was not admitted, so no risk file was read for it.' },
  unkeyed: { ok: false, reason: "The risk-file read was not this project's, so no hazard is shown." },
  idle: { ok: false, reason: 'No project is open, so there is no risk file on this screen.' },
};
const EMPTY_FILE: Refusal = { ok: false, reason: 'The risk file is empty.' };

interface MatrixActionState {
  status: ProjectReadStatus;
  rows: RiskRow[];
  row: RiskRow | undefined;
  view: MatrixView;
  setView: (v: MatrixView) => void;
  setSel: (id: string) => void;
  form: boolean;
  ctrlForm: boolean;
}

const hazardName = (r: RiskRow) => (r.hazard ? `${r.id} — ${r.hazard}` : r.id);

function selectHazard(s: MatrixActionState, params: Record<string, string>): ReturnType<SurfaceActionHandler> {
  const { rows } = s;
  const wanted = (params.hazard ?? '').trim();
  const listed = () => listedChoices(rows.map(hazardName), 'Hazards listed');
  if (!wanted) return { ok: false, reason: `No hazard named.${listed()}` };
  const lower = wanted.toLowerCase();
  const exact = rows.find((r) => r.id.toLowerCase() === lower);
  const contains = exact
    ? []
    : rows.filter((r) => r.id.toLowerCase().includes(lower) || (r.hazard || '').toLowerCase().includes(lower));
  const match = exact ?? (contains.length === 1 ? contains[0] : null);
  if (!match) {
    return {
      ok: false,
      reason:
        contains.length > 1
          ? `"${params.hazard}" matches ${contains.length} hazards — name one exactly.${listedChoices(contains.map(hazardName), 'Matches')}`
          : `No hazard matching "${params.hazard}" in the risk file.${listed()}`,
    };
  }
  s.setSel(match.id);
  return { ok: true, detail: `Opened ${match.id} — ${match.hazard || 'hazard'}` };
}

function focusCell(s: MatrixActionState, params: Record<string, string>): ReturnType<SurfaceActionHandler> {
  const sev = (params.severity ?? '').trim();
  const prob = (params.probability ?? '').trim();
  const si = SEV_LABELS.indexOf(sev as (typeof SEV_LABELS)[number]);
  const pi = PROB_LABELS.indexOf(prob as (typeof PROB_LABELS)[number]);
  if (si < 0 || pi < 0) return { ok: false, reason: 'Unknown severity or probability band.' };
  const requestedView: MatrixView = params.view === 'initial' || params.view === 'residual' ? params.view : s.view;
  if (requestedView !== s.view) s.setView(requestedView);
  // The SAME derivation the matrix dots render from, against the requested band.
  const bandProb = (r: RiskRow) => (requestedView === 'residual' ? (r.probR || r.prob) : r.prob);
  const hz = s.rows.filter((r) => sevI(r.sev) === si && probI(bandProb(r)) === pi);
  if (hz.length === 0) {
    return { ok: false, reason: `No hazard sits at ${sev} × ${prob} in the ${requestedView} matrix.` };
  }
  s.setSel(hz[0].id);
  return {
    ok: true,
    detail:
      hz.length === 1
        ? `Focused ${hz[0].id} at ${sev} × ${prob}`
        : `Focused ${hz[0].id} — first of ${hz.length} hazards at ${sev} × ${prob}`,
  };
}

function useRiskMatrixActions(surfaceId: string, s: MatrixActionState): void {
  const formGuard = (): Refusal | null => {
    if (s.form) return { ok: false, reason: 'The new-hazard form is open — close it first.' };
    if (s.ctrlForm) return { ok: false, reason: 'The add-control form is open — close it first.' };
    return null;
  };
  /* Reasons the file cannot be acted on: a form open, the read's state, an empty file. */
  const blocked = (): Refusal | null => formGuard() ?? HELD[s.status] ?? (s.rows.length === 0 ? EMPTY_FILE : null);
  useSurfaceActionHandlers(surfaceId, {
    [`${surfaceId}.set-matrix-view`]: (params) => {
      const guarded = formGuard();
      if (guarded) return guarded;
      const target = (params.view ?? '').trim();
      if (target !== 'initial' && target !== 'residual') {
        return { ok: false, reason: 'View must be initial or residual.' };
      }
      // The matrix renders once a row exists, whatever the read is doing.
      if (!s.row) return HELD[s.status] ?? EMPTY_FILE;
      s.setView(target);
      return { ok: true, detail: `Showing the ${target} matrix` };
    },
    // MANDATORY hold while loading: the seed effect overwrites `sel` when the
    // read lands, so an early select would be silently clobbered.
    [`${surfaceId}.select-hazard`]: (params) => blocked() ?? selectHazard(s, params),
    [`${surfaceId}.focus-cell`]: (params) => blocked() ?? focusCell(s, params),
  });
  /* The ready signal for the retry contract above. */
  useEffect(() => {
    if (s.status !== 'loading') notifySurfaceActionReady(surfaceId);
  }, [s.status, surfaceId]);
}

/* ── The register's writes ─────────────────────────────────────────────── */

/** The POST body for a new hazard, from the form, naming the open project. */
function hazardBody(v: Record<string, string>, programId: string | null): Record<string, unknown> {
  return {
    hazard: v.hazard, hazardousSituation: v.situation || '', harm: v.harm,
    sequenceOfEvents: v.seq || '', severity: sevI(v.sev || 'Serious') + 1, probability: probI(v.prob || 'Occasional') + 1,
    detectability: Number(v.det) || 3, controlStrategy: v.strategy || 'design_reduce', source: v.source || 'other',
    ...(programId ? { programId } : {}),
  };
}

/** The server's risk_controls row as the drawer lists it. */
function adoptedControl(cr: Record<string, unknown>, v: Record<string, string>): RiskControl {
  return {
    id: cr.id != null ? String(cr.id) : '',
    desc: typeof cr.description === 'string' ? cr.description : v.desc,
    type: typeof cr.control_type === 'string' ? cr.control_type : (v.type || 'protective_measure'),
    status: typeof cr.status === 'string' ? cr.status : (v.status || 'proposed'),
  };
}

interface WriteDeps {
  owner: DataReadOwner;
  programId: string | null;
  row: RiskRow | undefined;
  setRows: React.Dispatch<React.SetStateAction<RiskRow[]>>;
  setSel: (id: string) => void;
  setForm: (open: boolean) => void;
  setCtrlForm: (open: boolean) => void;
  setAccepting: (r: RiskRow | null) => void;
  fire: FireToast;
}

function riskWrites(d: WriteDeps) {
  // addHazard — REAL, awaited write. POSTs to the governed risk file and adopts
  // the SERVER's row via mapRiskItems (real ref_code + numeric dbId, authoritative
  // status/acceptability). No optimistic HZ-<n> id; the success toast fires only
  // after the write is confirmed, and any failure is stated with nothing added.
  const addHazard = async (v: Record<string, string>) => {
    if (!d.owner.current()) return;
    if (!v.hazard || !v.harm) { d.fire('Hazard and harm are required'); return; }
    try {
      const res = await apiRequest('POST', '/api/mdx/risk-items' + (d.programId ? `?program_id=${encodeURIComponent(d.programId)}` : ''), hazardBody(v, d.programId));
      const json = await res.json().catch(() => null);
      if (!d.owner.current()) return;
      if (!res.ok) { d.fire('Couldn’t add the hazard — ' + errText(json, res.status) + '. Nothing was saved.'); return; }
      const saved = envRow(json) as RawRiskItem | null;
      const adopted = d.programId && saved?.program_id !== d.programId ? undefined : mapRiskItems([saved])?.[0];
      if (!adopted) { d.fire('Saved, but the server returned an unexpected shape — reload to see it'); return; }
      d.setRows(rs => [{ ...adopted, _new: true }, ...rs.filter(r => r.id !== adopted.id)]);
      d.setSel(adopted.id); d.setForm(false);
      d.fire('Hazard ' + adopted.id + ' saved · status ' + adopted.status);
    } catch (e) {
      if (!d.owner.current()) return;
      d.fire('Couldn’t add the hazard — ' + thrownClause(e) + '. Nothing was saved.');
    }
  };

  // addControl — REAL, awaited write. POSTs to the risk item's controls
  // (addressed by its numeric dbId — the route requires a numeric :id) and adopts
  // the SERVER's risk_controls row (real id). Nothing is added on failure; the
  // former fabricated RC-<n> id and swallowed error are gone.
  const addControl = async (v: Record<string, string>) => {
    if (!d.owner.current()) return;
    const row = d.row;
    if (!row) return;
    if (row.dbId == null) { d.fire('This hazard isn’t in the governed file yet — reload before adding controls'); return; }
    try {
      const res = await apiRequest('POST', riskItemPath(row.dbId, d.programId, '/controls'), {
        description: v.desc, controlType: v.type || 'protective_measure', status: v.status || 'proposed',
      });
      const json = await res.json().catch(() => null);
      if (!d.owner.current()) return;
      if (!res.ok) { d.fire('Couldn’t add the control — ' + errText(json, res.status) + '. Nothing was saved.'); return; }
      const cr = envRow(json) as Record<string, unknown> | null;
      if (!cr || typeof cr !== 'object' || typeof cr.id !== 'number' || (cr.risk_item_id !== undefined && cr.risk_item_id !== row.dbId)) {
        d.fire('Saved, but the server returned an unexpected record — reload to see it', 'error'); return;
      }
      const nc = adoptedControl(cr, v);
      d.setRows(rs => rs.map(r => r.id === row.id ? { ...r, controls: [...(r.controls || []), nc] } : r));
      d.setCtrlForm(false);
      d.fire('Risk control saved to ' + row.id);
    } catch (e) {
      if (!d.owner.current()) return;
      d.fire('Couldn’t add the control — ' + thrownClause(e) + '. Nothing was saved.');
    }
  };

  // Accept residual — the signed act (postResidualAcceptance). The dialog opens
  // only for a hazard the governed file holds (a numeric dbId, which the route
  // addresses). The row is replaced by the SERVER's accepted row only after the
  // signature is confirmed, so status and residual acceptability (res) come from
  // the record. Controls are preserved (the item PATCH doesn't return them).
  const openAcceptance = (r: RiskRow) => {
    if (!d.owner.current()) return;
    if (r.dbId == null) { d.fire('This hazard isn’t in the governed file yet — reload before accepting its residual risk'); return; }
    d.setAccepting(r);
  };
  const signAcceptance = async (r: RiskRow, input: SignInput): Promise<EsigSignedManifest> => {
    if (!d.owner.current()) throw new Error('The risk-file context changed. Return to the original project and check the hazard before signing.');
    const { row: signedRow, manifest } = await postResidualAcceptance(r.dbId as number, input, d.programId);
    if (!d.owner.current()) throw new Error('The risk-file context changed. Check the signed outcome in the original project before signing again.');
    const adopted = mapRiskItems([signedRow])?.[0];
    const raw = signedRow as RawRiskItem | null;
    if (!adopted || adopted.dbId !== r.dbId || adopted.status !== 'accepted' || (d.programId && raw?.program_id !== d.programId)) {
      throw new Error('The server did not confirm the signed hazard record. Reload the original risk file before signing again.');
    }
    d.setRows(rs => rs.map(x => x.dbId === r.dbId ? { ...adopted, controls: x.controls } : x));
    d.fire(r.id + ' residual risk accepted and signed');
    return manifest;
  };
  return { addHazard, addControl, openAcceptance, signAcceptance };
}

/* ── The register's state ──────────────────────────────────────────────── */

export interface RiskRegisterOptions extends ProjectReadOptions {
  /** The screen AnA's matrix actions register under: Engineering, the register's one mount since fold F1c. */
  surfaceId: 'device-engineering';
}

export interface RiskRegisterState {
  programId: string | null;
  read: ProjectScopedRead<RawRiskItem>;
  rows: RiskRow[];
  row: RiskRow | undefined;
  sel: string;
  setSel: (id: string) => void;
  view: MatrixView;
  setView: (v: MatrixView) => void;
  summary: RiskSummary;
  riskState: AssessmentState;
  residualClear: boolean;
  /** The signed-in role may write (canGovernedWrite). The server decides either way. */
  canWrite: boolean;
  /** A hazard may be added here: a writing role, and a read that is the open project's. */
  mayAdd: boolean;
  form: boolean;
  setForm: (open: boolean) => void;
  ctrlForm: boolean;
  setCtrlForm: (open: boolean) => void;
  accepting: RiskRow | null;
  setAccepting: (r: RiskRow | null) => void;
  /** The selected accepted hazard's acceptance signature state; null when no accepted hazard is selected. */
  acceptanceSignature: SignedRecordRead | null;
  controlRead: RiskRecordRead;
  writes: ReturnType<typeof riskWrites>;
  toast: ReturnType<typeof useToast>[0];
  authUser: ReturnType<typeof useAuthUser>;
  /** What AnA can see of the register. Engineering hands it to the host, which publishes it under device-engineering. */
  anaContext: AnaContext;
}

function scopedRiskRead(live: ProjectScopedRead<RawRiskItem>, programId: string | null): ProjectScopedRead<RawRiskItem> {
  const badRows = live.status === 'ready' && (!riskRowsBelongToProject(live.rows, programId)
    || (live.rows.length > 0 && mapRiskItems(live.rows) === null));
  return badRows ? { ...live, status: 'unkeyed', rows: [], error: "The risk-file rows did not match this project's record." } : live;
}

export function useRiskRegister(opts: RiskRegisterOptions): RiskRegisterState {
  const owner = useRiskReadOwner(opts.programId);
  // REAL slice: GET /api/mdx/risk-items (server mdx-risk-management.ts) reads the
  // governed risk_items table — the project's rows, an honest empty, an honest failed load, or
  // an honest refusal, never a fixture. Raw rows carry numeric
  // severity/probability (1..5) plus nullable columns; mapRiskItems maps them
  // onto the RiskRow display contract null-safe. A stable EMPTY_ROWS stands in
  // until the read is the project's, so the re-seed effect below can't thrash.
  const live = useProjectScopedRead<RawRiskItem>('/api/mdx/risk-items', { ...opts, owner });
  const read = scopedRiskRead(live, opts.programId);
  const mapped = useMemo<RiskRow[]>(
    () => (read.status === 'ready' ? (mapRiskItems(read.rows) ?? EMPTY_ROWS) : EMPTY_ROWS),
    [read.status, read.rows],
  );
  const [rows, setRows] = useRiskOwnedState<RiskRow[]>(owner, EMPTY_ROWS);
  const [sel, setSel] = useRiskOwnedState<string>(owner, '');
  // Seed the optimistic-row store once the live risk file resolves; user-added
  // hazards before that are optimistic. `mapped` is a stable reference until
  // the read is ready, so this effect only fires on a real resolution.
  const seededRef = React.useRef<RiskRow[]>(EMPTY_ROWS);
  useEffect(() => {
    if (mapped !== seededRef.current) {
      seededRef.current = mapped;
      setRows(mapped);
      setSel(mapped[0]?.id ?? '');
    }
  }, [mapped, setRows, setSel]);
  const [view, setView] = useRiskOwnedState<MatrixView>(owner, 'initial');
  const [form, setForm] = useRiskOwnedState(owner, false);
  const [ctrlForm, setCtrlForm] = useRiskOwnedState(owner, false);
  const { toast, fire } = useRiskToast(owner);
  const authUser = useAuthUser();
  const canWrite = owner.current() && canGovernedWrite(authUser);
  /** The hazard whose signed residual-risk acceptance is open, if any. */
  const [accepting, setAccepting] = useRiskOwnedState<RiskRow | null>(owner, null);

  /* The selected hazard is the entity in context (window.C2C). */
  useEffect(() => {
    try {
      const r = rows.find(x => x.id === sel);
      const c2c = (window as any).C2C;
      if (c2c && r) c2c.setContext({ entityType: 'risk', entityId: r.id, entityLabel: r.id + ' — ' + (r.hazard || 'risk') });
    } catch { /* swallow */ }
  }, [sel, rows]);

  const row = rows.find(r => r.id === sel) || rows[0];
  useRiskMatrixActions(opts.surfaceId, { status: read.status, rows, row, view, setView, setSel, form, ctrlForm });

  const summary = useMemo(() => riskSummaryOf(rows), [rows]);

  /* ── What may be said about this risk file, and from which state ───────────
     assessmentState.ts, applied to ISO 14971. An empty hazard register is not a
     safe device; it is an unexamined one, and a register nobody has evaluated
     the residual risk of is the same thing one hazard at a time.

     `scopeExists` — hazards are actually recorded. Zero hazards is nothing an
     analysis could have run against, so it can never reach 'assessed-clear'.

     `findingCount` — hazards without a recorded acceptable residual risk, or
     sitting in the unacceptable band.

     `assessmentRan` — POSITIVE evidence that residual-risk evaluation happened:
     at least one hazard carries a determination a human recorded (the server's
     `acceptable` boolean, or the accepted status). This is a non-zero count of
     recorded evaluations, NOT the absence of findings; deriving it from
     `highResidual === 0` — the shape the copy used — is the defect itself. A
     register of hazards nobody has evaluated has `accepted === 0` and lands on
     'not-assessed', which is the honest answer.

     Read health comes from the read through assessmentStateFor, so a failed or
     in-flight read can never be spoken as an empty result — including the case
     where the read failed but a hazard written during this session leaves
     `rows` non-empty. */
  const riskState = assessmentStateFor(read, {
    scopeExists: summary.total > 0,
    findingCount: summary.outstanding,
    assessmentRan: summary.accepted > 0,
  });
  const residualClear = mayReassure(riskState);
  const readable = read.status !== 'refused' && read.status !== 'unkeyed' && read.status !== 'idle';
  /* The selected accepted hazard's residual-risk acceptance: whether its
     signature still binds the hazard and the controls it accepted, from GET
     /api/mdx/risk-items/:id `signedContent` (D5, 2026-10-29). Read for an
     accepted hazard only, the one the drawer shows with a signature. */
  const detailId = row?.dbId != null && readable ? row.dbId : null;
  const controlRead = useRiskRecordRead(detailId, opts.programId, owner, row?.status ?? '');
  const acceptanceSignature = row && isAccepted(row) && detailId !== null ? controlRead.signature : null;
  const anaContext = useMemo(
    () => riskAnaContext({ status: read.status, summary, view, row, riskState, canWrite, signature: acceptanceSignature, controls: controlRead }),
    [read.status, summary, view, row, riskState, canWrite, acceptanceSignature, controlRead],
  );
  const writes = riskWrites({ owner, programId: opts.programId, row, setRows, setSel, setForm, setCtrlForm, setAccepting, fire });
  const mayAdd = canWrite && readable;

  return {
    programId: opts.programId, read, rows, row, sel, setSel, view, setView, summary, riskState, residualClear,
    canWrite, mayAdd, form, setForm, ctrlForm, setCtrlForm, accepting, setAccepting, acceptanceSignature, controlRead, writes, toast, authUser, anaContext,
  };
}

/* ── The register, drawn ───────────────────────────────────────────────── */

const ctrlTone: Record<string, string> = { proposed: 'idle', implemented: 'ai', verified: 'warn', effective: 'ok' };
const stTone: Record<string, string> = { open: 'err', mitigating: 'warn', verified: 'ai', accepted: 'ok', closed: 'idle' };
const zone = (si: number, pi: number) => { const score = (si + 1) * (pi + 1); return score >= 15 ? 'err' : score >= 8 ? 'warn' : 'ok'; };
const enumLabel = (list: [string, string][], key: string) => (list.find(s => s[0] === key) || [])[1] || key;
const EN = RISK_ENUMS;

const HAZARD_FORM: C2CFormConfig = {
  eyebrow: 'ISO 14971 / risk item', title: 'New hazard',
  sub: 'Adds a hazard — hazardous situation — harm row and computes initial risk (severity x probability).',
  governed: 'Initial risk is the severity x probability product per ISO 14971. When the backend is connected the hazard is written to the governed risk file and audit-logged.',
  submitLabel: 'Add hazard',
  fields: [
    { key: 'hazard', label: 'Hazard', type: 'text', placeholder: 'e.g. Inaccurate glucose reading', required: true },
    { key: 'situation', label: 'Hazardous situation', type: 'text', placeholder: 'The circumstance that exposes the user to the hazard' },
    { key: 'harm', label: 'Harm', type: 'text', placeholder: 'e.g. Mis-dosing of insulin', required: true },
    { key: 'seq', label: 'Sequence of events', type: 'text', placeholder: 'Cause — situation — harm' },
    { key: 'sev', label: 'Severity', type: 'select', options: SEV_LABELS.map((s, i) => ({ value: s, label: s + ' (' + (i + 1) + ')' })), required: true },
    { key: 'prob', label: 'Probability', type: 'select', options: PROB_LABELS.map((p, i) => ({ value: p, label: p + ' (' + (i + 1) + ')' })), required: true },
    { key: 'strategy', label: 'Control strategy', type: 'select', options: EN.strategy.map(s => ({ value: s[0], label: s[1] })) },
    { key: 'source', label: 'Source', type: 'select', options: EN.source.map(s => ({ value: s[0], label: s[1] })) },
  ],
};

function controlForm(row: RiskRow | undefined): C2CFormConfig {
  return {
    eyebrow: 'Risk control / ' + (row?.id ?? ''), title: 'Add risk control',
    sub: 'Mitigation applied to ' + (row?.hazard ?? '') + '.',
    governed: 'Controls follow the ISO 14971 hierarchy: inherent safety — protective measure — information for safety.',
    submitLabel: 'Add control',
    fields: [
      { key: 'desc', label: 'Control description', type: 'text', placeholder: 'e.g. Dual-sensor cross-check rejects disagreeing readings', required: true },
      { key: 'type', label: 'Control type', type: 'select', options: EN.ctrlType.map(t => ({ value: t[0], label: t[1] })), required: true },
      { key: 'status', label: 'Status', type: 'select', options: EN.ctrlStatus.map(s => ({ value: s[0], label: s[1] })) },
    ],
  };
}

type Ask = (text: string) => void;
const DRAFT_RMF = 'Draft the ISO 14971 section 8 overall benefit-risk conclusion for the RMF';

/* The lead speaks the headline conclusion of the register, so it speaks only
   from a state that HAS an answer. `rows` can be non-empty while the read is in
   flight or has failed — a hazard written during this session survives a
   failed refresh — and the narrative would then describe the whole risk file
   from that one row. */
function RiskLead({ r, onAsk }: { r: RiskRegisterState; onAsk: Ask }) {
  const { summary, rows, row, riskState, residualClear } = r;
  if (!hasAnswer(riskState)) {
    return <UnresolvedLead state={riskState} eyebrow="Where the risk file stands right now" subject="hazards in the risk file" />;
  }
  const firstOpen = rows.find(x => x.status === 'open') || row;
  return (
    <AnswerLead
      tone={summary.highResidual > 0 || summary.open > 0 ? 'urgent' : 'calm'}
      eyebrow="Where the risk file stands right now"
      headline={summary.highResidual > 0
        ? <><b>{summary.highResidual}</b> residual risk{summary.highResidual === 1 ? '' : 's'} sit{summary.highResidual === 1 ? 's' : ''} in the <b>unacceptable</b> band and {summary.open > 0 ? <><b>{summary.open}</b> evaluation{summary.open === 1 ? '' : 's'} {summary.open === 1 ? 'is' : 'are'} still open.</> : 'must be reduced before the RMF can conclude.'}</>
        : summary.open > 0
          /* USED TO READ: "…still open — everything else is controlled to an
             acceptable level." False whenever a non-open hazard carries no
             recorded acceptance: a 'verified' hazard with `acceptable` NULL
             was counted as "everything else" and reported as controlled. */
          ? <><b>{summary.open}</b> risk evaluation{summary.open === 1 ? '' : 's'} {summary.open === 1 ? 'is' : 'are'} still open; <b>{summary.accepted}</b> of {summary.total} hazard{summary.total === 1 ? '' : 's'} carr{summary.accepted === 1 ? 'ies' : 'y'} a recorded acceptable residual risk.</>
          : residualClear
            /* USED TO READ: "All N hazards are controlled to an acceptable
               residual risk. The benefit-risk conclusion can proceed."
               Two defects in one sentence. It was selected by
               `highResidual === 0 && open === 0` — both EMPTY filters over a
               register whose residual risk had never been evaluated, so five
               hazards with `acceptable` NULL and scores under 15 read as
               fully controlled. And the second clause is a benefit-risk
               determination: under ISO 14971 that is a documented
               manufacturer decision, not a consequence of two counts reaching
               zero. What is left reports what the register shows and stops
               there. */
            ? <>All <b>{summary.total}</b> hazard{summary.total === 1 ? '' : 's'} carr{summary.total === 1 ? 'ies' : 'y'} a recorded acceptable residual risk, and none sit{summary.total === 1 ? 's' : ''} in the unacceptable band.</>
            : <><b>{summary.outstanding}</b> of {summary.total} hazard{summary.total === 1 ? '' : 's'} {summary.outstanding === 1 ? 'has' : 'have'} no recorded residual-risk acceptance. Residual risk is unevaluated for {summary.outstanding === 1 ? 'it' : 'those'}, not accepted.</>}
      body={
        /* USED TO READ: "Average risk dropped from X initial to Y residual …
           Each hazard carries its control chain and V&V evidence for the
           design history file." The drop is not a fact of the register — a
           hazard with no recorded residual probability maps `probR` to
           `prob`, so a file where nobody has re-scored anything reports the
           identical figure twice and calls it a reduction. The control-chain
           clause was flatly untrue: this screen reads the hazard register,
           which carries neither control lists nor verification evidence. */
        <>Mean risk score is <b>{summary.avgInitial}</b> initial and <b>{summary.avgResidual}</b> residual across {summary.total} hazard{summary.total === 1 ? '' : 's'}; {summary.accepted} carr{summary.accepted === 1 ? 'ies' : 'y'} a recorded acceptance. Controls are read for the selected hazard; DHF verification evidence is not read here.</>
      }
      reassure={
        /* "…from the controlled residual risks" presumed the controls this
           screen cannot see. The human approval it names is unchanged. */
        'I will draft the benefit-risk rationale and the RMF section 8 conclusion from the recorded residual risks and their acceptance decisions — you approve the judgment.'
      }
      action={summary.open > 0 && firstOpen
        ? { label: 'Open the ' + firstOpen.id + ' evaluation', onClick: () => r.setSel(firstOpen.id) }
        /* Drafting the RMF conclusion is only offered once the register
           actually supports one. It used to be the else-branch of "is
           anything open", so it was offered over a register with no
           residual-risk evaluation in it at all. */
        : summary.firstOutstanding
          ? { label: 'Open the ' + summary.firstOutstanding.id + ' evaluation', onClick: () => r.setSel(summary.firstOutstanding!.id) }
          : { label: 'Draft RMF conclusion', onClick: () => onAsk(DRAFT_RMF) }}
      secondary="Or work the matrix and hazards below."
    />
  );
}

function RiskMetrics({ summary, residualClear }: { summary: RiskSummary; residualClear: boolean }) {
  return (
    <div className="metrics">
      <div className="metric"><div className="metric-l">Hazards identified</div><div className="metric-n" style={{ fontSize: 22 }}>{summary.total}</div></div>
      {/* The tone was the literal "ok" — the green, good-news treatment — on
          every register including "Residual acceptable 0 / 12", where the
          colour is the only thing a scanning reader takes from the tile and
          it said the opposite of the number beside it. */}
      <div className="metric" data-tone={summary.accepted === summary.total ? 'ok' : ''}><div className="metric-l">Residual acceptable</div><div className="metric-n" style={{ fontSize: 22 }}>{summary.accepted} / {summary.total}</div></div>
      <div className="metric" data-tone={summary.open ? 'warn' : ''}><div className="metric-l">Open evaluations</div><div className="metric-n" style={{ fontSize: 22 }}>{summary.open}</div></div>
      {/* The green tone here used to be the else-branch of a count: zero
          hazards at 15 or more read as good news even over a register where
          no residual probability has been recorded and every "residual"
          score is really the initial one. The count stays as it is — it is
          computed from recorded severity and probability — but the good-news
          colour waits for the residual evaluation to have happened. */}
      <div className="metric" data-tone={summary.highResidual ? 'err' : residualClear ? 'ok' : ''}><div className="metric-l">High residual (&gt;=15)</div><div className="metric-n" style={{ fontSize: 22 }}>{summary.highResidual}</div></div>
    </div>
  );
}

function RiskMatrix({ r, onAsk }: { r: RiskRegisterState; onAsk: Ask }) {
  const { view, setView, rows, sel, setSel, summary } = r;
  const rowProb = (h: RiskRow) => (view === 'residual' ? (h.probR || h.prob) : h.prob);
  return (
    <div className="sec">
      <div className="sec-hdr">
        <div className="sec-title">Risk matrix</div>
        <div className="seg" style={{ marginLeft: 'auto' }}>
          <button className={`seg-b${view === 'initial' ? ' on' : ''}`} onClick={() => setView('initial')}>Initial</button>
          <button className={`seg-b${view === 'residual' ? ' on' : ''}`} onClick={() => setView('residual')}>Residual</button>
        </div>
      </div>
      <div className="sec-sub" style={{ marginTop: -6, marginBottom: 10 }}>severity x probability / {view === 'residual' ? 'after risk controls (ISO 14971 section 7)' : 'pre-mitigation'}</div>
      <div className="riskmx">
        <div className="riskmx-corner" />
        {SEV_LABELS.map((s) => (<div key={s} className="riskmx-col">{s}</div>))}
        {[...PROB_LABELS].reverse().map((p) => {
          const pi = PROB_LABELS.indexOf(p);
          return (
            <React.Fragment key={p}>
              <div className="riskmx-row">{p}</div>
              {SEV_LABELS.map((s, si) => {
                const hz = rows.filter(h => sevI(h.sev) === si && probI(rowProb(h)) === pi);
                return (
                  <div key={s} className={`riskmx-cell tone-${zone(si, pi)}`}>
                    {hz.map(h => (
                      <button key={h.id} className="riskmx-dot" data-on={sel === h.id || undefined} data-moved={(view === 'residual' && h.probR && h.probR !== h.prob) || undefined} title={h.id + ' / ' + h.hazard} onClick={() => setSel(h.id)}>{h.id.replace('HZ-', '')}</button>
                    ))}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
      <div className="riskmx-legend"><span><i className="z ok" />Acceptable</span><span><i className="z warn" />ALARP</span><span><i className="z err" />Unacceptable</span></div>
      {/* USED TO READ: "Benefit-risk: favorable" whenever
          `summary.highResidual` was 0 — a determination the surface is not
          entitled to make, selected by a filter that is EMPTY over a
          register nobody has evaluated. Two states produced the identical
          green "favorable": a device whose residual risks were assessed and
          accepted, and a register of hazards with `acceptable` NULL and
          every score under 15. Under ISO 14971 the overall benefit-risk
          conclusion is a documented manufacturer decision recorded in the
          risk management file; it is not a consequence of a count reaching
          zero, and it is not made on this screen. The counts the analysis
          actually found are reported instead, and the citation is
          unchanged. */}
      <div className="risk-br">
        {I.shieldCheck}
        <span><b>Benefit-risk: not concluded here</b> — {summary.accepted} of {summary.total} residual risk{summary.total === 1 ? '' : 's'} carr{summary.accepted === 1 ? 'ies' : 'y'} a recorded acceptance; {summary.open} open evaluation{summary.open === 1 ? '' : 's'}; {summary.highResidual} at a residual score of 15 or more. The overall conclusion (ISO 14971 section 8) is a documented manufacturer decision.</span>
        <button className="risk-br-cta" onClick={() => onAsk(DRAFT_RMF)}>{I.sparkles} Draft RMF conclusion</button>
      </div>
    </div>
  );
}

function HazardChain({ row }: { row: RiskRow }) {
  const sevTone = row.sev === 'Critical' || row.sev === 'Catastrophic' ? 'err' : row.sev === 'Serious' ? 'warn' : 'idle';
  return (
    <div className="risk-chain">
      <div className="rc-row"><span className="rc-k">Hazardous situation</span><span className="rc-v">{row.situation || '—'}</span></div>
      <div className="rc-row"><span className="rc-k">Harm</span><span className="rc-v">{row.harm}</span></div>
      {row.seq && <div className="rc-row"><span className="rc-k">Sequence of events</span><span className="rc-v">{row.seq}</span></div>}
      <div className="rc-row"><span className="rc-k">Severity</span><span className="rc-v"><span className={`rd-chip tone-${sevTone}`}>{row.sev} ({sevI(row.sev) + 1})</span></span></div>
      <div className="rc-row"><span className="rc-k">Probability</span><span className="rc-v">{row.prob} ({probI(row.prob) + 1}){row.probR && row.probR !== row.prob && <span className="rc-move"> — {row.probR} <span className="rc-move-tag">after controls</span></span>}</span></div>
      <div className="rc-row"><span className="rc-k">Strategy</span><span className="rc-v">{enumLabel(EN.strategy, row.strategy)} / {enumLabel(EN.source, row.source)}</span></div>
      <div className="rc-row"><span className="rc-k">Residual risk</span><span className="rc-v"><span className={`rd-chip tone-${row.res === 'Acceptable' ? 'ok' : 'warn'}`}>{row.res}</span></span></div>
      {/* USED TO READ: an em dash whenever `ver` was empty — which is
          every hazard the register read produces, because the mapper has
          no verification column to map and sets `ver: ''` on every row.
          A dash in a key/value list reads as "nothing recorded"; the
          honest statement is that this screen does not read it. */}
      <div className="rc-row"><span className="rc-k">Verification (DHF)</span><span className="rc-v">{row.ver || 'Not read on this screen'}</span></div>
    </div>
  );
}

function HazardControls({ row, read }: { row: RiskRow; read: RiskRecordRead }) {
  const controls = [...new Map([...read.controls, ...(row.controls || [])].map(c => [c.id, c])).values()];
  return (
    <div className="risk-ctrls">
      {controls.map(c => (
        <div key={c.id} className="risk-ctrl">
          <span className="risk-ctrl-t">{c.desc}</span>
          <span className="risk-ctrl-m"><span className="mono">{enumLabel(EN.ctrlType, c.type)}</span><span className={`rd-chip tone-${ctrlTone[c.status] || 'idle'}`}>{enumLabel(EN.ctrlStatus, c.status)}</span></span>
        </div>
      ))}
      {read.loading && <p role="status" className="sp-q-s">Loading risk controls…</p>}
      {read.refusal ? <ReadRefused refusal={read.refusal} what="risk controls" retry={read.retry} testId="risk-controls-refused" />
        : read.error && <div role="status" className="sp-q-s">Couldn't load the risk controls. Their absence here is not a record that none exist.
          <button type="button" className="btn ghost small" onClick={read.retry}>Try controls again</button></div>}
      {read.ready && controls.length === 0 && <p className="sp-q-s">No controls yet — add the first risk control.</p>}
    </div>
  );
}

/* The write controls are offered only to a role that can write (canGovernedWrite). */
function HazardDrawer({ r, row, onAsk }: { r: RiskRegisterState; row: RiskRow; onAsk: Ask }) {
  return (
    <aside className="risk-drawer">
      <div className="dr-eyebrow">{row.id} / hazard<span className={`rd-chip tone-${stTone[row.status] || 'idle'}`} style={{ marginLeft: 8 }}>{enumLabel(EN.status, row.status)}</span></div>
      <div className="dr-title">{row.hazard}</div>
      <HazardChain row={row} />
      {r.acceptanceSignature && (
        <div style={{ marginTop: 8 }}>
          <SignedContentLine facet={r.acceptanceSignature.reading ? null : r.acceptanceSignature.facet} expected
            reading={r.acceptanceSignature.reading} label="Acceptance signature" testId="risk-acceptance-signature" />
        </div>
      )}

      <div className="pj-seclbl" style={{ margin: '14px 0 8px' }}>Risk controls <span className="s">/ ISO 14971 section 7</span></div>
      <HazardControls row={row} read={r.controlRead} />
      {r.canWrite && <button className="btn ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => r.setCtrlForm(true)}>{I.plus} Add risk control</button>}

      {row.open && <div className="risk-flag" style={{ marginTop: 10 }}>{I.alertTriangle} Open evaluation — residual risk not yet accepted. Benefit-risk justification required before section 2.3.</div>}
      <div className="cm-pushbar" style={{ marginTop: 10 }}>
        {r.canWrite && row.status !== 'accepted' && <button className="btn ghost" onClick={() => r.writes.openAcceptance(row)}>{I.penLine} Accept residual</button>}
        <button className="btn ghost" onClick={() => onAsk('Draft the benefit-risk rationale for ' + row.id)}>{I.sparkles} Draft benefit-risk</button>
      </div>
    </aside>
  );
}

/* Every state the read can be in that is not a register, in words. */
function UnreadRegister({ r }: { r: RiskRegisterState }) {
  const { read } = r;
  if (read.refusal) {
    return <ProjectRefused refusal={read.refusal} onRetry={read.retry} record="risk record" testId="risk-project-refused" />;
  }
  if (read.status === 'unkeyed') {
    return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title="Couldn't load this project's risk file"
        hint="The risk-file read did not say it was this project's, so no hazard is shown under it. Reload, or check the service is current."
        retry={read.retry}
      />
    );
  }
  if (read.status === 'idle') {
    return <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>The risk file is held per project. Open a project to see its hazards.</div>;
  }
  if (read.status === 'loading') {
    return <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading the risk file…</div>;
  }
  if (read.status === 'error') {
    return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title="Couldn't load the risk file"
        hint={`The ISO 14971 risk file didn't respond. These are ${r.programId ? "this project's" : "the organization's"} governed hazards, risk controls and residual-risk evaluations — sign in and retry, or check the service is reachable.`}
        retry={read.retry}
      />
    );
  }
  return (
    <EmptyState
      icon={I.shieldCheck}
      title="No hazards in the risk file yet"
      hint={r.canWrite
        ? 'Add the first hazard with New hazard above — a hazard / hazardous-situation / harm row. AnA computes its initial risk (severity x probability), tracks its risk controls and residual risk, and threads it into the ISO 14971 risk management file.'
        : 'Nothing is recorded in this risk file yet. Your role can read it but cannot add hazards.'}
    />
  );
}

/** Whether the register itself is drawn: a row exists and the read did not refuse it or answer for another project. */
function drawsRegister(r: RiskRegisterState): r is RiskRegisterState & { row: RiskRow } {
  return !!r.row && r.read.status !== 'refused' && r.read.status !== 'unkeyed' && r.read.status !== 'idle';
}

/**
 * The register: its lead, metrics, matrix and drawer, or the state of its read
 * in words; its forms, the signature dialog and its toast. The screen draws
 * its own header and "New hazard" (offered when `register.canWrite`, enabled
 * when `register.mayAdd`).
 */
export function RiskRegister({ register: r, onAsk }: { register: RiskRegisterState; onAsk: Ask }) {
  return (
    <>
      {!r.canWrite && (
        <p className="scaf-note" role="note" data-testid="risk-view-only">
          View only. Your role can read this risk file but cannot add hazards or risk controls, or accept residual risk.
        </p>
      )}
      {drawsRegister(r) ? (
        <>
          <RiskLead r={r} onAsk={onAsk} />
          <RiskMetrics summary={r.summary} residualClear={r.residualClear} />
          <div className="risk-split">
            <RiskMatrix r={r} onAsk={onAsk} />
            <HazardDrawer r={r} row={r.row} onAsk={onAsk} />
          </div>
        </>
      ) : (
        <UnreadRegister r={r} />
      )}

      {r.form && <C2CForm config={HAZARD_FORM} onCancel={() => r.setForm(false)} onSubmit={r.writes.addHazard} />}
      {r.ctrlForm && <C2CForm config={controlForm(r.row)} onCancel={() => r.setCtrlForm(false)} onSubmit={r.writes.addControl} />}
      {r.accepting && (
        <EsignModal
          open
          action={'Accept the residual risk of ' + r.accepting.id}
          target={r.accepting.id + ' — ' + (r.accepting.hazard || 'hazard')}
          targetMeta="Your signature accepts this hazard’s residual risk as it stands, under ISO 14971."
          meanings={RESIDUAL_ACCEPTANCE_MEANINGS}
          defaultMeaning="approval"
          signer={esignSignerOf(r.authUser)}
          requireMfa={r.authUser?.mfaEnabled === true}
          onClose={() => r.setAccepting(null)}
          onSign={(input) => r.writes.signAcceptance(r.accepting as RiskRow, input)}
        />
      )}
      <C2CToast msg={r.toast} />
    </>
  );
}
