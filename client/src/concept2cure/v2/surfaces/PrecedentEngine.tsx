import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { assessmentState } from '../assessmentState';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import { AnswerLead } from '../AnswerLead';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';
import { severityTone } from '../fixtures/precedent-engine-data';
import '../styles/project-home-v2.css';
import { C2CForm } from '../C2CForm';

/*
 * Precedent intelligence — wired to the real precedent read-model.
 *
 * The whole board (closest precedents + risk / strategy / CRL / RTF / EMA /
 * AdComm analyses) comes from GET /api/precedent-engine-board, which the server
 * assembles from the real precedentEngine service (search + the six analyzers),
 * org-scoped and fail-closed per section. The claim check posts to the real
 * POST /api/precedent-engine/check-claim. Nothing is fabricated: `cycle` and
 * `match` are nullable on the real record and render null-safe, an empty corpus
 * shows an honest empty state, and a failed load shows an honest error — never
 * the old PE_* fixture.
 *
 * ── The pre-filled demo submission is gone, and nothing replaces it ───────────
 *
 * The query state used to be SEEDED with an invented programme — therapeutic
 * area 'Diabetes', indication 'Continuous glucose monitoring -- 14-day wear',
 * product code 'QBJ' — and `applied` was seeded from it, so the board fetched
 * on mount with those criteria before the user had typed anything.
 *
 * The read is live, but the QUESTION was fabricated, and the surface then wrote
 * the fabrication into its own answer. The AnswerLead eyebrow rendered "The
 * honest read on your 510(k) -- Continuous glucose monitoring", the headline
 * rendered "Citing <K-number> (<device>) is your cleanest path -- N devices like
 * yours cleared in about X--Y days", and the action button passed
 * "Draft the substantial-equivalence argument citing <K-number>" to `onAsk`,
 * which pushes it into the AnA conversation as the USER's own words. An
 * organization with no CGM device was told, on an authenticated regulated
 * screen, which predicate its submission should cite.
 *
 * This is the failure the ind-lifecycle cleanup documents ('BX-301'): invented
 * product context that is not merely displayed but SPOKEN back to the user and
 * to the assistant, in a workspace whose next output is a submission document.
 *
 * So the form now starts empty and no board is fetched until the user runs a
 * search. Until then the surface shows the search form and an honest "no search
 * run yet" panel. `submissionType` keeps its '510(k)' default: that is the first
 * member of the select's own enum, not a claim about anyone's programme.
 */

/* ── Live view shapes (mirror the server DTO in precedent-engine-board.ts) ── */

interface PrecedentResultView {
  clearanceNumber: string;
  deviceName: string;
  applicant: string;
  decisionDate: string;
  clearanceType: string;
  decisionOutcome: string;
  productCode: string;
  therapeuticArea: string;
  /** Review-cycle days; null when not sourceable from the service record. */
  cycle: number | null;
  /** Coarse similarity 0–1; null when the record carries no score. */
  match: number | null;
  riskFactors: string[];
  predicateKNumber: string | null;
}
interface RiskFactorView { label: string; severity: 'high' | 'medium' | 'low'; note: string }
interface RiskView { overall: string; score: number; factors: RiskFactorView[] }
interface StrategyView { recommendation: string; predicate: string; rationale: string[]; altPathways: { p: string; when: string }[] }
interface PatternView { title: string; rate: string; items: string[] }
/** What the board consulted for `results` (server: sources.registry). */
interface RegistryStatusView {
  consulted: boolean;
  available: boolean;
  reason?: string;
  resultCount?: number;
}
interface PrecedentBoard {
  results: PrecedentResultView[];
  risk: RiskView;
  strategy: StrategyView;
  /* Keyed rather than four fixed slots: which lenses arrive depends on the
     pathway (server: services/precedent/device-lenses). */
  patterns: Record<string, PatternView>;
  /** The lens keys that apply, in display order. Absent on an older board. */
  lenses?: string[];
  /* Optional so a board served before this field existed still renders — the
     empty-result copy falls back to naming the ambiguity, as it did before. */
  sources?: { registry: RegistryStatusView };
}
/**
 * The claim-check result, as the server actually returns it.
 *
 * ── The contract this replaces ───────────────────────────────────────────────
 * This interface used to read `{ verdict, confidence, note, precedents:
 * string[] }`. POST /api/precedent-engine/check-claim returns none of those. It
 * returns `{ supported, precedents: PrecedentRecord[], warnings,
 * suggestedCitations, recommendation, ... }`. Three consequences, all of them
 * live:
 *
 *   `verdict` was always undefined, so `verdict === 'supported' ? … : 'Needs
 *   support'` rendered "Needs support" for EVERY claim, including supported
 *   ones. That is the bare verdict the work order recorded.
 *
 *   `note` was always undefined, so the engine's reasoning — which it computes
 *   and returns — was never displayed. The screen had it and threw it away.
 *
 *   `precedents` are objects, and the list rendered them as React children.
 *   That throws. It had never fired only because the precedent corpus was
 *   structurally empty (the 510(k) query ran against a relation that does not
 *   exist), so the array was always []. Connecting the FDA registry would have
 *   made this crash on the first successful device claim check.
 */
interface ClaimPrecedentView {
  clearanceNumber?: string | null;
  deviceName?: string | null;
  decisionOutcome?: string | null;
  decisionDate?: string | null;
}
interface ClaimView {
  supported?: boolean;
  /** 'no-precedents' means nothing was consulted — not a judgement on the claim. */
  basis?: 'checked' | 'no-precedents';
  recommendation?: string;
  precedents?: ClaimPrecedentView[];
  warnings?: { message: string; severity?: string }[];
  suggestedCitations?: string[];
}
type AnalysisState = RiskView | StrategyView | PatternView;

interface PeQuery {
  submissionType: string;
  therapeuticArea: string;
  indication: string;
  productCode: string;
}

/* Saved queries — the real org-scoped CRUD at /api/saved-precedent-queries
   ({data} envelope; numeric ids). The full PeQuery round-trips through the
   free-text `query` column as JSON; productCode/pathway are additionally
   normalized into the structured `scope` for other consumers. */
interface SavedPeQuery { id: number; label: string; query: string; scope: Record<string, unknown> | null; }

const PATHWAY_OF: Record<string, string> = { '510(k)': '510k', 'PMA': 'pma', 'De Novo': 'de_novo' };

function parseSavedQuery(s: SavedPeQuery): PeQuery {
  try {
    const p = JSON.parse(s.query) as Partial<PeQuery>;
    if (p && typeof p === 'object' && typeof p.submissionType === 'string') {
      return {
        submissionType: p.submissionType,
        therapeuticArea: String(p.therapeuticArea ?? ''),
        indication: String(p.indication ?? ''),
        productCode: String(p.productCode ?? ''),
      };
    }
  } catch { /* fall through to the free-text mapping */ }
  return {
    submissionType: '510(k)',
    therapeuticArea: '',
    indication: s.query,
    productCode: String((s.scope as { productCode?: string } | null)?.productCode ?? ''),
  };
}

/* ── The board's two failure sentinels, and the one section that has none ─────
 *
 * GET /api/precedent-engine-board runs its seven service calls under
 * Promise.allSettled and answers HTTP 200 `{success:true}` even when some of
 * them REJECT: a rejected call is substituted with an EMPTY section and the
 * reason is logged server-side only. `board.error` is therefore undefined, and
 * a section that failed arrives looking exactly like a section that ran and
 * found nothing. Copy written off `length === 0` cannot tell them apart, and
 * only one of the two may say "nothing was found".
 *
 * Two of those substitutions carry a value the real service cannot produce, so
 * for those two the distinction IS recoverable from the payload:
 *
 *   risk.overall === 'unknown'
 *       analyzeRisk() rejected. The service's own result type is
 *       'low' | 'medium' | 'high' | 'critical' (server/services/precedent-engine.ts),
 *       so 'unknown' is written only by the route's empty-risk substitution.
 *
 *   strategy.recommendation === 'Insufficient precedent data'
 *       recommendStrategy() rejected. The service derives its recommendation
 *       from approved precedents and falls back to 'Standard submission
 *       approach'; this literal is written only by the empty-strategy
 *       substitution.
 *
 * Those sentinels are the `assessmentRan` evidence assessmentState.ts asks for.
 * It is never taken from `factors.length` / `rationale.length` — inferring "an
 * analysis ran" from the same empty array whose emptiness is the question is
 * the defect itself, wearing a new API.
 *
 * The SEARCH sub-call had no such sentinel: a rejected search was mapped to
 * `results: []`, byte-identical to a search that ran and matched nothing, with
 * nothing else in the payload to separate them. So the empty-result copy did
 * not assert either reading — it stated what came back and named the ambiguity
 * rather than resolving it in the direction that flatters the product.
 *
 * `sources.registry` is now that missing evidence for the device lane. The
 * engine's Strategy 2 used to SELECT from a relation no migration creates, so
 * it raised on every call and its catch returned [] — a search for a heavily
 * cleared product code reported zero precedents structurally, and this copy
 * could only shrug. Strategy 2 now reads the FDA 510(k) registry and REPORTS
 * whether it answered, so three genuinely different states can finally be told
 * apart and said out loud:
 *
 *   consulted && available && 0 results   the registry answered; no clearance
 *                                         matches these criteria. Assertable.
 *   consulted && !available               the registry did not answer, with the
 *                                         reason. Not an empty result.
 *   !consulted                            a non-device pathway, or no product
 *                                         code / device name to search it by —
 *                                         the old ambiguity, still named.
 */
const RISK_NOT_RUN = 'unknown';
const STRATEGY_NOT_RUN = 'Insufficient precedent data';

/* ════ PrecedentEngine — precedent intelligence workbench ════ */

export function PrecedentEngine({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;

  const [q, setQ] = useState<PeQuery>({
    submissionType: '510(k)',
    therapeuticArea: '',
    indication: '',
    productCode: '',
  });
  // The query actually sent to the board — committed on Search, so editing the
  // form does not refetch until the user runs it. `null` until the user runs a
  // search: there is no honest board to show before they have asked something.
  const [applied, setApplied] = useState<PeQuery | null>(null);
  const [selK, setSelK] = useState<string | null>(null);
  const [tab, setTab] = useState('risk');
  const [claim, setClaim] = useState('');
  const [claimRes, setClaimRes] = useState<ClaimView | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);

  // Live precedent board — GET /api/precedent-engine-board?<applied query>.
  // Changing `path` (via Search committing `applied`) refetches; the previous
  // board stays visible while the next one loads. A null path before the first
  // search idles the hook — no request, no board, no invented question.
  const path = useMemo(() => {
    if (!applied) return null;
    const p = new URLSearchParams();
    p.set('submissionType', applied.submissionType);
    if (applied.therapeuticArea.trim()) p.set('therapeuticArea', applied.therapeuticArea.trim());
    if (applied.indication.trim()) p.set('indication', applied.indication.trim());
    if (applied.productCode.trim()) p.set('productCode', applied.productCode.trim());
    return '/api/precedent-engine-board?' + p.toString();
  }, [applied]);
  const board = useLiveData<PrecedentBoard>(path);

  const results = board.data?.results ?? [];
  /* What was consulted for those results. `undefined` means a board served
     without the field — treat that as "not consulted" so the copy falls back to
     naming the ambiguity rather than asserting a clean registry answer. */
  const registry = board.data?.sources?.registry;
  const sel = results.find((r) => r.clearanceNumber === selK) || results[0];

  /* ── Ingest and Compare, against the endpoints that already existed ────────
     Both were `ask(...)`. `POST /api/precedent-engine/compare` runs the real
     comparison (precedentEngine.compare) and `POST /ingest` writes the
     precedent — neither had a caller, so the surface's two primary verbs were
     conversation. */
  const [ingestOpen, setIngestOpen] = React.useState(false);
  const [ingesting, setIngesting] = React.useState(false);
  const [peNote, setPeNote] = React.useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [comparing, setComparing] = React.useState('');
  const [comparison, setComparison] = React.useState<{ k: string; result: unknown } | null>(null);

  const ingestPrecedent = async (v: Record<string, string>) => {
    if (ingesting) return;
    setIngesting(true);
    setPeNote(null);
    try {
      const body: Record<string, unknown> = {
        submissionType: v.submissionType,
        decisionOutcome: v.decisionOutcome,
      };
      for (const k of ['clearanceNumber', 'deviceName', 'applicant', 'indication', 'productType', 'predicateKNumber'] as const) {
        if (v[k]?.trim()) body[k] = v[k].trim();
      }
      const res = await apiRequest('POST', '/api/precedent-engine/ingest', body);
      const j = await res.json().catch(() => null);
      if (!res.ok || (j as { success?: boolean } | null)?.success !== true) {
        setPeNote({
          text: 'The precedent was not ingested — ' + (serverMessage(j) ?? `the server refused it (HTTP ${res.status})`) + '.',
          tone: 'error',
        });
        return;
      }
      setIngestOpen(false);
      setPeNote({ text: `Precedent ${v.clearanceNumber || v.submissionType} added to the registry.`, tone: 'ok' });
    } catch (e) {
      setPeNote({
        text: 'The precedent was not ingested — ' + (e instanceof Error ? e.message : String(e)) + '.',
        tone: 'error',
      });
    } finally {
      setIngesting(false);
    }
  };

  const runCompare = async (target: { clearanceNumber: string; submissionType?: string; deviceName?: string; indication?: string }) => {
    if (comparing) return;
    setComparing(target.clearanceNumber);
    setPeNote(null);
    setComparison(null);
    try {
      const res = await apiRequest('POST', '/api/precedent-engine/compare', {
        precedentId: target.clearanceNumber,
        // The comparison needs a submission type; the precedent's own is the
        // honest default and is what the user is comparing against.
        submissionType: target.submissionType || '510k',
        deviceName: target.deviceName || undefined,
        indication: target.indication || undefined,
      });
      const j = await res.json().catch(() => null);
      const payload = (j as { success?: boolean; data?: unknown } | null);
      if (!res.ok || payload?.success !== true || payload.data == null) {
        setPeNote({
          text: `The comparison against ${target.clearanceNumber} did not run — ` +
            (serverMessage(j) ?? `the server refused it (HTTP ${res.status})`) + '.',
          tone: 'error',
        });
        return;
      }
      setComparison({ k: target.clearanceNumber, result: payload.data });
    } catch (e) {
      setPeNote({
        text: `The comparison against ${target.clearanceNumber} did not run — ` +
          (e instanceof Error ? e.message : String(e)) + '.',
        tone: 'error',
      });
    } finally {
      setComparing('');
    }
  };


  const runSearch = () => setApplied(q);

  /* Saved queries — list on load; save/pin/reload/delete against the real CRUD. */
  const [saved, setSaved] = useState<SavedPeQuery[]>([]);
  const [savedNote, setSavedNote] = useState('');
  const note = (m: string) => { setSavedNote(m); setTimeout(() => setSavedNote(''), 4200); };
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiRequest('GET', '/api/saved-precedent-queries/');
        const body = await res.json().catch(() => null);
        if (res.ok && Array.isArray(body?.data)) setSaved(body.data as SavedPeQuery[]);
      } catch { /* list stays empty; saving still reports its own errors */ }
    })();
  }, []);

  const saveQuery = async () => {
    const label = [q.productCode, q.submissionType, (q.indication || q.therapeuticArea).slice(0, 60)]
      .filter(Boolean).join(' · ').slice(0, 120) || 'Precedent query';
    try {
      const scope: Record<string, unknown> = {};
      if (q.productCode.trim()) scope.productCode = q.productCode.trim().slice(0, 16);
      if (PATHWAY_OF[q.submissionType]) scope.pathway = PATHWAY_OF[q.submissionType];
      const res = await apiRequest('POST', '/api/saved-precedent-queries/', {
        label, query: JSON.stringify(q), scope: Object.keys(scope).length ? scope : null,
      });
      const body = await res.json().catch(() => null);
      const row = (body?.data ?? body) as SavedPeQuery | null;
      if (!res.ok || !row?.id) { note(res.status === 401 ? 'Sign in to save queries.' : `Couldn’t save the query (HTTP ${res.status}).`); return; }
      setSaved((s) => [row, ...s.filter((x) => x.id !== row.id)]);
      note('Query saved · ' + row.label);
    } catch (e) {
      note('Couldn’t save the query — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  };

  const applySaved = (s: SavedPeQuery) => {
    const next = parseSavedQuery(s);
    setQ(next);
    setApplied(next); // run immediately
    // Stamp lastRunAt server-side; non-blocking, the search does not wait.
    void apiRequest('PATCH', `/api/saved-precedent-queries/${s.id}`, { refresh: true }).catch(() => {});
  };

  const deleteSaved = async (id: number) => {
    try {
      const res = await apiRequest('DELETE', `/api/saved-precedent-queries/${id}`);
      if (!res.ok && res.status !== 204) { note(`Couldn’t delete the saved query (HTTP ${res.status}).`); return; }
      setSaved((s) => s.filter((x) => x.id !== id));
    } catch (e) {
      note('Couldn’t delete — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  };

  const analysis: AnalysisState | null = useMemo(() => {
    const d = board.data;
    if (!d) return null;
    if (tab === 'risk') return d.risk;
    if (tab === 'strategy') return d.strategy;
    // Lens keys are decided by the pathway, so they are looked up rather than
    // enumerated: a device board carries rta/ai/nse/predicate/panel and a drug
    // board crl/rtf/ema/adcomm, and this switch used to know only the latter.
    return d.patterns?.[tab] ?? d.risk;
  }, [board.data, tab]);

  /* The honest state of the risk and strategy sections, from the sentinels
     documented above the component. `scopeExists` is "the section is present in
     the payload at all"; `unreadable` is "it is present and it is the failure
     substitution"; `assessmentRan` is the sentinel's ABSENCE, never an empty
     factor/rationale array. */
  const riskOverall = board.data?.risk?.overall;
  const riskState = assessmentState({
    unreadable: riskOverall === RISK_NOT_RUN,
    scopeExists: riskOverall != null,
    findingCount: board.data?.risk?.factors?.length ?? 0,
    assessmentRan: riskOverall != null && riskOverall !== RISK_NOT_RUN,
  });
  const strategyRec = board.data?.strategy?.recommendation;
  const strategyState = assessmentState({
    unreadable: strategyRec === STRATEGY_NOT_RUN,
    scopeExists: strategyRec != null,
    findingCount: board.data?.strategy?.rationale?.length ?? 0,
    assessmentRan: strategyRec != null && strategyRec !== STRATEGY_NOT_RUN,
  });

  // Real claim check — POST /api/precedent-engine/check-claim. No fabricated
  // verdict; a failed check surfaces nothing rather than a canned result.
  const checkClaim = async () => {
    if (!claim.trim() || claimBusy) return;
    setClaimBusy(true);
    // Before a search has been run there is no applied context, so the claim is
    // checked against whatever the user has typed into the form — never against
    // a seeded one.
    const ctx = applied ?? q;
    try {
      const res = await apiRequest('POST', '/api/precedent-engine/check-claim', {
        claim: claim.trim(),
        submissionType: ctx.submissionType,
        ...(ctx.therapeuticArea.trim() ? { therapeuticArea: ctx.therapeuticArea.trim() } : {}),
        ...(ctx.indication.trim() ? { indication: ctx.indication.trim() } : {}),
        /* The product code is what the FDA registry can be searched by; without
           it a device claim is checked against the org corpus only. */
        ...(ctx.productCode.trim() ? { productCode: ctx.productCode.trim() } : {}),
      });
      const body = await res.json().catch(() => null);
      setClaimRes(res.ok && body?.data ? (body.data as ClaimView) : null);
    } catch {
      setClaimRes(null);
    } finally {
      setClaimBusy(false);
    }
  };

  /* Short tab labels. The board decides WHICH lenses apply to the pathway and
     in what order (`lenses`); this only names them. A key the board sends that
     is not listed here falls back to the lens's own title, so a lens added
     server-side appears without a client change. */
  const LENS_LABEL: Record<string, string> = {
    // device
    rta: 'RTA / RTF',
    ai: 'AI requests',
    nse: 'NSE routes',
    predicate: 'Predicate adequacy',
    panel: 'Panel track',
    // drug
    crl: 'CRL triggers',
    rtf: 'RTF triggers',
    ema: 'EMA D120/180',
    adcomm: 'AdComm risk',
  };
  const lensKeys = board.data?.lenses ?? [];
  const TABS: [string, string][] = [
    ['risk', 'Risk analysis'],
    ['strategy', 'Strategy'],
    ...lensKeys.map(
      (k) => [k, LENS_LABEL[k] ?? board.data?.patterns?.[k]?.title ?? k] as [string, string],
    ),
  ];

  /* Type guards for analysis panel rendering */
  const isRisk = (a: AnalysisState): a is RiskView => 'factors' in a && 'score' in a;
  const isStrategy = (a: AnalysisState): a is StrategyView => 'recommendation' in a;
  const isPattern = (a: AnalysisState): a is PatternView => 'items' in a && 'title' in a && !('score' in a);

  /* answer-first lead — every value guarded for the real, nullable record */
  const top = results[0] || ({} as PrecedentResultView);
  const cyc = results.map((r) => r.cycle).filter((c): c is number => typeof c === 'number');
  const lo = cyc.length ? Math.min(...cyc) : null;
  const hi = cyc.length ? Math.max(...cyc) : null;
  const topRisk =
    analysis && isRisk(analysis) && analysis.factors && analysis.factors[0] ? analysis.factors[0] : null;
  const strong = (top.match || 0) >= 0.85;

  /* The surface's identity and its search form are shown in EVERY state. They
     used to live only in the fully-loaded branch, so a load failure replaced the
     form with an error panel and left the user with no way to re-run the search
     that had just failed. */
  const head = (
    <div className="sp-head">
      <div>
        <div className="sp-eyebrow">Specialist — precedent board</div>
        <h1 className="sp-title">Precedent intelligence</h1>
        <p className="sp-state">
          Search cleared precedents, compare your submission, and run regulatory-risk, strategy,
          CRL/RTF-trigger, EMA-question and Advisory-Committee analyses — every result traces to
          registry precedents.
        </p>
      </div>
      {/* ── "Ingest precedent" ingested nothing ────────────────────────────
          The surface's primary CTA — the one its own empty states repeatedly
          tell the user to press ("or ingest a precedent to seed the
          registry") — typed a sentence into the chat rail. No precedent was
          ever added, so the registry could not be seeded the way the screen
          said to seed it. POST /api/precedent-engine/ingest and its schema
          existed with no caller. */}
      <button className="sp-primary" onClick={() => setIngestOpen(true)} disabled={ingesting}>
        {I.plus} {ingesting ? 'Ingesting…' : 'Ingest precedent'}
      </button>
    </div>
  );

  const searchCard = (
    <div className="pj-card" style={{ marginBottom: 14 }}>
      <div
        className="pj-card-b"
        style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}
      >
        <label className="pe-f">
          <span>Submission type</span>
          <select
            value={q.submissionType}
            onChange={(e) => setQ({ ...q, submissionType: e.target.value })}
          >
            {/* Grouped by lane. The complaint was that NDA/BLA/ANDA are offered
                on a device screen — true, but this one screen serves both
                lanes, and nothing reaching it reliably says which one the user
                is in (__C2C_SEGMENT is written by a single other surface). So
                rather than hide half the list on a guess, the two families are
                named and separated, and the analysis lenses below follow the
                choice: pick 510(k) and the drug lenses are gone. */}
            <optgroup label="Device pathways">
              {['510(k)', 'De Novo', 'PMA', 'IDE', 'HDE'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </optgroup>
            <optgroup label="Drug and biologic pathways">
              {['NDA', 'BLA', 'ANDA'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="pe-f" style={{ flex: 1.4 }}>
          <span>Indication</span>
          <input
            value={q.indication}
            onChange={(e) => setQ({ ...q, indication: e.target.value })}
          />
        </label>
        <label className="pe-f">
          <span>Therapeutic area</span>
          <input
            value={q.therapeuticArea}
            onChange={(e) => setQ({ ...q, therapeuticArea: e.target.value })}
          />
        </label>
        <label className="pe-f" style={{ maxWidth: 110 }}>
          <span>Product code</span>
          <input
            value={q.productCode}
            onChange={(e) => setQ({ ...q, productCode: e.target.value })}
          />
        </label>
        <button
          className="sp-primary"
          style={{ padding: '8px 16px' }}
          onClick={runSearch}
          disabled={board.loading}
        >
          {I.search} {board.loading ? 'Searching...' : 'Search'}
        </button>
        <button className="sp-ask" onClick={saveQuery} title="Save this query for reuse">
          {I.plus} Save query
        </button>
      </div>
      {(saved.length > 0 || savedNote) && (
        <div className="pj-card-b" style={{ paddingTop: 0, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {saved.map((s) => (
            <span key={s.id} className="rd-chip tone-idle" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <button style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
                onClick={() => applySaved(s)} title="Load and run this saved query">
                {s.label}
              </button>
              <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', opacity: 0.6 }}
                onClick={() => deleteSaved(s.id)} title="Delete saved query" aria-label={'Delete ' + s.label}>
                ×
              </button>
            </span>
          ))}
          {savedNote && <span style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>{savedNote}</span>}
        </div>
      )}
    </div>
  );

  /* WHAT ANA SEES HERE — published above the honest-state early returns so one
     call covers every branch (a hook below a conditional return would not). */
  const anaContext = useMemo(() => {
    if (!applied) {
      // Nothing from the typed-but-unrun form: a pre-filled query once told an
      // org which predicate to cite for a device it did not have.
      return {
        summary:
          'Precedent intelligence: no search has been run; nothing is on screen but the empty search form.',
        facts: { searchRun: false },
      };
    }
    if (board.loading && !board.data) {
      return {
        summary: `Precedent intelligence: the applied ${applied.submissionType} search is still loading; no board is on screen yet.`,
      };
    }
    if (board.error && !board.data) {
      return {
        summary:
          'Precedent intelligence: the precedent read-model did not respond — a failed read, not an empty corpus.',
      };
    }
    return {
      summary:
        `Precedent intelligence for the applied ${applied.submissionType} search` +
        (applied.indication.trim() ? ` (${applied.indication.trim()})` : '') +
        `: ${results.length} precedent(s)` +
        (sel ? `; ${sel.clearanceNumber} selected` : '') +
        `; the ${tab} analysis tab is open.`,
      facts: {
        query: {
          submissionType: applied.submissionType,
          therapeuticArea: applied.therapeuticArea,
          indication: applied.indication,
          productCode: applied.productCode,
        },
        resultCount: results.length,
        ...(sel ? { selected: sel.clearanceNumber } : {}),
        tab,
        // `cycle` is nullable on the real record — no range unless one exists.
        ...(lo != null && hi != null ? { cycleDaysMin: lo, cycleDaysMax: hi } : {}),
      },
      availableActions: [
        'Select a result; switch the analysis tab',
        'Running a search commits a query; ingesting a precedent, comparing, saved-query changes and claim checks are writes or verdicts — AnA proposes them in conversation, never through screen controls.',
      ],
    };
  }, [applied, board.loading, board.error, board.data, results.length, sel, tab, lo, hi]);
  /* Both actions refuse until a search has been RUN. AnA never runs it: the
     search is the person's, and a board with no applied query has nothing on
     screen to operate. */
  useSurfaceActionHandlers('precedent-intelligence', {
    'precedent-intelligence.open-tab': (params) => {
      if (!applied) {
        return { ok: false, reason: 'No search has been run — the person runs the search; there is no board on screen yet.' };
      }
      const target = String(params.tab ?? '');
      if (!['risk', 'strategy', 'crl', 'rtf', 'ema', 'adcomm'].includes(target)) {
        return { ok: false, reason: `No analysis tab named "${params.tab}".` };
      }
      if (tab === target) return { ok: true, detail: `Already on the ${target} tab` };
      setTab(target);
      return { ok: true, detail: `Opened the ${target} analysis tab` };
    },
    'precedent-intelligence.select-result': (params) => {
      if (!applied) {
        return { ok: false, reason: 'No search has been run — there are no precedents on screen to select.' };
      }
      const raw = String(params.result ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a precedent to select.' };
      if (board.loading) return { ok: false, reason: 'The precedent board is still loading.', retry: true };
      if (board.error) {
        return { ok: false, reason: 'The precedent read-model did not respond, so no results are listed to select from.' };
      }
      const needle = raw.toLowerCase();
      const exact = results.filter((r) => r.clearanceNumber.toLowerCase() === needle);
      const hits = exact.length
        ? exact
        : results.filter((r) => (r.deviceName ?? '').toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No precedent named "${raw}" in these results.` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} precedents — name one exactly.` };
      setSelK(hits[0].clearanceNumber);
      return { ok: true, detail: `Selected ${hits[0].clearanceNumber} — ${hits[0].deviceName ?? 'unnamed device'}` };
    },
  });
  useEffect(() => {
    if (applied && !board.loading && !board.error) notifySurfaceActionReady('precedent-intelligence');
  }, [applied, board.loading, board.error]);

  usePublishSurfaceContext('precedent-intelligence', anaContext);

  /* Four honest states on the real read-model — never a fixture, and never a
     seeded search standing in for one the user has not run. */
  if (!applied) {
    return (
      <div className="sp" style={{ maxWidth: 1160 }}>
        {head}
        {searchCard}
        <EmptyState
          icon={I.search}
          title="No search run yet"
          hint="Enter your submission type, indication, therapeutic area or product code above and run a search. Precedents, risk, strategy and the pattern analyses are assembled for the criteria YOU enter — from your organization's precedent corpus, and for device pathways also from the FDA 510(k) registry. Nothing is pre-filled on your behalf."
        />
      </div>
    );
  }
  if (board.loading && !board.data) {
    return (
      <div className="sp" style={{ maxWidth: 1160 }}>
        {head}
        {searchCard}
        <EmptyState title="Loading precedent intelligence…" icon={I.clock} />
      </div>
    );
  }
  if (board.error && !board.data) {
    return (
      <div className="sp" style={{ maxWidth: 1160 }}>
        {head}
        {searchCard}
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load precedent intelligence"
          hint="The precedent read-model didn't respond. It's assembled live from your organization's precedent corpus, and for device pathways from the FDA 510(k) registry — sign in and retry. Nothing is shown from a cached sample."
        />
      </div>
    );
  }

  return (
    <div className="sp" style={{ maxWidth: 1160 }}>
      {head}

      {peNote && (
        <div
          className="scaf-note"
          role="status"
          style={{ margin: '0 0 12px', color: peNote.tone === 'error' ? 'var(--error)' : undefined }}
        >
          {peNote.text}
        </div>
      )}

      {ingestOpen && (
        <C2CForm
          config={{
            eyebrow: 'Precedent registry',
            title: 'Ingest a precedent',
            sub: 'A cleared or approved submission to compare against. Only the two fields the registry requires are mandatory; the rest sharpen the comparison and are recorded as given.',
            submitLabel: ingesting ? 'Ingesting…' : 'Ingest precedent',
            fields: [
              { key: 'submissionType', label: 'Submission type', type: 'text', placeholder: 'e.g. 510k, PMA, De Novo', required: true, half: true },
              { key: 'decisionOutcome', label: 'Decision outcome', type: 'text', placeholder: 'e.g. Cleared, Approved, NSE', required: true, half: true },
              { key: 'clearanceNumber', label: 'Clearance / approval number', type: 'text', placeholder: 'e.g. K243117', half: true },
              { key: 'deviceName', label: 'Device or product name', type: 'text', half: true },
              { key: 'applicant', label: 'Applicant', type: 'text', half: true },
              { key: 'predicateKNumber', label: 'Predicate K-number', type: 'text', half: true },
              { key: 'indication', label: 'Indication', type: 'textarea' },
            ],
          }}
          onCancel={() => setIngestOpen(false)}
          onSubmit={ingestPrecedent}
        />
      )}

      {comparison && (
        <div className="pj-card" style={{ marginBottom: 14 }}>
          <div className="pj-card-h">
            <span className="t">Comparison against {comparison.k}</span>
            <button type="button" className="pj-card-h-go" onClick={() => setComparison(null)}>Close</button>
          </div>
          <div className="pj-card-b">
            {/* The engine's own answer, rendered as it came back. This surface
                does not re-score or summarise it — a comparison the reader
                cannot trace to the engine is worth less than none. */}
            <pre className="pe-compare">{JSON.stringify(comparison.result, null, 2)}</pre>
          </div>
        </div>
      )}

      <AnswerLead
        tone={strong ? 'good' : 'calm'}
        eyebrow={
          'The honest read on your ' +
          applied.submissionType +
          (applied.indication ? ' -- ' + applied.indication.split('--')[0].trim() : '')
        }
        headline={
          strong ? (
            <>
              Citing <b>{top.clearanceNumber}</b> ({top.deviceName}) is your cleanest path --{' '}
              {results.length} devices like yours cleared
              {lo != null && hi != null ? (
                <> in about <b>{lo}--{hi} days</b></>
              ) : null}
              .
            </>
          ) : results.length === 0 ? (
            /* This headline used to read "No cleared precedents matched this
               search yet — widen the criteria or ingest a precedent." Both
               halves are claims the surface cannot support: that a search ran
               and matched nothing, and that the remedy is the user's criteria.
               A search that REJECTS server-side is mapped to `results: []` and
               returned under HTTP 200 with no sentinel anywhere in the payload,
               so an unrun search reads here exactly like an empty one. The
               headline now states only what arrived, and names the ambiguity
               instead of resolving it in the direction that flatters the
               product. */
            registry?.consulted && registry.available ? (
              <>
                The FDA 510(k) registry answered and holds no clearance matching these
                criteria, and your organization's corpus has none either. Widening the
                product code or device name is the next move.
              </>
            ) : registry?.consulted && !registry.available ? (
              <>
                The FDA 510(k) registry did not answer{registry.reason ? <> — {registry.reason}</> : null}.
                Nothing came back, and nothing here establishes that no precedent exists.
              </>
            ) : (
              <>
                No precedents came back for this search — and this board cannot tell an empty
                result from a precedent search that did not complete, so nothing here establishes
                that no precedent exists.
              </>
            )
          ) : (
            <>
              No single strong predicate yet — worth a search or a De Novo look before you
              commit.
            </>
          )
        }
        body={
          topRisk ? (
            <>
              The one thing reviewers will most likely ask about is{' '}
              <b>{topRisk.label.toLowerCase()}</b>. Bring it up front and you take their biggest
              question off the table before they raise it.
            </>
          ) : riskState === 'unreadable' ? (
            /* Same defect as the risk panel below, one level up: with no scored
               factors this invited the reader to "run the risk analysis" when
               the risk analysis had already run for this search and failed.
               Telling them to do the thing that just failed, without saying it
               failed, is the part that misleads. */
            'The risk analysis did not complete for this search, so there is nothing here about what reviewers are likely to push back on. Run the search again before reading anything into the silence.'
          ) : (
            "Run the risk analysis below and I'll tell you exactly what reviewers tend to push back on for this kind of submission."
          )
        }
        reassure={
          strong
            ? "You're not starting from zero — I'll draft the argument with you."
            : "Whatever the path, I'll walk it with you step by step."
        }
        action={{
          label: 'Draft this argument with AnA',
          onClick: () =>
            ask(
              'Draft the substantial-equivalence argument citing ' +
                (top.clearanceNumber || 'the top precedent') +
                (topRisk
                  ? ' and pre-empt the ' + topRisk.label.toLowerCase() + ' question'
                  : ''),
            ),
        }}
        secondary="Or explore the precedents and analyses below when you're ready."
      />

      {searchCard}

      <div className="sp-2col" style={{ gridTemplateColumns: '1.15fr 1fr' }}>
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Closest precedents</span>
            <span className="s">{results.length} -- ranked by match</span>
          </div>
          <div className="pj-card-b" style={{ padding: 8 }}>
            {results.length === 0 ? (
              /* The hint used to read "No cleared precedents in the corpus
                 matched this submission type and criteria." That is a finding
                 about the corpus, and the panel has no evidence for it: a
                 search that fails server-side is substituted with an empty
                 result list under a 200, so this branch is reached by a failed
                 search and a genuinely empty one alike. The remedy is still
                 offered — widening or ingesting is what the user can do either
                 way — but it is no longer presented as the diagnosis.

                 `sources.registry` now supplies the evidence that was missing
                 for the device lane, so where the FDA registry actually
                 answered this panel can say so; where it did not, it says THAT
                 instead of describing an empty corpus. */
              <EmptyState
                icon={I.search}
                title="No precedents returned"
                hint={
                  registry?.consulted && registry.available
                    ? "The FDA 510(k) registry answered for these criteria and returned no clearance, and your organization's corpus holds none either. Widen the product code or device name, or ingest a precedent of your own."
                    : registry?.consulted && !registry.available
                      ? `The FDA 510(k) registry could not be reached, so only your organization's corpus was searched${registry.reason ? ` — ${registry.reason}` : ''}. Treat this as unconfirmed rather than as an empty registry, and re-run the search.`
                      : 'This search returned no precedents. That is not the same as none existing: an empty result and a precedent search that did not complete are indistinguishable from here, so treat it as unconfirmed rather than as an empty corpus. Re-run the search, widen the criteria, or ingest a precedent to seed the registry.'
                }
              />
            ) : (
              <div className="sp-list">
                {results.map((r) => (
                  <button
                    key={r.clearanceNumber}
                    className="sp-row"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      borderRadius: 8,
                      padding: '9px 10px',
                      border:
                        (sel && sel.clearanceNumber === r.clearanceNumber)
                          ? '1px solid var(--accent-muted)'
                          : '1px solid transparent',
                      background:
                        (sel && sel.clearanceNumber === r.clearanceNumber) ? 'var(--accent-000)' : 'transparent',
                    }}
                    onClick={() => setSelK(r.clearanceNumber)}
                  >
                    <span className="sp-row-b">
                      <span
                        className="sp-row-t"
                        style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-200)' }}
                      >
                        {r.clearanceNumber} -- {r.deviceName}
                      </span>
                      <span className="sp-row-s">
                        {r.applicant} -- {r.clearanceType}
                        {r.cycle != null ? ' -- ' + r.cycle + 'd cycle' : ''}
                      </span>
                    </span>
                    <span className="rd-chip tone-ok">{r.decisionOutcome}</span>
                    {r.match != null && <span className="pe-match">{Math.round(r.match * 100)}%</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          {sel && (
            <div className="pj-card" style={{ marginBottom: 14 }}>
              <div className="pj-card-h">
                <span className="t">
                  {sel.clearanceNumber} -- {sel.deviceName}
                </span>
                {/* Was `ask('Compare our submission against precedent …')` —
                    it bypassed POST /api/precedent-engine/compare, which runs
                    the real comparison. */}
                <button
                  className="pj-card-h-go"
                  style={{ fontSize: 11, color: 'var(--accent-200)' }}
                  onClick={() => void runCompare(sel)}
                  disabled={comparing === sel.clearanceNumber}
                >
                  {comparing === sel.clearanceNumber ? 'Comparing…' : <>Compare {I.arrowRight}</>}
                </button>
              </div>
              <div className="pj-card-b">
                <div className="tl-spec-grid">
                  <div className="tl-spec-row">
                    <span className="tl-spec-k">Applicant</span>
                    <span className="tl-spec-v">{sel.applicant}</span>
                  </div>
                  <div className="tl-spec-row">
                    <span className="tl-spec-k">Decision</span>
                    <span className="tl-spec-v">
                      {sel.decisionOutcome}{sel.decisionDate ? ' -- ' + sel.decisionDate : ''}
                    </span>
                  </div>
                  <div className="tl-spec-row">
                    <span className="tl-spec-k">Type</span>
                    <span className="tl-spec-v">{sel.clearanceType}</span>
                  </div>
                  <div className="tl-spec-row">
                    <span className="tl-spec-k">Predicate</span>
                    <span className="tl-spec-v">{sel.predicateKNumber || '--'}</span>
                  </div>
                </div>
                {sel.riskFactors && sel.riskFactors.length > 0 && (
                  <div className="tl-warn" style={{ marginTop: 10 }}>
                    {sel.riskFactors.map((f, i) => (
                      <div key={i} className="tl-warn-row">
                        {I.alertTriangle} {f}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="pj-card">
            <div className="pj-card-b">
              <div className="reg-tabs" style={{ marginTop: 0 }}>
                {TABS.map(([id, l]) => (
                  <button
                    key={id}
                    className={'reg-tab' + (tab === id ? ' on' : '')}
                    onClick={() => setTab(id)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {tab === 'risk' && analysis && isRisk(analysis) && (
                <div>
                  <div className="ub-row" style={{ marginBottom: 8 }}>
                    <div className="ub-row-l">
                      <div className="ub-row-t">Overall risk</div>
                      {/* This line printed `analysis.overall` raw, so a risk
                          analysis that failed server-side rendered the bare
                          word "unknown" beside a "0%" chip in the warn tone —
                          a failed read shown as the lowest possible score. */}
                      <div className="ub-row-s">
                        {riskState === 'unreadable'
                          ? 'Not assessed — the risk analysis did not complete'
                          : analysis.overall}
                      </div>
                    </div>
                    {riskState === 'unreadable' ? (
                      <span className="rd-chip tone-idle">no score</span>
                    ) : (
                      <span className="rd-chip tone-warn">
                        {Math.round((analysis.score || 0) * 100)}%
                      </span>
                    )}
                  </div>
                  {/* This branch was `analysis.factors.length === 0` alone, and
                      read "No scored risk factors for this submission context
                      yet — nothing is inferred without a real signal." It is
                      false in exactly one state: analyzeRisk() rejected, the
                      board substituted an empty risk section, and no signal was
                      ever obtained — so the sentence describing restraint
                      became a description of a clean risk profile. `overall`
                      separates the two, and it is a real sentinel rather than a
                      restatement of the empty array. */}
                  {riskState === 'unreadable' ? (
                    <div className="scaf-note">The risk analysis did not complete for this search, so no factors were scored. This is an unread result, not a clear one — nothing here should be taken as an absence of reviewer risk. Run the search again.</div>
                  ) : riskState === 'assessed-clear' ? (
                    <div className="scaf-note">The risk analysis ran for this submission context and scored no factors — nothing is inferred without a real signal.</div>
                  ) : riskState === 'assessed-with-findings' ? (
                    <div className="sp-list">
                      {analysis.factors.map((f, i) => (
                        <div key={i} className="sp-row">
                          <span className={'rd-chip tone-' + severityTone(f.severity)}>
                            {f.severity}
                          </span>
                          <span className="sp-row-b">
                            <span className="sp-row-t">{f.label}</span>
                            <span className="sp-row-s">{f.note}</span>
                          </span>
                          <button
                            className="sp-go"
                            onClick={() => ask('Explain and pre-empt: ' + f.label)}
                          >
                            {I.sparkles}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* No overall risk value arrived at all — the section is
                       neither a scored result nor the known failure
                       substitution, so the only honest reading is that nothing
                       has been assessed. */
                    <div className="scaf-note">No risk assessment is present in this board for the search — nothing about reviewer risk has been established.</div>
                  )}
                </div>
              )}
              {tab === 'strategy' && analysis && isStrategy(analysis) && (
                <div>
                  <div
                    className="de-quote"
                  >
                    {/* Unchanged in the normal case. In the failure case this
                        rendered "Recommended: Insufficient precedent data",
                        which reads as a conclusion drawn from a thin corpus;
                        the string is in fact the marker of a strategy analysis
                        that never ran. */}
                    {strategyState === 'unreadable' ? (
                      <><b>No recommendation:</b> the strategy analysis did not complete for this search.</>
                    ) : (
                      <>
                        <b>Recommended:</b> {analysis.recommendation}
                        {analysis.predicate ? ' -- citing ' + analysis.predicate : ''}
                      </>
                    )}
                  </div>
                  {/* This branch was `analysis.rationale.length === 0` alone,
                      and read "Not enough supporting precedent data to assemble
                      a rationale — run a search that returns precedents first."
                      It puts the cause on the user's search at the one moment
                      the cause is server-side: recommendStrategy() rejected and
                      the board substituted an empty strategy section, which has
                      no relation to what the search returned. `recommendation`
                      already carries the marker for that state and is displayed
                      immediately above; it is what the copy branches on now. */}
                  {strategyState === 'unreadable' ? (
                    <div className="scaf-note">No rationale is shown because the strategy analysis did not complete for this search — not because the precedent set was thin. Run the search again; until it completes there is no recommendation here to weigh either way.</div>
                  ) : strategyState === 'assessed-clear' ? (
                    <div className="scaf-note">The strategy analysis ran and found no supporting precedent detail to build a rationale from. Widen the search so precedents come back, and the rationale fills in.</div>
                  ) : strategyState === 'assessed-with-findings' ? (
                    <ul className="pe-ul">
                      {analysis.rationale.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  ) : (
                    /* No recommendation value arrived at all — neither a real
                       one nor the known failure substitution. Nothing ran that
                       this panel can speak for. */
                    <div className="scaf-note">No strategy assessment is present in this board for the search — no pathway recommendation has been established.</div>
                  )}
                </div>
              )}
              {lensKeys.includes(tab) && analysis && isPattern(analysis) && (
                <div>
                  <div className="pj-seclbl" style={{ marginTop: 0 }}>
                    {analysis.title}
                  </div>
                  {analysis.items.length === 0 ? (
                    <div className="scaf-note">No {analysis.title.toLowerCase()} surfaced for this context — the analyzer found no matching pattern rather than inventing one.</div>
                  ) : (
                    <ul className="pe-ul">
                      {analysis.items.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="pj-card" style={{ marginTop: 14 }}>
        <div className="pj-card-h">
          <span className="t">Real-time claim check</span>
          <span className="s">claim check</span>
        </div>
        <div className="pj-card-b">
          <div className="tl-edit" style={{ marginTop: 0 }}>
            <span className="tl-edit-ic">{I.sparkles}</span>
            <input
              aria-label="Claim to check against precedent"
              className="tl-edit-in"
              placeholder='Paste a claim to check against precedent — e.g. "14-day wear with no fingerstick calibration"'
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') checkClaim();
              }}
            />
            <button
              className="tl-edit-go"
              aria-label="Check this claim against precedent"
              onClick={checkClaim}
              disabled={!claim.trim() || claimBusy}
            >
              {I.arrowUp}
            </button>
          </div>
          {claimRes && (
            <div className="gri-result" style={{ marginTop: 12 }}>
              <div className="gri-result-hdr">
                <span className="t">
                  {/* Three states, not two. "Not supported" is a judgement and
                      may only be shown when something was actually consulted. */}
                  {claimRes.basis === 'no-precedents'
                    ? 'Not checked'
                    : claimRes.supported
                      ? 'Supported'
                      : 'Not supported'}
                </span>
              </div>
              <div className="gri-result-body">
                {claimRes.recommendation && (
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: 'var(--text-200)',
                      marginBottom: 8,
                    }}
                  >
                    {claimRes.recommendation}
                  </div>
                )}
                {(claimRes.warnings || []).length > 0 && (
                  <ul style={{ margin: '0 0 8px 18px', padding: 0, fontSize: 13, lineHeight: 1.5 }}>
                    {(claimRes.warnings || []).map((w, i) => (
                      <li key={i} style={{ color: 'var(--text-200)' }}>{w.message}</li>
                    ))}
                  </ul>
                )}
                {/* The precedents the claim was actually checked against —
                    named, so the reader can go and look at them. */}
                <div className="gri-cite">
                  {(claimRes.precedents || []).map((c, i) => (
                    <span key={c.clearanceNumber ?? i} className="c">
                      {[c.clearanceNumber, c.deviceName].filter(Boolean).join(' — ') ||
                        'precedent'}
                    </span>
                  ))}
                  {(claimRes.suggestedCitations || []).map((c) => (
                    <span key={c} className="c">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
