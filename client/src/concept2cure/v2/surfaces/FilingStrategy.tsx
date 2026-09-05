/**
 * Global Filing Strategy — where to file, in what order, and where agencies disagree.
 *
 * Registry id: `filing-strategy`.
 *
 * ── Why this surface exists ──────────────────────────────────────────────────
 * `/api/regulatory-precedent-intelligence` mounts 39 endpoints and had zero
 * client references. Its `cross-jurisdictional` family (8 endpoints) and
 * `confidence` family (6) exist NOWHERE else in the platform — verified against
 * `/api/precedent-engine`, which serves the overlapping CRL/RTF/EMA/AdComm
 * concepts and has a surface already. These fourteen were unreachable capability
 * with no duplicate anywhere.
 *
 * The backing is real: `db/migrations/20260322_regulatory_precedent_intelligence.sql`
 * creates the eleven `regulatory_intel.*` tables these read, and it is in the
 * applied migration set. This is not a shell over a stub.
 *
 * ── Why a new surface rather than a tab on PrecedentEngine ───────────────────
 * It answers a different question. PrecedentEngine answers "what has happened
 * before in cases like mine". This answers "given that record, in what ORDER do
 * I file across regions, and where will the agencies disagree with each other".
 * A programme lead planning a global sequence and a writer checking a claim
 * against precedent are not the same person at the same moment.
 *
 * Two extension targets were considered and rejected on evidence:
 * `PrecedentEngine.tsx` is 728 lines whose tab panels could not be safely
 * verified before editing, and `GlobalRiBrowser` lives inside the shared
 * `Surfaces.tsx`. Neither is a safe place to graft a new capability.
 *
 * ── What this does NOT do ────────────────────────────────────────────────────
 * It does not touch the CRL / RTF / EMA / advisory-committee endpoints. Those
 * overlap with `precedent-engine`, which has an independent implementation
 * (1,797 lines) already wired to a surface, and that one is authoritative — see
 * docs/adr/0013-precedent-engine-is-authoritative.md. The short version: this
 * module's tables SHIP EMPTY, so its CRL/RTF/EMA answers would be `[]` on every
 * tenant, and "no CRL triggers found" reads as "low risk".
 *
 * ── This record starts empty, and the surface says so ────────────────────────
 * The same is true of the two families below. The tables are created and seeded
 * with nothing, so every view is blank until the organisation populates it. That
 * is stated in the header, in the catalog entry, and in each empty state —
 * because a blank filing-sequence panel and a filing sequence with no risks are
 * the same pixels and opposite meanings.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { apiRequest, extractApiError } from '@/lib/queryClient';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

const BASE = '/api/regulatory-precedent-intelligence';

/** Agencies the cross-jurisdictional tables carry divergence and reliance data for. */
const AGENCIES = ['FDA', 'EMA', 'PMDA', 'MHRA', 'NMPA', 'Health Canada', 'TGA', 'ANVISA', 'Swissmedic'];

const OPTIMIZE_FOR: Array<{ value: string; label: string; hint: string }> = [
  { value: 'balanced', label: 'Balanced', hint: 'Weighs revenue, risk and resource use together.' },
  { value: 'speed', label: 'Speed to first approval', hint: 'Shortest path to any approval, accepting more parallel work.' },
  { value: 'revenue', label: 'Revenue', hint: 'Largest markets first, even where review is slower.' },
  { value: 'risk', label: 'Risk mitigation', hint: 'File where the record is strongest first, to de-risk later reviews.' },
];

type Load<T> = { state: 'idle' | 'loading' | 'ready' | 'error'; data: T | null; error?: string };
const idle = <T,>(): Load<T> => ({ state: 'idle', data: null });

/** Server data as an array, whatever arrived. `?? []` does not do this — a `{…}` body stays truthy. */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Load<T>> {
  try {
    const res = await apiRequest(method, path, body);
    const parsed = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      return {
        state: 'error',
        data: null,
        error:
          res.status === 401
            ? 'Sign in to your tenant to use filing strategy.'
            // This read `parsed.error` first, so on the refusal envelope
            // { error: 'FORBIDDEN', message: '<the reason>' } the enum token went
            // on screen and the reason was dropped. extractApiError takes the
            // sentence wherever the envelope put it and substitutes a
            // status-keyed one when the server sent none — this surface has no
            // domain copy of its own that would say more.
            : extractApiError(parsed, res.status).message,
      };
    }
    // These handlers return the service result directly, not wrapped in `data`.
    return { state: 'ready', data: (parsed?.data ?? parsed) as T };
  } catch (e) {
    // apiRequest THROWS for every non-OK status except 401, so a real refusal
    // arrives here rather than in the branch above. An ApiRequestError's message
    // has already been reduced to a displayable sentence; anything else caught
    // here is a browser-native fetch rejection ("Failed to fetch"), which is not
    // user copy and keeps the generic sentence.
    const known = (e as { name?: unknown })?.name === 'ApiRequestError';
    return {
      state: 'error',
      data: null,
      error: known && (e as Error).message ? (e as Error).message : 'The request did not complete.',
    };
  }
}

function humanize(key: string): string {
  const s = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function cell(v: unknown): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1e4) / 1e4) : '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.map(cell).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
function severityTone(s: unknown): 'ok' | 'warn' | 'err' {
  const v = String(s ?? '').toLowerCase();
  if (v === 'critical' || v === 'high' || v === 'major') return 'err';
  if (v === 'medium' || v === 'moderate') return 'warn';
  return 'ok';
}

/**
 * Render any list of records as a table, from whatever keys the rows carry.
 *
 * These services return typed rows, but the shapes are wide and evolve with the
 * schema; hardcoding columns would silently drop a field the service started
 * returning. Deriving them from the data cannot go stale — and a row rendered
 * with an unexpected extra column is a better failure than one missing a column
 * a reviewer needed.
 */
function RecordTable({ rows, hide = [] }: { rows: Record<string, unknown>[]; hide?: string[] }) {
  const columns = useMemo(() => {
    const seen: string[] = [];
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (!seen.includes(k) && !hide.includes(k)) seen.push(k);
      }
    }
    // Long free-text and blobs make an unreadable table; they stay in the raw view.
    return seen.filter(k => !/^(id|organizationId|organization_id|createdAt|updatedAt|embedding)$/.test(k)).slice(0, 8);
  }, [rows, hide]);

  if (columns.length === 0) return <EmptyState icon={I.list} title="No fields to show" />;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="reg-tbl">
        <thead><tr>{columns.map(c => <th key={c} scope="col">{humanize(c)}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 100).map((r, i) => (
            <tr key={i}>
              {columns.map(c => (
                <td key={c} className="mono">
                  {/^severity$|^risk$|^priority$/i.test(c)
                    ? <span className={'rd-chip tone-' + severityTone(r[c])}>{cell(r[c])}</span>
                    : cell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 100 && (
        <div style={{ fontSize: 11, color: 'var(--text-300,#6b6963)', marginTop: 4 }}>
          Showing 100 of {rows.length} rows.
        </div>
      )}
    </div>
  );
}

function Panel({ title, hint, load, empty, children }: {
  title: string; hint?: string; load: Load<unknown>; empty: string; children: () => React.ReactNode;
}) {
  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">{title}</span>
        {hint && <span className="s">{hint}</span>}
      </div>
      <div className="pj-card-b">
        {load.state === 'idle' ? (
          <EmptyState icon={I.telescope} title={empty} />
        ) : load.state === 'loading' ? (
          <EmptyState icon={I.clock} title={`Loading ${title.toLowerCase()}…`} />
        ) : load.state === 'error' ? (
          <EmptyState tone="error" icon={I.alertTriangle} title={`Couldn’t load ${title.toLowerCase()}`} hint={load.error} />
        ) : (
          // A thunk, not children: JSX evaluates eagerly at the call site, so a
          // guard here could not protect a `.map` over a body that is not a list.
          children()
        )}
      </div>
    </div>
  );
}

const TABS: Array<[string, string]> = [
  ['sequence', 'Filing sequence'],
  ['divergence', 'Agency divergence'],
  ['calibration', 'Prediction calibration'],
];

export function FilingStrategy(_props: SurfaceViewProps) {
  const [toast, fireToast] = useToast();
  const [tab, setTab] = useState('sequence');

  /* AnA can open any of the three tabs — the same view-state switch a person
     makes. The registry enum has validated `tab`; the defensive lookup keeps the
     handler honest if the registry drifts. */
  useSurfaceActionHandlers('filing-strategy', {
    'filing-strategy.open-tab': (params) => {
      const target = params.tab;
      const hit = TABS.find((t) => t[0] === target);
      if (!hit) return { ok: false, reason: `"${target}" is not a filing-strategy tab.` };
      if (tab === target) return { ok: true, detail: `Already on the ${hit[1]} tab` };
      setTab(target);
      return { ok: true, detail: `Opened the ${hit[1]} tab` };
    },
  });

  // Filing sequence
  const [seq, setSeq] = useState({ productType: '', therapeuticArea: '', optimizeFor: 'balanced' });
  const [agencies, setAgencies] = useState<string[]>(['FDA', 'EMA']);
  const [sequence, setSequence] = useState<Load<any>>(idle<any>());

  // Divergence
  const [div, setDiv] = useState({ agencyA: 'FDA', agencyB: 'EMA', therapeuticArea: '' });
  const [divergences, setDivergences] = useState<Load<any[]>>(idle<any[]>());

  // Calibration
  const [calibration, setCalibration] = useState<Load<any>>(idle<any>());

  const toggleAgency = useCallback((a: string) => {
    setAgencies(prev => (prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]));
  }, []);

  const runSequence = useCallback(async () => {
    if (!seq.productType.trim()) { fireToast('Enter a product type.', 'error'); return; }
    if (agencies.length < 2) { fireToast('Select at least two agencies to sequence.', 'error'); return; }
    setSequence({ state: 'loading', data: null });
    setSequence(await call<any>('POST', `${BASE}/cross-jurisdictional/optimize-filing`, {
      productType: seq.productType.trim(),
      ...(seq.therapeuticArea.trim() ? { therapeuticArea: seq.therapeuticArea.trim() } : {}),
      targetAgencies: agencies,
      optimizeFor: seq.optimizeFor,
    }));
  }, [seq, agencies, fireToast]);

  const runDivergence = useCallback(async () => {
    if (div.agencyA === div.agencyB) { fireToast('Choose two different agencies.', 'error'); return; }
    setDivergences({ state: 'loading', data: null });
    setDivergences(await call<any[]>('POST', `${BASE}/cross-jurisdictional/divergences/search`, {
      agencyA: div.agencyA,
      agencyB: div.agencyB,
      ...(div.therapeuticArea.trim() ? { therapeuticArea: div.therapeuticArea.trim() } : {}),
      limit: 100,
    }));
  }, [div, fireToast]);

  const runCalibration = useCallback(async () => {
    setCalibration({ state: 'loading', data: null });
    setCalibration(await call<any>('GET', `${BASE}/confidence/calibration-report`));
  }, []);

  /* What AnA can see. The question a user is actually holding on this screen is
     "should I file here first?", and without the selection she cannot tell which
     agencies they are weighing. */
  const anaContext = useMemo(() => ({
    summary:
      tab === 'sequence'
        ? `Global filing strategy, sequencing ${agencies.join(', ') || 'no agencies yet'}${seq.productType ? ` for ${seq.productType}` : ''}, optimising for ${seq.optimizeFor}.`
        : tab === 'divergence'
          ? `Global filing strategy, comparing ${div.agencyA} against ${div.agencyB}.`
          : 'Global filing strategy, reviewing how well the platform’s own predictions have held up.',
    facts: {
      view: tab,
      targetAgencies: agencies,
      optimizeFor: seq.optimizeFor,
      productType: seq.productType || null,
      comparing: tab === 'divergence' ? [div.agencyA, div.agencyB] : null,
      sequenceLoaded: sequence.state === 'ready',
      // State-aware, like `sequenceLoaded` above: a failed or not-yet-run
      // divergence search must not read as "0 divergences" — that is the
      // "absence of evidence reported as agreement" this surface exists to
      // refuse. The count travels only when the search actually resolved.
      divergenceState: divergences.state,
      ...(divergences.state === 'ready'
        ? { divergenceCount: asArray(divergences.data).length }
        : {}),
    },
    availableActions: [
      'Explain why an agency is sequenced first',
      'Explain a divergence between two agencies',
      'Compare optimising for speed versus risk',
      'Interpret the calibration report',
    ],
  }), [tab, agencies, seq, div, sequence.state, divergences.state, divergences.data]);

  usePublishSurfaceContext('filing-strategy', anaContext);

  return (
    <div className="cm-body">
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Global filing strategy</span>
          <span className="s">Sequence, divergence and calibration</span>
        </div>
        <div className="pj-card-b" style={{ fontSize: 13, color: 'var(--text-300,#6b6963)', lineHeight: 1.5 }}>
          <p style={{ margin: '0 0 8px' }}>
            Filing order, agency divergence and reliance pathways are computed by the server from your
            organisation’s cross-jurisdictional record. Nothing here is estimated in the browser, and an
            agency with no recorded divergence is reported as having none — not as agreement.
          </p>
          <p style={{ margin: 0 }}>
            <b>This record starts empty.</b> The store ships with no rows, so every view below is blank
            until your organisation adds frameworks, divergences and reliance pathways. Blank here means
            nothing has been recorded — never that there is nothing to record.
          </p>
        </div>
      </div>

      <div className="pj-card">
        <div className="pj-card-b">
          <div className="reg-tabs" style={{ marginTop: 0 }}>
            {TABS.map(([id, label]) => (
              <button
                key={id}
                className={'reg-tab' + (tab === id ? ' on' : '')}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'sequence' && (
        <>
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Sequence the filing</span><span className="s">Two or more agencies</span></div>
            <div className="pj-card-b">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginBottom: 10 }}>
                <label style={{ fontSize: 12 }}>Product type
                  <input className="c2c-input" style={{ height: 30 }} value={seq.productType}
                    onChange={e => setSeq({ ...seq, productType: e.target.value })} placeholder="e.g. monoclonal antibody" />
                </label>
                <label style={{ fontSize: 12 }}>Therapeutic area <span style={{ color: 'var(--text-300,#6b6963)' }}>(optional)</span>
                  <input className="c2c-input" style={{ height: 30 }} value={seq.therapeuticArea}
                    onChange={e => setSeq({ ...seq, therapeuticArea: e.target.value })} placeholder="e.g. oncology" />
                </label>
                <label style={{ fontSize: 12 }}>Optimise for
                  <select className="c2c-input" style={{ height: 30 }} value={seq.optimizeFor}
                    onChange={e => setSeq({ ...seq, optimizeFor: e.target.value })}>
                    {OPTIMIZE_FOR.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-300,#6b6963)', marginTop: 2 }}>
                    {OPTIMIZE_FOR.find(o => o.value === seq.optimizeFor)?.hint}
                  </span>
                </label>
              </div>

              <fieldset style={{ border: 0, padding: 0, margin: '0 0 10px' }}>
                <legend style={{ fontSize: 12, padding: 0, marginBottom: 4 }}>Target agencies</legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {AGENCIES.map(a => (
                    <button key={a} className={'btn' + (agencies.includes(a) ? ' primary' : '')}
                      style={{ height: 28, fontSize: 12 }}
                      aria-pressed={agencies.includes(a)}
                      onClick={() => toggleAgency(a)}>
                      {a}
                    </button>
                  ))}
                </div>
              </fieldset>

              <button className="btn primary" style={{ height: 32 }} onClick={runSequence}
                disabled={sequence.state === 'loading'}>
                {I.route} {sequence.state === 'loading' ? 'Optimising…' : 'Optimise sequence'}
              </button>
            </div>
          </div>

          <Panel title="Recommended sequence" load={sequence} empty="Choose agencies and optimise to see a sequence.">
            {() => {
              const d = sequence.data as any;
              const rows = asArray<Record<string, unknown>>(d?.recommendedSequence ?? d?.sequence ?? d?.strategies);
              return rows.length > 0
                ? <RecordTable rows={rows} />
                : <EmptyState icon={I.route} title="No sequence returned"
                    hint="Your cross-jurisdictional record has no filing strategy for this product type and agency set. The store ships empty — this is what an unpopulated record looks like, not a finding about the agencies." />;
            }}
          </Panel>
        </>
      )}

      {tab === 'divergence' && (
        <>
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Where two agencies disagree</span><span className="s">Requirement divergence</span></div>
            <div className="pj-card-b">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 10 }}>
                <label style={{ fontSize: 12 }}>Agency A
                  <select className="c2c-input" style={{ height: 30 }} value={div.agencyA}
                    onChange={e => setDiv({ ...div, agencyA: e.target.value })}>
                    {AGENCIES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12 }}>Agency B
                  <select className="c2c-input" style={{ height: 30 }} value={div.agencyB}
                    onChange={e => setDiv({ ...div, agencyB: e.target.value })}>
                    {AGENCIES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12 }}>Therapeutic area <span style={{ color: 'var(--text-300,#6b6963)' }}>(optional)</span>
                  <input className="c2c-input" style={{ height: 30 }} value={div.therapeuticArea}
                    onChange={e => setDiv({ ...div, therapeuticArea: e.target.value })} placeholder="e.g. oncology" />
                </label>
              </div>
              <button className="btn primary" style={{ height: 32 }} onClick={runDivergence}
                disabled={divergences.state === 'loading'}>
                {I.gitCompare} {divergences.state === 'loading' ? 'Searching…' : 'Find divergences'}
              </button>
            </div>
          </div>

          <Panel title="Divergences" hint={`${asArray(divergences.data).length}`} load={divergences}
            empty="Choose two agencies and search.">
            {() => {
              const rows = asArray<Record<string, unknown>>(divergences.data);
              return rows.length > 0
                ? <RecordTable rows={rows} />
                : <EmptyState icon={I.gitCompare} title="No recorded divergences"
                    hint={`Nothing on record between ${div.agencyA} and ${div.agencyB} for this scope. That is an absence of evidence, not evidence the agencies agree.`} />;
            }}
          </Panel>
        </>
      )}

      {tab === 'calibration' && (
        <>
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">How well have our predictions held up?</span><span className="s">Confidence calibration</span></div>
            <div className="pj-card-b">
              <div style={{ fontSize: 12, color: 'var(--text-300,#6b6963)', marginBottom: 10, lineHeight: 1.5 }}>
                Compares predicted confidence against resolved outcomes. A rule that says 90% and is right
                60% of the time is worse than one that says 60% and means it — this is the report that
                shows which is which, and it is the honest basis for how much weight to put on any of the
                platform’s predictions.
              </div>
              <button className="btn primary" style={{ height: 32 }} onClick={runCalibration}
                disabled={calibration.state === 'loading'}>
                {I.activity} {calibration.state === 'loading' ? 'Loading…' : 'Load calibration report'}
              </button>
            </div>
          </div>

          <Panel title="Calibration" load={calibration} empty="Load the report to see calibration by rule.">
            {() => {
              const d = calibration.data as any;
              const buckets = asArray<Record<string, unknown>>(d?.buckets ?? d?.byBucket ?? d?.rules);
              return (
                <>
                  {typeof d?.overallAccuracy === 'number' && (
                    <div style={{ marginBottom: 10 }}>
                      <span className="rd-chip tone-ok">{Math.round(d.overallAccuracy * 100)}% overall accuracy</span>
                      {typeof d?.totalPredictions === 'number' && (
                        <span style={{ fontSize: 12, color: 'var(--text-300,#6b6963)', marginLeft: 8 }}>
                          over {d.totalPredictions} resolved predictions
                        </span>
                      )}
                    </div>
                  )}
                  {buckets.length > 0
                    ? <RecordTable rows={buckets} />
                    : <EmptyState icon={I.activity} title="No resolved predictions yet"
                        hint="Calibration needs predictions whose outcome has been recorded. Until then there is nothing to measure, which is different from being well calibrated." />}
                </>
              );
            }}
          </Panel>
        </>
      )}

      <C2CToast msg={toast} />
    </div>
  );
}
