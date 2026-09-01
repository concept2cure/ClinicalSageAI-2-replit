import React, { useState, useEffect, useRef, useMemo } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { useLiveRows, unwrapList, EmptyState, liveGetOrNull, liveMutateOrNull } from '../dataConnect';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

/* ── Inline fixture types ── */

interface RbmSite {
  n: string;
  name: string;
  country: string;
  composite: number;
  tier: string;
  drivers?: string[];
}

interface CoStudy {
  // Display columns returned by GET /api/clinical-operations/studies
  // (clinical-operations-routes.ts): id AS studyId, protocol AS id, phase,
  // design, enrolled AS n, target_enrollment AS target, status, note. `design`
  // and `note` are backfilled nullable columns (added via ALTER TABLE) and the
  // POST write path does not set them, so persisted studies routinely carry null
  // there — rendered honestly (omitted when absent), never fabricated.
  /** The study row's real primary key — the handle every study-scoped
   *  clinical-ops endpoint takes. Without it this board can display a study and
   *  write nothing against it. */
  studyId: string;
  id: string;
  phase: string;
  design: string | null;
  n: number;
  target: number;
  status: string;
  note: string | null;
}

interface CoSite {
  // Adopted from the live rbm_site_risk_scores rows (see mapRbmSites):
  // site_number, site_name, composite_risk, monitoring_tier, drivers, plus
  // country_code joined from site_intel.sites. `composite` is nullable
  // (composite_risk can be null on the score row, and a newly-added site has no
  // score yet). Open/high signal counts are NOT part of this endpoint, so they
  // are not carried here (never fabricated).
  n: string;
  name: string;
  country: string;
  composite: number | null;
  tier: string;
  driver: string;
}

/** A protocol deviation as clinical_ops.deviations actually holds it. */
interface CoDev {
  id: string;
  /** Protocol code of the study the deviation is recorded against. */
  study: string;
  /** major | minor | administrative — the API's own vocabulary, not a re-coding. */
  category: string;
  description: string;
  detectedDate: string;
  correctiveAction: string;
  status: string;
}

/** The category → severity-chip mapping. `data-s` only drives the chip colour. */
const DEV_SEV: Record<string, string> = { major: 'high', minor: 'med', administrative: 'low' };

/* Stable empty seeds for the optimistic-row stores while the live source is
   loading or has errored. `useLiveRows` synthesizes a FRESH [] every render in
   those states, which would otherwise thrash the re-seed effect in `useRows`
   (see dataConnect loop-safety note). */
const EMPTY_SITES: CoSite[] = [];

/** Map the adopted RbmSite rows onto the CoSite display shape. Open/high signal
 *  counts are intentionally absent — GET /api/mdx/rbm-site-risk does not return
 *  them (they live on /rbm-site-oversight/:programId, which this org-wide board
 *  has no program handle to call), so they are not fabricated here. */
function buildSites(sitesData: RbmSite[]): CoSite[] {
  return sitesData.map((s: RbmSite) => ({
    n: s.n,
    name: s.name,
    country: s.country,
    composite: s.composite,
    tier: s.tier,
    driver: (s.drivers || [])[0] || '',
  }));
}

/* ── Inline shared kit helpers (not yet ported as modules) ── */

interface QueueItem {
  ico: string;
  title: string;
  sub: string;
  tone: string;
  action: string;
  cmd: string;
}

interface BpComposerProps {
  eyebrow: string;
  title: string;
  state: React.ReactNode;
  starters: string[];
  primary?: React.ReactNode;
  queue: QueueItem[];
  onAsk: (text: string) => void;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}

function BpComposer({ eyebrow, title, state, starters, primary, queue, onAsk, lead, children }: BpComposerProps) {
  return (
    <div className="sp">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">{eyebrow}</div>
          <h1 className="sp-title">{title}</h1>
          <p className="sp-state">{state}</p>
        </div>
        {primary}
      </div>
      {lead}
      <div className="sp-starters">
        {starters.map((s, i) => (
          <button key={i} className="sp-starter" onClick={() => onAsk(s)}>
            <span className="sk">{I.sparkles}</span>
            <span>{s}</span>
          </button>
        ))}
      </div>
      <div className="sp-sec">
        <div className="sp-sec-h">
          <span className="t">Today {I.dot} your queue</span>
          <span className="s">{queue.length} items</span>
          <span className="sp-sample">sample</span>
        </div>
        <div className="sp-queue">
          {queue.map((q, i) => (
            <button key={i} className="sp-q" data-tone={q.tone} onClick={() => onAsk(q.cmd)}>
              <span className="sp-q-ic">{I[q.ico] || I.info}</span>
              <span className="sp-q-b">
                <span className="sp-q-t">{q.title}</span>
                <span className="sp-q-s">{q.sub}</span>
              </span>
              <span className="sp-q-a">{q.action} {I.right}</span>
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

interface SpCardProps {
  title: string;
  meta?: React.ReactNode;
  sample?: boolean;
  action?: React.ReactNode;
  children?: React.ReactNode;
  foot?: React.ReactNode;
}

function SpCard({ title, meta, sample, action, children, foot }: SpCardProps) {
  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">{title}</span>
        <span className="s" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sample && <span className="sp-sample">sample</span>}
          {meta}
          {action}
        </span>
      </div>
      <div className="pj-card-b">
        {children}
        {foot}
      </div>
    </div>
  );
}

interface AddBtnProps {
  onClick: () => void;
  label: string;
}

function AddBtn({ onClick, label }: AddBtnProps) {
  return (
    <button className="sp-addbtn" onClick={onClick}>
      {I.plus} {label}
    </button>
  );
}

interface SpAskProps {
  onAsk: (text: string) => void;
  cmd: string;
  label: string;
}

function SpAsk({ onAsk, cmd, label }: SpAskProps) {
  return (
    <div className="sp-foot">
      <button className="sp-ask" onClick={() => onAsk(cmd)}>
        {I.sparkles} {label}
      </button>
    </div>
  );
}

function pill(status: string) {
  const map: Record<string, string> = {
    active: 'ai', review: 'warn', drafted: 'idle', draft: 'idle',
    designated: 'ok', approved: 'ok', requested: 'warn', evaluating: 'warn',
    planned: 'idle', implemented: 'ok', monitoring: 'ai', watch: 'idle',
    drafting: 'warn', queued: 'idle', filed: 'ai', eligible: 'warn',
    awarded: 'ok', agreed: 'ok', submitted: 'ai', 'in draft': 'idle',
    received: 'ok', complete: 'ok',
  };
  return <span className={'rd-chip tone-' + (map[status] || 'idle')}>{status}</span>;
}

/**
 * Rows that follow the live source, and nothing else.
 *
 * This used to return an `add` alongside them — an optimistic appender that both
 * drawers on this surface called INSTEAD of writing anything, which is how a
 * hand-typed site ended up in a governed monitoring-tier table and a deviation
 * "added to the board" reached no store at all. Neither caller exists now: the
 * site drawer is gone (nothing can write to the site-risk roster) and deviations
 * are re-read from the record after their write. The appender goes with them,
 * because leaving it here is leaving the defect one call site away.
 */
function useRows<T>(seed: T[]): readonly [T[]] {
  const [rows, setRows] = useState(() => (seed || []).map((r) => ({ ...r })));
  // Re-seed when the live source resolves (seed identity changes once).
  const seedRef = useRef(seed);
  useEffect(() => {
    if (seed !== seedRef.current) {
      seedRef.current = seed;
      setRows((seed || []).map((r) => ({ ...r })));
    }
  }, [seed]);
  return [rows] as const;
}

/**
 * Map the raw rbm_site_risk_scores rows the backend returns
 * (GET /api/mdx/rbm-site-risk — DB columns: site_number, site_name,
 * composite_risk, monitoring_tier, drivers, plus country_code joined from
 * site_intel.sites) onto the RbmSite display contract the risk-based-monitoring
 * board renders. Fail-closed (returns null → the board keeps its Sample
 * fixture) unless the payload is a non-empty list of rows carrying the score
 * signature (site_number + a monitoring_tier/composite_risk column). Exported
 * for unit coverage.
 */
export function mapRbmSites(payload: unknown): RbmSite[] | null {
  const list = unwrapList(payload);
  if (!Array.isArray(list) || list.length === 0) return null;
  const out: RbmSite[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    // Signature gate — a score row, not the RbmSite fixture (which carries `n`/
    // `composite`, not `site_number`/`composite_risk`).
    if (typeof r.site_number !== 'string' || !r.site_number) return null;
    if (!('monitoring_tier' in r) && !('composite_risk' in r)) return null;
    const composite = r.composite_risk != null ? Number(r.composite_risk) : NaN;
    out.push({
      n: r.site_number,
      name: typeof r.site_name === 'string' && r.site_name ? r.site_name : r.site_number,
      country: typeof r.country_code === 'string' ? r.country_code : '',
      composite: Number.isFinite(composite) ? composite : 0,
      tier: typeof r.monitoring_tier === 'string' && r.monitoring_tier ? r.monitoring_tier : 'standard',
      drivers: Array.isArray(r.drivers) ? (r.drivers as string[]) : [],
    });
  }
  return out.length ? out : null;
}

/* ════ Clinical Operations — clinical-development stage surface ════ */

export function ClinicalOps({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  // Studies & enrollment — GET /api/clinical-operations/studies is REAL
  // (clinical_ops.studies via pg, projected to the CoStudy display contract,
  // org-scoped). Real rows, an honest empty, or an honest failed-load — never a
  // fixture.
  const liveStudies = useLiveRows<CoStudy>('/api/clinical-operations/studies');

  // Site-risk roster — GET /api/mdx/rbm-site-risk is REAL (rbm_site_risk_scores
  // + country_code from site_intel.sites, org-scoped). The endpoint returns raw
  // score rows, so adopt them via mapRbmSites → buildSites onto the CoSite
  // display shape. mapRbmSites returns null for an empty/unmappable payload;
  // `?? []` funnels that into the honest empty state below, never a fixture.
  const liveSites = useLiveRows<unknown>('/api/mdx/rbm-site-risk');
  const mappedSites = useMemo(
    () => buildSites(mapRbmSites(liveSites.rows) ?? []),
    [liveSites.rows],
  );
  // Seed the optimistic-row store with a STABLE empty array while the roster is
  // loading or errored (useLiveRows returns a fresh [] each render then); once
  // it resolves, `mappedSites` is a stable reference and becomes the seed.
  const seedSites =
    liveSites.loading || liveSites.error ? EMPTY_SITES : mappedSites;
  const [sites] = useRows<CoSite>(seedSites);

  /* ── Protocol deviations — the record, not a React array ───────────────────
     "Log deviation" used to push onto local state and toast "Deviation added to
     the board". Nothing was written; the row was gone on reload; and the empty
     state read "No protocol deviations logged", which is a CLEARANCE claim about
     an organisation this board had never asked.

     The deviations API is study-scoped in both directions, and it is reachable:
     the studies read now carries each study's real id (see CoStudy.studyId), so
     the board fans out one read per study it is already displaying and posts new
     deviations against the study the user names. There is no org-wide list
     endpoint, so this fan-out IS the list — bounded to the studies on screen, and
     honest about a partial failure rather than silently short. */
  const studyIds = useMemo(
    () => liveStudies.rows
      .map((st) => st.studyId)
      .filter((x): x is string => typeof x === 'string' && x !== '')
      .slice(0, 12),
    [liveStudies.rows],
  );
  const studyCodeById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const st of liveStudies.rows) if (st.studyId) m[st.studyId] = st.id;
    return m;
  }, [liveStudies.rows]);
  const [devReload, setDevReload] = useState(0);
  const [devState, setDevState] = useState<{ rows: CoDev[]; loading: boolean; error: string }>(
    { rows: [], loading: true, error: '' },
  );
  useEffect(() => {
    if (liveStudies.loading) { setDevState({ rows: [], loading: true, error: '' }); return undefined; }
    if (liveStudies.error) {
      // The deviations read hangs off the studies read. A failed studies read is
      // not "no deviations" — it is "we do not know", and it says so.
      setDevState({ rows: [], loading: false, error: 'the study portfolio did not load, so its deviations could not be read' });
      return undefined;
    }
    if (studyIds.length === 0) { setDevState({ rows: [], loading: false, error: '' }); return undefined; }
    let cancelled = false;
    setDevState((d) => ({ ...d, loading: true, error: '' }));
    Promise.all(
      studyIds.map((id) =>
        liveGetOrNull<unknown[]>('/api/clinical-operations/studies/' + encodeURIComponent(id) + '/deviations'),
      ),
    ).then((results) => {
      if (cancelled) return;
      const failed = results.filter((r) => r.error).length;
      const rows: CoDev[] = [];
      results.forEach((r, i) => {
        const list = unwrapList(r.data);
        if (!Array.isArray(list)) return;
        for (const raw of list) {
          const d = (raw ?? {}) as Record<string, unknown>;
          rows.push({
            id: String(d.id ?? ''),
            study: studyCodeById[studyIds[i]] || studyIds[i],
            category: typeof d.category === 'string' ? d.category : '',
            description: typeof d.description === 'string' ? d.description : '',
            detectedDate: typeof d.detected_date === 'string' ? d.detected_date.slice(0, 10) : '',
            correctiveAction: typeof d.corrective_action === 'string' ? d.corrective_action : '',
            status: typeof d.status === 'string' ? d.status : '',
          });
        }
      });
      setDevState({
        rows,
        loading: false,
        error: failed
          ? failed + ' of ' + studyIds.length + ' studies did not answer, so this list is incomplete'
          : '',
      });
    });
    return () => { cancelled = true; };
  }, [liveStudies.loading, liveStudies.error, studyIds, studyCodeById, devReload]);
  const devs = devState.rows;

  /* Studies materially behind their enrollment target — the one queue item this
     surface can derive honestly from `/api/clinical-operations/studies`. Empty
     while the read is loading or failed: "no study is behind" and "the study
     read failed" are different statements, and only one of them belongs in a
     panel headed "Today". */
  const enrollmentBehind = useMemo(() => {
    if (liveStudies.loading || liveStudies.error) return [];
    return liveStudies.rows
      .filter((st) => st.target > 0 && st.n < st.target * 0.8 && st.status !== 'completed')
      .slice(0, 2)
      .map((st) => ({
        ico: 'alertTriangle',
        title: st.id + ' is behind enrollment',
        sub: st.n + ' of ' + st.target + ' enrolled (' + Math.round((st.n / st.target) * 100) + '%)',
        tone: 'warn',
        action: 'Review',
        cmd: 'Why is ' + st.id + ' behind its enrollment target, and which sites are driving it?',
      }));
  }, [liveStudies.loading, liveStudies.error, liveStudies.rows]);
  const [devForm, setDevForm] = useState(false);
  const [devSaving, setDevSaving] = useState(false);
  const [toast, fireToast] = useToast();

  /* ── "Add study site" is gone, deliberately ───────────────────────────────
     It opened a drawer, pushed a row onto React state and toasted "Site added to
     the board". The board's site roster is `rbm_site_risk_scores` — governed
     composite risk scores derived by the RBM engine from Site Intelligence — so
     the row it added was an unscored, unsourced entry sitting in a risk table
     among real ones, carrying whatever monitoring tier the user picked. On a
     monitoring-tier table that is not merely unsaved, it is misleading.

     There is no write that puts a site into that roster: the RBM recompute is
     program-scoped and derives from site_intel.sites, and the one real site write
     in the clinical-operations router (POST /sites) inserts into
     clinical_ops.sites — a different store this board never reads, so a site
     created there would still never appear here. Offering the control would mean
     promising an outcome no endpoint can deliver, so the surface says where sites
     actually come from instead. */

  const DEV_FORM: C2CFormConfig = {
    eyebrow: 'Clinical ops — log deviation',
    title: 'Record a protocol deviation',
    sub: 'Deviations are recorded against a study. Pick the study it belongs to — the deviations record is study-scoped, so a deviation with no study has nowhere to live.',
    governed: 'This writes a protocol deviation to the study’s clinical-operations record.',
    submitLabel: devSaving ? 'Recording…' : 'Record deviation',
    fields: [
      {
        key: 'studyId', label: 'Study', type: 'select', required: true,
        options: liveStudies.rows
          .filter((st) => st.studyId)
          .map((st) => ({ value: st.studyId, label: st.id + (st.phase ? ' -- Phase ' + st.phase : '') })),
      },
      {
        key: 'category', label: 'Category', type: 'seg', default: 'minor', half: true,
        // The record's own vocabulary. The form used to collect low/med/high and
        // drop it; re-coding a severity scale into a regulatory category the API
        // defines would be inventing the classification.
        options: ['administrative', 'minor', 'major'],
      },
      { key: 'detectedDate', label: 'Detected on', type: 'date', required: true, half: true },
      // The roster's site NUMBERS are not clinical_ops.sites primary keys, so the
      // record's optional siteId cannot be filled from them without fabricating a
      // reference. The site is carried in the description, where it is a fact
      // rather than a foreign key that does not resolve.
      { key: 'site', label: 'Site', type: 'select', options: sites.map((st) => st.n), half: true },
      { key: 'title', label: 'Deviation', type: 'text', placeholder: 'What happened', required: true },
      { key: 'detail', label: 'Detail', type: 'textarea', placeholder: 'Description, root cause, context...' },
      { key: 'capa', label: 'Corrective action', type: 'textarea', placeholder: 'Corrective / preventive action taken or planned...' },
    ],
  };

  const recordDeviation = async (v: Record<string, string>) => {
    if (devSaving) return;
    const studyId = (v.studyId || '').trim();
    if (!studyId) { fireToast('Not recorded -- choose the study this deviation belongs to.', 'error'); return; }
    const site = (v.site || '').trim();
    const description =
      (site ? 'Site ' + site + ' -- ' : '') + (v.title || '').trim() +
      ((v.detail || '').trim() ? '\n\n' + (v.detail || '').trim() : '');
    setDevSaving(true);
    try {
      const r = await liveMutateOrNull('POST', '/api/clinical-operations/deviations', {
        studyId,
        category: ['major', 'minor', 'administrative'].indexOf(v.category) === -1 ? 'minor' : v.category,
        description,
        detectedDate: (v.detectedDate || '').trim(),
        ...((v.capa || '').trim() ? { correctiveAction: (v.capa || '').trim() } : {}),
      });
      if (r.error || !r.data) {
        // Never "added to the board" when nothing was written.
        fireToast('Not recorded -- the clinical-operations service did not accept the deviation. Nothing was saved.', 'error');
        return;
      }
      setDevForm(false);
      // Re-read from the record rather than pushing the typed row onto the list:
      // what the board shows is then what the store holds, not what was submitted.
      setDevReload((n) => n + 1);
      fireToast('Deviation recorded against ' + (studyCodeById[studyId] || 'the study'));
    } finally {
      setDevSaving(false);
    }
  };

  const enhanced = sites.filter((s) => s.tier === 'enhanced');
  const worst = sites.slice().sort((a, b) => (b.composite || 0) - (a.composite || 0))[0] || ({} as CoSite);

  /* What AnA can see of this screen.
     Every starter this surface offers her — "which sites are behind enrollment
     and why?", "summarize the open protocol deviations" — is a question about
     rows she could not see. The three live reads fail independently, so each
     publishes its own state rather than one collapsed verdict.

     The deviations list is now the RECORD (a study-scoped fan-out across the
     studies on the board), so it is published as such — but its COVERAGE is
     published with it. It is bounded to the studies on screen and can come back
     partial, and an assistant that answered "there are no open deviations" from a
     bounded or partial read would be making a clearance claim nobody made. */
  const anaContext = useMemo(() => {
    const sitesState = liveSites.loading
      ? 'still loading'
      : liveSites.error
        ? 'could not be read'
        : `${sites.length} site(s), ${enhanced.length} at enhanced tier`;
    const studiesState = liveStudies.loading
      ? 'still loading'
      : liveStudies.error
        ? 'could not be read'
        : `${liveStudies.rows.length} study(ies)`;
    const devsState = devState.loading
      ? 'still loading'
      : devState.error
        ? `could not be read (${devState.error})`
        : `${devs.length} recorded across the ${studyIds.length} study(ies) this board reads`;
    return {
      summary:
        `Clinical operations: the site-risk roster is ${sitesState}; studies and enrolment are ${studiesState}. ` +
        /* One sentence for every count. A `devs.length ? … : …` here picked the
           copy BY the list being empty, so an untouched board told AnA "no
           protocol deviations have been logged" — clearance vocabulary for a
           state that is `not-assessed`. The list is now the real record, but it
           is still bounded, so the coverage travels with the count and a 0 is
           never offered as a finding that there are none. */
        `Protocol deviations: ${devsState}. The deviations record is study-scoped and this board reads only ` +
        'the studies it displays (at most 12), so a count of 0 covers those studies alone and is not a ' +
        'finding that the organisation has no deviations.',
      facts: {
        siteRoster: liveSites.loading || liveSites.error
          ? null
          : {
              totalSites: sites.length,
              enhancedTier: enhanced.length,
              highestRiskSite: worst.n
                ? { site: worst.n, name: worst.name, country: worst.country, composite: worst.composite, tier: worst.tier, driver: worst.driver }
                : null,
              sites: sites.slice(0, 12).map((st) => ({
                site: st.n, name: st.name, country: st.country,
                composite: st.composite, tier: st.tier, driver: st.driver,
              })),
            },
        siteRosterUnavailable: liveSites.error ? 'the site-risk roster read failed' : null,
        studies: liveStudies.loading || liveStudies.error
          ? null
          : liveStudies.rows.slice(0, 12).map((st) => ({
              protocol: st.id, phase: st.phase, design: st.design,
              enrolled: st.n, target: st.target, status: st.status, note: st.note,
            })),
        studiesUnavailable: liveStudies.error ? 'the studies read failed' : null,
        /* The organisation's recorded deviations, for the studies this board
           reads. Null while the read is loading or has failed — "we could not
           read them" must never arrive as "there are none". */
        deviations: devState.loading || devState.error
          ? null
          : devs.slice(0, 20).map((d) => ({
              // `description` and `correctiveAction` are user-authored free-text
              // on a subject-scoped clinical table (TEXT, up to 5000 chars) —
              // deviation narratives and CAPA text that routinely carry subject
              // detail. Folding them verbatim into the every-turn prompt is both
              // a PII exposure and a prompt-injection channel. The structured
              // fields carry the grounding; the narrative stays on screen.
              study: d.study, category: d.category,
              detectedDate: d.detectedDate, status: d.status,
            })),
        deviationsUnavailable: devState.error || null,
        deviationCoverage: {
          scope: 'study-scoped; only the studies this board displays',
          studiesRead: studyIds.length,
          orgWideListEndpointExists: false,
        },
      },
      availableActions: [
        'Record a protocol deviation against one of the organisation’s studies (a real, study-scoped write)',
        'Read the site-risk composite scores and monitoring tiers',
        'Read study enrolment against target',
      ],
    };
  }, [liveSites.loading, liveSites.error, liveStudies.loading, liveStudies.error, liveStudies.rows, liveStudies.empty, sites, enhanced.length, worst, devs, devState, studyIds]);
  usePublishSurfaceContext('clinical-ops', anaContext);

  return (
    <BpComposer
      eyebrow="Clinical development — operations"
      title="Clinical operations"
      state={
        liveSites.loading && sites.length === 0
          ? <>Loading the site-risk roster…</>
          : liveSites.error && sites.length === 0
          ? <>The site-risk roster didn't load — retry from the site-risk card below.</>
          : sites.length === 0
          ? <>No site-risk scores yet — the risk-based-monitoring engine has not scored this organisation&rsquo;s sites.</>
          : enhanced.length
          ? <><b>{enhanced.length}</b> of <b>{sites.length}</b> study sites are enhanced-tier and need on-site monitoring{worst.name ? <> -- {worst.name} leads at composite <b>{worst.composite ?? '—'}</b></> : null}. Central monitoring holds the rest.</>
          : <>All <b>{sites.length}</b> sites are at standard or reduced monitoring — no enhanced visits required.</>
      }
      starters={[
        'Which sites are behind enrollment and why?',
        'Summarize the open protocol deviations and CAPA status',
        'Prep the next DSMB data package',
        'What is the gap to database lock on the pivotal study?',
      ]}
      primary={<button className="sp-primary" onClick={() => setDevForm(true)}>{I.plus} Log deviation</button>}
      queue={[
        // Derived from the live roster; dropped when there's no site data so the
        // queue never interpolates an "undefined" site.
        ...(worst.name
          ? [{ ico: 'alertTriangle', title: worst.name + ' -- ' + worst.tier + ' tier', sub: 'composite ' + (worst.composite ?? '—') + (worst.driver ? ' -- ' + worst.driver : ''), tone: 'warn', action: 'Review', cmd: 'Explain the drivers behind the highest-risk site and the monitoring it needs.' }]
          : []),
        /* ── Two invented items are gone ──────────────────────────────────
           "Prep the next DSMB data package" and "Review open protocol
           deviations" were unconditional literals, so the panel headed
           "Today · your queue — N items" counted work nobody had, with a
           warn-toned badge on a deviation review that no deviation data
           supports (this board has no reachable org-wide deviations read; the
           endpoint is study-scoped and it has no studyId handle).

           They are not lost: both are already offered as `starters` above,
           which is what a suggested prompt is. The queue now carries only what
           the live roster actually says, so an empty queue means an empty
           queue.

           Enrollment IS live, so a study genuinely behind its target earns a
           place here. */
        ...enrollmentBehind,
      ]}
      onAsk={ask}
    >
      <div className="sp-sec">
        <SpCard
          title="Site-risk assessment — RBM"
          meta="site-risk-engine composite"
          foot={
            <SpAsk
              onAsk={ask}
              cmd="Recompute site risk and show the enhanced-tier sites with drivers and the monitoring recommendation."
              label="Recompute & prioritize monitoring"
            />
          }
        >
          {liveSites.loading && sites.length === 0 ? (
            <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading site-risk roster…</div>
          ) : liveSites.error && sites.length === 0 ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load the site-risk roster"
              hint="The risk-based-monitoring site-risk engine didn't respond. These are the organization's governed site-risk composite scores — sign in and retry, or check the service is reachable."
            />
          ) : sites.length === 0 ? (
            <EmptyState
              icon={I.shieldCheck}
              title="No site-risk scores yet"
              hint="Once the risk-based-monitoring engine computes composite scores for this organization's study sites, the enhanced-tier sites and their drivers appear here."
            />
          ) : (
            <>
              <p className="co-assess-lead">
                {enhanced.length} of {sites.length} sites are <b>enhanced-tier</b> and need on-site monitoring; central monitoring holds the remaining {sites.length - enhanced.length} at standard or reduced. Composite scores are the governed site-risk-engine output — AnA ranks and explains them, it doesn't recompute them here.
              </p>
              <div className="sp-list">
                {enhanced.map((s, i) => (
                  <div key={i} className="sp-row">
                    <span className="sp-tag">Site {s.n}</span>
                    <span className="sp-row-b">
                      <span className="sp-row-t">{s.name}{s.composite != null ? ` -- composite ${s.composite}` : ''}</span>
                      <span className="sp-row-s">{s.driver}</span>
                    </span>
                    <span className="sp-sev" data-s="high">enhanced</span>
                  </div>
                ))}
              </div>
              <div className="co-reco">{I.shieldCheck} Recommendation — schedule enhanced monitoring visits for these {enhanced.length} sites; maintain central monitoring elsewhere. Scheduling a monitoring visit is a governed action that will carry a Part 11 audit entry once wired to the clinical-operations service.</div>
            </>
          )}
        </SpCard>
      </div>

      <div className="sp-sec">
        <SpCard title="Studies & enrollment" meta="Phase 1 -> 3">
          <div className="sp-list">
            {liveStudies.loading ? (
              <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading studies…</div>
            ) : liveStudies.error ? (
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="Couldn't load the study portfolio"
                hint="The clinical-operations service didn't respond. These are the organization's registered studies and their enrollment — sign in and retry, or check the service is reachable."
              />
            ) : liveStudies.empty ? (
              <EmptyState
                icon={I.fileText}
                title="No studies yet"
                hint="Register a study in the clinical-operations service and it appears here with its phase, design, and enrollment against target."
              />
            ) : (
              liveStudies.rows.map((s, i) => (
                <button key={i} className="sp-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => ask(`Summarize the status of study ${s.id}`)}>
                  <span className="sp-tag">{s.id}</span>
                  <span className="sp-tag2">Ph {s.phase}</span>
                  <span className="sp-row-b">
                    <span className="sp-row-t">{s.design ? `${s.design} -- ` : ''}N={s.n}/{s.target}</span>
                    <span className="sp-row-s">{s.note}</span>
                  </span>
                  {pill(s.status)}
                </button>
              ))
            )}
          </div>
        </SpCard>
      </div>

      <div className="sp-2col">
        <SpCard
          title="Study sites — monitoring tier"
          meta={sites.length + ' sites'}
          foot={<SpAsk onAsk={ask} cmd="Open the central-monitoring view across all sites." label="Central monitoring" />}
        >
          <div className="sp-list">
            {liveSites.loading && sites.length === 0 ? (
              <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading study sites…</div>
            ) : liveSites.error && sites.length === 0 ? (
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="Couldn't load the study sites"
                hint="The risk-based-monitoring site-risk engine didn't respond. Sign in and retry, or check the service is reachable."
              />
            ) : sites.length === 0 ? (
              <EmptyState
                icon={I.shieldCheck}
                title="No study sites yet"
                hint="Sites reach this roster from Site Intelligence, through the risk-based-monitoring engine, which computes each site's composite score and monitoring tier. Sites are not added here — a row with no computed score would sit in a risk table looking like one that has been assessed."
              />
            ) : (
              sites.map((s, i) => (
                <button key={i} className="sp-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => ask(`Explain the site-risk drivers for ${s.name} (site ${s.n}).`)}>
                  <span className="sp-tag">Site {s.n}</span>
                  <span className="sp-tag2">{s.country}</span>
                  <span className="sp-row-b">
                    <span className="sp-row-t">{s.name}{s.composite != null ? ` -- composite ${s.composite}` : ''}</span>
                    <span className="sp-row-s">{s.driver}</span>
                  </span>
                  <span className="sp-sev" data-s={s.tier === 'enhanced' ? 'high' : s.tier === 'standard' ? 'med' : 'low'}>{s.tier}</span>
                </button>
              ))
            )}
          </div>
        </SpCard>

        <SpCard title="DSMB & interim reviews" meta="independent monitoring">
          {/* Backend gap: there is no clinical-operations DSMB / interim-review
              endpoint yet. An honest empty beats the prior hardcoded
              review-history fixture presented as cleared reviews. */}
          <EmptyState
            icon={I.shieldCheck}
            title="No DSMB reviews yet"
            hint="Independent DSMB / DMC interim-review outcomes will appear here once the clinical-operations service records them. There is no DSMB review endpoint yet."
          />
        </SpCard>
      </div>

      <div className="sp-sec">
        <SpCard
          title="Protocol deviations"
          meta={
            devState.loading
              ? 'reading the studies'
              : devState.error
                ? 'incomplete'
                : devs.length === 1 ? '1 recorded' : devs.length + ' recorded'
          }
          action={<AddBtn onClick={() => setDevForm(true)} label="Log deviation" />}
        >
          {/* The deviations API is study-scoped in both directions and there is
              no org-wide list, so this card is the fan-out across the studies on
              the board — bounded, and explicit when part of it failed. What it
              shows is the record; a partial or failed read is never rendered as
              an empty one, because "no deviations" is a clearance claim. */}
          {devState.loading ? (
            <div className="scaf-note" style={{ padding: '18px 10px' }}>Reading protocol deviations…</div>
          ) : devState.error ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't read the protocol deviations"
              hint={'These are the deviations recorded against your studies — ' + devState.error + '. Sign in and retry, or check the service is reachable.'}
            />
          ) : liveStudies.empty ? (
            <EmptyState
              icon={I.clipboardList}
              title="No studies to record deviations against"
              hint="Deviations are recorded against a study. Register a study in the clinical-operations service and its deviations appear here."
            />
          ) : devs.length === 0 ? (
            <EmptyState
              icon={I.clipboardList}
              title="No protocol deviations recorded"
              hint={'No deviation is recorded against ' + (studyIds.length === 1 ? 'the study on this board' : 'the ' + studyIds.length + ' studies on this board') + '. Recording one writes it to that study\u2019s clinical-operations record.'}
            />
          ) : (
            <div className="sp-list">
              {devs.map((d) => (
                <div key={d.id} className="sp-row">
                  <span className="sp-sev" data-s={DEV_SEV[d.category] || 'low'}>{d.category || 'uncategorised'}</span>
                  <span className="sp-tag">{d.study}</span>
                  <span className="sp-row-b">
                    <span className="sp-row-t">{d.description}</span>
                    <span className="sp-row-s">
                      {d.detectedDate ? 'detected ' + d.detectedDate : 'detection date not recorded'}
                      {d.correctiveAction ? ' -- ' + d.correctiveAction : ''}
                    </span>
                  </span>
                  {pill(d.status)}
                </div>
              ))}
            </div>
          )}
        </SpCard>
      </div>

      {devForm && (
        <C2CForm
          config={DEV_FORM}
          onCancel={() => setDevForm(false)}
          onSubmit={(v) => void recordDeviation(v)}
        />
      )}
      <C2CToast msg={toast} />
    </BpComposer>
  );
}
