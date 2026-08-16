import React, { useState, useEffect, useRef, useMemo } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { useLiveRows, unwrapList, EmptyState } from '../dataConnect';
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
  // (clinical-operations-routes.ts): protocol AS id, phase, design, enrolled AS
  // n, target_enrollment AS target, status, note. `design` and `note` are
  // backfilled nullable columns (added via ALTER TABLE) and the POST write path
  // does not set them, so persisted studies routinely carry null there —
  // rendered honestly (omitted when absent), never fabricated.
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
  _new?: boolean;
}

interface CoDev {
  sev: string;
  site: string;
  title: string;
  capa: string;
  status: string;
  _new?: boolean;
}

/* Stable empty seeds for the optimistic-row stores while the live source is
   loading or has errored. `useLiveRows` synthesizes a FRESH [] every render in
   those states, which would otherwise thrash the re-seed effect in `useRows`
   (see dataConnect loop-safety note). */
const EMPTY_SITES: CoSite[] = [];
const EMPTY_DEVS: CoDev[] = [];

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

function rowcls(r: { _new?: boolean }): string {
  return 'sp-row' + (r._new ? ' de-row-new' : '');
}

function useRows<T extends { _new?: boolean }>(seed: T[]): readonly [T[], (r: T) => void] {
  const [rows, setRows] = useState(() => (seed || []).map((r) => ({ ...r })));
  // Re-seed when the live source resolves (seed identity changes once).
  const seedRef = useRef(seed);
  useEffect(() => {
    if (seed !== seedRef.current) {
      seedRef.current = seed;
      setRows((seed || []).map((r) => ({ ...r })));
    }
  }, [seed]);
  const add = (r: T) => {
    const row: T = { ...r, _new: true };
    setRows((rs) => [row, ...rs]);
    setTimeout(() => setRows((rs) => rs.map((x) => (x === row ? { ...x, _new: false } : x))), 1500);
  };
  return [rows, add] as const;
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
  const [sites, addSite] = useRows<CoSite>(seedSites);

  // Protocol deviations — no reachable list endpoint for this surface: the
  // clinical-operations deviations API is study-scoped
  // (GET /api/clinical-operations/studies/:studyId/deviations) and this org-wide
  // board has no studyId handle. Start from an honest empty; rows a user logs
  // are optimistic-only (the form copy below no longer claims persistence).
  const [devs, addDev] = useRows<CoDev>(EMPTY_DEVS);
  const [siteForm, setSiteForm] = useState(false);
  const [devForm, setDevForm] = useState(false);
  const [toast, fireToast] = useToast();

  const SITE_FORM: C2CFormConfig = {
    eyebrow: 'Clinical ops -- activate site',
    title: 'Activate a study site',
    governed: 'Sites are governed records. This adds the site to the board for review — it does not yet write to the governed store or enroll it into risk-based monitoring.',
    submitLabel: 'Add site',
    fields: [
      { key: 'n', label: 'Site number', type: 'text', placeholder: 'e.g. 1131', required: true, half: true },
      { key: 'country', label: 'Country', type: 'select', options: ['US', 'DE', 'FR', 'UK', 'JP', 'CA', 'SE', 'IT', 'AU'], required: true, half: true },
      { key: 'name', label: 'Site name', type: 'text', placeholder: 'Institution', required: true },
      { key: 'tier', label: 'Initial monitoring tier', type: 'seg', options: ['reduced', 'standard', 'enhanced'], default: 'standard' },
    ],
  };

  const DEV_FORM: C2CFormConfig = {
    eyebrow: 'Clinical ops -- log deviation',
    title: 'Log a protocol deviation',
    governed: 'Deviations are governed records. This adds the deviation to the board for review — it does not yet open a CAPA workflow or write a Part 11 audit entry.',
    submitLabel: 'Add deviation',
    fields: [
      { key: 'site', label: 'Site', type: 'select', options: sites.map((s) => s.n), required: true, half: true },
      { key: 'sev', label: 'Severity', type: 'seg', options: ['low', 'med', 'high'], default: 'low', half: true },
      { key: 'title', label: 'Deviation', type: 'text', placeholder: 'What happened', required: true },
      { key: 'capa', label: 'CAPA', type: 'select', options: ['documented', 'CAPA open', 'escalated'], default: 'documented', half: true },
      { key: 'status', label: 'Status', type: 'seg', options: ['planned', 'evaluating'], default: 'evaluating', half: true },
      { key: 'detail', label: 'Detail', type: 'textarea', placeholder: 'Description, root cause, corrective action...' },
    ],
  };

  const enhanced = sites.filter((s) => s.tier === 'enhanced');
  const worst = sites.slice().sort((a, b) => (b.composite || 0) - (a.composite || 0))[0] || ({} as CoSite);

  return (
    <BpComposer
      eyebrow="Clinical development -- operations"
      title="Clinical operations"
      state={
        liveSites.loading && sites.length === 0
          ? <>Loading the site-risk roster…</>
          : liveSites.error && sites.length === 0
          ? <>The site-risk roster didn't load — retry from the site-risk card below.</>
          : sites.length === 0
          ? <>No site-risk scores yet — run the risk-based-monitoring engine or add sites to populate the board.</>
          : enhanced.length
          ? <><b>{enhanced.length}</b> of <b>{sites.length}</b> study sites are enhanced-tier and need on-site monitoring{worst.name ? <> -- {worst.name} leads at composite <b>{worst.composite ?? '—'}</b></> : null}. Central monitoring holds the rest.</>
          : <>All <b>{sites.length}</b> sites are at standard or reduced monitoring -- no enhanced visits required.</>
      }
      starters={[
        'Which sites are behind enrollment and why?',
        'Summarize the open protocol deviations and CAPA status',
        'Prep the next DSMB data package',
        'What is the gap to database lock on the pivotal study?',
      ]}
      primary={<button className="sp-primary" onClick={() => setSiteForm(true)}>{I.plus} Add study site</button>}
      queue={[
        // Derived from the live roster; dropped when there's no site data so the
        // queue never interpolates an "undefined" site.
        ...(worst.name
          ? [{ ico: 'alertTriangle', title: worst.name + ' -- ' + worst.tier + ' tier', sub: 'composite ' + (worst.composite ?? '—') + (worst.driver ? ' -- ' + worst.driver : ''), tone: 'warn', action: 'Review', cmd: 'Explain the drivers behind the highest-risk site and the monitoring it needs.' }]
          : []),
        { ico: 'shieldCheck', title: 'Prep the next DSMB data package', sub: 'Assemble the interim safety/efficacy package for the DSMB', tone: 'info', action: 'Prep', cmd: 'Prepare the next DSMB data package for the pivotal study' },
        { ico: 'clipboardList', title: 'Review open protocol deviations', sub: 'Summarize open deviations and their CAPA status', tone: 'warn', action: 'Open', cmd: 'Summarize the open protocol deviations and their CAPA status' },
      ]}
      onAsk={ask}
    >
      <div className="sp-sec">
        <SpCard
          title="Site-risk assessment -- RBM"
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
                {enhanced.length} of {sites.length} sites are <b>enhanced-tier</b> and need on-site monitoring; central monitoring holds the remaining {sites.length - enhanced.length} at standard or reduced. Composite scores are the governed site-risk-engine output -- AnA ranks and explains them, it doesn't recompute them here.
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
              <div className="co-reco">{I.shieldCheck} Recommendation -- schedule enhanced monitoring visits for these {enhanced.length} sites; maintain central monitoring elsewhere. Scheduling a monitoring visit is a governed action that will carry a Part 11 audit entry once wired to the clinical-operations service.</div>
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
          title="Study sites -- monitoring tier"
          meta={sites.length + ' sites'}
          action={<AddBtn onClick={() => setSiteForm(true)} label="Add site" />}
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
                hint="Add a study site or run the risk-based-monitoring engine, and each site's country, composite score, and monitoring tier appear here."
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
          meta={devs.length === 1 ? '1 logged' : devs.length + ' logged'}
          action={<AddBtn onClick={() => setDevForm(true)} label="Log deviation" />}
        >
          {/* Backend gap: no org-wide deviations list endpoint for this board
              (the clinical-operations deviations API is study-scoped). Starts
              from an honest empty; rows a user logs are optimistic-only, not a
              fixture and not persisted. */}
          {devs.length === 0 ? (
            <EmptyState
              icon={I.clipboardList}
              title="No protocol deviations logged"
              hint="Log a protocol deviation to track it on the board. The org-wide deviations list isn't wired yet — the clinical-operations deviations API is study-scoped, so logged rows stay local for now."
            />
          ) : (
            <div className="sp-list">
              {devs.map((d, i) => (
                <div key={i} className={rowcls(d)}>
                  <span className="sp-sev" data-s={d.sev}>{d.sev}</span>
                  <span className="sp-row-b">
                    <span className="sp-row-t">{d.title}</span>
                    <span className="sp-row-s">{d.site} -- {d.capa}</span>
                  </span>
                  {pill(d.status)}
                </div>
              ))}
            </div>
          )}
        </SpCard>
      </div>

      {siteForm && (
        <C2CForm
          config={SITE_FORM}
          onCancel={() => setSiteForm(false)}
          onSubmit={(v) => {
            addSite({
              n: v.n,
              name: v.name,
              country: v.country,
              composite: null,
              tier: v.tier,
              driver: 'New site -- composite pending first RBM cycle',
            });
            setSiteForm(false);
            fireToast('Site added to the board -- ' + v.n + ' (' + v.country + ')');
          }}
        />
      )}
      {devForm && (
        <C2CForm
          config={DEV_FORM}
          onCancel={() => setDevForm(false)}
          onSubmit={(v) => {
            addDev({ sev: v.sev, site: v.site, title: v.title, capa: v.capa, status: v.status });
            setDevForm(false);
            fireToast('Deviation added to the board -- ' + v.site);
          }}
        />
      )}
      <C2CToast msg={toast} />
    </BpComposer>
  );
}
