import React, { useState, useRef, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag, useLive } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { AnswerLead } from '../AnswerLead';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import {
  DR_CONN,
  DR_CATS,
  DR_RESULTS,
  DR_SYNTH,
  DEPTHS,
  TIER_TONE,
  type ConnectorInfo,
  type ConnectorState,
  type ConnectorType,
  type ConnectorCategory,
  type ConnectorTier,
  type CredentialField,
  type DrJob,
  type ResearchDepth,
} from '../fixtures/deep-research-data';
import '../styles/project-home-v2.css';

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

/* ── Live board types (GET /api/deep-research/board -> { success, data }) ── */

interface DrBoardConnector {
  id: string;
  name: string;
  type: string;
  cat: string;
  tier: string;
  creds: boolean;
  icon: string | null;
  desc: string;
  cf: CredentialField[];
  configured: boolean;
}
interface DrBoardCredits {
  remaining: number;
  limit: number;
  tier: string | null;
}
interface DrBoardRunJob {
  name: string;
  state: 'run' | 'done';
  hits: number | null;
}
interface DrBoardRun {
  id: number;
  uuid: string | null;
  status: string;
  indication: string | null;
  progress: number;
  creditsUsed: number;
  jobs: DrBoardRunJob[];
  createdAt: string | null;
  completedAt: string | null;
}
interface DrBoardData {
  connectors: DrBoardConnector[];
  connectorCount: number;
  configuredCount: number;
  credits: DrBoardCredits | null;
  runs: DrBoardRun[];
}

/* Sample deep-research credit allowance -- shown only when the board endpoint is
   unreachable (mirrors the client's prior hardcoded 42/60 professional). */
const DR_CREDITS_FIXTURE: DrBoardCredits = { remaining: 42, limit: 60, tier: 'professional' };

/* The { success, data } board the surface falls back to when the live endpoint
   is unreachable or unprovisioned -- shape-exact so `raw.data.data` is uniform
   whether live or sample. Connectors mirror the client's own default seed
   (public ready, credentialed not-configured). */
const DR_BOARD_FIXTURE: { data: DrBoardData } = {
  data: {
    connectors: DR_CONN.map((c) => ({ ...c, configured: !c.creds })),
    connectorCount: DR_CONN.length,
    configuredCount: DR_CONN.filter((c) => !c.creds).length,
    credits: DR_CREDITS_FIXTURE,
    runs: [],
  },
};

/* ════ DeepResearch — connectors & deep research surface ════ */

export function DeepResearch({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const open = (id: string) => {
    try {
      localStorage.setItem('c2c_open_surface', id);
    } catch (_e) {
      /* noop */
    }
    onNav && onNav(id);
  };

  const [tab, setTab] = useState<'research' | 'connectors'>('research');
  const [conn, setConn] = useState<ConnectorState[]>(
    DR_CONN.map((c) => ({ ...c, configured: !c.creds })),
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
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* Live board -- GET /api/deep-research/board -> { success, data: DrBoard }.
     useLive assigns the WHOLE body to `.data`, so the display payload is at
     `raw.data.data`. Connectors are the primary read-model; credits ride the
     same envelope. */
  const raw = useLive<{ data?: DrBoardData }>('/api/deep-research/board', DR_BOARD_FIXTURE);
  const board = raw.data?.data;

  /* Fail-closed shape guard -- trust the live connector catalog only on a 200
     that structurally matches (Array.isArray + first-element typeof). The route
     always returns the catalog (falling back to the static one), so there is no
     provisioned flag to gate on; a bad shape keeps the fixture, shown as sample. */
  const connectorsLive = Boolean(
    !raw.sample &&
      board &&
      Array.isArray(board.connectors) &&
      board.connectors.length > 0 &&
      typeof board.connectors[0]?.id === 'string' &&
      typeof board.connectors[0]?.configured === 'boolean',
  );
  const connectorsSample = !connectorsLive;
  const liveConnectors = connectorsLive ? board!.connectors : null;

  /* Re-seed the connector state from the live catalog once it resolves, coercing
     the wider live field types back to the fixture unions. Keyed on the
     live-arrived boolean so a later connect/disconnect edit is never clobbered. */
  useEffect(() => {
    if (liveConnectors) {
      setConn(
        liveConnectors.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type as ConnectorType,
          cat: c.cat as ConnectorCategory,
          tier: c.tier as ConnectorTier,
          creds: c.creds,
          icon: c.icon ?? '',
          desc: c.desc,
          cf: c.cf,
          configured: c.configured,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectorsLive]);

  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  /* Credits -- the live board authoritatively reports the org's deep-research
     allowance; when it reports null (usage tables unreadable) we render "—"
     rather than fabricate a cap. Only a fail-closed (unreachable) board falls
     back to the sample allowance. remaining/limit === -1 means unlimited. */
  const creditsLive = Boolean(
    !raw.sample &&
      board &&
      board.credits &&
      typeof board.credits.remaining === 'number' &&
      typeof board.credits.limit === 'number',
  );
  const creditsData: DrBoardCredits | null = creditsLive
    ? board!.credits!
    : connectorsSample
      ? DR_CREDITS_FIXTURE
      : null;
  const creditsUnlimited = Boolean(
    creditsData && (creditsData.remaining === -1 || creditsData.limit === -1),
  );
  const creditsTier = creditsData?.tier ?? '—';
  const creditsLong = creditsData
    ? creditsUnlimited
      ? 'unlimited'
      : `${creditsData.remaining} of ${creditsData.limit}`
    : '—';
  const creditsShort = creditsData
    ? creditsUnlimited
      ? 'unlimited credits'
      : `${creditsData.remaining}/${creditsData.limit} credits`
    : '— credits';

  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase('idle');
    setJobs([]);
    fireToast('Research job stopped');
  };

  const launch = () => {
    if (!sel.length) return;
    const chosen = sel.map((id) => DR_CONN.find((c) => c.id === id)).filter(Boolean) as ConnectorInfo[];
    setPhase('running');
    setJobs(chosen.map((c) => ({ name: c.name, state: 'run' as const, hits: 0 })));
    const speed = depth === 'quick' ? 300 : depth === 'exhaustive' ? 800 : 550;
    timers.current = [];
    chosen.forEach((_, i) => {
      timers.current.push(
        setTimeout(() => {
          setJobs((js) =>
            js.map((j, k) =>
              k === i ? { ...j, state: 'done' as const, hits: Math.floor(Math.random() * 40) + 6 } : j,
            ),
          );
        }, 500 + i * speed),
      );
    });
    timers.current.push(setTimeout(() => setPhase('done'), 650 + chosen.length * speed));
  };

  const cats = [...new Set(conn.map((c) => c.cat))];
  const configuredCount = conn.filter((c) => c.configured).length;

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
      <SampleTag sample={connectorsSample} />
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
              Deep research is a governed job (tier: {creditsTier}). You have{' '}
              <b>{creditsLong}</b> research credits this period; a {depth} run costs{' '}
              {(DEPTHS.find((d) => d[0] === depth) || [])[2]}.
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
                  Parallel fan-out -- grounded synthesis -- {creditsShort}
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
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="s">{DR_RESULTS.length} top sources</span>
                    {/* Per-run results are not in the board read-model (listJobs
                        returns results = null); always fixture, shown honestly. */}
                    <SampleTag sample={true} />
                  </span>
                </div>
                <div className="pj-card-b">
                  <div className="sp-list">
                    {DR_RESULTS.map((r, i) => (
                      <div key={i} className="sp-row">
                        <span className="sp-tag2">SRC-{i + 1}</span>
                        <span className="sp-row-b">
                          <span className="sp-row-t">{r.title}</span>
                          <span className="sp-row-s">
                            {r.conn} -- {r.meta} -- {r.date}
                          </span>
                        </span>
                        <button
                          className="sp-go"
                          onClick={() => ask('Open source SRC-' + (i + 1) + ': ' + r.title)}
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
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="s">every claim cited</span>
                    {/* Synthesis is not in the board read-model (listJobs returns
                        synthesis = null); always fixture, shown honestly. */}
                    <SampleTag sample={true} />
                  </span>
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
                    {DR_SYNTH}
                  </div>
                  <div className="cm-pushbar" style={{ marginTop: 14 }}>
                    <button
                      className="sp-primary"
                      style={{ padding: '8px 14px' }}
                      onClick={() => {
                        open('vault');
                        fireToast('Saved to Vault with citations');
                      }}
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
                      onClick={() => fireToast('Exported research brief (PDF)')}
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
