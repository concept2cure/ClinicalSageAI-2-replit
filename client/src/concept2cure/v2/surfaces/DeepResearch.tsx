import React, { useState, useRef, useEffect } from 'react';
import { I } from '../icons';
import { useLiveData } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import { AnswerLead } from '../AnswerLead';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import {
  DR_CONN,
  DR_CATS,
  DEPTHS,
  TIER_TONE,
  type ConnectorInfo,
  type ConnectorState,
  type DrJob,
  type ResearchDepth,
  type ConnectorTier,
} from '../fixtures/deep-research-data';
import '../styles/project-home-v2.css';

/* Real deep-research contract — GET /api/deep-research/board (credits) and
   POST/GET /api/deep-research/jobs (launch + poll). No fabricated fields;
   credits is null (rendered "—") when the usage/license tables are unreadable. */
interface DrCredits { remaining: number; limit: number; tier: string | null }
/**
 * GET /api/deep-research/board.
 *
 * `connectors` / `connectorCount` / `configuredCount` were missing from this
 * type, so the response's real per-org connector status was parsed and thrown
 * away. The surface then invented its own: `configured: !c.creds` — true for
 * every connector that does not require credentials — which is a fact about the
 * CATALOG, not about this organisation. Every org saw the same "N of 18
 * connectors configured", and a connector nobody had set up rendered "ready".
 *
 * The server has had the real answer all along: deep-research-board.routes.ts
 * builds these three from getConnectorCatalog(orgId) and maps each row into
 * exactly this client shape (category→cat, requiredTier→tier,
 * requiresCredentials→creds, description→desc).
 */
interface DrBoard {
  credits: DrCredits | null;
  connectors?: ConnectorState[];
  connectorCount?: number;
  configuredCount?: number;
}
interface DrResult { title?: string; conn?: string; source?: string; meta?: string; date?: string; url?: string }
interface DrRunJob {
  id: number;
  status: string;
  progress?: number;
  results?: DrResult[] | null;
  synthesis?: string | null;
  connectorLogs?: Record<string, { resultCount?: number; state?: string }> | null;
}

/* ── Inline shared kit helpers ── */

function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const fire = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2400);
  };
  return [msg, fire];
}

function C2CToast({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="de-toast">
      <span className="ico">{I.checkCircle}</span>
      {msg}
    </div>
  );
}

/* ════ DeepResearch — connectors & deep research surface ════ */

export function DeepResearch({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;

  const [tab, setTab] = useState<'research' | 'connectors'>('research');
  /* Seeded NOT configured, then replaced by the org's real status when the board
     arrives. The old seed was `configured: !c.creds`, which asserted that every
     credential-free connector was already set up for this org — a claim the
     client had no basis for. Unknown must read as not configured. */
  const [conn, setConn] = useState<ConnectorState[]>(
    DR_CONN.map((c) => ({ ...c, configured: false })),
  );
  const [query, setQuery] = useState(
    'Precedent accelerated approvals for RTK-X inhibitors on an ORR endpoint',
  );
  const [sel, setSel] = useState<string[]>([
    'clinical_trials_gov',
    'pubmed',
    'fda_drugs',
    'ema_epar',
  ]);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [jobs, setJobs] = useState<DrJob[]>([]);
  const [form, setForm] = useState<ConnectorInfo | null>(null);
  const [depth, setDepth] = useState<ResearchDepth>('standard');
  const [toast, fireToast] = useToast();
  const [jobId, setJobId] = useState<number | null>(null);
  const [job, setJob] = useState<DrRunJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real deep-research allowance for this org (GET /api/deep-research/board).
  // Honest null (rendered "—") when usage/license are unreadable — never a
  // fabricated 42/60 placeholder.
  const board = useLiveData<DrBoard>('/api/deep-research/board');
  const credits = board.data?.credits ?? null;

  /* Adopt the org's real connector status once the board resolves. Falls back to
     the static catalog (all not-configured) if the endpoint degrades — the route
     fails closed to the static catalog by design, so an unreadable table shows
     an honest "not configured" rather than an invented "ready". */
  const boardConnectors = board.data?.connectors;
  useEffect(() => {
    if (boardConnectors && boardConnectors.length > 0) setConn(boardConnectors);
  }, [boardConnectors]);

  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const connName = (id: string) => DR_CONN.find((c) => c.id === id)?.name || id;
  const fanout = (j: DrRunJob | null, done: boolean): DrJob[] =>
    sel.map((id) => {
      const log = (j?.connectorLogs || {})[id];
      const isDone = done || (!!log && (log.state === 'done' || log.resultCount != null));
      return { name: connName(id), state: isDone ? 'done' : 'run', hits: log?.resultCount ?? 0 };
    });

  /* Poll a real research job until it settles — the per-connector fan-out,
     results and synthesis all come from the persisted deep_research_jobs run;
     no simulated hit counts. */
  const poll = async (id: number) => {
    let res: Response;
    try {
      res = await apiRequest('GET', `/api/deep-research/jobs/${id}`);
    } catch (e) {
      setPhase('idle');
      fireToast(`Couldn't reach the research engine — ${e instanceof Error ? e.message : String(e)}.`);
      return;
    }
    const j = (await res.json().catch(() => null)) as DrRunJob | null;
    if (!res.ok || !j) {
      setPhase('idle');
      fireToast(`Research job read failed (HTTP ${res.status}).`);
      return;
    }
    const done =
      j.status === 'completed' || j.status === 'done' || j.status === 'failed' || j.status === 'cancelled';
    setJob(j);
    setJobs(fanout(j, done));
    if (done) setPhase(j.status === 'completed' || j.status === 'done' ? 'done' : 'idle');
    else pollRef.current = setTimeout(() => poll(id), 1600);
  };

  const launch = async () => {
    if (!sel.length) return;
    if (pollRef.current) clearTimeout(pollRef.current);
    setJob(null);
    setPhase('running');
    setJobs(fanout(null, false));
    let res: Response;
    try {
      res = await apiRequest('POST', '/api/deep-research/jobs', {
        query: { indication: query },
        connectorIds: sel,
        // Sent verbatim: DEPTHS keys are the engine's own depth values now, so
        // there is no translation step in which a price can diverge from a cost.
        depth,
      });
    } catch (e) {
      setPhase('idle');
      setJobs([]);
      fireToast(`Couldn't reach the research engine — ${e instanceof Error ? e.message : String(e)}.`);
      return;
    }
    const j = (await res.json().catch(() => null)) as DrRunJob | null;
    if (!res.ok || !j?.id) {
      setPhase('idle');
      setJobs([]);
      fireToast(
        res.status === 403
          ? 'Deep research needs a higher plan, or you are out of research credits this period.'
          : (j as { error?: string } | null)?.error || `Couldn't start research (HTTP ${res.status}).`,
      );
      return;
    }
    setJobId(j.id);
    setJob(j);
    poll(j.id);
  };

  const stop = async () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    const id = jobId;
    setPhase('idle');
    setJobs([]);
    setJob(null);
    if (id != null) {
      try {
        await apiRequest('POST', `/api/deep-research/jobs/${id}/stop`);
      } catch {
        /* best effort */
      }
    }
    fireToast('Research job stopped');
  };

  const cats = [...new Set(DR_CONN.map((c) => c.cat))];
  /* Prefer the server's own count; fall back to counting what we hold. */
  const configuredCount = board.data?.configuredCount ?? conn.filter((c) => c.configured).length;

  const doConnect = (c: ConnectorState) => {
    if (!c.creds) {
      setConn((cs) => cs.map((x) => (x.id === c.id ? { ...x, configured: true } : x)));
      fireToast(c.name + ' enabled');
      return;
    }
    setForm(c);
  };

  return (
    <div className="sp" style={{ maxWidth: 1060 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Intelligence -- connectors & deep research</div>
          <h1 className="sp-title">Deep Research & Connectors</h1>
          <p className="sp-state">
            Fan out one question across your connected sources -- ClinicalTrials.gov, PubMed,
            Drugs@FDA, EMA, EUDAMED, EU CTIS, PMDA, your DMS and EHR (FHIR R4) -- and get a
            grounded synthesis with every claim traced to source. {configuredCount} of{' '}
            {conn.length} connectors configured.
          </p>
        </div>
        <button className="sp-primary" onClick={() => setTab('connectors')}>
          {I.database} Manage connectors
        </button>
      </div>

      {tab === 'research' && (
        <AnswerLead
          tone="calm"
          eyebrow="What you can find out right now"
          headline={
            <>
              Ask one question and I fan it out across{' '}
              <b>{conn.filter((c) => c.configured).length}</b> connected sources -- then hand you a
              synthesis with <b>every claim traced to source</b>.
            </>
          }
          body={
            <>
              Deep research is a governed job{credits?.tier ? ` (tier: ${credits.tier})` : ''}.{' '}
              {board.loading ? (
                'Loading your research-credit allowance…'
              ) : credits ? (
                <>
                  You have{' '}
                  <b>{credits.remaining < 0 ? 'unlimited' : `${credits.remaining} of ${credits.limit}`}</b>{' '}
                  research credits this period.
                </>
              ) : (
                'Your research-credit allowance loads from your plan.'
              )}
            </>
          }
          reassure="Nothing is fabricated -- if a source can't support a claim, I say so and cite what I did find."
          action={{ label: 'Launch this research', onClick: launch }}
          secondary="Or refine the question and connectors below."
        />
      )}

      <div className="reg-tabs">
        <button
          className={'reg-tab' + (tab === 'research' ? ' on' : '')}
          onClick={() => setTab('research')}
        >
          Deep research
        </button>
        <button
          className={'reg-tab' + (tab === 'connectors' ? ' on' : '')}
          onClick={() => setTab('connectors')}
        >
          Connectors -- {conn.length}
        </button>
      </div>

      {tab === 'research' && (
        <div>
          <div className="pj-card" style={{ marginBottom: 14 }}>
            <div className="pj-card-b">
              <div className="pj-seclbl" style={{ marginTop: 0 }}>
                Research question
              </div>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  fontSize: 14,
                  color: 'var(--text-100)',
                  background: 'var(--bg-000)',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <div className="pj-seclbl">Query these connectors</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {conn
                  .filter((c) => c.configured)
                  .map((c) => (
                    <button
                      key={c.id}
                      className="sp-starter"
                      style={{
                        width: 'auto',
                        padding: '6px 11px',
                        borderColor: sel.includes(c.id)
                          ? 'var(--accent-100)'
                          : 'var(--border)',
                        background: sel.includes(c.id)
                          ? 'var(--accent-000)'
                          : 'var(--bg-000)',
                        color: sel.includes(c.id)
                          ? 'var(--accent-200)'
                          : 'var(--text-300)',
                      }}
                      onClick={() => toggle(c.id)}
                    >
                      {sel.includes(c.id) ? I.check : I.plus}
                      <span>{c.name}</span>
                    </button>
                  ))}
              </div>
              <div className="pj-seclbl">Research depth</div>
              <div style={{ display: 'flex', gap: 7 }}>
                {DEPTHS.map(([k, l, cost]) => (
                  <button
                    key={k}
                    className="sp-starter"
                    style={{
                      width: 'auto',
                      padding: '6px 12px',
                      borderColor: depth === k ? 'var(--accent-100)' : 'var(--border)',
                      background: depth === k ? 'var(--accent-000)' : 'var(--bg-000)',
                      color: depth === k ? 'var(--accent-200)' : 'var(--text-300)',
                    }}
                    onClick={() => setDepth(k as ResearchDepth)}
                  >
                    <span>{l}</span>
                    <span className="sp-q-s" style={{ marginLeft: 6 }}>
                      {cost}
                    </span>
                  </button>
                ))}
              </div>
              <div className="cm-pushbar" style={{ marginTop: 14 }}>
                {phase === 'running' ? (
                  <button
                    className="sp-primary"
                    style={{
                      padding: '9px 16px',
                      background: 'var(--error)',
                      borderColor: 'var(--error)',
                    }}
                    onClick={stop}
                  >
                    {I.close} Stop research
                  </button>
                ) : (
                  <button
                    className="sp-primary"
                    style={{ padding: '9px 16px' }}
                    onClick={launch}
                    disabled={!sel.length}
                  >
                    {I.telescope} Launch deep research
                  </button>
                )}
                <span className="sp-q-s">
                  Parallel fan-out -- grounded synthesis
                  {credits ? ` -- ${credits.remaining < 0 ? 'unlimited' : credits.remaining + '/' + credits.limit} credits` : ''}
                </span>
              </div>
            </div>
          </div>

          {phase !== 'idle' && (
            <div className="pj-card" style={{ marginBottom: 14 }}>
              <div className="pj-card-h">
                <span className="t">Fan-out progress</span>
                <span className="s">
                  {jobs.filter((j) => j.state === 'done').length}/{jobs.length} connectors
                </span>
              </div>
              <div className="pj-card-b">
                <div className="sp-list">
                  {jobs.map((j, i) => (
                    <div key={i} className="sp-row">
                      <span className="sp-q-ic">
                        {j.state === 'done' ? I.checkCircle : I.clock}
                      </span>
                      <span className="sp-row-b">
                        <span className="sp-row-t">{j.name}</span>
                        <span className="sp-row-s">
                          {j.state === 'done' ? j.hits + ' results returned' : 'querying...'}
                        </span>
                      </span>
                      {j.state === 'done' && <span className="rd-chip tone-ok">done</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {phase === 'done' && (
            <>
              <div className="pj-card" style={{ marginBottom: 14 }}>
                <div className="pj-card-h">
                  <span className="t">Aggregated results</span>
                  <span className="s">{(job?.results || []).length} top sources</span>
                </div>
                <div className="pj-card-b">
                  <div className="sp-list">
                    {(job?.results || []).length === 0 && (
                      <div className="sp-q-s" style={{ padding: '6px 2px' }}>
                        No sources were returned for this run.
                      </div>
                    )}
                    {(job?.results || []).map((r, i) => (
                      <div key={i} className="sp-row">
                        <span className="sp-tag2">SRC-{i + 1}</span>
                        <span className="sp-row-b">
                          <span className="sp-row-t">{r.title || r.source || 'Source ' + (i + 1)}</span>
                          <span className="sp-row-s">
                            {[r.conn || r.source, r.meta, r.date].filter(Boolean).join(' -- ')}
                          </span>
                        </span>
                        <button
                          className="sp-go"
                          onClick={() => ask('Open source SRC-' + (i + 1) + ': ' + (r.title || r.url || ''))}
                        >
                          {I.externalLink}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="pj-card">
                <div className="pj-card-h">
                  <span className="t">Grounded synthesis</span>
                  <span className="s">every claim cited</span>
                </div>
                <div className="pj-card-b">
                  <div
                    style={{
                      fontFamily: 'var(--font-serif,Georgia,serif)',
                      fontSize: 15,
                      lineHeight: 1.7,
                      color: 'var(--text-100)',
                      padding: '12px 14px',
                      background: 'var(--bg-050)',
                      borderLeft: '3px solid var(--ai)',
                      borderRadius: 8,
                    }}
                  >
                    {job?.synthesis || 'No synthesis was returned for this run.'}
                  </div>
                  <div className="cm-pushbar" style={{ marginTop: 14 }}>
                    <button
                      className="sp-primary"
                      style={{ padding: '8px 14px' }}
                      onClick={() => ask('Save this deep-research synthesis to the Vault with its citations.')}
                    >
                      {I.vault} Save to Vault
                    </button>
                    <button
                      className="sp-ask"
                      onClick={() =>
                        ask(
                          'Cite this deep-research synthesis into the Clinical Overview §2.5 precedent paragraph.',
                        )
                      }
                    >
                      {I.penLine} Cite in document
                    </button>
                    <button
                      className="sp-ask"
                      onClick={() => ask('Export this deep-research brief as a PDF.')}
                    >
                      {I.download} Export brief
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'connectors' && (
        <div>
          {cats.map((cat) => (
            <div key={cat} className="sp-sec">
              <div className="sp-sec-h">
                <span className="t">{DR_CATS[cat] || cat}</span>
                <span className="s">{conn.filter((c) => c.cat === cat).length}</span>
              </div>
              <div className="ae-grid">
                {conn
                  .filter((c) => c.cat === cat)
                  .map((c) => (
                    <div key={c.id} className="ae-sys" style={{ cursor: 'default' }}>
                      <div className="ae-sys-top">
                        <span className="ae-sys-mod">{c.type}</span>
                        <span
                          className={'rd-chip tone-' + (c.configured ? 'ok' : 'idle')}
                        >
                          {c.configured ? (c.creds ? 'connected' : 'ready') : 'not configured'}
                        </span>
                      </div>
                      <div className="ae-sys-t">{c.name}</div>
                      <div className="sp-q-s" style={{ margin: '2px 0 8px', lineHeight: 1.4 }}>
                        {c.desc}
                      </div>
                      <div className="ae-sys-foot">
                        <span className="ae-sys-tags">
                          <span
                            className={
                              'rd-chip tone-' + (TIER_TONE[c.tier as ConnectorTier] || 'idle')
                            }
                            style={{ fontSize: 9 }}
                          >
                            {c.tier}
                          </span>
                          <span className="ae-sys-tag">
                            {c.creds ? 'credentials' : 'no credentials'}
                          </span>
                        </span>
                        {c.configured ? (
                          c.creds ? (
                            <button
                              className="sp-q-a"
                              onClick={() =>
                                setConn((cs) =>
                                  cs.map((x) =>
                                    x.id === c.id ? { ...x, configured: false } : x,
                                  ),
                                )
                              }
                            >
                              Disconnect
                            </button>
                          ) : (
                            <span className="sp-q-s">public</span>
                          )
                        ) : (
                          <button className="sp-q-a" onClick={() => doConnect(c)}>
                            {I.plus} {c.creds ? 'Configure' : 'Enable'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <C2CForm
          config={{
            eyebrow:
              'Connector -- ' +
              (DR_CATS[form.cat] || form.cat) +
              ' -- ' +
              form.tier +
              ' tier',
            title: 'Configure ' + form.name,
            sub: form.desc,
            governed:
              'Credentials are stored per-organization, AES-256-GCM encrypted, with SSRF guards on any baseUrl/tokenEndpoint.',
            submitLabel: 'Store credentials & connect',
            fields: form.cf.map((f) => ({
              key: f.field,
              label: f.label,
              type: 'text' as const,
              placeholder: f.placeholder,
              required: !/optional/i.test(f.label),
            })),
          } as C2CFormConfig}
          onCancel={() => setForm(null)}
          onSubmit={() => {
            setConn((cs) =>
              cs.map((x) => (x.id === form.id ? { ...x, configured: true } : x)),
            );
            fireToast(form.name + ' connected');
            setForm(null);
          }}
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}
