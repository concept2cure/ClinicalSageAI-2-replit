import React, { useState, useMemo, useEffect } from 'react';

import { usePublishSurfaceContext } from '../surfaceContext';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { I } from '../icons';
import { EmptyState, useLiveRows } from '../dataConnect';
import { apiRequest, extractApiError } from '@/lib/queryClient';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';
// SEV_LABELS / PROB_LABELS / RISK_ENUMS are canonical ISO 14971 reference config
// (the severity + probability scales and the control/status/source enums that
// mirror the backend's zod validators) — kept. RISK_ROWS was the display DATA
// fixture and is gone: the surface now reads the org's real risk file.
import { RISK_ENUMS, SEV_LABELS, PROB_LABELS } from '../fixtures/risk-data';
import type { RiskRow, RiskControl } from '../fixtures/risk-data';
import { C2CToast, useToast } from '../toast';

/* ---- Risk management (ISO 14971) ---- */

/* Raw risk_items row as returned by GET /api/mdx/risk-items (server
   mdx-risk-management.ts — SELECT * FROM risk_items, org-scoped). severity and
   probability are integers on the ISO 14971 1..5 scale; every column that can be
   NULL in the table is typed `| null` here and mapped null-safe by mapRiskItems,
   so the surface never fabricates a value the backend did not return. */
interface RawRiskItem {
  id: number;
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
   loading or unavailable. useLiveRows synthesizes a fresh [] on every render
   until it resolves; feeding a module-level constant into the re-seed effect
   keeps it from thrashing ("Maximum update depth exceeded"). */
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

export function Risk({ onAsk }: SurfaceViewProps) {
  // REAL slice: GET /api/mdx/risk-items (server mdx-risk-management.ts) reads the
  // org's governed risk_items table via pg `pool` — org-scoped real rows, an
  // honest empty, or an honest failed load, never a fixture. Raw rows carry
  // numeric severity/probability (1..5) plus nullable columns; mapRiskItems maps
  // them onto the RiskRow display contract null-safe (an absent column is never
  // fabricated). A stable EMPTY_ROWS stands in while loading/errored so the
  // re-seed effect below can't thrash.
  const live = useLiveRows<RawRiskItem>('/api/mdx/risk-items');
  const mapped = useMemo<RiskRow[]>(
    () => (live.loading || live.error ? EMPTY_ROWS : (mapRiskItems(live.rows) ?? EMPTY_ROWS)),
    [live.loading, live.error, live.rows],
  );
  const [rows, setRows] = useState<RiskRow[]>(EMPTY_ROWS);
  const [sel, setSel] = useState<string>('');
  // Seed the optimistic-row store once the live risk file resolves; user-added
  // hazards before that are optimistic. `mapped` is a stable reference while
  // loading/errored, so this effect only fires on a real resolution.
  const seededRef = React.useRef<RiskRow[]>(EMPTY_ROWS);
  useEffect(() => {
    if (mapped !== seededRef.current) {
      seededRef.current = mapped;
      setRows(mapped);
      setSel(mapped[0]?.id ?? '');
    }
  }, [mapped]);
  const [view, setView] = useState<'initial' | 'residual'>('initial');
  const [form, setForm] = useState(false);
  const [ctrlForm, setCtrlForm] = useState(false);
  const [toast, fire] = useToast();

  useEffect(() => {
    try {
      const r = rows.find(x => x.id === sel);
      const c2c = (window as any).C2C;
      if (c2c && r) c2c.setContext({ entityType: 'risk', entityId: r.id, entityLabel: r.id + ' -- ' + (r.hazard || 'risk') });
    } catch (_e) { /* swallow */ }
  }, [sel, rows]);

  const EN = RISK_ENUMS;
  const sevI = (s: string) => Math.max(0, SEV_LABELS.indexOf(s as any));
  const probI = (p: string) => Math.max(0, PROB_LABELS.indexOf(p as any));
  const rowProb = (r: RiskRow) => view === 'residual' ? (r.probR || r.prob) : r.prob;
  const zone = (si: number, pi: number) => { const score = (si + 1) * (pi + 1); return score >= 15 ? 'err' : score >= 8 ? 'warn' : 'ok'; };
  const row = rows.find(r => r.id === sel) || rows[0];

  /* ── AnA's hands on this screen — the surface-action bus ──────────────────
     Registered under 'risk' (identity-mapped nav target). Every handler
     drives the SAME state the human's own controls drive (setView, setSel via
     the matrix dots and register rows); hazards resolve against the REAL risk
     file with honest misses. Accepting residual risk, adding hazards, and
     adding controls stay governed human acts, untouched. */
  const riskFormGuard = (): { ok: false; reason: string } | null => {
    if (form) return { ok: false, reason: 'The new-hazard form is open — close it first.' };
    if (ctrlForm) return { ok: false, reason: 'The add-control form is open — close it first.' };
    return null;
  };
  useSurfaceActionHandlers('risk', {
    'risk.set-matrix-view': (params) => {
      const guarded = riskFormGuard();
      if (guarded) return guarded;
      const target = (params.view ?? '').trim();
      if (target !== 'initial' && target !== 'residual') {
        return { ok: false, reason: 'View must be initial or residual.' };
      }
      // The matrix renders only once a row exists; until the read settles a
      // refusal would be false, so the bus holds the directive instead.
      if (live.loading && !row)
        return { ok: false, reason: 'The risk file is still loading.', retry: true };
      if (live.error && !row) return { ok: false, reason: 'The risk file could not be read.' };
      if (!row) return { ok: false, reason: 'The risk file is empty.' };
      setView(target);
      return { ok: true, detail: `Showing the ${target} matrix` };
    },
    'risk.select-hazard': (params) => {
      const guarded = riskFormGuard();
      if (guarded) return guarded;
      const wanted = (params.hazard ?? '').trim();
      if (!wanted) return { ok: false, reason: 'No hazard named.' };
      // MANDATORY hold while loading: the seed effect overwrites `sel` when
      // the read lands, so an early select would be silently clobbered.
      if (live.loading)
        return { ok: false, reason: 'The risk file is still loading.', retry: true };
      if (live.error) return { ok: false, reason: 'The risk file could not be read.' };
      if (rows.length === 0) return { ok: false, reason: 'The risk file is empty.' };
      const lower = wanted.toLowerCase();
      const exact = rows.find((r) => r.id.toLowerCase() === lower);
      const contains = exact
        ? []
        : rows.filter(
            (r) => r.id.toLowerCase().includes(lower) || (r.hazard || '').toLowerCase().includes(lower),
          );
      const match = exact ?? (contains.length === 1 ? contains[0] : null);
      if (!match) {
        return {
          ok: false,
          reason:
            contains.length > 1
              ? `"${params.hazard}" matches ${contains.length} hazards — name one exactly.`
              : `No hazard matching "${params.hazard}" in the risk file.`,
        };
      }
      setSel(match.id);
      return { ok: true, detail: `Opened ${match.id} — ${match.hazard || 'hazard'}` };
    },
    'risk.focus-cell': (params) => {
      const guarded = riskFormGuard();
      if (guarded) return guarded;
      if (live.loading)
        return { ok: false, reason: 'The risk file is still loading.', retry: true };
      if (live.error) return { ok: false, reason: 'The risk file could not be read.' };
      if (rows.length === 0) return { ok: false, reason: 'The risk file is empty.' };
      const sev = (params.severity ?? '').trim();
      const prob = (params.probability ?? '').trim();
      const si = SEV_LABELS.indexOf(sev as (typeof SEV_LABELS)[number]);
      const pi = PROB_LABELS.indexOf(prob as (typeof PROB_LABELS)[number]);
      if (si < 0 || pi < 0) return { ok: false, reason: 'Unknown severity or probability band.' };
      const requestedView =
        params.view === 'initial' || params.view === 'residual' ? params.view : view;
      if (requestedView !== view) setView(requestedView);
      // The SAME derivation the matrix dots render from, against the requested band.
      const bandProb = (r: RiskRow) =>
        requestedView === 'residual' ? (r.probR || r.prob) : r.prob;
      const hz = rows.filter((r) => sevI(r.sev) === si && probI(bandProb(r)) === pi);
      if (hz.length === 0) {
        return {
          ok: false,
          reason: `No hazard sits at ${sev} × ${prob} in the ${requestedView} matrix.`,
        };
      }
      setSel(hz[0].id);
      return {
        ok: true,
        detail:
          hz.length === 1
            ? `Focused ${hz[0].id} at ${sev} × ${prob}`
            : `Focused ${hz[0].id} — first of ${hz.length} hazards at ${sev} × ${prob}`,
      };
    },
  });
  /* The ready signal for the retry contract above. */
  useEffect(() => {
    if (!live.loading) notifySurfaceActionReady('risk');
  }, [live.loading]);

  const summary = useMemo(() => {
    const prod = (r: RiskRow, resid: boolean) => { const si = sevI(r.sev) + 1; const pi = (probI(resid ? (r.probR || r.prob) : r.prob)) + 1; return si * pi; };
    const total = rows.length;
    const open = rows.filter(r => r.status === 'open' || r.status === 'mitigating').length;
    const accepted = rows.filter(r => r.status === 'accepted' || r.res === 'Acceptable').length;
    const highResidual = rows.filter(r => prod(r, true) >= 15).length;
    const avgInitial = (rows.reduce((s, r) => s + prod(r, false), 0) / (total || 1)).toFixed(1);
    const avgResidual = (rows.reduce((s, r) => s + prod(r, true), 0) / (total || 1)).toFixed(1);
    return { total, open, accepted, highResidual, avgInitial, avgResidual };
  }, [rows, view]);

  /* What AnA can see of this screen.
     She knew the user was on "risk" and nothing else — not how many hazards are
     open, how many carry a high residual score, or which one is selected — so
     "what still needs mitigation?" required the user to read their own risk
     file back to her.

     A failed read publishes the failure. `rows` is EMPTY_ROWS both when the
     governed risk file is genuinely empty and when the read threw, and
     "0 open risks" over an outage is the most dangerous sentence this surface
     could produce: it reads as a clean risk file to the person accountable for
     one. */
  const anaContext = useMemo(() => {
    if (live.loading) {
      return { summary: 'The risk file is still loading; nothing on screen is final yet.' };
    }
    if (live.error) {
      return {
        summary:
          'The risk file could not be read, so this screen shows no hazards because of a failure, not because none are recorded.',
        availableActions: ['Retry the risk-file read'],
      };
    }
    return {
      summary:
        `Risk management (ISO 14971): ${summary.total} hazard(s) — ${summary.open} open or mitigating, ` +
        `${summary.accepted} accepted, ${summary.highResidual} with a residual score of 15 or more. ` +
        `Mean score ${summary.avgInitial} initial, ${summary.avgResidual} residual. ` +
        `Matrix showing ${view} risk` +
        (row ? `; "${row.id} — ${row.hazard || 'hazard'}" selected` : ''),
      facts: {
        totalHazards: summary.total,
        openOrMitigating: summary.open,
        accepted: summary.accepted,
        highResidual: summary.highResidual,
        meanInitialScore: summary.avgInitial,
        meanResidualScore: summary.avgResidual,
        matrixView: view,
        selected: row
          ? {
              id: row.id, hazard: row.hazard, severity: row.sev,
              probability: row.prob, residualProbability: row.probR ?? null,
              status: row.status, residualAcceptability: row.res ?? null,
            }
          : null,
      },
      availableActions: [
        'Open a hazard to see its severity, probability and controls',
        'Add a hazard to the governed risk file',
        'Add a control to the selected hazard',
        'Switch the matrix between initial and residual risk',
      ],
    };
  }, [live.loading, live.error, summary, view, row]);
  usePublishSurfaceContext('risk', anaContext);

  // addHazard — REAL, awaited write. POSTs to the governed risk file and adopts
  // the SERVER's row via mapRiskItems (real ref_code + numeric dbId, authoritative
  // status/acceptability). No optimistic HZ-<n> id; the success toast fires only
  // after the write is confirmed, and any failure is stated with nothing added.
  const addHazard = async (v: Record<string, string>) => {
    if (!v.hazard || !v.harm) { fire('Hazard and harm are required'); return; }
    const sev = v.sev || 'Serious';
    const prob = v.prob || 'Occasional';
    try {
      const res = await apiRequest('POST', '/api/mdx/risk-items', {
        hazard: v.hazard, hazardousSituation: v.situation || '', harm: v.harm,
        sequenceOfEvents: v.seq || '', severity: sevI(sev) + 1, probability: probI(prob) + 1,
        detectability: Number(v.det) || 3, controlStrategy: v.strategy || 'design_reduce', source: v.source || 'other',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { fire('Couldn’t add the hazard — ' + errText(json, res.status) + '. Nothing was saved.'); return; }
      const adopted = mapRiskItems([envRow(json)])?.[0];
      if (!adopted) { fire('Saved, but the server returned an unexpected shape — reload to see it'); return; }
      setRows(rs => [{ ...adopted, _new: true }, ...rs.filter(r => r.id !== adopted.id)]);
      setSel(adopted.id); setForm(false);
      fire('Hazard ' + adopted.id + ' saved · status ' + adopted.status);
    } catch (e) {
      // A caught throw is only safe to render when it is an ApiRequestError: its
      // message has already been through the same reduction as errText above.
      // Anything else reaching here is a browser-native fetch rejection, whose
      // message ("Failed to fetch", "Load failed") is not user copy.
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      const msg = known && (e as Error).message
        ? clause((e as Error).message)
        : 'the risk file could not be reached';
      fire('Couldn’t add the hazard — ' + msg + '. Nothing was saved.');
    }
  };

  // addControl — REAL, awaited write. POSTs to the risk item's controls
  // (addressed by its numeric dbId — the route requires a numeric :id) and adopts
  // the SERVER's risk_controls row (real id). Nothing is added on failure; the
  // former fabricated RC-<n> id and swallowed error are gone.
  const addControl = async (v: Record<string, string>) => {
    if (!row) return;
    if (row.dbId == null) { fire('This hazard isn’t in the governed file yet — reload before adding controls'); return; }
    try {
      const res = await apiRequest('POST', '/api/mdx/risk-items/' + row.dbId + '/controls', {
        description: v.desc, controlType: v.type || 'protective_measure', status: v.status || 'proposed',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { fire('Couldn’t add the control — ' + errText(json, res.status) + '. Nothing was saved.'); return; }
      const cr = envRow(json) as Record<string, unknown> | null;
      if (!cr || typeof cr !== 'object') { fire('Saved, but the server returned an unexpected shape — reload to see it'); return; }
      const nc: RiskControl = {
        id: cr.id != null ? String(cr.id) : '',
        desc: typeof cr.description === 'string' ? cr.description : v.desc,
        type: typeof cr.control_type === 'string' ? cr.control_type : (v.type || 'protective_measure'),
        status: typeof cr.status === 'string' ? cr.status : (v.status || 'proposed'),
      };
      setRows(rs => rs.map(r => r.id === row.id ? { ...r, controls: [...(r.controls || []), nc] } : r));
      setCtrlForm(false);
      fire('Risk control saved to ' + row.id);
    } catch (e) {
      // Same restriction as addHazard: only an ApiRequestError message has been
      // reduced to user copy; a native fetch rejection must not reach the toast.
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      const msg = known && (e as Error).message
        ? clause((e as Error).message)
        : 'the risk file could not be reached';
      fire('Couldn’t add the control — ' + msg + '. Nothing was saved.');
    }
  };

  // setStatus — REAL, awaited PATCH (addressed by numeric dbId). Adopts the
  // SERVER's updated row so status AND residual acceptability (res) come from the
  // authoritative `acceptable` boolean — the old code flipped res to 'Acceptable'
  // locally on accept/verify, overstating acceptability the backend hadn't
  // recorded. Controls are preserved (the item PATCH doesn't return them).
  const setStatus = async (id: string, st: string) => {
    const cur = rows.find(r => r.id === id);
    if (!cur) return;
    if (cur.dbId == null) { fire('This hazard isn’t in the governed file yet — reload before changing its status'); return; }
    try {
      const res = await apiRequest('PATCH', '/api/mdx/risk-items/' + cur.dbId, { status: st });
      const json = await res.json().catch(() => null);
      if (!res.ok) { fire('Couldn’t update the status — ' + errText(json, res.status) + '. Nothing was persisted.'); return; }
      const adopted = mapRiskItems([envRow(json)])?.[0];
      setRows(rs => rs.map(r => r.id === id ? (adopted ? { ...adopted, controls: r.controls } : { ...r, status: st }) : r));
      fire(id + ' → ' + st);
    } catch (e) {
      // Same restriction as addHazard: only an ApiRequestError message has been
      // reduced to user copy; a native fetch rejection must not reach the toast.
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      const msg = known && (e as Error).message
        ? clause((e as Error).message)
        : 'the risk file could not be reached';
      fire('Couldn’t update the status — ' + msg + '. Nothing was persisted.');
    }
  };

  const ctrlTone: Record<string, string> = { proposed: 'idle', implemented: 'ai', verified: 'warn', effective: 'ok' };
  const stTone: Record<string, string> = { open: 'err', mitigating: 'warn', verified: 'ai', accepted: 'ok', closed: 'idle' };

  const hazardFormConfig: C2CFormConfig = {
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

  const ctrlFormConfig: C2CFormConfig = {
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

  return (
    <div className="page-inner">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Specialist / device</div>
          <h1 className="ph-title">Risk management</h1>
          <div className="ph-sub">ISO 14971 risk file — hazard analysis, 5x5 risk matrix, risk controls, residual risk and benefit-risk.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => onAsk('Summarize the open risk evaluations')}>{I.sparkles} Ask AnA</button>
          <button className="btn primary" onClick={() => setForm(true)}>{I.plus} New hazard</button>
        </div>
      </div>

      {live.loading && !row ? (
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading the risk file…</div>
      ) : live.error && !row ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the risk file"
          hint="The ISO 14971 risk file didn't respond. These are the organization's governed hazards, risk controls and residual-risk evaluations — sign in and retry, or check the service is reachable."
        />
      ) : !row ? (
        <EmptyState
          icon={I.shieldCheck}
          title="No hazards in the risk file yet"
          hint="Add the first hazard with New hazard above — a hazard / hazardous-situation / harm row. AnA computes its initial risk (severity x probability), tracks its risk controls and residual risk, and threads it into the ISO 14971 risk management file."
        />
      ) : (
      <>
      <AnswerLead
        tone={summary.highResidual > 0 || summary.open > 0 ? 'urgent' : 'calm'}
        eyebrow="Where the risk file stands right now"
        headline={summary.highResidual > 0
          ? <><b>{summary.highResidual}</b> residual risk{summary.highResidual === 1 ? '' : 's'} sit{summary.highResidual === 1 ? 's' : ''} in the <b>unacceptable</b> band and {summary.open > 0 ? <><b>{summary.open}</b> evaluation{summary.open === 1 ? '' : 's'} {summary.open === 1 ? 'is' : 'are'} still open.</> : 'must be reduced before the RMF can conclude.'}</>
          : summary.open > 0
            ? <><b>{summary.open}</b> risk evaluation{summary.open === 1 ? '' : 's'} {summary.open === 1 ? 'is' : 'are'} still open — everything else is controlled to an acceptable level.</>
            : <>All <b>{summary.total}</b> hazards are controlled to an acceptable residual risk. The benefit-risk conclusion can proceed.</>}
        body={<>Average risk dropped from <b>{summary.avgInitial}</b> initial to <b>{summary.avgResidual}</b> residual across {summary.total} hazards; {summary.accepted} accepted. Each hazard carries its control chain and V&amp;V evidence for the design history file.</>}
        reassure="I will draft the benefit-risk rationale and the RMF section 8 conclusion from the controlled residual risks — you approve the judgment."
        action={summary.open > 0
          ? { label: 'Open the ' + (rows.find(r => r.status === 'open') || row).id + ' evaluation', onClick: () => setSel((rows.find(r => r.status === 'open') || row).id) }
          : { label: 'Draft RMF conclusion', onClick: () => onAsk('Draft the ISO 14971 section 8 overall benefit-risk conclusion for the RMF') }}
        secondary="Or work the matrix and hazards below."
      />

      <div className="metrics">
        <div className="metric"><div className="metric-l">Hazards identified</div><div className="metric-n" style={{ fontSize: 22 }}>{summary.total}</div></div>
        <div className="metric" data-tone="ok"><div className="metric-l">Residual acceptable</div><div className="metric-n" style={{ fontSize: 22 }}>{summary.accepted} / {summary.total}</div></div>
        <div className="metric" data-tone={summary.open ? 'warn' : ''}><div className="metric-l">Open evaluations</div><div className="metric-n" style={{ fontSize: 22 }}>{summary.open}</div></div>
        <div className="metric" data-tone={summary.highResidual ? 'err' : 'ok'}><div className="metric-l">High residual (&gt;=15)</div><div className="metric-n" style={{ fontSize: 22 }}>{summary.highResidual}</div></div>
      </div>

      <div className="risk-split">
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
                    const hz = rows.filter(r => sevI(r.sev) === si && probI(rowProb(r)) === pi);
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
          <div className="risk-br">
            {I.shieldCheck}
            <span><b>Benefit-risk: {summary.highResidual ? 'gated' : 'favorable'}</b> — {summary.accepted} of {summary.total} residual risks Acceptable; {summary.open} open evaluation{summary.open === 1 ? '' : 's'} gate{summary.open === 1 ? 's' : ''} the RMF conclusion (ISO 14971 section 8).</span>
            <button className="risk-br-cta" onClick={() => onAsk('Draft the ISO 14971 section 8 overall benefit-risk conclusion for the RMF')}>{I.sparkles} Draft RMF conclusion</button>
          </div>
        </div>
        <aside className="risk-drawer">
          <div className="dr-eyebrow">{row.id} / hazard<span className={`rd-chip tone-${stTone[row.status] || 'idle'}`} style={{ marginLeft: 8 }}>{(EN.status.find(s => s[0] === row.status) || [])[1] || row.status}</span></div>
          <div className="dr-title">{row.hazard}</div>
          <div className="risk-chain">
            <div className="rc-row"><span className="rc-k">Hazardous situation</span><span className="rc-v">{row.situation || '—'}</span></div>
            <div className="rc-row"><span className="rc-k">Harm</span><span className="rc-v">{row.harm}</span></div>
            {row.seq && <div className="rc-row"><span className="rc-k">Sequence of events</span><span className="rc-v">{row.seq}</span></div>}
            <div className="rc-row"><span className="rc-k">Severity</span><span className="rc-v"><span className={`rd-chip tone-${row.sev === 'Critical' || row.sev === 'Catastrophic' ? 'err' : row.sev === 'Serious' ? 'warn' : 'idle'}`}>{row.sev} ({sevI(row.sev) + 1})</span></span></div>
            <div className="rc-row"><span className="rc-k">Probability</span><span className="rc-v">{row.prob} ({probI(row.prob) + 1}){row.probR && row.probR !== row.prob && <span className="rc-move"> -- {row.probR} <span className="rc-move-tag">after controls</span></span>}</span></div>
            <div className="rc-row"><span className="rc-k">Strategy</span><span className="rc-v">{(EN.strategy.find(s => s[0] === row.strategy) || [])[1] || row.strategy} / {(EN.source.find(s => s[0] === row.source) || [])[1] || row.source}</span></div>
            <div className="rc-row"><span className="rc-k">Residual risk</span><span className="rc-v"><span className={`rd-chip tone-${row.res === 'Acceptable' ? 'ok' : 'warn'}`}>{row.res}</span></span></div>
            <div className="rc-row"><span className="rc-k">Verification (DHF)</span><span className="rc-v">{row.ver || '—'}</span></div>
          </div>

          <div className="pj-seclbl" style={{ margin: '14px 0 8px' }}>Risk controls <span className="s">/ ISO 14971 section 7</span></div>
          <div className="risk-ctrls">
            {(row.controls || []).map(c => (
              <div key={c.id} className="risk-ctrl">
                <span className="risk-ctrl-t">{c.desc}</span>
                <span className="risk-ctrl-m"><span className="mono">{(EN.ctrlType.find(t => t[0] === c.type) || [])[1] || c.type}</span><span className={`rd-chip tone-${ctrlTone[c.status] || 'idle'}`}>{(EN.ctrlStatus.find(s => s[0] === c.status) || [])[1] || c.status}</span></span>
              </div>
            ))}
            {(!row.controls || !row.controls.length) && <div className="sp-q-s" style={{ padding: '6px 0' }}>No controls yet — add the first risk control.</div>}
          </div>
          <button className="btn ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setCtrlForm(true)}>{I.plus} Add risk control</button>

          {row.open && <div className="risk-flag" style={{ marginTop: 10 }}>{I.alertTriangle} Open evaluation — residual risk not yet accepted. Benefit-risk justification required before section 2.3.</div>}
          <div className="cm-pushbar" style={{ marginTop: 10 }}>
            {row.status !== 'accepted' && <button className="btn ghost" onClick={() => setStatus(row.id, 'accepted')}>{I.check} Accept residual</button>}
            <button className="btn ghost" onClick={() => onAsk('Draft the benefit-risk rationale for ' + row.id)}>{I.sparkles} Draft benefit-risk</button>
          </div>
        </aside>
      </div>
      </>
      )}

      {form && <C2CForm config={hazardFormConfig} onCancel={() => setForm(false)} onSubmit={addHazard} />}
      {ctrlForm && <C2CForm config={ctrlFormConfig} onCancel={() => setCtrlForm(false)} onSubmit={addControl} />}
      <C2CToast msg={toast} />
    </div>
  );
}
