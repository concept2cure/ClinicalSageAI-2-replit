/**
 * Quality Management Plans (QMP) — the quality-plan lifecycle + dashboard.
 *
 * Registry id: `qmp`.
 *
 * Wired to the real quality backend (server/routes/quality-management-api.ts,
 * mounted /api/quality, org-scoped from the tenant context). NOTE: these
 * endpoints return RAW JSON (a bare array / bare object), not a {data} envelope.
 *   • GET    /plans            — the org's quality-management plans (bare array)
 *   • POST   /plans            — create a plan (returns the created row)
 *   • PATCH  /plans/:id        — update status/metadata (returns the updated row)
 *   • DELETE /plans/:id        — delete a plan that is not active and that no
 *                                section gating rule uses
 *   • GET    /dashboard/:qmpId — completeness, section gate-levels, factor risk
 *                                profile for the selected plan
 *
 * GOVERNED: a plan sets the gates every governed document is validated against,
 * so create, activate, archive and delete each open a C2CForm that captures a
 * reason (≥ 8 characters, the server's floor) and send nothing until it is
 * confirmed. The server writes the plan and its ledger entry in one
 * transaction, and refuses a viewer (403) — shown as a refusal, like any other.
 * The active plan is offered Archive, never Delete: its gates are the ones in
 * force, and archiving retires it while keeping the record (the server refuses
 * that delete too).
 *
 * HONESTY: the plan list and dashboard render live org data, an honest empty, or
 * an honest error — never a fixture. Writes are real awaited requests that
 * adopt the server's returned row; a refusal is shown as an error in the
 * server's own words and the plan is left as it was.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig, C2CFormField } from '../C2CForm';
import { apiRequest, ApiRequestError, serverMessage } from '@/lib/queryClient';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

interface Plan { id: number; name: string; version: string | null; status: string | null; description: string | null; }
interface Dashboard {
  qmp: { id: number; name: string; version: string; status: string };
  sections: { totalSections: number; sectionsByGateLevel: { hard: number; soft: number; info: number }; activeSections: number; inactiveSections: number; sectionsAllowingOverride: number };
  factors: { totalFactors: number; factorsByRiskLevel: { high: number; medium: number; low: number }; activeFactors: number; inactiveFactors: number; requiredFactors: number };
  overallCompleteness: number;
  riskProfile: { highRiskPercentage: number; mediumRiskPercentage: number; lowRiskPercentage: number };
}

interface RawResult<T> { ok: boolean; status: number; body: T | null; message: string | null; code: string | null }

/** Reads the RAW body (QMP endpoints are not {data}-wrapped); never throws.
 *  `apiRequest` THROWS on a non-2xx (other than 401), so a refusal's status
 *  and the server's sentence are read off the ApiRequestError — catching it
 *  bare reported every refusal as "HTTP 0" with the reason discarded. */
async function rawJson<T = any>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<RawResult<T>> {
  try {
    const res = await apiRequest(method, path, body);
    const parsed = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, body: parsed, message: res.ok ? null : serverMessage(parsed), code: null };
  } catch (e) {
    if (e instanceof ApiRequestError) {
      const payloadCode = (e.payload as { error?: unknown } | null | undefined)?.error;
      return { ok: false, status: e.status, body: null, message: e.message || null, code: e.code ?? (typeof payloadCode === 'string' ? payloadCode : null) };
    }
    return { ok: false, status: 0, body: null, message: null, code: null };
  }
}
/** Whether the server could not say if the change landed: no answer at all, or a COMMIT it could not confirm. */
const outcomeUnknown = (r: RawResult<unknown>) => r.status === 0 || r.code === 'OUTCOME_UNKNOWN';
/** A refused write, in the server's words when it sent any. When the outcome
 *  is unknown it is never called a refusal: say that, and re-read. */
function refusalText(r: RawResult<unknown>, refused: string, verb: string): string {
  if (outcomeUnknown(r)) return r.message && r.status !== 0 ? r.message : `No response from the server. Reload to check whether the plan was ${verb}.`;
  return r.message ? `${refused} — ${r.message}` : `${refused} (HTTP ${r.status}).`;
}
function statusTone(s: string | null | undefined) {
  const v = String(s ?? '').toLowerCase();
  return v === 'active' ? 'ok' : v === 'archived' ? 'dim' : 'warn';
}

/* The banner states what the server actually does: the plan write and its
   ledger entry commit together, so a failed audit write changes nothing. The
   default banner's e-signature clause does not apply to these changes. */
const GOVERNED_NOTE = 'Governed change — your reason is recorded with it in the audit trail. If the audit entry cannot be written, nothing is changed.';
const REASON_FIELD: C2CFormField = { key: 'reason', label: 'Reason (governed)', type: 'textarea', required: true, placeholder: 'At least 8 characters — recorded with the change.' };
const MIN_REASON = 8;

const CREATE_FORM: C2CFormConfig = {
  eyebrow: 'Quality management · governed change',
  title: 'New quality-management plan',
  sub: 'A QMP governs the gate levels and risk factors your documents are validated against.',
  governed: GOVERNED_NOTE,
  submitLabel: 'Create plan',
  fields: [
    { key: 'name', label: 'Plan name', type: 'text', required: true, placeholder: 'e.g. CER Quality Plan 2026' },
    { key: 'version', label: 'Version', type: 'text', default: '1.0', half: true },
    { key: 'status', label: 'Status', type: 'seg', options: ['draft', 'active', 'archived'], default: 'draft', half: true },
    { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Scope and intent of this quality plan' },
    REASON_FIELD,
  ],
};
const ACTIVATE_FORM = (p: Plan): C2CFormConfig => ({
  eyebrow: 'Quality management · governed change',
  title: `Activate “${p.name}”`,
  sub: 'Marks this plan active in the register. Validation applies a plan’s gates whenever a document is checked against it, whatever its status.',
  governed: GOVERNED_NOTE,
  submitLabel: 'Activate plan',
  fields: [REASON_FIELD],
});
const ARCHIVE_FORM = (p: Plan): C2CFormConfig => ({
  eyebrow: 'Quality management · governed change',
  title: `Archive “${p.name}”`,
  sub: 'Marks the plan archived. It stays in the register, and can then be deleted if it is no longer needed.',
  governed: GOVERNED_NOTE,
  submitLabel: 'Archive plan',
  fields: [REASON_FIELD],
});
const DELETE_FORM = (p: Plan): C2CFormConfig => ({
  eyebrow: 'Quality management · governed change',
  title: `Delete “${p.name}”`,
  sub: 'Removes the plan from the register. A plan that section gating rules or other quality records still use is refused. The audit trail keeps a full copy of the plan as it was.',
  governed: GOVERNED_NOTE,
  submitLabel: 'Delete plan',
  fields: [REASON_FIELD],
});

/** The two governed status moves the register offers, and the words for each. */
const TRANSITION = {
  active: { form: ACTIVATE_FORM, done: 'Plan activated', refused: 'Plan not activated', verb: 'activated' },
  archived: { form: ARCHIVE_FORM, done: 'Plan archived', refused: 'Plan not archived', verb: 'archived' },
} as const;
type PlanTransition = keyof typeof TRANSITION;

type PlanDialog = { kind: 'create' } | { kind: 'status'; plan: Plan; to: PlanTransition } | { kind: 'delete'; plan: Plan };

export function QmpWorkspace({ onAsk }: SurfaceViewProps) {
  /* AnA on this surface. It took SurfaceViewProps and discarded the whole
     object as `_props`, so a quality lead looking at a gate-level breakdown and
     a risk profile had no way to ask what any of it meant — on the screen that
     decides what every other document is validated against. */
  const ask = onAsk;
  const [plans, setPlans] = useState<Plan[]>([]);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [active, setActive] = useState<number | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [dashState, setDashState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [dialog, setDialog] = useState<PlanDialog | null>(null);
  const [toast, fireToast] = useToast();

  const loadPlans = useCallback(async () => {
    setListState('loading');
    const { ok, body } = await rawJson<Plan[]>('GET', '/api/quality/plans');
    if (!ok) { setListState('error'); return; }
    const list = Array.isArray(body) ? body : [];
    setPlans(list); setListState('ready');
    setActive((cur) => (cur && list.some((p) => p.id === cur) ? cur : list[0]?.id ?? null));
  }, []);
  useEffect(() => { void loadPlans(); }, [loadPlans]);

  const loadDashboard = useCallback(async (id: number) => {
    setDashState('loading');
    const { ok, body } = await rawJson<Dashboard>('GET', `/api/quality/dashboard/${id}`);
    // Require the full dashboard shape before rendering — a partial/empty body
    // (e.g. a freshly created plan with no sections yet) must not crash the view.
    if (!ok || !body || !body.sections?.sectionsByGateLevel || !body.factors?.factorsByRiskLevel || !body.riskProfile) {
      setDashState('error'); setDash(null); return;
    }
    setDash(body); setDashState('ready');
  }, []);
  useEffect(() => { if (active != null) void loadDashboard(active); else { setDash(null); setDashState('idle'); } }, [active, loadDashboard]);

  /* The server's floor, checked first so a request it would refuse is never
     sent. The drawer stays open on any refusal so the reason can be fixed. */
  const reasonOf = useCallback((v: Record<string, string>): string | null => {
    const reason = String(v.reason ?? '').trim();
    if (reason.length >= MIN_REASON) return reason;
    fireToast(`Give a reason of at least ${MIN_REASON} characters. It is recorded with the change.`, 'error');
    return null;
  }, [fireToast]);

  /* One governed write at a time. C2CForm submits without waiting, so a double
     click sent two requests: two plans, or a success toast then "not found"
     for a delete that had in fact happened. */
  const writing = useRef(false);
  const once = useCallback(<A extends unknown[]>(fn: (...a: A) => Promise<void>) => async (...a: A) => {
    if (writing.current) return;
    writing.current = true;
    try { await fn(...a); } finally { writing.current = false; }
  }, []);

  const create = useCallback(async (v: Record<string, string>) => {
    const reason = reasonOf(v);
    if (reason === null) return;
    const r = await rawJson<Plan>('POST', '/api/quality/plans', {
      name: v.name, version: v.version || '1.0', status: v.status || 'draft', description: v.description || undefined, reason,
    });
    if (!r.ok) { fireToast(refusalText(r, 'Plan not created', 'created'), 'error'); if (outcomeUnknown(r)) void loadPlans(); return; }
    setDialog(null);
    const body = r.body;
    // A 2xx without a readable row still created the plan: reload rather than guess.
    if (!body?.id) { fireToast('Quality-management plan created. Reloading the register.'); void loadPlans(); return; }
    fireToast('Quality-management plan created · ' + body.name);
    setPlans((ps) => [body, ...ps.filter((p) => p.id !== body.id)]);
    setActive(body.id);
  }, [reasonOf, loadPlans, fireToast]);

  const transition = useCallback(async (plan: Plan, to: PlanTransition, v: Record<string, string>) => {
    const reason = reasonOf(v);
    if (reason === null) return;
    const words = TRANSITION[to];
    const r = await rawJson<Plan>('PATCH', `/api/quality/plans/${plan.id}`, { status: to, reason });
    if (!r.ok) { fireToast(refusalText(r, words.refused, words.verb), 'error'); if (outcomeUnknown(r)) void loadPlans(); return; }
    setDialog(null);
    const body = r.body;
    if (!body) { fireToast(`${words.done}. Reloading the register.`); void loadPlans(); return; }
    fireToast(`${words.done} · ` + (body.name ?? plan.name));
    setPlans((ps) => ps.map((p) => (p.id === plan.id ? { ...p, ...body } : p)));
    if (active === plan.id) void loadDashboard(plan.id);
  }, [active, reasonOf, loadPlans, loadDashboard, fireToast]);

  const remove = useCallback(async (plan: Plan, v: Record<string, string>) => {
    const reason = reasonOf(v);
    if (reason === null) return;
    const r = await rawJson('DELETE', `/api/quality/plans/${plan.id}`, { reason });
    if (!r.ok) { fireToast(refusalText(r, 'Plan not deleted', 'deleted'), 'error'); if (outcomeUnknown(r)) void loadPlans(); return; }
    setDialog(null);
    fireToast('Plan deleted · ' + plan.name);
    const rest = plans.filter((p) => p.id !== plan.id);
    setPlans(rest);
    setActive((cur) => (cur === plan.id ? rest[0]?.id ?? null : cur));
  }, [plans, reasonOf, loadPlans, fireToast]);

  /* WHAT ANA SEES HERE. A QMP defines the gates every other document is
     validated against, so the payload carries the gate-level split and the risk
     profile rather than just a plan name — "why did my document fail a hard
     gate" is answered from this screen's numbers, not from the document's.

     dashState travels separately from the plan list because the dashboard has
     its own failure: a freshly created plan with no sections yet lands in
     `error` by design (the loader requires the full shape before rendering).
     Publishing that as "no sections" would state a fact the surface itself
     refuses to state. */
  const activePlan = plans.find((p) => p.id === active) ?? null;
  const anaContext = useMemo(
    () => ({
      summary: listState === 'loading'
        ? 'Quality management plans, still loading.'
        : listState === 'error'
          ? 'Quality management plans could not be loaded — unavailable, not empty.'
          : plans.length === 0
            ? 'Quality management: no quality plans defined yet for this organization.'
            : `Quality management: ${plans.length} plan(s)` +
              (activePlan ? `, "${activePlan.name}" (v${activePlan.version ?? '—'}, ${activePlan.status ?? 'no status'}) selected` : '') +
              (dash ? `; ${dash.overallCompleteness}% complete across ${dash.sections.totalSections} section(s).` : '.'),
      facts: {
        plansState: listState,
        planCount: plans.length,
        activePlanCount: plans.filter((p) => String(p.status ?? '').toLowerCase() === 'active').length,
        ...(activePlan
          ? { selectedPlanId: activePlan.id, selectedPlanName: activePlan.name, selectedPlanVersion: activePlan.version, selectedPlanStatus: activePlan.status }
          : {}),
        dashboardState: dashState,
        ...(dash
          ? {
              overallCompletenessPct: dash.overallCompleteness,
              totalSections: dash.sections.totalSections,
              sectionsByGateLevel: dash.sections.sectionsByGateLevel,
              sectionsAllowingOverride: dash.sections.sectionsAllowingOverride,
              totalFactors: dash.factors.totalFactors,
              factorsByRiskLevel: dash.factors.factorsByRiskLevel,
              requiredFactors: dash.factors.requiredFactors,
              riskProfile: dash.riskProfile,
            }
          : {}),
      },
      availableActions: [
        'Explain what a hard, soft and info gate each enforce',
        'Explain this plan\'s risk profile and which factors drive it',
        'Explain what activating this plan changes for documents in flight',
        'Create a quality-management plan',
      ],
    }),
    [listState, plans, activePlan, dashState, dash],
  );
  usePublishSurfaceContext('qmp', anaContext);

  return (
    <div className="cm-body">
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Quality management plans</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {ask && <button className="reg-cta" onClick={() => ask('Explain what this quality-management plan enforces: what a hard, soft and info gate each block, which risk factors are required, and what changes for documents already in flight if I activate it. Say which figures are unavailable rather than assuming zero.')}>{I.sparkles} Explain this plan</button>}
            <button className="nda-open" onClick={() => setDialog({ kind: 'create' })}>{I.plus} New plan</button>
          </span>
        </div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {listState === 'loading' ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="Loading quality plans…" /></div>
            : listState === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load quality plans" hint="The quality-plan register didn’t respond. Sign in to your tenant and retry." /></div>
            : plans.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="No quality plans yet" hint="Create a quality-management plan to define the gate levels and risk factors your documents are validated against." /></div>
            : <table className="reg-tbl"><thead><tr><th>Plan</th><th>Version</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
              <tbody>{plans.map((p) => (
                <tr key={p.id} data-active={active === p.id || undefined}>
                  {/* The plan name opened the row from a <td onClick> with a pointer
                      cursor — a control no keyboard could reach, offering by mouse
                      exactly what the row's own View button already does. Clicking
                      the name is the convention here, so it stays; as a button it
                      keeps the click target and gains the tab stop. */}
                  <td>
                    <button type="button" className="tbl-name-btn" onClick={() => setActive(p.id)}>{p.name}</button>
                  </td>
                  <td className="mono">{p.version ?? '—'}</td>
                  <td><span className={'rd-chip tone-' + statusTone(p.status)}>{p.status ?? '—'}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="nda-open" onClick={() => setActive(p.id)}>{I.eye} View</button>
                    {p.status === 'active'
                      ? <button className="nda-open" style={{ marginLeft: 6 }} aria-label={`Archive ${p.name}`} onClick={() => setDialog({ kind: 'status', plan: p, to: 'archived' })}>{I.lock} Archive</button>
                      : <>
                          <button className="nda-open" style={{ marginLeft: 6 }} aria-label={`Activate ${p.name}`} onClick={() => setDialog({ kind: 'status', plan: p, to: 'active' })}>{I.check} Activate</button>
                          <button className="nda-open" style={{ marginLeft: 6 }} aria-label={`Delete ${p.name}`} onClick={() => setDialog({ kind: 'delete', plan: p })}>{I.close} Delete</button>
                        </>}
                  </td>
                </tr>))}</tbody></table>}
        </div>
      </div>

      {active != null && (
        <div className="pj-card">
          <div className="pj-card-h"><span className="t">Plan dashboard</span>{dash && <span className={'rd-chip tone-' + (dash.overallCompleteness >= 80 ? 'ok' : 'warn')}>{dash.overallCompleteness}% complete</span>}</div>
          <div className="pj-card-b">
            {dashState === 'loading' ? <EmptyState icon={I.layers} title="Loading dashboard…" />
              : dashState === 'error' ? <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load the plan dashboard" hint="The plan dashboard didn’t respond." />
              : !dash ? <EmptyState icon={I.layers} title="No dashboard" hint="Select a plan to see its completeness, section gate levels, and factor risk profile." />
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Sections ({dash.sections.totalSections})</div>
                    <div style={{ fontSize: 13 }}>Hard gate: <b>{dash.sections.sectionsByGateLevel.hard}</b> · Soft: <b>{dash.sections.sectionsByGateLevel.soft}</b> · Info: <b>{dash.sections.sectionsByGateLevel.info}</b></div>
                    <div style={{ fontSize: 13 }}>Active {dash.sections.activeSections} · allow override {dash.sections.sectionsAllowingOverride}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Risk factors ({dash.factors.totalFactors})</div>
                    <div style={{ fontSize: 13 }}>
                      <span className="rd-chip tone-err">high {dash.factors.factorsByRiskLevel.high}</span>{' '}
                      <span className="rd-chip tone-warn">medium {dash.factors.factorsByRiskLevel.medium}</span>{' '}
                      <span className="rd-chip tone-ok">low {dash.factors.factorsByRiskLevel.low}</span>
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Required {dash.factors.requiredFactors} · active {dash.factors.activeFactors}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Risk profile</div>
                    <div style={{ fontSize: 13 }}>High {dash.riskProfile.highRiskPercentage}% · Medium {dash.riskProfile.mediumRiskPercentage}% · Low {dash.riskProfile.lowRiskPercentage}%</div>
                  </div>
                </div>
              )}
          </div>
        </div>
      )}

      {dialog?.kind === 'create' && <C2CForm config={CREATE_FORM} onCancel={() => setDialog(null)} onSubmit={once(create)} />}
      {dialog?.kind === 'status' && <C2CForm key={`${dialog.to}-${dialog.plan.id}`} config={TRANSITION[dialog.to].form(dialog.plan)} onCancel={() => setDialog(null)} onSubmit={once((v: Record<string, string>) => transition(dialog.plan, dialog.to, v))} />}
      {dialog?.kind === 'delete' && <C2CForm key={`delete-${dialog.plan.id}`} config={DELETE_FORM(dialog.plan)} onCancel={() => setDialog(null)} onSubmit={once((v: Record<string, string>) => remove(dialog.plan, v))} />}
      <C2CToast msg={toast} />
    </div>
  );
}
