import React, { useState, useMemo } from 'react';

import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import { I } from '../icons';
import { useLiveData, useLiveRows, isRowsWith, hasKeys, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* Submission data-standards capability chips — live from
   /api/registrations/data-standards (server-truthful shipped/not_integrated
   states of the platform, not customer data), with this honest list as the
   offline fallback. */
interface DataStandard {
  id: string;
  label: string;
  status: 'shipped' | 'not_integrated';
  detail?: string;
}
const REG_STANDARDS_FALLBACK: DataStandard[] = [
  { id: 'estar', label: 'eSTAR (FDA CDRH)', status: 'shipped' },
  { id: 'ectd', label: 'eCTD compile · validate · export', status: 'shipped' },
  { id: 'eudamed_m2m', label: 'EUDAMED M2M', status: 'not_integrated' },
  { id: 'idmp_xevmpd', label: 'EU IDMP / xEVMPD', status: 'not_integrated' },
];

/* ── Display types (the shape the design's table/rows render) ── */

interface RegMarketRow {
  mkt: string;
  auth: string;
  flag: string;
  proc: string;
  id: string;
  status: string;
  granted: string;
  expiry: string;
  next: string;
  days: number | null;
}

/* `RegDossierDoc` / `RegDossierCert` / `RegDossier` lived here to type a dossier
   that had no data source. The real one (RimMarketDossier, below) is the
   server's shape, so the imagined one is gone rather than kept beside it. */

/* Real registration-grid row — the server's rim_registrations record from
   GET /api/rim/registrations ({ registrations, summary }). Every value the
   surface shows comes from the organization's governed RIM grid. */
interface RimRegistration {
  id: number;
  product_id: number;
  product_name?: string | null;
  country: string;
  market_status: string;
  registration_number?: string | null;
  marketing_auth_holder?: string | null;
  approval_date?: string | null;
  renewal_due_date?: string | null;
}
interface GridResponse {
  registrations: RimRegistration[];
  summary?: unknown;
}

/* `grid.data?.registrations ?? []` READS as guarded and isn't: the `?.` covers
   the container, not the member. A 200 that isn't this grid — `{ data: [] }`
   unwrapping to a bare `[]`, an envelope that lost its payload, a proxy's login
   page — left `registrations` undefined, the `??` swallowed it, and the surface
   confidently reported "No market registrations yet" for an organization whose
   grid it had never actually read. Requiring the row array here sends that body
   to the "couldn't load the registration grid" panel below, which is the only
   one of the two states that is true. Row keys are the ones the RIM query
   actually selects (product_name is not among them — it stays optional). */
const isGridResponse = (v: unknown): v is GridResponse =>
  hasKeys<GridResponse>('registrations')(v) &&
  isRowsWith<RimRegistration>('id', 'product_id', 'country', 'market_status')(
    (v as GridResponse).registrations,
  );

/* ── The dossier now has a real source ─────────────────────────────────────────
   This was `const REG_DOSSIERS: Record<string, RegDossier> = {}` — deliberately
   empty, with a comment saying no fabricated dossiers would be shown until a
   real source existed. Honest, and completely inert: because the lookup always
   missed, the caret never rendered and clicking a registration row did nothing
   at all.

   GET /api/rim/products/:id/market-dossier is that source. Every field in it is
   a stored row or a rule applied to one — the registration record, the org's
   approved rim_labels for that market, and the label type the market requires
   with the citation that says so. A market with no labels comes back empty with
   `labelGap` true, which is the fact rather than a gap in the UI. */
interface RimMarketDossier {
  country: string;
  marketStatus: string;
  registrationNumber: string | null;
  approvalDate: string | null;
  renewalDueDate: string | null;
  expectedLabelType: string;
  expectedLabelBasis: string;
  approvedLabels: Array<{ labelType: string; version: string | null; approvedDate: string | null; country: string | null }>;
  labelGap: boolean;
}

const LABEL_TYPE_LABEL: Record<string, string> = {
  uspi: 'USPI',
  smpc: 'EU SmPC',
  core_data_sheet: 'Company core data sheet',
  pil: 'Patient information leaflet',
};
const labelTypeName = (t: string) => LABEL_TYPE_LABEL[t] ?? t.replace(/_/g, ' ');

const _rgStatusPill: Record<string, string> = { approved: 'ok', 'under-review': 'warn', planned: 'neutral' };
const _rgStatusLabel: Record<string, string> = { approved: 'Approved', 'under-review': 'Under review', planned: 'Planned' };
const _rgDocPill: Record<string, string> = { approved: 'ok', submitted: 'ai', 'in-review': 'warn', draft: 'neutral' };

function daysUntil(date?: string | null): number | null {
  if (!date) return null;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}
function productLabel(r: RimRegistration): string {
  return r.product_name && r.product_name.trim() ? r.product_name : `Product #${r.product_id}`;
}
/* Map a real RIM registration into the design's row shape. Fields the grid
   doesn't carry (procedure, expiry) render as "—" rather than invented values;
   market_status is normalized to the design's status vocabulary. */
function toRegRow(r: RimRegistration): RegMarketRow {
  const days = daysUntil(r.renewal_due_date);
  return {
    mkt: r.country,
    auth: r.marketing_auth_holder || '',
    flag: '',
    proc: productLabel(r),
    id: r.registration_number || '—',
    status: r.market_status === 'under_review' ? 'under-review' : r.market_status,
    granted: r.approval_date || '—',
    expiry: '—',
    next: r.renewal_due_date ? `Renewal due ${r.renewal_due_date}` : '—',
    days,
  };
}

/* ── RegRow sub-component (expandable dossier) — design UI, unchanged ── */

interface RegRowProps {
  r: RegMarketRow;
  prod: string;
  /** The product the dossier read is keyed on. */
  productId: number;
  onAsk: ((text: string) => void) | undefined;
}

function RegRow({ r, prod, productId, onAsk }: RegRowProps) {
  const [open, setOpen] = useState(false);
  /* Fetched only while the row is open — a grid of thirty markets must not fire
     thirty dossier reads to render a table nobody has expanded yet. */
  const doss = useLiveRows<RimMarketDossier>(
    open ? `/api/rim/products/${productId}/market-dossier` : null,
    [open, productId],
  );
  const mine = doss.rows.find((d) => d.country.toUpperCase() === r.mkt.toUpperCase()) ?? null;

  return (
    <>
      <tr
        className={'reg-row has-doss' + (open ? ' open' : '')}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <td><div className="reg-mkt"><span className="reg-caret">{open ? I.chevDown : (I.chevRight || I.right)}</span><span className="reg-flag">{r.flag}</span><div><div className="reg-mkt-n">{r.mkt}</div><div className="reg-mkt-a">{r.auth}</div></div></div></td>
        <td className="reg-proc">{r.proc}</td>
        <td><span className="reg-id">{r.id}</span></td>
        <td><span className={`reg-pill ${_rgStatusPill[r.status] || 'neutral'}`}>{_rgStatusLabel[r.status] || r.status}</span></td>
        <td className="reg-date">{r.granted}</td>
        <td className="reg-date">{r.expiry}</td>
        <td><div className="reg-next"><span>{r.next}</span>{r.days != null && <span className={`reg-next-d ${r.days <= 14 ? 'warn' : ''}`}>{r.days}d</span>}</div></td>
      </tr>
      {open && (
        <tr className="reg-doss-row"><td colSpan={7}>
          <div className="reg-doss">
            {doss.loading ? (
              <div className="reg-cert pending">{I.clock} Reading the {r.mkt} label record…</div>
            ) : doss.error ? (
              /* A failed dossier read is NOT "this market has no labels" — the
                 second is a regulatory claim about the org's file. */
              <div className="reg-cert pending" role="alert">
                {I.alertTriangle} The {r.mkt} label record could not be read, so nothing is shown here — this is a failed read, not an empty dossier.
              </div>
            ) : !mine ? (
              <div className="reg-cert pending">{I.info || I.clock} No label record is on file for {r.mkt} yet.</div>
            ) : (
              <>
                <div className="reg-doss-h">
                  <span className="reg-doss-l">{I.folder} {r.mkt} label record</span>
                  <span className="reg-doss-c">
                    {mine.approvedLabels.length} approved label{mine.approvedLabels.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="reg-doss-list">
                  {mine.approvedLabels.map((l, j) => (
                    <button
                      key={j}
                      className="reg-doc"
                      onClick={(e) => { e.stopPropagation(); onAsk && onAsk(`Open the approved ${labelTypeName(l.labelType)} for ${prod} in ${r.mkt}`); }}
                    >
                      <span className="reg-doc-ic">{I.fileText}</span>
                      <span className="reg-doc-n">{labelTypeName(l.labelType)}{l.version ? ' v' + l.version : ''}</span>
                      <span className="reg-doc-sec">{l.country == null ? 'global' : l.country}{l.approvedDate ? ' · approved ' + l.approvedDate : ''}</span>
                      <span className="reg-pill ok">approved</span>
                      <span className="reg-doc-go">{I.arrowRight || I.right}</span>
                    </button>
                  ))}
                  {mine.approvedLabels.length === 0 && (
                    <div className="reg-cert pending">{I.clock} No approved label is on file for this market.</div>
                  )}
                </div>
                {mine.labelGap ? (
                  <div className="reg-doss-gap" role="alert">
                    {I.alertTriangle}
                    <span>
                      This market requires an approved <b>{labelTypeName(mine.expectedLabelType)}</b> and none is on file.
                      <span className="reg-doss-basis"> {mine.expectedLabelBasis}</span>
                    </span>
                  </div>
                ) : (
                  <div className="reg-cert">
                    {I.shieldCheck || I.check}
                    <span>
                      <b>{labelTypeName(mine.expectedLabelType)}</b> is on file for {r.mkt}
                      {mine.registrationNumber ? <> {I.dot} {mine.registrationNumber}</> : null}
                      {mine.approvalDate ? <> {I.dot} approved {mine.approvalDate}</> : null}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </td></tr>
      )}
    </>
  );
}

/* ════ Registrations -- global registration lifecycle surface ════
   Design UI wired to the organization's real product × country registration
   grid (GET /api/rim/registrations). Tabs whose backend does not exist yet show
   the design's honest empty state rather than fabricated rows. ════ */

export function Registrations({ onAsk }: SurfaceViewProps) {
  const [tab, setTab] = useState('reg');
  const grid = useLiveData<GridResponse>('/api/rim/registrations', ['/api/rim/registrations'], isGridResponse);
  /* Gated on error as well as loading. `useLiveRows`/`useLiveData` return
     `data: null` on a FAILED read, so each count below derives from an empty
     list and resolves to 0 — and with `loading` already false the strip renders
     a SETTLED zero rather than a placeholder. Rows are empty in three
     situations and only the third may say "nothing is on file"; the pattern is
     MarketAccess.tsx:62. */
  /* Was `grid.loading ? '—' : n`, a half-guard: a failed RIM read left
     loading false and every count 0, so the header stated the org holds no
     marketing authorizations anywhere. On the clock/commit/strategy tabs no
     error panel is on screen at all, so those zeros stood alone. */
  const kv = (n: number | string) => (grid.loading || grid.error ? '—' : String(n));
  /* The chips used to render `(standards.data || REG_STANDARDS_FALLBACK).map`.
     the retired `useLive` handed back the parsed body cast to DataStandard[] without looking
     at it, and `||` only fires on null/undefined — so a 200 carrying `{}`,
     `{ data: … }`, an error body or a JSON string was truthy, walked past the
     fallback, and `.map` threw inside render on six of seven skewed bodies.
     `useLiveRows` unwraps the envelope and the row guard rejects anything that
     isn't a list of standards, so a wrong-shaped 200 reaches the same honest
     shipped-in-code fallback as an unreachable backend. */
  const standards = useLiveRows<DataStandard>(
    '/api/registrations/data-standards',
    ['/api/registrations/data-standards'],
    isRowsWith<DataStandard>('id', 'label', 'status'),
  );
  const standardsRows = standards.rows.length ? standards.rows : REG_STANDARDS_FALLBACK;

  const regs = grid.data?.registrations ?? [];
  const noRows = !grid.loading && !grid.error && regs.length === 0;
  const approved = regs.filter((r) => r.market_status === 'approved').length;
  const review = regs.filter((r) => r.market_status === 'under_review' || r.market_status === 'submitted').length;
  const countries = new Set(regs.map((r) => r.country)).size;
  const products = new Set(regs.map((r) => r.product_id)).size;
  const renewals = regs
    .map((r) => ({ r, days: daysUntil(r.renewal_due_date) }))
    .filter((x) => x.days != null)
    .sort((a, b) => (a.days as number) - (b.days as number));

  /* What AnA can see of this screen.
     She knew the user was on "registrations" and nothing else — not how many
     markets are approved, how many are under review, or which registration
     renews next — so "what lapses first?" needed the user to read their own
     grid back to her. A lapsing registration is not a small event.

     A failed read publishes the failure. `regs` is [] both when the org has no
     registrations and when the grid read threw, and "0 markets approved" over
     an outage would misreport a company's entire market position. This surface
     already learned that lesson once — the comment above `GridResponse`
     records it reporting "No market registrations yet" for a grid it had never
     read. */
  const anaContext = useMemo(() => {
    if (grid.loading) {
      return { summary: 'The registrations grid is still loading; nothing on screen is final yet.' };
    }
    if (grid.error) {
      return {
        summary:
          'The registrations grid could not be read, so this screen shows no markets because of a failure, not because none are registered.',
        availableActions: ['Retry the registrations read'],
      };
    }
    const soonest = renewals[0] ?? null;
    return {
      summary:
        `Market registrations: ${regs.length} registration(s) across ${countries} country/countries and ${products} product(s) — ` +
        `${approved} approved, ${review} submitted or under review` +
        (soonest
          ? `; soonest renewal ${productLabel(soonest.r)} in ${soonest.r.country} due in ${soonest.days} day(s)`
          : ''),
      facts: {
        registrationCount: regs.length,
        approved,
        submittedOrUnderReview: review,
        countries,
        products,
        soonestRenewal: soonest
          ? {
              product: productLabel(soonest.r),
              country: soonest.r.country,
              daysUntilRenewal: soonest.days,
              status: soonest.r.market_status,
            }
          : null,
        openTab: tab,
      },
      availableActions: [
        'Review a registration and its market status',
        'Check which registrations renew next',
        'Switch between the registrations grid and the data-standards view',
      ],
    };
  }, [grid.loading, grid.error, regs, approved, review, countries, products, renewals, tab]);
  usePublishSurfaceContext('registrations', anaContext);

  // Group the real rows by product for the design's grouped table layout.
  const groups: { label: string; rows: RimRegistration[] }[] = [];
  const byProduct = new Map<string, RimRegistration[]>();
  for (const r of regs) {
    const k = productLabel(r);
    if (!byProduct.has(k)) { byProduct.set(k, []); groups.push({ label: k, rows: byProduct.get(k)! }); }
    byProduct.get(k)!.push(r);
  }

  const ask = (q: string) => onAsk && onAsk(q);
  const tabs: [string, string][] = [['reg', 'Registrations'], ['clock', 'Approvals tracker'], ['vary', 'Renewals & variations'], ['commit', 'HA commitments'], ['strategy', 'Submission strategy']];

  /* AnA can open any registrations tab — the same view-state switch a person
     makes. The registry enum has validated `tab`; the defensive lookup keeps the
     handler honest if it drifts. */
  useSurfaceActionHandlers('registrations', {
    'registrations.open-tab': (params) => {
      const target = params.tab;
      const hit = tabs.find((t) => t[0] === target);
      if (!hit) return { ok: false, reason: `"${target}" is not a registrations tab.` };
      if (tab === target) return { ok: true, detail: `Already on the ${hit[1]} tab` };
      setTab(target);
      return { ok: true, detail: `Opened the ${hit[1]} tab` };
    },
  });

  return (
    <div className="page-host reg">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Lifecycle {I.dot} cross-market</div>
          <h1 className="reg-title">Registrations</h1>
          <p className="reg-sub">Authorization status across markets, agency review clocks, renewals &amp; variations, and health-authority commitments &mdash; one registration ledger for every market you file in.</p>
        </div>
        <button className="reg-ask" onClick={() => ask('Build a global registration & sequencing plan across my markets')}>{I.sparkles} Ask AnA to plan markets</button>
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi"><div className="reg-kpi-v">{kv(countries)}</div><div className="reg-kpi-l">Markets {I.dot} {kv(products)} product{products === 1 ? '' : 's'}</div></div>
        <div className="reg-kpi" data-tone="ok"><div className="reg-kpi-v">{kv(approved)}</div><div className="reg-kpi-l">Approved / cleared</div></div>
        <div className="reg-kpi" data-tone="warn"><div className="reg-kpi-v">{kv(review)}</div><div className="reg-kpi-l">Under review {I.dot} on clocks</div></div>
        <div className="reg-kpi" data-tone="ai"><div className="reg-kpi-v">&mdash;</div><div className="reg-kpi-l">Open HA commitments</div></div>
      </div>

      <div className="reg-tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={`reg-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'reg' && (
        <div className="reg-card">
          {grid.loading ? (
            <div className="reg-pad"><EmptyState title="Loading registrations…" icon={I.clock} /></div>
          ) : grid.error ? (
            <div className="reg-pad">
              <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load the registration grid" hint="The RIM registration service didn't respond. Sign in and retry, or check that the service is reachable — nothing is shown from a cached sample." />
            </div>
          ) : noRows ? (
            <div className="reg-pad">
              <EmptyState icon={I.globe || I.grid} title="No market registrations yet" hint={<>Add your products and their country registrations in RIM and they appear here with real status, numbers and renewal timing. Nothing here is simulated.</>} />
            </div>
          ) : (
            <table className="reg-tbl">
              <thead><tr><th>Market</th><th>Product</th><th>Registration</th><th>Status</th><th>Granted</th><th>Expiry</th><th>Next action</th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <React.Fragment key={g.label}>
                    <tr className="reg-group"><td colSpan={7}>{g.label}</td></tr>
                    {g.rows.map((rr) => <RegRow key={rr.id} r={toRegRow(rr)} prod={g.label} productId={rr.product_id} onAsk={onAsk} />)}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
          <div className="reg-standards">
            <span className="reg-std-l">Submission data standards</span>
            {standardsRows.map((s) => (
              <span
                key={s.id}
                className={'reg-std ' + (s.status === 'shipped' ? 'ok' : 'gap')}
                title={s.detail}
              >
                {s.status === 'shipped' ? I.check : I.alertTriangle} {s.label} &mdash;{' '}
                {s.status === 'shipped' ? 'shipped' : <>not in the platform yet {I.dot} flagged</>}
              </span>
            ))}
          </div>
        </div>
      )}

      {tab === 'clock' && (
        <div className="reg-card reg-pad">
          <div className="reg-sec-l">Agency review clocks</div>
          <EmptyState
            icon={I.clock}
            title="No active review clocks"
            hint="Agency review clocks track a submission's day count against its statutory window. They appear here once a submission-tracking source is connected — nothing is simulated."
          />
        </div>
      )}

      {tab === 'vary' && (
        <div className="reg-card">
          {grid.loading ? (
            <div className="reg-pad"><EmptyState title="Loading renewals…" icon={I.clock} /></div>
          ) : grid.error ? (
            <div className="reg-pad"><EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load renewals" hint="The RIM registration service didn't respond." /></div>
          ) : renewals.length === 0 ? (
            <div className="reg-pad"><EmptyState icon={I.clock} title="No renewals scheduled" hint="Renewal timing appears here once your registrations carry a renewal-due date in RIM. Nothing here is simulated." /></div>
          ) : (
            <table className="reg-tbl">
              <thead><tr><th>Market</th><th>Type</th><th>Product</th><th>Status</th><th>Due</th><th></th></tr></thead>
              <tbody>
                {renewals.map(({ r, days }) => (
                  <tr key={r.id}>
                    <td className="reg-proc">{r.country}</td>
                    <td className="reg-mkt-n">Registration renewal</td>
                    <td className="reg-date">{productLabel(r)}</td>
                    <td><span className={`reg-pill ${(days as number) <= 30 ? 'warn' : (days as number) <= 90 ? 'ai' : 'ok'}`}>{r.renewal_due_date}</span></td>
                    <td className="reg-date">{days}d</td>
                    <td><button className="reg-link" onClick={() => ask(`Prepare the renewal for ${productLabel(r)} in ${r.country} (due ${r.renewal_due_date})`)}>{I.sparkles} Prepare</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'commit' && (
        <div className="reg-card reg-pad">
          <EmptyState
            icon={I.shieldCheck || I.check}
            title="No health-authority commitments recorded"
            hint="Post-approval commitments (post-market studies, PMCF, periodic reports) are tracked here once a commitments source is connected — nothing is simulated."
          />
        </div>
      )}

      {tab === 'strategy' && (
        <div className="reg-card reg-pad">
          <div className="reg-sec-l">Submission strategy &amp; reliance pathways</div>
          <EmptyState
            icon={I.sparkles}
            title="No submission strategy captured yet"
            hint={<>AnA sequences markets to reuse one evidence package across reliance pathways &mdash; minimizing redundant testing while covering each market&rsquo;s delta. Ask it to draft a sequencing plan from your live registration grid; nothing is pre-filled here.</>}
          />
          <div className="reg-note">{I.sparkles} <button className="reg-link" onClick={() => ask('Draft a submission-sequencing and reliance-pathway strategy from my registration grid')}>Draft a strategy with AnA</button></div>
        </div>
      )}
    </div>
  );
}
