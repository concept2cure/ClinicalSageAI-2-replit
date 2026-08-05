import React, { useState } from 'react';
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

interface RegDossierDoc {
  n: string;
  st: string;
  sec: string;
  blocker?: boolean;
}

interface RegDossierCert {
  n: string;
  id: string;
  granted: string;
}

interface RegDossier {
  filing: string;
  docs: RegDossierDoc[];
  cert: RegDossierCert | null;
}

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

/* No fabricated dossiers: the RIM grid does not carry per-registration document
   sets, so the design's expandable dossier stays dormant (rows render
   un-expanded) until a real dossier source is wired — never faked. */
const REG_DOSSIERS: Record<string, RegDossier> = {};

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
  onAsk: ((text: string) => void) | undefined;
}

function RegRow({ r, prod, onAsk }: RegRowProps) {
  const [open, setOpen] = useState(false);
  const dossier = REG_DOSSIERS[prod + '·' + r.mkt];
  return (
    <>
      <tr className={'reg-row' + (dossier ? ' has-doss' : '') + (open ? ' open' : '')} onClick={() => dossier && setOpen(o => !o)}>
        <td><div className="reg-mkt">{dossier && <span className="reg-caret">{open ? I.chevDown : (I.chevRight || I.right)}</span>}<span className="reg-flag">{r.flag}</span><div><div className="reg-mkt-n">{r.mkt}</div><div className="reg-mkt-a">{r.auth}</div></div></div></td>
        <td className="reg-proc">{r.proc}</td>
        <td><span className="reg-id">{r.id}</span></td>
        <td><span className={`reg-pill ${_rgStatusPill[r.status] || 'neutral'}`}>{_rgStatusLabel[r.status] || r.status}</span></td>
        <td className="reg-date">{r.granted}</td>
        <td className="reg-date">{r.expiry}</td>
        <td><div className="reg-next"><span>{r.next}</span>{r.days != null && <span className={`reg-next-d ${r.days <= 14 ? 'warn' : ''}`}>{r.days}d</span>}</div></td>
      </tr>
      {open && dossier && (
        <tr className="reg-doss-row"><td colSpan={7}>
          <div className="reg-doss">
            <div className="reg-doss-h"><span className="reg-doss-l">{I.folder} {dossier.filing}</span><span className="reg-doss-c">{dossier.docs.length} documents</span></div>
            <div className="reg-doss-list">
              {dossier.docs.map((d, j) => (
                <button key={j} className={'reg-doc' + (d.blocker ? ' blk' : '')} onClick={(e) => { e.stopPropagation(); onAsk && onAsk(`Open "${d.n}" from the ${r.mkt} ${prod} dossier`); }}>
                  <span className="reg-doc-ic">{I.fileText}</span>
                  <span className="reg-doc-n">{d.n}</span>
                  <span className="reg-doc-sec">{d.sec}</span>
                  <span className={`reg-pill ${_rgDocPill[d.st] || 'neutral'}`}>{d.st}</span>
                  <span className="reg-doc-go">{I.arrowRight || I.right}</span>
                </button>
              ))}
            </div>
            {dossier.cert
              ? <button className="reg-cert" onClick={(e) => { e.stopPropagation(); onAsk && onAsk(`Open the authorization document ${dossier.cert!.id} for ${r.mkt}`); }}>{I.shieldCheck || I.check}<span><b>{dossier.cert.n}</b> {I.dot} {dossier.cert.id} {I.dot} granted {dossier.cert.granted}</span><span className="reg-doc-go">{I.download || I.arrowRight}</span></button>
              : <div className="reg-cert pending">{I.clock} Authorization document issues once the agency review clock closes.</div>}
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
  /* The chips used to render `(standards.data || REG_STANDARDS_FALLBACK).map`.
     `useLive` hands back the parsed body cast to DataStandard[] without looking
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

  return (
    <div className="page-host reg">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Lifecycle {I.dot} cross-market</div>
          <h1 className="reg-title">Registrations</h1>
          <p className="reg-sub">Authorization status across markets, agency review clocks, renewals &amp; variations, and health-authority commitments &mdash; one registration ledger for every market you file in.</p>
        </div>
        <button className="reg-ask" onClick={() => ask('Build a global registration & sequencing plan across my markets')}>{I.sparkles} Plan markets with AnA</button>
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi"><div className="reg-kpi-v">{grid.loading ? '—' : countries}</div><div className="reg-kpi-l">Markets {I.dot} {grid.loading ? '—' : products} product{products === 1 ? '' : 's'}</div></div>
        <div className="reg-kpi" data-tone="ok"><div className="reg-kpi-v">{grid.loading ? '—' : approved}</div><div className="reg-kpi-l">Approved / cleared</div></div>
        <div className="reg-kpi" data-tone="warn"><div className="reg-kpi-v">{grid.loading ? '—' : review}</div><div className="reg-kpi-l">Under review {I.dot} on clocks</div></div>
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
                    {g.rows.map((rr) => <RegRow key={rr.id} r={toRegRow(rr)} prod={g.label} onAsk={onAsk} />)}
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
