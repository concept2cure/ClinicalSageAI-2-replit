/**
 * Mission Control — the program operating surface.
 *
 * Registry id: `mission-control`.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `server/routes/mission-control.ts` is the platform's project-management
 * engine — Programs → Destinations → Artifacts → Evidence → Dependencies →
 * Decisions → Reviews → Risks, org-scoped, with Part 11 provenance on every
 * mutation. Thirty-eight endpoints, mounted at `/api/mission-control`, and until
 * now the string "mission-control" did not appear anywhere in `client/src`. The
 * PM system had no UI at all.
 *
 * ── What this surface covers, and what it does not ───────────────────────────
 * The program spine: list and open a program, see its readiness with the
 * blockers and next actions the engine derives, and read the artifacts, risks,
 * decisions and stale dependencies behind that score.
 *
 * It deliberately does NOT wrap all thirty-eight endpoints. Destinations, route
 * plans, evidence graph editing, review workflow, approval delegation and
 * authority interactions each need their own interaction model, and a surface
 * that exposed every endpoint as a form would be an API browser rather than a
 * product. Those are scoped in `docs/design/WORK_ORDER_mission_control.md`.
 *
 * ── Honesty rules this surface follows ───────────────────────────────────────
 * Every number shown comes from the server. Readiness is not recomputed here —
 * the engine owns the weighting, and a second implementation in the browser
 * would drift from the one that gets defended to a regulator. When a call
 * fails, the surface says which call and why rather than rendering zeros: a
 * readiness of 0% and a readiness that could not be loaded are different facts,
 * and only one of them means the program is in trouble.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { apiRequest, extractApiError, serverMessage } from '@/lib/queryClient';
import { usePublishSurfaceContext } from '../surfaceContext';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

const BASE = '/api/mission-control';

interface Program {
  id: number;
  name: string;
  code?: string;
  customerTrack?: string;
  indication?: string;
  therapeuticArea?: string;
  developmentStage?: string;
  primaryMarket?: string;
  status?: string;
  targetSubmissionDate?: string | null;
  updatedAt?: string;
}

interface Readiness {
  readiness: Record<string, number>;
  overallConfidence: number;
  summary: Record<string, number>;
  blockers: Array<{ type: string; message: string; severity: string }>;
  nextActions: Array<{ action: string; target: string; priority: string; reason: string }>;
}

type Load<T> = { state: 'idle' | 'loading' | 'ready' | 'error'; data: T | null; error?: string };
const idle = <T,>(): Load<T> => ({ state: 'idle', data: null });

async function get<T>(path: string): Promise<Load<T>> {
  try {
    const res = await apiRequest('GET', path);
    const parsed = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      return {
        state: 'error',
        data: null,
        error:
          res.status === 401
            ? 'Sign in to your tenant to load Mission Control.'
            // This read `parsed.error` first, so on the refusal envelope
            // { error: 'FORBIDDEN', message: '<the reason>' } the enum token was
            // rendered as the panel's hint and the reason was dropped.
            // extractApiError takes the sentence wherever the envelope put it and
            // substitutes a status-keyed one when the server sent none — these
            // panels are generic loaders with no domain copy that would say more.
            : extractApiError(parsed, res.status).message,
      };
    }
    return { state: 'ready', data: (parsed?.data ?? null) as T };
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

/** Insert spaces before capitals: `artifactCompleteness` → `Artifact completeness`. */
function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Severity and score both carry a tone. Tone is never the only signal — every
 * chip below also carries its word, and every bar its number, so the meaning
 * survives for a reader who cannot distinguish the colours.
 */
function severityTone(s: string): 'ok' | 'warn' | 'err' {
  const v = s.toLowerCase();
  if (v === 'critical' || v === 'high') return 'err';
  if (v === 'medium' || v === 'moderate') return 'warn';
  return 'ok';
}
function scoreTone(n: number): 'ok' | 'warn' | 'err' {
  if (n >= 75) return 'ok';
  if (n >= 50) return 'warn';
  return 'err';
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center' }}>
      <div style={{ fontSize: 12 }}>{label}</div>
      <div className="mono" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{pct}%</div>
      <div
        // The bar is decoration over the number, not a substitute for it — the
        // percentage is always present for anyone the bar does not serve.
        aria-hidden="true"
        style={{
          gridColumn: '1 / -1', height: 6, borderRadius: 3,
          background: 'var(--bg-200, #e8e6dc)', overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`, height: '100%',
            background:
              scoreTone(pct) === 'ok' ? 'var(--success, #5e6d49)'
              : scoreTone(pct) === 'warn' ? 'var(--warning, #955d22)'
              : 'var(--error, #b63939)',
            transition: 'width var(--dur-normal, 200ms) ease-out',
          }}
        />
      </div>
    </div>
  );
}

/**
 * Server data as an array, whatever arrived.
 *
 * `data ?? []` is not enough and the difference is a crash: `??` only replaces
 * null and undefined, so a response body of `{…}` where a list was expected
 * stays truthy and `.slice` throws. That is the same class as the `ectd-compile`
 * defect — a guard that covers the container and not the member.
 */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function Section({
  title, hint, load, empty, children,
}: {
  title: string;
  hint?: string;
  load: Load<unknown[]>;
  empty: string;
  /**
   * A THUNK, not an element. JSX children are evaluated eagerly at the call
   * site, so the `Array.isArray` guard below could never protect them — the
   * caller's `.map` over a non-array had already thrown before `Section` ran.
   * Taking a function moves the evaluation behind the guard, which is the only
   * placement that actually holds.
   */
  children: () => React.ReactNode;
}) {
  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">{title}</span>
        {hint && <span className="s">{hint}</span>}
      </div>
      <div className="pj-card-b" style={{ padding: 0 }}>
        {load.state === 'loading' ? (
          <div style={{ padding: 16 }}><EmptyState icon={I.clock} title={`Loading ${title.toLowerCase()}…`} /></div>
        ) : load.state === 'error' ? (
          <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title={`Couldn’t load ${title.toLowerCase()}`} hint={load.error} /></div>
        ) : !Array.isArray(load.data) || load.data.length === 0 ? (
          <div style={{ padding: 16 }}><EmptyState icon={I.list} title={empty} /></div>
        ) : (
          children()
        )}
      </div>
    </div>
  );
}

const TRACKS = ['biotech', 'pharma', 'cro', 'device', 'diagnostics'] as const;

export function MissionControl(_props: SurfaceViewProps) {
  const [toast, fireToast] = useToast();

  const [programs, setPrograms] = useState<Load<Program[]>>(idle<Program[]>());
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [readiness, setReadiness] = useState<Load<Readiness>>(idle<Readiness>());
  const [artifacts, setArtifacts] = useState<Load<any[]>>(idle<any[]>());
  const [risks, setRisks] = useState<Load<any[]>>(idle<any[]>());
  const [decisions, setDecisions] = useState<Load<any[]>>(idle<any[]>());
  const [stale, setStale] = useState<Load<any[]>>(idle<any[]>());

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', customerTrack: 'biotech', indication: '' });
  const [busy, setBusy] = useState(false);

  const loadPrograms = useCallback(async () => {
    setPrograms({ state: 'loading', data: null });
    const r = await get<Program[]>(`${BASE}/programs`);
    setPrograms(r);
    if (r.state === 'ready' && Array.isArray(r.data) && r.data.length > 0) {
      setSelectedId(prev => (prev != null && r.data!.some(p => p.id === prev) ? prev : r.data![0].id));
    }
  }, []);

  useEffect(() => { void loadPrograms(); }, [loadPrograms]);

  useEffect(() => {
    if (selectedId == null) return;
    let cancelled = false;
    const p = `${BASE}/programs/${selectedId}`;
    const set = <T,>(fn: (v: Load<T>) => void, v: Load<T>) => { if (!cancelled) fn(v); };

    setReadiness({ state: 'loading', data: null });
    setArtifacts({ state: 'loading', data: null });
    setRisks({ state: 'loading', data: null });
    setDecisions({ state: 'loading', data: null });
    setStale({ state: 'loading', data: null });

    void get<Readiness>(`${p}/readiness`).then(r => set(setReadiness, r));
    void get<any[]>(`${p}/artifacts`).then(r => set(setArtifacts, r));
    void get<any[]>(`${p}/risks`).then(r => set(setRisks, r));
    void get<any[]>(`${p}/decisions`).then(r => set(setDecisions, r));
    void get<any[]>(`${p}/dependencies/stale`).then(r => set(setStale, r));

    return () => { cancelled = true; };
  }, [selectedId]);

  const createProgram = useCallback(async () => {
    if (!draft.name.trim()) { fireToast('Enter a program name.', 'error'); return; }
    setBusy(true);
    try {
      const res = await apiRequest('POST', `${BASE}/programs`, {
        name: draft.name.trim(),
        customerTrack: draft.customerTrack,
        ...(draft.indication.trim() ? { indication: draft.indication.trim() } : {}),
      });
      const parsed = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        fireToast(
          res.status === 401 ? 'Sign in to your tenant to create a program.'
          // `parsed.error` was toasted verbatim, so a coded refusal reached the
          // user as its token. serverMessage returns only a real sentence, and
          // null when there is none — which is when this surface's own copy is
          // the better answer.
          : serverMessage(parsed) ?? `Could not create the program (HTTP ${res.status}).`,
          'error',
        );
        return;
      }
      setCreating(false);
      setDraft({ name: '', customerTrack: 'biotech', indication: '' });
      fireToast('Program created.');
      await loadPrograms();
      if (parsed?.data?.id) setSelectedId(parsed.data.id);
    } catch (e) {
      // apiRequest throws for every non-OK status except 401, and this call had
      // no catch at all: a refused create (a duplicate name, a track the caller
      // may not use) rejected out of the callback and the user was shown
      // nothing — an error rendered as no result. Only an ApiRequestError's
      // message is safe to show; a native fetch rejection keeps the copy below.
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      fireToast(known && (e as Error).message ? (e as Error).message : 'Could not create the program.', 'error');
    } finally { setBusy(false); }
  }, [draft, fireToast, loadPrograms]);

  const selected = useMemo(
    () => asArray<Program>(programs.data).find(p => p.id === selectedId) ?? null,
    [programs.data, selectedId]
  );

  const readinessRows = useMemo(() => {
    const r = readiness.data?.readiness;
    if (!r || typeof r !== 'object') return [];
    return Object.entries(r).filter(([, v]) => typeof v === 'number') as Array<[string, number]>;
  }, [readiness.data]);

  /* What AnA can see of this screen. The nouns and numbers a user would point
     at — never the raw responses, and never anything not rendered above, so
     this channel cannot become a way to feed the model data the screen is
     hiding. `blockers` are included because "what should I do next?" is the
     question this surface exists to answer, and without them AnA would have to
     ask the user to restate what is already on their screen. */
  const anaContext = useMemo(() => {
    if (!selected) {
      return {
        summary: 'Mission Control with no program selected.',
        facts: { programCount: asArray(programs.data).length },
        availableActions: ['Create a program', 'Open a program'],
      };
    }
    return {
      summary:
        `Mission Control, program "${selected.name}"` +
        (readiness.data ? ` at ${readiness.data.overallConfidence}% overall readiness.` : '.'),
      facts: {
        programId: selected.id,
        programName: selected.name,
        customerTrack: selected.customerTrack ?? null,
        indication: selected.indication ?? null,
        overallConfidence: readiness.data?.overallConfidence ?? null,
        readinessLoaded: readiness.state === 'ready',
        blockers: asArray<any>(readiness.data?.blockers).map(b => `${b.severity}: ${b.message}`),
        nextActions: asArray<any>(readiness.data?.nextActions).map(a => `${a.action} — ${a.target}`),
        artifactCount: asArray(artifacts.data).length,
        riskCount: asArray(risks.data).length,
        staleDependencyCount: asArray(stale.data).length,
      },
      availableActions: [
        'Create a program',
        'Switch to another program',
        'Explain a readiness dimension',
        'Explain what is blocking this program',
      ],
    };
  }, [selected, programs.data, readiness.state, readiness.data, artifacts.data, risks.data, stale.data]);

  usePublishSurfaceContext('mission-control', anaContext);

  return (
    <div className="cm-body">
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Mission Control</span>
          <span className="s">Programs, readiness and what is blocking them</span>
        </div>
        <div className="pj-card-b" style={{ fontSize: 13, color: 'var(--text-300, #6b6963)', lineHeight: 1.5 }}>
          Readiness is computed by the server from the program’s artifacts, evidence, reviews,
          risks and dependencies. Nothing on this page is recalculated in the browser — the
          score you see is the score the engine will defend.
        </div>
      </div>

      {/* ── Programs ── */}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Programs</span>
          <span className="s">{asArray(programs.data).length} in this organization</span>
        </div>
        <div className="pj-card-b">
          {programs.state === 'loading' ? (
            <EmptyState icon={I.clock} title="Loading programs…" />
          ) : programs.state === 'error' ? (
            <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load programs" hint={programs.error} />
          ) : !Array.isArray(programs.data) || programs.data.length === 0 ? (
            <EmptyState
              icon={I.rocket}
              title="No programs yet"
              hint="A program is the unit Mission Control tracks: its artifacts, evidence, reviews, risks and submission destinations all hang off it."
            />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {programs.data.map(p => (
                <button
                  key={p.id}
                  className={'btn' + (p.id === selectedId ? ' primary' : '')}
                  style={{ height: 28, fontSize: 12 }}
                  aria-pressed={p.id === selectedId}
                  onClick={() => setSelectedId(p.id)}
                >
                  {p.name}{p.code ? ` · ${p.code}` : ''}
                </button>
              ))}
            </div>
          )}

          {creating ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8, alignItems: 'end' }}>
              <label style={{ fontSize: 12 }}>Program name
                <input className="c2c-input" style={{ height: 30 }} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. C2C-101 first-in-human" />
              </label>
              <label style={{ fontSize: 12 }}>Track
                <select className="c2c-input" style={{ height: 30 }} value={draft.customerTrack} onChange={e => setDraft({ ...draft, customerTrack: e.target.value })}>
                  {TRACKS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Indication <span style={{ color: 'var(--text-300, #6b6963)' }}>(optional)</span>
                <input className="c2c-input" style={{ height: 30 }} value={draft.indication} onChange={e => setDraft({ ...draft, indication: e.target.value })} placeholder="e.g. NSCLC" />
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn primary" style={{ height: 30 }} onClick={createProgram} disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
                <button className="btn" style={{ height: 30 }} onClick={() => setCreating(false)} disabled={busy}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn" style={{ height: 30 }} onClick={() => setCreating(true)}>{I.plus} New program</button>
          )}
        </div>
      </div>

      {selected && (
        <>
          {/* ── Readiness ── */}
          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">Readiness — {selected.name}</span>
              {readiness.state === 'ready' && readiness.data && (
                <span className={'rd-chip tone-' + scoreTone(readiness.data.overallConfidence)}>
                  {readiness.data.overallConfidence}% overall confidence
                </span>
              )}
            </div>
            <div className="pj-card-b">
              {readiness.state === 'loading' ? (
                <EmptyState icon={I.clock} title="Loading readiness…" />
              ) : readiness.state === 'error' ? (
                // Distinct from a low score on purpose: a readiness that could not
                // be loaded and a readiness of 0% are different facts, and only one
                // of them means the program is in trouble.
                <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load readiness" hint={readiness.error} />
              ) : readinessRows.length === 0 ? (
                <EmptyState icon={I.activity} title="No readiness signal yet" hint="Readiness is derived from artifacts, evidence, reviews, risks and dependencies. Add any of them and the score appears." />
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '12px 20px' }}>
                    {readinessRows.map(([k, v]) => <ScoreBar key={k} label={humanize(k)} value={v} />)}
                  </div>

                  {Array.isArray(readiness.data?.blockers) && readiness.data!.blockers.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Blockers</div>
                      <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                        {readiness.data!.blockers.map((b, i) => (
                          <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13 }}>
                            <span className={'rd-chip tone-' + severityTone(b.severity)}>{b.severity}</span>
                            <span>{b.message}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {Array.isArray(readiness.data?.nextActions) && readiness.data!.nextActions.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Next actions</div>
                      <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                        {readiness.data!.nextActions.map((a, i) => (
                          <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13 }}>
                            <span className={'rd-chip tone-' + severityTone(a.priority)}>{a.priority}</span>
                            <span><b>{a.action}</b> — {a.target}. <span style={{ color: 'var(--text-300, #6b6963)' }}>{a.reason}</span></span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── The records behind the score ── */}
          <Section title="Artifacts" hint={`${asArray(artifacts.data).length}`} load={artifacts} empty="No artifacts on this program yet">
            {() => <table className="reg-tbl">
              <thead><tr><th scope="col">Title</th><th scope="col">Type</th><th scope="col">State</th><th scope="col">Destination</th></tr></thead>
              <tbody>
                {asArray<any>(artifacts.data).slice(0, 100).map((a: any, i: number) => (
                  <tr key={a.id ?? i}>
                    <td style={{ fontWeight: 600 }}>{a.title ?? '—'}</td>
                    <td>{a.artifactType ?? '—'}</td>
                    <td>{a.lifecycleState ?? '—'}</td>
                    <td>{a.destinationId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
          </Section>

          <Section title="Risks" hint={`${asArray(risks.data).length}`} load={risks} empty="No risks logged">
            {() => <table className="reg-tbl">
              <thead><tr><th scope="col">Risk</th><th scope="col">Severity</th><th scope="col">Status</th><th scope="col">Owner</th></tr></thead>
              <tbody>
                {asArray<any>(risks.data).slice(0, 100).map((r: any, i: number) => (
                  <tr key={r.id ?? i}>
                    <td>{r.title ?? r.description ?? '—'}</td>
                    <td><span className={'rd-chip tone-' + severityTone(String(r.severity ?? ''))}>{r.severity ?? '—'}</span></td>
                    <td>{r.status ?? '—'}</td>
                    <td>{r.ownerId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
          </Section>

          <Section title="Stale dependencies" hint="Upstream changed after the downstream artifact was written" load={stale} empty="No stale dependencies">
            {() => <table className="reg-tbl">
              <thead><tr><th scope="col">Upstream</th><th scope="col">Downstream</th><th scope="col">Kind</th></tr></thead>
              <tbody>
                {asArray<any>(stale.data).slice(0, 100).map((d: any, i: number) => (
                  <tr key={d.id ?? i}>
                    <td>{d.upstreamId ?? '—'}</td>
                    <td>{d.downstreamId ?? '—'}</td>
                    <td>{d.dependencyType ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
          </Section>

          <Section title="Decisions" hint={`${asArray(decisions.data).length}`} load={decisions} empty="No decisions recorded">
            {() => <table className="reg-tbl">
              <thead><tr><th scope="col">Decision</th><th scope="col">Rationale</th><th scope="col">Decided</th></tr></thead>
              <tbody>
                {asArray<any>(decisions.data).slice(0, 100).map((d: any, i: number) => (
                  <tr key={d.id ?? i}>
                    <td style={{ fontWeight: 600 }}>{d.title ?? d.decision ?? '—'}</td>
                    <td>{d.rationale ?? '—'}</td>
                    <td>{d.decidedAt ? String(d.decidedAt).slice(0, 10) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
          </Section>
        </>
      )}

      {/* role="status" + aria-live: the toast carries every validation message
          ("Enter a program name.") and every write confirmation, and without a
          live region none of it reaches a screen reader. WCAG 2.2 SC 4.1.3. */}
      <C2CToast msg={toast} />
    </div>
  );
}
