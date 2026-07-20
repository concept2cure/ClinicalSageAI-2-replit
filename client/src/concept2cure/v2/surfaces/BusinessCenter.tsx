/**
 * Business Center — the owner/finance console (stricter tier than Master
 * Administration: support staff are EXCLUDED). UI deliverable of
 * HANDOFF_TO_DESIGN_master_admin_business_center.md §5, wired 1:1 to
 * /api/admin/business/* (server/routes/admin/business-center.ts +
 * business/rate-cards.ts — authMiddleware → requireBusinessAdmin).
 *
 * Money is integer cents end-to-end and formatted only at render; margins get
 * sign + tone; wherever revenue appears, its source (Stripe-invoiced vs
 * modeled from the tier price card) is labeled — the console never lets a
 * modeled number pass as an invoiced one. No fixtures: loading / empty /
 * error+retry / non-leaky 403 / 401→sign-in, same contract as MasterAdmin.
 * Rate-card edits are governed (reason-for-change, audited server-side).
 */
import React, { useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  ConsoleDenied,
  ConsoleError,
  ConsoleLoading,
  KpiCard,
  ReasonDialog,
  StatusChip,
  When,
  adminDownload,
  adminSend,
  num,
  pct,
  usd,
  useAdminGet,
} from '../platformAdminConnect';
import '../styles/project-home-v2.css';
import '../styles/ana-v2.css';

/* ── Response shapes (mirror business-center.ts / rate-cards.ts exactly) ────── */

interface BcClientRow {
  organizationId: number;
  name: string;
  slug?: string;
  tier: string;
  status: string | null;
  revenueCents: number;
  revenueSource: 'stripe' | 'modeled';
  costCents: number;
  marginCents: number;
  marginPct: number | null;
  byFeature: Array<{ featureId: string; credits: number; costCents: number }>;
}
interface BcCostAccounting {
  period: string;
  currency: string;
  revenueModel: 'stripe' | 'modeled' | 'mixed';
  clients: BcClientRow[];
  totals: { revenueCents: number; costCents: number; marginCents: number; marginPct: number | null };
  generatedAt: string;
}
interface BcExecutive {
  portfolio: {
    clients: number;
    activeClients: number;
    mrrCents: number;
    monthlyCostRunRateCents: number;
    grossMarginCents: number;
    grossMarginPct: number | null;
  };
  risk: {
    lossMakingClients: number;
    lossMakers: Array<{ organizationId: number; name: string; revenueCents: number; costCents: number; marginCents: number }>;
    revenueConcentrationTop5Pct: number;
  };
  topClients: Array<{ organizationId: number; name: string; revenueCents: number; sharePct: number }>;
  tierMix: Array<{ tier: string; clients: number; revenueCents: number }>;
  note: string;
  generatedAt: string;
}
interface BcRate {
  costKey: string;
  label: string;
  unitCostCents: number;
  unit: string;
  source: 'default' | 'override';
  updatedAt: string | null;
}
interface BcTierPrice {
  tier: string;
  monthlyPriceCents: number;
  perSeatCents: number;
  source: 'default' | 'override';
  updatedAt: string | null;
}
interface BcMetering {
  windowDays: number;
  meteredFeatures: Array<{ featureId: string; credits: number; events: number; lastSeen: string; hasExplicitRate: boolean }>;
  gaps: {
    usageWithoutExplicitRate: Array<{ featureId: string; credits: number; pricedAt: 'default' }>;
    ratedButNoUsage: string[];
  };
  healthy: boolean;
  generatedAt: string;
}
interface BcAccess {
  roles: string[];
  allowlistEmails: string[];
  roleHolders: Array<{ id: number; email: string; name: string | null; status: string | null; role: string; organization_name: string | null }>;
  generatedAt: string;
}

interface Governed {
  title: string;
  consequence: string;
  confirmLabel: string;
  danger?: boolean;
  run: (reason: string) => Promise<{ ok: boolean; error: string | null }>;
}

/** Signed margin with tone — color never carries the meaning alone. */
function Margin({ cents }: { cents: number }) {
  const negative = cents < 0;
  return (
    <span
      className="mono"
      style={{
        fontVariantNumeric: 'tabular-nums',
        color: negative ? 'var(--error)' : 'var(--success)',
        fontWeight: 600,
      }}
    >
      {negative ? '-' : '+'}
      {usd(Math.abs(cents))}
    </span>
  );
}

/** The "Stripe-invoiced vs modeled" legend the SOW requires beside revenue. */
function RevenueLegend({ model }: { model: 'stripe' | 'modeled' | 'mixed' | null }) {
  return (
    <div className="scaf-note" style={{ margin: '8px 0 0', maxWidth: 640 }}>
      Revenue source
      {model ? ` (this view: ${model})` : ''}: <b>stripe</b> = actual Stripe-invoiced amounts;{' '}
      <b>modeled</b> = derived from the tier price card when no invoice exists. Cost is metered
      usage x owner-set unit rates.
    </div>
  );
}

const BC_SECTIONS: Array<[string, string, string]> = [
  ['executive', 'Executive summary', 'barChart'],
  ['costs', 'Cost accounting', 'creditCard'],
  ['rates', 'Rate cards', 'sliders'],
  ['metering', 'Metering coverage', 'checkSquare'],
  ['access', 'Access', 'user'],
];

export function BusinessCenter({ onAsk }: SurfaceViewProps) {
  const [sec, setSec] = useState('executive');
  const [gov, setGov] = useState<Governed | null>(null);
  const [govBusy, setGovBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [toast, setToast] = useState('');
  const fireToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 3200);
  };

  // Access probe for the whole console — requireBusinessAdmin is uniform
  // across /api/admin/business, so the summary's 401/403 decides the state.
  const exec = useAdminGet<BcExecutive>('/api/admin/business/executive-summary', ['exec', refreshTick]);

  const runGoverned = async (g: Governed, reason: string) => {
    setGovBusy(true);
    const r = await g.run(reason);
    setGovBusy(false);
    setGov(null);
    if (r.ok) {
      fireToast('Done -- reason recorded -- audited');
      setRefreshTick((t) => t + 1);
    } else {
      fireToast('Not applied -- ' + (r.error || 'request failed'));
    }
  };

  if (exec.status === 401 || exec.status === 403) {
    return (
      <div className="page-inner">
        <BcHeader />
        <ConsoleDenied
          status={exec.status}
          tierLabel="the platform owner and designated business administrators"
        />
      </div>
    );
  }

  return (
    <div className="page-inner" style={{ maxWidth: 1240 }}>
      <BcHeader
        right={
          <button className="btn ghost" onClick={() => setRefreshTick((t) => t + 1)} title="Refresh all data">
            {I.rotateCw} Refresh
          </button>
        }
      />
      <div className="sp-2col" style={{ gridTemplateColumns: '210px 1fr', alignItems: 'start' }}>
        <div className="pj-card">
          <div className="pj-card-b" style={{ padding: 8 }}>
            <div className="ac-nav">
              {BC_SECTIONS.map(([id, label, icon]) => (
                <button key={id} className={'ac-nav-b' + (sec === id ? ' on' : '')} onClick={() => setSec(id)}>
                  {I[icon] || I.grid}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          {sec === 'executive' && <BcExecutiveView state={exec} />}
          {sec === 'costs' && <BcCosts refreshTick={refreshTick} onToast={fireToast} />}
          {sec === 'rates' && <BcRates refreshTick={refreshTick} setGov={setGov} />}
          {sec === 'metering' && <BcMeteringView refreshTick={refreshTick} />}
          {sec === 'access' && <BcAccessView refreshTick={refreshTick} />}
        </div>
      </div>

      {gov && (
        <ReasonDialog
          title={gov.title}
          consequence={gov.consequence}
          confirmLabel={gov.confirmLabel}
          danger={gov.danger}
          busy={govBusy}
          onConfirm={(reason) => void runGoverned(gov, reason)}
          onCancel={() => setGov(null)}
        />
      )}
      {toast && (
        <div className="pdev-toast">
          {I.check} {toast}
        </div>
      )}
    </div>
  );
}

function BcHeader({ right }: { right?: React.ReactNode }) {
  return (
    <div className="ph">
      <div>
        <div className="ph-eyebrow">
          Business Center -- /api/admin/business --{' '}
          <span style={{ color: 'var(--warning)' }}>owner {'·'} finance -- internal</span>
        </div>
        <h1 className="ph-title">Business Center</h1>
        <div className="ph-sub">
          Cost-based accounting, revenue, margins and P&amp;L across the client estate. Numbers
          reconcile with Master Administration -- both read the same tables.
        </div>
      </div>
      {right && <div style={{ display: 'flex', gap: 8 }}>{right}</div>}
    </div>
  );
}

/* ════════════ 1 · Executive summary ════════════ */

function BcExecutiveView({ state }: { state: ReturnType<typeof useAdminGet<BcExecutive>> }) {
  if (state.loading) return <ConsoleLoading label="executive summary" />;
  if (state.error) return <ConsoleError error={state.error} onRetry={state.retry} />;
  const d = state.data;
  if (!d) return <ConsoleLoading label="executive summary" />;
  const p = d.portfolio;
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <KpiCard label="MRR (recognized)" value={usd(p.mrrCents)} sub={`${num(p.clients)} clients -- ${num(p.activeClients)} active`} />
        <KpiCard label="Monthly cost run-rate" value={usd(p.monthlyCostRunRateCents)} />
        <KpiCard
          label="Gross margin"
          value={usd(p.grossMarginCents)}
          sub={p.grossMarginPct != null ? `${p.grossMarginPct}% of revenue` : 'no revenue yet'}
          tone={p.grossMarginCents < 0 ? 'err' : 'ok'}
        />
        <KpiCard
          label="Loss-making clients"
          value={num(d.risk.lossMakingClients)}
          tone={d.risk.lossMakingClients > 0 ? 'err' : 'ok'}
          sub="cost exceeds revenue"
        />
        <KpiCard
          label="Top-5 revenue share"
          value={pct(d.risk.revenueConcentrationTop5Pct)}
          tone={d.risk.revenueConcentrationTop5Pct > 80 ? 'warn' : undefined}
          sub="concentration risk"
        />
      </div>
      <RevenueLegend model={null} />
      <div className="scaf-note" style={{ marginTop: 4, maxWidth: 640 }}>{d.note}</div>

      {d.risk.lossMakers.length > 0 && (
        <div className="sec" style={{ marginTop: 18 }}>
          <div className="sec-hdr">
            <div className="sec-title" style={{ color: 'var(--error)' }}>Loss-making clients</div>
            <div className="sec-sub">serving them costs more than they pay</div>
          </div>
          <div className="ctable" style={{ maxWidth: 760 }}>
            <div className="ct-head" style={{ gridTemplateColumns: '1.4fr 110px 110px 120px' }}>
              <div>Client</div><div style={{ textAlign: 'right' }}>Revenue</div><div style={{ textAlign: 'right' }}>Cost</div><div style={{ textAlign: 'right' }}>Margin</div>
            </div>
            {d.risk.lossMakers.map((c) => (
              <div key={c.organizationId} className="ct-row" style={{ gridTemplateColumns: '1.4fr 110px 110px 120px' }}>
                <div className="ct-strong">{c.name}</div>
                <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(c.revenueCents)}</div>
                <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(c.costCents)}</div>
                <div style={{ textAlign: 'right' }}><Margin cents={c.marginCents} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sec" style={{ marginTop: 18 }}>
        <div className="sec-hdr"><div className="sec-title">Top clients by revenue</div></div>
        {d.topClients.length === 0 ? (
          <div className="scaf-note">No revenue recognized yet.</div>
        ) : (
          <div className="ctable" style={{ maxWidth: 640 }}>
            <div className="ct-head" style={{ gridTemplateColumns: '1.4fr 120px 90px' }}>
              <div>Client</div><div style={{ textAlign: 'right' }}>Revenue</div><div style={{ textAlign: 'right' }}>Share</div>
            </div>
            {d.topClients.map((c) => (
              <div key={c.organizationId} className="ct-row" style={{ gridTemplateColumns: '1.4fr 120px 90px' }}>
                <div className="ct-strong">{c.name}</div>
                <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(c.revenueCents)}</div>
                <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct(c.sharePct)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sec" style={{ marginTop: 18 }}>
        <div className="sec-hdr"><div className="sec-title">Tier mix</div></div>
        {d.tierMix.length === 0 ? (
          <div className="scaf-note">No clients yet.</div>
        ) : (
          <div className="ctable" style={{ maxWidth: 520 }}>
            <div className="ct-head" style={{ gridTemplateColumns: '1fr 90px 120px' }}>
              <div>Tier</div><div style={{ textAlign: 'right' }}>Clients</div><div style={{ textAlign: 'right' }}>Revenue</div>
            </div>
            {d.tierMix.map((t) => (
              <div key={t.tier} className="ct-row" style={{ gridTemplateColumns: '1fr 90px 120px' }}>
                <div className="ct-strong">{t.tier}</div>
                <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(t.clients)}</div>
                <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(t.revenueCents)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════ 2 · Cost accounting ════════════ */

function BcCosts({ refreshTick, onToast }: { refreshTick: number; onToast: (m: string) => void }) {
  const c = useAdminGet<BcCostAccounting>('/api/admin/business/cost-accounting', ['costs', refreshTick]);
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    const ok = await adminDownload('/api/admin/business/cost-accounting.csv', 'cost-accounting.csv');
    setDownloading(false);
    onToast(ok ? 'CSV downloaded -- export audited' : 'Download failed');
  };
  if (c.loading) return <ConsoleLoading label="cost accounting" />;
  if (c.error) return <ConsoleError error={c.error} onRetry={c.retry} />;
  const d = c.data;
  if (!d) return <ConsoleLoading label="cost accounting" />;
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1 }}>
          <KpiCard label="Revenue (30d)" value={usd(d.totals.revenueCents)} />
          <KpiCard label="Cost (30d)" value={usd(d.totals.costCents)} />
          <KpiCard
            label="Margin"
            value={usd(d.totals.marginCents)}
            sub={d.totals.marginPct != null ? `${d.totals.marginPct}%` : undefined}
            tone={d.totals.marginCents < 0 ? 'err' : 'ok'}
          />
        </div>
        <button className="sp-primary" onClick={download} disabled={downloading}>
          {I.download} {downloading ? 'Preparing...' : 'Download CSV'}
        </button>
      </div>
      <RevenueLegend model={d.revenueModel} />
      {d.clients.length === 0 ? (
        <div className="scaf-note" style={{ marginTop: 12 }}>No clients to account for yet.</div>
      ) : (
        <div className="ctable" style={{ marginTop: 12 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '1.4fr 100px 90px 130px 110px 120px 80px' }}>
            <div>Client</div><div>Tier</div><div>Status</div><div style={{ textAlign: 'right' }}>Revenue</div><div style={{ textAlign: 'right' }}>Cost</div><div style={{ textAlign: 'right' }}>Margin</div><div style={{ textAlign: 'right' }}>Margin %</div>
          </div>
          {d.clients.map((r) => (
            <div key={r.organizationId} className="ct-row" style={{ gridTemplateColumns: '1.4fr 100px 90px 130px 110px 120px 80px' }}>
              <div className="ct-strong">{r.name}</div>
              <div>{r.tier}</div>
              <div><StatusChip value={r.status} /></div>
              <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {usd(r.revenueCents)}{' '}
                <span className={`rd-chip tone-${r.revenueSource === 'stripe' ? 'ok' : 'idle'}`} style={{ fontSize: 9 }}>
                  {r.revenueSource}
                </span>
              </div>
              <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(r.costCents)}</div>
              <div style={{ textAlign: 'right' }}><Margin cents={r.marginCents} /></div>
              <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.marginPct != null ? `${r.marginPct}%` : '--'}</div>
            </div>
          ))}
        </div>
      )}
      <div className="scaf-note" style={{ marginTop: 8 }}>
        Sorted lowest margin first -- the clients that need pricing attention are on top. The CSV
        export is a governed, audited action.
      </div>
    </div>
  );
}

/* ════════════ 3 · Rate cards ════════════ */

function BcRates({ refreshTick, setGov }: { refreshTick: number; setGov: (g: Governed) => void }) {
  const [tick, setTick] = useState(0);
  const rates = useAdminGet<{ rates: BcRate[] }>('/api/admin/business/cost-rates', ['rates', refreshTick, tick]);
  const tiers = useAdminGet<{ tiers: BcTierPrice[] }>('/api/admin/business/tier-pricing', ['tiers', refreshTick, tick]);

  const editRate = (r: BcRate) => {
    const raw = window.prompt(
      `New unit cost for "${r.label}" in CENTS per ${r.unit} (current: ${r.unitCostCents}):`,
      String(r.unitCostCents),
    );
    if (raw == null) return;
    const cents = Number(raw.trim());
    if (!Number.isFinite(cents) || cents < 0 || !Number.isInteger(cents)) return;
    setGov({
      title: `Set ${r.label} to ${usd(cents)} / ${r.unit}`,
      consequence: `Every client's modeled cost recomputes with this rate from the next report. Current: ${usd(r.unitCostCents)} / ${r.unit} (${r.source}).`,
      confirmLabel: 'Set unit cost',
      run: async (reason) => {
        const res = await adminSend('PATCH', `/api/admin/business/cost-rates/${encodeURIComponent(r.costKey)}`, {
          unitCostCents: cents,
          reason,
        });
        if (res.ok) setTick((t) => t + 1);
        return { ok: res.ok, error: res.error };
      },
    });
  };

  const editTier = (t: BcTierPrice) => {
    const monthlyRaw = window.prompt(
      `New MONTHLY price for tier "${t.tier}" in CENTS (current: ${t.monthlyPriceCents}):`,
      String(t.monthlyPriceCents),
    );
    if (monthlyRaw == null) return;
    const perSeatRaw = window.prompt(
      `New PER-SEAT price for tier "${t.tier}" in CENTS (current: ${t.perSeatCents}):`,
      String(t.perSeatCents),
    );
    if (perSeatRaw == null) return;
    const monthly = Number(monthlyRaw.trim());
    const perSeat = Number(perSeatRaw.trim());
    if (!Number.isInteger(monthly) || monthly < 0 || !Number.isInteger(perSeat) || perSeat < 0) return;
    setGov({
      title: `Reprice tier ${t.tier}`,
      consequence: `Modeled revenue for every ${t.tier}-tier client recomputes as ${usd(monthly)}/mo + ${usd(perSeat)}/seat. Stripe-invoiced clients are unaffected.`,
      confirmLabel: 'Set tier price',
      run: async (reason) => {
        const res = await adminSend('PATCH', `/api/admin/business/tier-pricing/${encodeURIComponent(t.tier)}`, {
          monthlyPriceCents: monthly,
          perSeatCents: perSeat,
          reason,
        });
        if (res.ok) setTick((x) => x + 1);
        return { ok: res.ok, error: res.error };
      },
    });
  };

  return (
    <div>
      <div className="sec-hdr"><div className="sec-title">Cost rates</div><div className="sec-sub">what a unit of each metered feature costs you</div></div>
      {rates.loading ? (
        <ConsoleLoading label="cost rates" />
      ) : rates.error ? (
        <ConsoleError error={rates.error} onRetry={rates.retry} />
      ) : !rates.data || rates.data.rates.length === 0 ? (
        <div className="scaf-note" style={{ marginBottom: 18 }}>No cost rates configured.</div>
      ) : (
        <div className="ctable" style={{ maxWidth: 860, marginBottom: 18 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '1.3fr 130px 110px 90px 96px 70px' }}>
            <div>Feature</div><div style={{ textAlign: 'right' }}>Unit cost</div><div>Unit</div><div>Source</div><div>Updated</div><div></div>
          </div>
          {rates.data.rates.map((r) => (
            <div key={r.costKey} className="ct-row" style={{ gridTemplateColumns: '1.3fr 130px 110px 90px 96px 70px' }}>
              <div className="vn">
                <span className="ct-strong">{r.label}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-400)' }}>{r.costKey}</span>
              </div>
              <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(r.unitCostCents)}</div>
              <div style={{ color: 'var(--text-400)', fontSize: 12 }}>{r.unit}</div>
              <div><span className={`rd-chip tone-${r.source === 'override' ? 'ai' : 'idle'}`}>{r.source}</span></div>
              <div><When iso={r.updatedAt} /></div>
              <div><button className="sp-ask" onClick={() => editRate(r)}>Edit</button></div>
            </div>
          ))}
        </div>
      )}

      <div className="sec-hdr"><div className="sec-title">Tier pricing</div><div className="sec-sub">the price card modeled revenue is derived from</div></div>
      {tiers.loading ? (
        <ConsoleLoading label="tier pricing" />
      ) : tiers.error ? (
        <ConsoleError error={tiers.error} onRetry={tiers.retry} />
      ) : !tiers.data || tiers.data.tiers.length === 0 ? (
        <div className="scaf-note">No tier prices configured.</div>
      ) : (
        <div className="ctable" style={{ maxWidth: 760 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '1fr 130px 130px 90px 96px 70px' }}>
            <div>Tier</div><div style={{ textAlign: 'right' }}>Monthly</div><div style={{ textAlign: 'right' }}>Per seat</div><div>Source</div><div>Updated</div><div></div>
          </div>
          {tiers.data.tiers.map((t) => (
            <div key={t.tier} className="ct-row" style={{ gridTemplateColumns: '1fr 130px 130px 90px 96px 70px' }}>
              <div className="ct-strong">{t.tier}</div>
              <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(t.monthlyPriceCents)}</div>
              <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(t.perSeatCents)}</div>
              <div><span className={`rd-chip tone-${t.source === 'override' ? 'ai' : 'idle'}`}>{t.source}</span></div>
              <div><When iso={t.updatedAt} /></div>
              <div><button className="sp-ask" onClick={() => editTier(t)}>Edit</button></div>
            </div>
          ))}
        </div>
      )}
      <div className="scaf-note" style={{ marginTop: 10, maxWidth: 640 }}>
        Every edit is a governed action: it captures a reason, shows default-vs-override
        provenance, and lands in the audit trail.
      </div>
    </div>
  );
}

/* ════════════ 4 · Metering coverage ════════════ */

function BcMeteringView({ refreshTick }: { refreshTick: number }) {
  const m = useAdminGet<BcMetering>('/api/admin/business/metering-coverage', ['met', refreshTick]);
  if (m.loading) return <ConsoleLoading label="metering coverage" />;
  if (m.error) return <ConsoleError error={m.error} onRetry={m.retry} />;
  const d = m.data;
  if (!d) return <ConsoleLoading label="metering coverage" />;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          padding: '10px 14px',
          borderRadius: 8,
          border: `1px solid ${d.healthy ? 'var(--success)' : 'var(--warning)'}`,
          background: `color-mix(in srgb,${d.healthy ? 'var(--success)' : 'var(--warning)'} 8%,transparent)`,
          maxWidth: 680,
          marginBottom: 6,
        }}
      >
        <span>{d.healthy ? I.shieldCheck : I.alertTriangle}</span>
        <div style={{ fontSize: 12.5 }}>
          <b>{d.healthy ? 'Metering is healthy' : 'Metering has gaps'}</b> -- cost accounting is
          only as accurate as its metering. A feature billing usage without an explicit rate is
          priced at the catch-all default (mispricing risk); a rate with no usage is stale.
          Window: {d.windowDays} days.
        </div>
      </div>

      <div className="sec-hdr" style={{ marginTop: 14 }}><div className="sec-title">Metered features</div><div className="sec-sub">{d.meteredFeatures.length} emitting usage</div></div>
      {d.meteredFeatures.length === 0 ? (
        <div className="scaf-note" style={{ marginBottom: 16 }}>No usage records in the window.</div>
      ) : (
        <div className="ctable" style={{ maxWidth: 760, marginBottom: 16 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '1.4fr 100px 90px 110px 110px' }}>
            <div>Feature</div><div style={{ textAlign: 'right' }}>Credits</div><div style={{ textAlign: 'right' }}>Events</div><div>Last seen</div><div>Rate</div>
          </div>
          {d.meteredFeatures.map((f) => (
            <div key={f.featureId} className="ct-row" style={{ gridTemplateColumns: '1.4fr 100px 90px 110px 110px' }}>
              <div className="mono" style={{ fontSize: 11.5 }}>{f.featureId}</div>
              <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(f.credits)}</div>
              <div className="mono" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(f.events)}</div>
              <div><When iso={f.lastSeen} /></div>
              <div>
                <span className={`rd-chip tone-${f.hasExplicitRate ? 'ok' : 'warn'}`}>
                  {f.hasExplicitRate ? 'explicit' : 'default'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sec-hdr"><div className="sec-title">Gaps</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12, maxWidth: 860 }}>
        <div className="pj-card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
            Usage without an explicit rate{' '}
            <span className={`rd-chip tone-${d.gaps.usageWithoutExplicitRate.length ? 'warn' : 'ok'}`}>
              {d.gaps.usageWithoutExplicitRate.length}
            </span>
          </div>
          {d.gaps.usageWithoutExplicitRate.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-400)' }}>None -- every metered feature has its own rate.</div>
          ) : (
            d.gaps.usageWithoutExplicitRate.map((g) => (
              <div key={g.featureId} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span className="mono">{g.featureId}</span>
                <span className="mono" style={{ color: 'var(--text-400)' }}>{num(g.credits)} credits @ default</span>
              </div>
            ))
          )}
        </div>
        <div className="pj-card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
            Rates with no usage{' '}
            <span className={`rd-chip tone-${d.gaps.ratedButNoUsage.length ? 'warn' : 'ok'}`}>
              {d.gaps.ratedButNoUsage.length}
            </span>
          </div>
          {d.gaps.ratedButNoUsage.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-400)' }}>None -- every configured rate saw usage.</div>
          ) : (
            d.gaps.ratedButNoUsage.map((k) => (
              <div key={k} className="mono" style={{ fontSize: 12, padding: '3px 0' }}>{k}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════ 5 · Access roster ════════════ */

function BcAccessView({ refreshTick }: { refreshTick: number }) {
  const a = useAdminGet<BcAccess>('/api/admin/business/access', ['access', refreshTick]);
  if (a.loading) return <ConsoleLoading label="access roster" />;
  if (a.error) return <ConsoleError error={a.error} onRetry={a.retry} />;
  const d = a.data;
  if (!d) return <ConsoleLoading label="access roster" />;
  return (
    <div>
      <div className="scaf-note" style={{ maxWidth: 640, marginBottom: 12 }}>
        Read-only roster of who can enter this console -- the same source of truth the server
        enforces. Grant or revoke roles from the Admin console's Access &amp; personnel section
        (governed, audited).
      </div>
      <div className="sec-hdr"><div className="sec-title">Qualifying roles</div></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {d.roles.map((r) => (
          <span key={r} className="rd-chip tone-warn">{r}</span>
        ))}
      </div>
      <div className="sec-hdr"><div className="sec-title">Allowlisted emails</div><div className="sec-sub">BUSINESS_CENTER_EMAILS</div></div>
      {d.allowlistEmails.length === 0 ? (
        <div className="scaf-note" style={{ marginBottom: 14 }}>No allowlisted emails.</div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {d.allowlistEmails.map((e) => (
            <span key={e} className="rd-chip tone-ai mono" style={{ fontSize: 11 }}>{e}</span>
          ))}
        </div>
      )}
      <div className="sec-hdr"><div className="sec-title">Role holders</div><div className="sec-sub">{d.roleHolders.length} accounts</div></div>
      {d.roleHolders.length === 0 ? (
        <div className="scaf-note">No accounts hold a business role.</div>
      ) : (
        <div className="ctable" style={{ maxWidth: 860 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '1.4fr 1fr 110px 100px 1fr' }}>
            <div>Email</div><div>Name</div><div>Role</div><div>Status</div><div>Organization</div>
          </div>
          {d.roleHolders.map((h) => (
            <div key={`${h.id}-${h.role}-${h.organization_name ?? ''}`} className="ct-row" style={{ gridTemplateColumns: '1.4fr 1fr 110px 100px 1fr' }}>
              <div className="ct-strong" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.email}</div>
              <div>{h.name ?? '--'}</div>
              <div><span className="rd-chip tone-warn">{h.role}</span></div>
              <div><StatusChip value={h.status} /></div>
              <div style={{ color: 'var(--text-400)', fontSize: 12 }}>{h.organization_name ?? '--'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
