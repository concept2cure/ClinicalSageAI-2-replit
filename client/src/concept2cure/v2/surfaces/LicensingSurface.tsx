import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag, connected, liveGet } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { useLiveB2bPricing, useLiveDtcPricing } from '../livePricing';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  LIC_DTC,
  LIC_PRICING,
  LIC_ARCHETYPES,
  licBundle,
  type DtcTier,
  type B2bTier,
  type BillingStatus,
} from '../fixtures/licensing';
import '../styles/project-home-v2.css';

/* -- Inline helpers -- */

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

function money(n: number | null): string {
  return n == null ? 'Custom' : '$' + n.toLocaleString();
}

function lim(n: number): string | number {
  return n === -1 ? 'Unlimited' : n;
}

/* -- Billing API helper -- the project's one fetch convention (apiRequest
   attaches Bearer + x-organization-id). The kit's window.C2C_API bridge is
   gone in the ported app; going through it left checkout/portal permanently
   in sample mode even when signed in. */

async function billingPost<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const res = await apiRequest('POST', path, body);
  if (!res.ok) return null; // 401 passes through un-thrown; anything else throws upstream
  return (await res.json().catch(() => null)) as T | null;
}

interface BillingApi {
  status(): Promise<BillingStatus | null>;
  checkout(body: Record<string, unknown>): Promise<{ checkoutUrl?: string } | null>;
  dtcCheckout(body: Record<string, unknown>): Promise<{ checkoutUrl?: string } | null>;
  portal(returnUrl: string): Promise<{ portalUrl?: string } | null>;
  connected(): boolean;
}

const billing: BillingApi = {
  status() {
    return liveGet<BillingStatus | null>('/api/billing/status', null).then((r) => (r.sample ? null : r.data));
  },
  checkout(body) {
    return billingPost('/api/billing/checkout', body);
  },
  dtcCheckout(body) {
    return billingPost('/api/billing/dtc-checkout', body);
  },
  portal(returnUrl) {
    return billingPost('/api/billing/portal', { returnUrl });
  },
  connected() {
    return connected();
  },
};

/* ════ Licensing -- plans & billing surface ════ */

export function LicensingSurface({ onAsk, onNav }: SurfaceViewProps) {
  const [model, setModel] = useState<'dtc' | 'b2b'>('dtc');
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('annual');
  const [arch, setArch] = useState('virtual_biotech');
  const [seats, setSeats] = useState(5);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [toast, fireToast] = useToast();
  const live = billing.connected();

  useEffect(() => {
    billing
      .status()
      .then((r: any) => {
        const s = r && (r.data !== undefined ? r.data : r);
        if (s && s.tier) setStatus(s);
      })
      .catch(() => {});
  }, []);

  const family = (LIC_ARCHETYPES.find((a) => a.id === arch) || { family: 'pharma' }).family;
  /* Price cards adopt the live /api/billing price book (fail-closed to the
     curated fixtures); checkout amounts are always computed server-side by
     Stripe from the same book, so what renders is what gets charged. */
  const dtcPricing = useLiveDtcPricing(LIC_DTC);
  const b2bPricing = useLiveB2bPricing(family, LIC_PRICING[family] || LIC_PRICING.pharma);
  const dtcTiers: DtcTier[] = dtcPricing.tiers;
  const b2bTiers: B2bTier[] = b2bPricing.tiers;
  const pricingLive = dtcPricing.live || b2bPricing.live;
  const bundle = licBundle(seats);

  const curTier = status ? status.tier : 'free';

  const checkout = (tier: string) => {
    if (tier === 'enterprise') {
      onAsk && onAsk('Connect me with sales for the Enterprise plan.');
      fireToast('Enterprise · routed to sales');
      return;
    }
    const body: Record<string, unknown> =
      model === 'dtc'
        ? { tier, billingCycle: cycle }
        : { tier, billingCycle: cycle, seats };
    if (live) {
      (model === 'dtc' ? billing.dtcCheckout(body) : billing.checkout(body))
        .then((r: any) => {
          if (r && r.checkoutUrl) window.open(r.checkoutUrl, '_blank');
          else fireToast('Checkout started');
        })
        .catch(() => fireToast('Checkout failed'));
    } else {
      fireToast(
        'Sample · would POST /' +
          (model === 'dtc' ? 'dtc-checkout' : 'checkout') +
          ' · ' +
          tier +
          ' · ' +
          cycle +
          (model === 'b2b' ? ' · ' + seats + ' seats' : ''),
      );
    }
  };

  const managePortal = () => {
    if (live) {
      billing
        .portal(window.location.href)
        .then((r: any) => {
          if (r && r.portalUrl) window.open(r.portalUrl, '_blank');
        })
        .catch(() => fireToast('Portal unavailable'));
    } else {
      fireToast('Sample · would POST /portal (Stripe customer portal)');
    }
  };

  return (
    <div className="sp" style={{ maxWidth: 1120 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Admin · /api/billing {live ? '· live' : ''}</div>
          <h1 className="sp-title">
            Plans &amp; licensing <SampleTag sample={!live && !pricingLive} />
          </h1>
          <p className="sp-state">
            Self-service monthly tiers, or enterprise per-user pricing by
            organization archetype -- with seat bundle discounts and annual
            savings. Billing runs on Stripe Checkout + Customer Portal.
          </p>
        </div>
        {status && (
          <button className="sp-primary" onClick={managePortal}>
            {I.creditCard || I.settings} Manage billing
          </button>
        )}
      </div>

      {status && (
        <div className="pj-card" style={{ marginBottom: 16 }}>
          <div className="pj-card-b lic-status">
            <div>
              <span className="l">Current plan</span>
              <span className="v">{status.tier}</span>
            </div>
            <div>
              <span className="l">Status</span>
              <span className={'v lic-st lic-st-' + status.paymentStatus}>
                {status.paymentStatus}
              </span>
            </div>
            <div>
              <span className="l">Billing</span>
              <span className="v">{status.billingCycle}</span>
            </div>
            <div>
              <span className="l">Seats</span>
              <span className="v">{status.seats}</span>
            </div>
            <div>
              <span className="l">Renews</span>
              <span className="v">
                {status.currentPeriodEnd
                  ? new Date(status.currentPeriodEnd).toLocaleDateString()
                  : '--'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="lic-controls">
        <div className="cv-tiers">
          <button
            className={'cv-tier' + (model === 'dtc' ? ' on' : '')}
            onClick={() => setModel('dtc')}
          >
            Self-service
          </button>
          <button
            className={'cv-tier' + (model === 'b2b' ? ' on' : '')}
            onClick={() => setModel('b2b')}
          >
            Enterprise (per-user)
          </button>
        </div>
        <div className="lic-cycle">
          <button
            className={cycle === 'monthly' ? 'on' : ''}
            onClick={() => setCycle('monthly')}
          >
            Monthly
          </button>
          <button
            className={cycle === 'annual' ? 'on' : ''}
            onClick={() => setCycle('annual')}
          >
            Annual <span className="lic-save">save</span>
          </button>
        </div>
        {model === 'b2b' && (
          <div className="lic-arch">
            <label>Archetype</label>
            <select value={arch} onChange={(e) => setArch(e.target.value)}>
              {LIC_ARCHETYPES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <label style={{ marginLeft: 10 }}>Seats</label>
            <input
              type="number"
              min="1"
              value={seats}
              onChange={(e) =>
                setSeats(Math.max(1, parseInt(e.target.value) || 1))
              }
            />
            {bundle.label && (
              <span className="lic-bundle">
                {bundle.label} · -{bundle.discountPct}%
              </span>
            )}
          </div>
        )}
      </div>

      {model === 'dtc' ? (
        <div className="lic-grid">
          {dtcTiers.map((t: DtcTier) => {
            const annual =
              t.baseMonthly != null && t.baseMonthly > 0
                ? Math.round(t.baseMonthly * (1 - t.annualDiscountPct / 100))
                : t.baseMonthly;
            const shown =
              t.baseMonthly == null
                ? null
                : cycle === 'annual'
                  ? annual
                  : t.baseMonthly;
            const cur = curTier === t.tier;
            return (
              <div key={t.tier} className={'lic-card' + (cur ? ' cur' : '')}>
                {cur && <div className="lic-cur-tag">Current</div>}
                <div className="lic-name">{t.name}</div>
                <div className="lic-tier">{t.tier}</div>
                <div className="lic-price">
                  {shown == null
                    ? 'Custom'
                    : shown === 0
                      ? 'Free'
                      : money(shown) + (shown ? '/mo' : '')}
                  {cycle === 'annual' &&
                    t.baseMonthly != null &&
                    t.baseMonthly > 0 && (
                      <span className="lic-price-sub">
                        {' '}
                        billed yearly · -{t.annualDiscountPct}%
                      </span>
                    )}
                </div>
                <ul className="lic-feats">
                  <li>
                    {I.check} {lim(t.maxUsers)} user
                    {t.maxUsers === 1 ? '' : 's'}
                  </li>
                  <li>
                    {I.check} {lim(t.maxProjects)} projects
                  </li>
                  <li>
                    {I.check} {lim(t.maxStorageGB)} GB storage
                  </li>
                  <li>
                    {I.check} {lim(t.deepResearchCredits)} deep-research
                    credits/mo
                  </li>
                  <li>
                    {I.check} {lim(t.builderCredits)} builder credits/mo
                  </li>
                  {t.trialDays > 0 && (
                    <li className="lic-trial">
                      {I.sparkles} {t.trialDays}-day free trial
                    </li>
                  )}
                </ul>
                <button
                  className={'lic-cta' + (cur ? ' ghost' : '')}
                  disabled={cur}
                  onClick={() =>
                    t.tier === 'free' ? checkout('free') : checkout(t.tier)
                  }
                >
                  {cur
                    ? 'Current plan'
                    : t.tier === 'enterprise'
                      ? 'Contact sales'
                      : t.tier === 'free'
                        ? 'Start free'
                        : t.trialDays > 0
                          ? 'Start ' + t.trialDays + '-day trial'
                          : 'Choose'}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="lic-grid lic-grid-3">
          {b2bTiers.map((t: B2bTier) => {
            const perUser =
              t.perUserMonthly == null
                ? null
                : Math.round(
                    t.perUserMonthly * (1 - (bundle.discountPct || 0) / 100),
                  );
            const shown =
              perUser == null
                ? null
                : cycle === 'annual'
                  ? Math.round(perUser * (1 - t.annualDiscountPct / 100))
                  : perUser;
            const total = shown == null ? null : shown * seats;
            const cur = curTier === t.tier;
            return (
              <div key={t.tier} className={'lic-card' + (cur ? ' cur' : '')}>
                {cur && <div className="lic-cur-tag">Current</div>}
                <div className="lic-name">{t.name}</div>
                <div className="lic-tier">{t.tier}</div>
                <div className="lic-price">
                  {shown == null ? 'Custom' : money(shown) + '/user/mo'}
                  {(bundle.discountPct ?? 0) > 0 && perUser != null && (
                    <span className="lic-price-sub">
                      {' '}
                      {bundle.label} -{bundle.discountPct}%
                    </span>
                  )}
                </div>
                {total != null && (
                  <div className="lic-total">
                    ~ {money(total)}/mo · {seats} seats
                    {cycle === 'annual'
                      ? ' (annual -' + t.annualDiscountPct + '%)'
                      : ''}
                  </div>
                )}
                <ul className="lic-feats">
                  <li>
                    {I.check} {t.includedTokensMonthly / 1_000_000}M AI
                    tokens/user/mo
                  </li>
                  <li>
                    {I.check} {lim(t.maxProjects)} projects
                  </li>
                  <li>
                    {I.check} {t.maxStorageGB} GB storage
                  </li>
                  <li>
                    {I.check} {t.minCommitmentMonths}-mo commitment
                  </li>
                  {t.features.map((f, i) => (
                    <li key={i}>{I.check} {f}</li>
                  ))}
                </ul>
                <button
                  className={'lic-cta' + (cur ? ' ghost' : '')}
                  disabled={cur}
                  onClick={() => checkout(t.tier)}
                >
                  {cur
                    ? 'Current plan'
                    : t.tier === 'enterprise'
                      ? 'Contact sales'
                      : 'Choose ' + t.name}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="lic-usage-row">
        <div className="lic-usage-main">
          <b>Usage-based, capped, auditable</b>
          <span>
            Every plan meters real usage -- session and weekly windows,
            per-engine buckets, overage caps you set yourself, and credits with
            auto-reload. Changing a cap is a governed action: admin role,
            reason-for-change, audit entry.
          </span>
        </div>
        <button
          className="lic-usage-cta"
          onClick={() => {
            try {
              localStorage.setItem('c2c_open_surface', 'usage');
            } catch (_e) {
              /* noop */
            }
            onNav && onNav('usage');
          }}
        >
          Open Usage &amp; limits &rarr;
        </button>
      </div>

      <div className="scaf-note" style={{ marginTop: 16 }}>
        {I.shieldCheck} Prices, limits, credits and features are read from the
        codebase pricing config (services/billing.ts). Checkout &amp; management
        run through Stripe ({live ? 'live' : 'sample'}).
      </div>
      <C2CToast msg={toast} />
    </div>
  );
}
