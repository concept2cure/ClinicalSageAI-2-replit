/**
 * Quality Management Plans (QMP) — the quality-plan lifecycle + dashboard.
 *
 * Registry id: `qmp`.
 *
 * Wired to the real quality backend (server/routes/quality-management-api.ts,
 * mounted /api/quality, org-scoped from the tenant context). NOTE: these
 * endpoints return RAW JSON (a bare array / bare object), not a {data} envelope.
 *   • GET   /plans            — the org's quality-management plans (bare array)
 *   • POST  /plans            — create a plan (returns the created row)
 *   • PATCH /plans/:id        — update status/metadata (returns the updated row)
 *   • GET   /dashboard/:qmpId — completeness, section gate-levels, factor risk
 *                               profile for the selected plan
 *
 * HONESTY: the plan list and dashboard render live org data, an honest empty, or
 * an honest error — never a fixture. Create/activate are real awaited writes
 * that adopt the server's returned row and refetch; nothing is fabricated.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { apiRequest } from '@/lib/queryClient';
import '../styles/project-home-v2.css';

interface Plan { id: number; name: string; version: string | null; status: string | null; description: string | null; }
interface Dashboard {
  qmp: { id: number; name: string; version: string; status: string };
  sections: { totalSections: number; sectionsByGateLevel: { hard: number; soft: number; info: number }; activeSections: number; inactiveSections: number; sectionsAllowingOverride: number };
  factors: { totalFactors: number; factorsByRiskLevel: { high: number; medium: number; low: number }; activeFactors: number; inactiveFactors: number; requiredFactors: number };
  overallCompleteness: number;
  riskProfile: { highRiskPercentage: number; mediumRiskPercentage: number; lowRiskPercentage: number };
}

function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fire = useCallback((m: string) => { setMsg(m); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setMsg(''), 4200); }, []);
  return [msg, fire];
}
function C2CToast({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="de-toast"><span className="ico">{I.checkCircle}</span>{msg}</div>;
}
/** Reads the RAW body (QMP endpoints are not {data}-wrapped); never throws. */
async function rawJson<T = any>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = await apiRequest(method, path, body);
    const parsed = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, body: parsed };
  } catch { return { ok: false, status: 0, body: null }; }
}
function statusTone(s: string | null | undefined) {
  const v = String(s ?? '').toLowerCase();
  return v === 'active' ? 'ok' : v === 'archived' ? 'dim' : 'warn';
}

const CREATE_FORM: C2CFormConfig = {
  eyebrow: 'Quality management',
  title: 'New quality-management plan',
  sub: 'A QMP governs the gate levels and risk factors your documents are validated against.',
  submitLabel: 'Create plan',
  fields: [
    { key: 'name', label: 'Plan name', type: 'text', required: true, placeholder: 'e.g. CER Quality Plan 2026' },
    { key: 'version', label: 'Version', type: 'text', default: '1.0', half: true },
    { key: 'status', label: 'Status', type: 'seg', options: ['draft', 'active', 'archived'], default: 'draft', half: true },
    { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Scope and intent of this quality plan' },
  ],
};

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
  const [creating, setCreating] = useState(false);
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

  const create = useCallback(async (v: Record<string, string>) => {
    const { ok, status, body } = await rawJson<Plan>('POST', '/api/quality/plans', {
      name: v.name, version: v.version || '1.0', status: v.status || 'draft', description: v.description || undefined,
    });
    if (!ok || !body?.id) { fireToast(status === 400 ? 'Couldn’t create the plan — check the name (3–100 chars).' : `Couldn’t create the plan (HTTP ${status}).`); return; }
    setCreating(false);
    fireToast('Quality-management plan created · ' + body.name);
    setPlans((ps) => [body, ...ps.filter((p) => p.id !== body.id)]);
    setActive(body.id);
  }, [fireToast]);

  const activate = useCallback(async (id: number) => {
    const { ok, status, body } = await rawJson<Plan>('PATCH', `/api/quality/plans/${id}`, { status: 'active' });
    if (!ok || !body) { fireToast(`Couldn’t activate the plan (HTTP ${status}).`); return; }
    fireToast('Plan activated · ' + (body.name ?? id));
    setPlans((ps) => ps.map((p) => (p.id === id ? { ...p, ...body } : p)));
    if (active === id) void loadDashboard(id);
  }, [active, loadDashboard, fireToast]);

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
            <button className="nda-open" onClick={() => setCreating(true)}>{I.plus} New plan</button>
          </span>
        </div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {listState === 'loading' ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="Loading quality plans…" /></div>
            : listState === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load quality plans" hint="GET /api/quality/plans didn’t respond. Sign in to your tenant and retry." /></div>
            : plans.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="No quality plans yet" hint="Create a quality-management plan to define the gate levels and risk factors your documents are validated against." /></div>
            : <table className="reg-tbl"><thead><tr><th>Plan</th><th>Version</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
              <tbody>{plans.map((p) => (
                <tr key={p.id} data-active={active === p.id || undefined}>
                  <td style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => setActive(p.id)}>{p.name}</td>
                  <td className="mono">{p.version ?? '—'}</td>
                  <td><span className={'rd-chip tone-' + statusTone(p.status)}>{p.status ?? '—'}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="nda-open" onClick={() => setActive(p.id)}>{I.eye} View</button>
                    {p.status !== 'active' && <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => activate(p.id)}>{I.check} Activate</button>}
                  </td>
                </tr>))}</tbody></table>}
        </div>
      </div>

      {active != null && (
        <div className="pj-card">
          <div className="pj-card-h"><span className="t">Plan dashboard</span>{dash && <span className={'rd-chip tone-' + (dash.overallCompleteness >= 80 ? 'ok' : 'warn')}>{dash.overallCompleteness}% complete</span>}</div>
          <div className="pj-card-b">
            {dashState === 'loading' ? <EmptyState icon={I.layers} title="Loading dashboard…" />
              : dashState === 'error' ? <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load the plan dashboard" hint="GET /api/quality/dashboard/:id didn’t respond." />
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

      {creating && <C2CForm config={CREATE_FORM} onCancel={() => setCreating(false)} onSubmit={create} />}
      <C2CToast msg={toast} />
    </div>
  );
}
