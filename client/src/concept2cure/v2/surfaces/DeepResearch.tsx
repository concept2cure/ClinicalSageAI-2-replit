import React, { useState, useRef, useEffect } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import { AnswerLead } from '../AnswerLead';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import {
  // Canonical display config only — the category label map, the engine's two
  // research depths (pinned to the engine's own cost model by
  // deepResearchPricing.test.ts) and the tier→tone map. The connector CATALOG
  // (DR_CONN) is deliberately NOT imported any more; see the note on `conn`.
  DR_CATS,
  DEPTHS,
  TIER_TONE,
  type ConnectorState,
  type DrJob,
  type ResearchDepth,
  type ConnectorTier,
} from '../fixtures/deep-research-data';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { downloadBlob } from '../download';

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

/** POST /api/deep-research/connectors → { success } | { error }. */
interface DrConnectorWrite {
  success?: boolean;
  error?: string;
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

/* ════ DeepResearch — connectors & deep research surface ════ */

export function DeepResearch({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;

  const [tab, setTab] = useState<'research' | 'connectors'>('research');
  /* The research question starts EMPTY.
     It used to be initialised to "Precedent accelerated approvals for RTK-X
     inhibitors on an ORR endpoint" — an invented programme, pre-loaded as the
     textarea's VALUE, not its placeholder. It was therefore the payload of the
     very next request: the AnswerLead's "Launch this research" button POSTs
     `query.indication` straight to /api/deep-research/jobs, so a user who
     pressed the surface's primary action without reading it spent real research
     credits running a fabricated question about a molecule that does not exist.
     The example now lives in the placeholder, where it is visibly an example. */
  const [query, setQuery] = useState('');
  /* Connector selection starts EMPTY and is seeded, once, from the connectors
     this organisation actually has configured (below). The four ids that used to
     be hardcoded here were catalog ids, not this org's — and because the chip
     row only renders configured connectors, an unconfigured one stayed selected
     but INVISIBLE and was still sent in `connectorIds` on launch. */
  const [sel, setSel] = useState<string[]>([]);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [jobs, setJobs] = useState<DrJob[]>([]);
  const [form, setForm] = useState<ConnectorState | null>(null);
  const [depth, setDepth] = useState<ResearchDepth>('standard');
  const [toast, fireToast] = useToast();

  /* ── "Export brief" asked the assistant for a PDF ─────────────────────────
     `onClick={() => ask('Export this deep-research brief as a PDF.')}` — a
     download icon that opened a chat turn. The renderer exists:
     POST /api/concept2cure/artifacts/export-pdf takes { title, content },
     renders with pdf-lib and responds with the file.

     The brief that gets rendered is the synthesis plus its citation list,
     assembled from the SAME `job.results` the source table above renders — so
     what downloads is what is on screen, not a re-derivation. */
  const [exporting, setExporting] = useState(false);

  const exportBrief = async () => {
    if (!job?.synthesis || exporting) return;
    setExporting(true);
    try {
      const cited = (job.results || [])
        .map((r, i) => `[SRC-${i + 1}] ${r.title || r.source || 'Source'}${r.url ? ` — ${r.url}` : ''}`)
        .join('\n');
      const content =
        `${job.synthesis}\n\n` +
        (cited ? `Sources\n${cited}\n` : 'Sources\nNo sources were returned for this run.\n');
      const res = await apiRequest('POST', '/api/concept2cure/artifacts/export-pdf', {
        title: 'Deep research brief',
        content,
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        fireToast(
          'Brief not exported — ' + (serverMessage(b) ?? `the server refused it (HTTP ${res.status})`) + '.',
          'error',
        );
        return;
      }
      downloadBlob('deep-research-brief.pdf', await res.blob());
    } catch (e) {
      fireToast(
        'Brief not exported — ' + (e instanceof Error ? e.message : String(e)) + '.',
        'error',
      );
    } finally {
      setExporting(false);
    }
  };
  const [jobId, setJobId] = useState<number | null>(null);
  const [job, setJob] = useState<DrRunJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Bumped after a successful credential write so the board is re-read and the
     connector's status comes back from the server rather than from a local flip. */
  const [reload, setReload] = useState(0);
  const [connBusy, setConnBusy] = useState('');

  // Real deep-research allowance AND connector inventory for this org
  // (GET /api/deep-research/board). Honest null credits (rendered "—") when
  // usage/license are unreadable — never a fabricated 42/60 placeholder.
  const board = useLiveData<DrBoard>('/api/deep-research/board', [
    '/api/deep-research/board',
    reload,
  ]);
  const credits = board.data?.credits ?? null;

  /* ── The connector inventory is the SERVER's, or it is nothing ──────────────
     This list used to be seeded from DR_CONN, the client-side copy of
     CONNECTOR_CATALOG carried in fixtures/deep-research-data.ts, and the board's
     real `connectors` array only overwrote it if it arrived non-empty. So an
     authenticated user whose board read failed — or whose org the catalog no
     longer matches — was shown eighteen connector cards, each with a name, a
     tier and a product description, under the sentence "N of 18 connectors
     configured". That is an inventory claim about their organisation, rendered
     from a constant in the bundle.

     deep-research-board.routes.ts has served the real answer all along:
     getConnectorCatalog(orgId) joins CONNECTOR_CATALOG against this org's
     connector_credentials, and the route maps every field this surface renders
     (category→cat, requiredTier→tier, requiresCredentials→creds,
     description→desc, setupGuide.credentialFields→cf). It is also the only
     source that can know `configured`.

     So: real rows, or an honest loading / error / empty state. No local
     mutation of this array either — a connector's status changes when the
     SERVER says it changed, which is why every mutation below re-reads. */
  const boardConnectors = board.data?.connectors;
  const conn: ConnectorState[] = boardConnectors ?? [];
  const connectorsReady = !board.loading && !board.error && conn.length > 0;

  /* Seed the selection once, from the org's real configured connectors. A ref
     guards it so a later board re-read (after a credential write) cannot stomp a
     selection the user has since edited. The dep is the RESPONSE array, not the
     `?? []` fallback, which is a fresh identity on every render while the board
     is still loading. */
  const selSeeded = useRef(false);
  useEffect(() => {
    if (selSeeded.current || !boardConnectors || boardConnectors.length === 0) return;
    selSeeded.current = true;
    setSel(boardConnectors.filter((c) => c.configured).map((c) => c.id));
  }, [boardConnectors]);

  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const connName = (id: string) => conn.find((c) => c.id === id)?.name || id;
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
      // `String(e)` rendered whatever was thrown, so a dropped connection put the
      // browser's own "Failed to fetch" on screen. Only ApiRequestError carries a
      // message that has already been reduced to safe copy.
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      const detail =
        known && (e as Error).message ? (e as Error).message : 'the request did not complete';
      setPhase('idle');
      fireToast(`Couldn't reach the research engine — ${detail}.`, 'error');
      return;
    }
    const j = (await res.json().catch(() => null)) as DrRunJob | null;
    if (!res.ok || !j) {
      setPhase('idle');
      // The body is already parsed here, so the server's own sentence is
      // preferred over the generic one; the status stays for support.
      fireToast(serverMessage(j) ?? `Couldn't read the research job (HTTP ${res.status}).`, 'error');
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
    // A blank question is no longer backfilled by a fixture default, so the
    // action has to say why it did nothing rather than silently returning.
    if (!query.trim()) {
      fireToast('Enter a research question first.', 'error');
      return;
    }
    if (!sel.length) {
      fireToast('Select at least one connected source to query.', 'error');
      return;
    }
    if (pollRef.current) clearTimeout(pollRef.current);
    setJob(null);
    setPhase('running');
    setJobs(fanout(null, false));
    let res: Response;
    try {
      res = await apiRequest('POST', '/api/deep-research/jobs', {
        query: { indication: query.trim() },
        connectorIds: sel,
        // Sent verbatim: DEPTHS keys are the engine's own depth values now, so
        // there is no translation step in which a price can diverge from a cost.
        depth,
      });
    } catch (e) {
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      const detail =
        known && (e as Error).message ? (e as Error).message : 'the request did not complete';
      setPhase('idle');
      setJobs([]);
      fireToast(`Couldn't reach the research engine — ${detail}.`, 'error');
      return;
    }
    const j = (await res.json().catch(() => null)) as DrRunJob | null;
    if (!res.ok || !j?.id) {
      setPhase('idle');
      setJobs([]);
      // The 403 copy stays — the plan/credit refusal is the one case this surface
      // can explain better than the server. Below it, `j.error` was read first, so
      // an envelope shaped { error: 'QUOTA_EXCEEDED', message: '<a real sentence>' }
      // showed the enum token instead of the reason.
      fireToast(
        res.status === 403
          ? 'Deep research needs a higher plan, or you are out of research credits this period.'
          : serverMessage(j) ?? `Couldn't start research (HTTP ${res.status}).`,
        'error',
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

  /* Categories come from the org's own connector rows, so a category with no
     connector for this tenant does not render an empty section header. */
  const cats = [...new Set(conn.map((c) => c.cat))];
  /* Prefer the server's own counts; fall back to counting the rows it sent. Both
     are absent (not zero) until the board resolves — see `connectorsReady`. */
  const configuredCount = board.data?.configuredCount ?? conn.filter((c) => c.configured).length;
  const connectorCount = board.data?.connectorCount ?? conn.length;

  /* ── AnA's hands + eyes on this screen ────────────────────────────────────
     The ONE drivable control is the tab switch. The research question, source
     selection, and depth are never driven from here: filling any of them
     pre-arms the surface's primary button, which POSTs straight to
     /api/deep-research/jobs and spends metered research credits — the exact
     incident the note on `query` above records. Launching stays a human click.

     Refusals are specific: an open credential drawer holds possibly-unsaved
     values; an in-flight credential save shouldn't be reshuffled under; and a
     switch away from a running research job would hide a live, metered spend
     (the person's own tab buttons can — AnA uninvited must not). */
  useSurfaceActionHandlers('deep-research', {
    'deep-research.open-tab': (params) => {
      const target = params.tab === 'connectors' ? 'connectors' : 'research';
      if (form !== null) {
        return {
          ok: false,
          reason:
            `The "Configure ${form.name}" credential drawer is open with possibly unsaved values — ` +
            'close or save it first.',
        };
      }
      if (connBusy !== '') {
        return { ok: false, reason: 'A connector credential save is in flight — let it finish first.' };
      }
      if (tab === target) return { ok: true, detail: `Already on the ${target} tab` };
      if (target === 'connectors' && phase === 'running') {
        return {
          ok: false,
          reason:
            'A research run is in progress on the research tab — switching away would hide a live, ' +
            'credit-metered job. The person can switch themselves if they want to.',
        };
      }
      setTab(target);
      return { ok: true, detail: `Opened the ${target} tab` };
    },
  });
  /* What AnA can see of this screen, published as itself. The three not-ready
     states stay distinct: a loading board, a failed board read, and a real
     inventory — "0 connectors" after an error would turn a failure into a
     fabricated empty state, and a fabricated credits figure is a spend claim. */
  const anaContext = React.useMemo(() => {
    if (board.loading) {
      return {
        summary:
          'The deep-research board is still loading; credits and the connector inventory are not readable yet.',
      };
    }
    if (board.error) {
      return {
        summary:
          'The deep-research board could not be read — credits and the connector inventory are unknown ' +
          'because of a failure, not because the organization has none.',
        availableActions: ['Retry the board read'],
      };
    }
    return {
      summary:
        `Deep research: the ${tab} tab is open. ` +
        (credits
          ? credits.remaining < 0
            ? 'Research credits this period: unlimited.'
            : `Research credits this period: ${credits.remaining} of ${credits.limit} remaining.`
          : 'Credits are not readable from the plan yet.') +
        ` ${connectorCount} connector(s) for this organization, ${configuredCount} configured.` +
        (phase === 'running' ? ' A research run is in progress.' : ''),
      facts: {
        tab,
        credits,
        connectorCount,
        configuredCount,
        researchRun: phase,
      },
      availableActions: [
        'Switch between the research and connectors tabs',
        'Typing the research question, choosing sources and depth, and launching stay human clicks — a launch spends metered research credits',
      ],
    };
  }, [board.loading, board.error, tab, credits, connectorCount, configuredCount, phase]);
  usePublishSurfaceContext('deep-research', anaContext);

  /**
   * Open the credential drawer. Nothing is marked configured here.
   *
   * The old body flipped `configured: true` in local state for any connector
   * that needs no credentials and toasted "<name> enabled" — a status change
   * that never left the browser. It was also redundant: getConnectorCatalog
   * computes `configured: !requiresCredentials || hasStoredCredentials`, so the
   * server already reports every credential-free connector as configured. The
   * only real transition a user can make from here is storing credentials, and
   * that goes through storeConnector below.
   */
  const doConnect = (c: ConnectorState) => setForm(c);

  /**
   * REAL, awaited credential write — POST /api/deep-research/connectors
   * (server/routes/deep-research.ts:186 → storeCredentials, AES-256-GCM,
   * org-scoped, SSRF-guarded). The board is re-read afterwards so the card's
   * status comes back from `connector_credentials`, not from a local flip.
   *
   * On failure the drawer stays open and says what happened. It used to close
   * and render the connector as "connected" unconditionally, which meant a
   * professional-tier gate (403) or a rejected baseUrl looked exactly like a
   * successful connection until the next reload.
   */
  const storeConnector = async (c: ConnectorState, values: Record<string, string>) => {
    if (connBusy) return;
    setConnBusy(c.id);
    try {
      const res = await apiRequest('POST', '/api/deep-research/connectors', {
        connectorId: c.id,
        credentials: values,
      });
      const body = (await res.json().catch(() => null)) as DrConnectorWrite | null;
      if (!res.ok || !body?.success) {
        // The 403 branch is kept: the plan gate is a flow this surface explains
        // in its own words. The other half read `body.error` first, which showed
        // the enum token whenever the server sent a code alongside its sentence.
        fireToast(
          res.status === 403
            ? 'Storing connector credentials needs a professional plan. Nothing was saved.'
            : (serverMessage(body) ?? `Couldn't store the credentials (HTTP ${res.status}).`) +
                ' Nothing was saved.',
          'error',
        );
        return;
      }
      setForm(null);
      setReload((n) => n + 1);
      fireToast(c.name + ' credentials stored — re-reading connector status');
    } catch (e) {
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      const detail =
        known && (e as Error).message ? (e as Error).message : 'the request did not complete';
      fireToast(`Couldn't reach the connector service — ${detail}. Nothing was saved.`, 'error');
    } finally {
      setConnBusy('');
    }
  };

  return (
    <div className="sp" style={{ maxWidth: 1060 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Intelligence — connectors & deep research</div>
          <h1 className="sp-title">Deep Research & Connectors</h1>
          <p className="sp-state">
            Fan out one question across your connected sources and get a grounded synthesis with
            every claim traced to source.{' '}
            {/* The count is an inventory claim about THIS organisation, so it is
                stated only once the org's own connector board has been read. The
                sentence above no longer names a list of sources either — that
                list was the client-side catalog, not a statement about what this
                tenant has connected. */}
            {board.loading
              ? 'Loading your connectors…'
              : board.error
                ? "Your connector inventory couldn't be loaded."
                : `${configuredCount} of ${connectorCount} connectors configured.`}
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
            connectorsReady ? (
              <>
                Ask one question and I fan it out across{' '}
                <b>{conn.filter((c) => c.configured).length}</b> connected sources — then hand you
                a synthesis with <b>every claim traced to source</b>.
              </>
            ) : (
              <>
                Ask one question and I fan it out across your connected sources — then hand you a
                synthesis with <b>every claim traced to source</b>.
              </>
            )
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
          reassure="Nothing is fabricated — if a source can't support a claim, I say so and cite what I did find."
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
          Connectors{connectorsReady ? ' -- ' + connectorCount : ''}
        </button>
      </div>

      {tab === 'research' && (
        <div>
          <div className="pj-card" style={{ marginBottom: 14 }}>
            <div className="pj-card-b">
              {/* The visible section label is the field's programmatic label.
                  It was never associated before, and the field passed the
                  accessible-name ratchet only because its fabricated default
                  value leaked into the textarea's textContent — remove the
                  fixture and the field announces as nothing. aria-labelledby
                  points at the text already on screen, so there is one label,
                  not a duplicate, and the layout is unchanged. */}
              <div className="pj-seclbl" id="dr-query-label" style={{ marginTop: 0 }}>
                Research question
              </div>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={2}
                aria-labelledby="dr-query-label"
                placeholder="e.g. Precedent accelerated approvals on an overall-response-rate endpoint in second-line NSCLC"
                style={{
                  width: '100%',
                  border: '1px solid var(--border-control)',
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
              {/* Four honest states. The chip row is the org's real configured
                  connectors; when there are none there is nothing to fan out to,
                  and saying so is the answer — not a row of catalog names the
                  tenant has not connected. */}
              {board.loading ? (
                <div className="sp-q-s">Loading your connectors…</div>
              ) : board.error ? (
                <div className="sp-q-s">
                  Couldn&rsquo;t load your connectors — the connector board didn&rsquo;t respond.
                  Sign in and retry, or check the service is reachable.
                </div>
              ) : conn.filter((c) => c.configured).length === 0 ? (
                <div className="sp-q-s">
                  No connectors are configured for your organization yet. Configure one under
                  Connectors and it becomes available to query here.
                </div>
              ) : null}
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
                    disabled={!sel.length || !query.trim()}
                  >
                    {I.telescope} Launch deep research
                  </button>
                )}
                <span className="sp-q-s">
                  Parallel fan-out — grounded synthesis
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
                        {/* Was a chat prompt: "Open source SRC-1: <title>",
                            which asked the assistant to talk about a source the
                            user was pointing at. The URL is on the record — the
                            row above renders from it — so the link opens it. A
                            record that arrived without one renders no link
                            rather than a control that cannot go anywhere. */}
                        {r.url ? (
                          <a
                            className="sp-go"
                            href={r.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={'Open ' + (r.title || r.source || 'source ' + (i + 1)) + ' in a new tab'}
                            title={r.url}
                          >
                            {I.externalLink}
                          </a>
                        ) : (
                          <span className="sp-go" aria-hidden="true" style={{ opacity: 0.35 }} title="This source arrived without a link">
                            {I.externalLink}
                          </span>
                        )}
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
                      title="Sends this request to AnA in the rail — nothing is saved here until AnA confirms"
                    >
                      {I.vault} Ask AnA to save to the Vault
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
                      onClick={() => void exportBrief()}
                      disabled={exporting || !job?.synthesis}
                      title={job?.synthesis ? 'Download the synthesis and its citations as a PDF' : 'No synthesis to export yet'}
                      data-testid="dr-export-brief"
                    >
                      {I.download} {exporting ? 'Exporting…' : 'Export brief'}
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
          {/* Loading / error / empty before any card is drawn. Previously this
              grid always had eighteen cards to draw because the catalog was in
              the bundle; now it draws whatever the org's board returned, or
              says why it has nothing. */}
          {board.loading ? (
            <div className="scaf-note" style={{ padding: '18px 10px' }}>
              Loading your connectors…
            </div>
          ) : board.error ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load your connectors"
              hint="The connector board didn't respond. This list is your organization's own connector inventory and its live configured status — sign in and retry, or check the service is reachable. Nothing is shown from a bundled catalog."
            />
          ) : conn.length === 0 ? (
            <EmptyState
              icon={I.database}
              title="No connectors are available for your organization"
              hint="The connector catalog resolved with no entries for this organization. Once connectors are provisioned for your plan they appear here with their live configured status."
            />
          ) : null}
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
                        {/* "Disconnect" is gone rather than left as a control
                            that lies. It flipped `configured: false` in local
                            state only: the credentials stayed encrypted in
                            connector_credentials, the connector kept working,
                            and the card read "not configured" until the next
                            reload — the most dangerous shape of a mock action on
                            a security control. There is no DELETE
                            /api/deep-research/connectors/:id to call; when one
                            exists, this is where it belongs.
                            "Enable" is gone for the same reason on the other
                            side: a credential-free connector is already
                            configured by the server's own definition, so there
                            was nothing for it to enable. */}
                        {c.configured ? (
                          <span className="sp-q-s">{c.creds ? 'credentials stored' : 'public'}</span>
                        ) : c.creds ? (
                          <button
                            className="sp-q-a"
                            onClick={() => doConnect(c)}
                            disabled={connBusy !== ''}
                          >
                            {I.plus} {connBusy === c.id ? 'Saving…' : 'Configure'}
                          </button>
                        ) : null /* Unreachable against the current server rule
                            (a credential-free connector is configured by
                            definition). No affordance and no explanation is
                            invented for it — the status chip above already says
                            "not configured", which is all that is known. */}
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
            // The catalog marks which credential fields are secrets; render
            // those as password inputs rather than plain text, which is what
            // every one of them used to be.
            fields: form.cf.map((f) => ({
              key: f.field,
              label: f.label,
              type: (f.secret ? 'password' : 'text') as 'password' | 'text',
              placeholder: f.placeholder,
              required: !/optional/i.test(f.label),
            })),
          } as C2CFormConfig}
          onCancel={() => setForm(null)}
          onSubmit={(values) => void storeConnector(form, values)}
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}
