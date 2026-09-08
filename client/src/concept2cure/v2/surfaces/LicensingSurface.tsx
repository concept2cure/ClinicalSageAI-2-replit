import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData, liveMutateOrNull, type DataResult } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import { takeUnlockIntent, type UnlockIntent } from '../unlockIntent';
import type { SurfaceViewProps } from '../surfaceViews';
// Canonical price list, NOT fabricated per-tenant data: LIC_DTC / LIC_PRICING /
// LIC_ARCHETYPES / licBundle are the product's fixed pricing catalog — the same
// tiers the backend charges against (server/services/billing.ts, mirrored here
// in dollars; verified in sync) and served read-only by GET /api/billing/{pricing,
// dtc-pricing}. Identical for every tenant, so it is kept as reference config,
// not re-anchored. Only the per-org subscription STATUS below is live persisted
// data. `BillingStatus` is a type. Nothing here is a sample, so no SampleTag.
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
import { C2CToast, useToast } from '../toast';

/* -- Inline helpers -- */

function money(n: number | null): string {
  return n == null ? 'Custom' : '$' + n.toLocaleString();
}

function lim(n: number): string | number {
  return n === -1 ? 'Unlimited' : n;
}

/* -- Billing API helper (mirrors kit runtime setup) -- */

interface BillingApi {
  checkout(body: Record<string, unknown>): Promise<DataResult<{ checkoutUrl?: string }>>;
  dtcCheckout(body: Record<string, unknown>): Promise<DataResult<{ checkoutUrl?: string }>>;
  portal(returnUrl: string): Promise<DataResult<{ portalUrl?: string }>>;
}

// Subscription STATUS is read fixture-free via useLiveData in the component.
// This helper only carries the checkout / portal ACTIONS (real Stripe endpoints).
// Ported off the design kit's `window.C2C_API` bridge, which is assigned
// nowhere in this repository — so every one of these four went down the
// `: Promise.reject(new Error('offline'))` branch, on every click, forever.
// Checkout and portal are real Stripe endpoints; they have never been reachable
// from this surface. dataConnect's header states the rule these now follow: the
// kit global collapses onto apiRequest on port, and no second fetch convention
// is introduced.
//
// The full DataResult is kept (rather than `.then(r => r.data)`) so a failure can
// be REPORTED. It could not be before: a rejected checkout resolved to `null`,
// which fell into the `else` arm of `if (r && r.checkoutUrl)` and fired the toast
// "Checkout started". The user was told their checkout had begun when the server
// had refused it.
const billing: BillingApi = {
  checkout(body) {
    return liveMutateOrNull<{ checkoutUrl?: string }>('POST', '/api/billing/checkout', body);
  },
  dtcCheckout(body) {
    return liveMutateOrNull<{ checkoutUrl?: string }>('POST', '/api/billing/dtc-checkout', body);
  },
  portal(returnUrl) {
    return liveMutateOrNull<{ portalUrl?: string }>('POST', '/api/billing/portal', { returnUrl });
  },
};

/* ════ Licensing -- plans & billing surface ════ */

export function LicensingSurface({ onAsk, onNav }: SurfaceViewProps) {
  const [model, setModel] = useState<'dtc' | 'b2b'>('dtc');
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('annual');
  const [arch, setArch] = useState('virtual_biotech');
  const [seats, setSeats] = useState(5);
  const [toast, fireToast] = useToast();

  // Per-org subscription STATUS is real persisted data: GET /api/billing/status
  // reads the organizations row (server getSubscriptionStatus) and reconciles
  // live Stripe state. Real object -> honest error -> no fixture. useLiveData
  // unwraps the success envelope; this route returns the status object directly.
  /* What the customer was trying to open, when they arrived from a lock.
     Read ONCE on mount and cleared in the same step — the intent is a fact
     about one navigation, and a customer who comes back here later from the
     account menu must not be told they were unlocking something they stopped
     thinking about. Null on every other route into this page, which is the
     common case. */
  const [unlock] = useState<UnlockIntent | null>(() => takeUnlockIntent());

  const statusState = useLiveData<BillingStatus>('/api/billing/status');
  const status = statusState.data;

  const family = (LIC_ARCHETYPES.find((a) => a.id === arch) || { family: 'pharma' }).family;
  const b2bTiers: B2bTier[] = LIC_PRICING[family] || LIC_PRICING.pharma;
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
    /* Always the real endpoint, and only ever the real outcome.
       This used to be gated on `connected()` (a session token in local storage),
       and when that read false it fired "Sample · would POST /dtc-checkout · …"
       and did nothing. That is a mock action on a runtime path: the button
       narrated a request it never made, in a tone that reads like a dry run
       rather than a failure, so a real customer whose token lived somewhere this
       check could not see simply could not buy anything and was never told.
       The request now goes out; if it is refused, the refusal is what is shown. */
    (model === 'dtc' ? billing.dtcCheckout(body) : billing.checkout(body)).then((r) => {
      if (r.data?.checkoutUrl) {
        window.open(r.data.checkoutUrl, '_blank');
        return;
      }
      // No URL back means no checkout was created — never report one that was not.
      fireToast(r.error ? 'Checkout failed · ' + r.error : 'Checkout did not return a payment link', 'error');
    });
  };

  const managePortal = () => {
    billing.portal(window.location.href).then((r) => {
      if (r.data?.portalUrl) {
        window.open(r.data.portalUrl, '_blank');
        return;
      }
      fireToast(r.error ? 'Billing portal unavailable · ' + r.error : 'Billing portal unavailable', 'error');
    });
  };

  /* WHAT ANA SEES HERE. On a failed status read `curTier` silently falls back
     to 'free' and the free card wears the Current tag — the error branch
     exists so that fallback is never reported as the organization's plan.
     Payment status is the raw value, never dunning language; choosing a plan
     and the seats input are checkout acts and are never offered. */
  const anaContext = useMemo(() => {
    const lockLead = unlock
      ? `The user arrived here from a lock on "${unlock.label}", which ${
          unlock.requiredTier
            ? `needs the ${unlock.requiredTier} plan or above`
            : 'has no plan remedy — changing plan may not resolve it on its own'
        }. `
      : '';
    const view = `Viewing the ${model === 'dtc' ? 'self-service' : 'enterprise per-user'} catalog on the ${cycle} cycle.`;
    const shared = {
      pricingModel: model,
      cycle,
      ...(model === 'b2b' ? { archetype: arch } : {}),
      arrivedFromLock: unlock ? { label: unlock.label, requiredTier: unlock.requiredTier } : null,
    };
    if (statusState.loading) {
      return { summary: lockLead + 'The current plan is still loading. ' + view, facts: shared };
    }
    if (statusState.error) {
      return {
        summary:
          lockLead +
          'The subscription status could not be read, so no current plan is shown — any "Current" marker on the ' +
          'free card is the silent fallback of the failed read, NOT a finding that the organization is on the ' +
          'free tier. ' + view,
        facts: { ...shared, planUnavailable: true },
      };
    }
    if (!status) {
      return {
        summary: lockLead + 'No subscription record was returned for this organization. ' + view,
        facts: { ...shared, planUnavailable: true },
      };
    }
    return {
      summary:
        lockLead +
        `Plans & licensing: current plan "${status.tier}", payment status "${status.paymentStatus}", ` +
        `${status.seats} seat(s), billed ${status.billingCycle}` +
        (status.currentPeriodEnd
          ? `, current period ends ${new Date(status.currentPeriodEnd).toLocaleDateString()}`
          : '') +
        '. ' + view,
      facts: {
        ...shared,
        currentTier: status.tier,
        paymentStatus: status.paymentStatus,
        billingCycle: status.billingCycle,
        seats: status.seats,
        currentPeriodEnd: status.currentPeriodEnd ?? null,
        planUnavailable: false,
      },
      availableActions: [
        'Switch between the self-service and enterprise catalogs and the monthly/annual cycle (view state only)',
        'Choosing a plan opens Stripe checkout; changing or cancelling runs through the billing portal — human acts',
      ],
    };
  }, [unlock, model, cycle, arch, statusState.loading, statusState.error, status]);
  /* AnA operates the pricing CATALOG view only. The seat count is a checkout
     body field and `checkout()` opens Stripe — neither is reachable from here;
     both stay the person's own click. */
  useSurfaceActionHandlers('licensing', {
    'licensing.set-pricing-model': (params) => {
      const target = params.model === 'b2b' ? 'b2b' : 'dtc';
      const label = target === 'b2b' ? 'enterprise per-user' : 'self-service';
      if (model === target) return { ok: true, detail: `Already showing the ${label} catalog` };
      setModel(target);
      return { ok: true, detail: `Showing the ${label} catalog` };
    },
    'licensing.set-cycle': (params) => {
      const target = params.cycle === 'monthly' ? 'monthly' : 'annual';
      if (cycle === target) return { ok: true, detail: `Already showing ${target} pricing` };
      setCycle(target);
      return { ok: true, detail: `Showing ${target} pricing — nothing is purchased` };
    },
  });

  usePublishSurfaceContext('licensing', anaContext);

  return (
    <div className="sp" style={{ maxWidth: 1120 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Admin · billing</div>
          <h1 className="sp-title">Plans &amp; licensing</h1>
          <p className="sp-state">
            Self-service monthly tiers, or enterprise per-user pricing by
            organization archetype — with seat bundle discounts and annual
            savings. Billing runs on Stripe Checkout + Customer Portal.
          </p>
        </div>
        {status && (
          <button className="sp-primary" onClick={managePortal}>
            {I.creditCard || I.settings} Manage billing
          </button>
        )}
      </div>

      {unlock && (
        /* Says the thing the customer came here to find out. Every value is the
           server's own verdict, carried across the navigation — the module's
           real name and the real minimum tier. When requiredTier is null the
           lock has no plan remedy (an administrator disabled it, or it is
           outside this workspace's industry mode) and this must NOT offer a plan
           that would change nothing. */
        <div className="lic-unlock" role="note">
          <span className="lic-unlock-ic" aria-hidden="true">{I.lock}</span>
          <div className="lic-unlock-mid">
            <div className="lic-unlock-t">{unlock.label}</div>
            <div className="lic-unlock-b">
              {unlock.requiredTier
                ? `Included from the ${unlock.requiredTier.charAt(0).toUpperCase()}${unlock.requiredTier.slice(1)} plan upward. Your current plan does not include it.`
                : 'Not included in your plan. Changing plan may not resolve this on its own — check with your administrator.'}
            </div>
          </div>
        </div>
      )}

      {statusState.loading ? (
        <div role="status" className="scaf-note" style={{ marginBottom: 16 }}>
          Loading your current plan…
        </div>
      ) : statusState.error ? (
        <div style={{ marginBottom: 16 }}>
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load your current plan"
            hint="Your subscription status didn't load. This reads your organization's billing record — sign in and retry, or check the billing service is reachable."
          />
        </div>
      ) : status ? (
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
      ) : null}

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
          {LIC_DTC.map((t: DtcTier) => {
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
            Every plan meters real usage — session and weekly windows,
            per-engine buckets, overage caps you set yourself, and credits with
            auto-reload. Changing a cap is a governed action: admin role,
            reason-for-change, audit entry.
          </span>
        </div>
        <button
          className="lic-usage-cta"
          onClick={() => {
            onNav && onNav('usage');
          }}
        >
          Open Usage &amp; limits &rarr;
        </button>
      </div>

      <div className="scaf-note" style={{ marginTop: 16 }}>
        {I.shieldCheck} Prices, limits, credits and features are the product&rsquo;s fixed
        catalog, mirrored from the same config the backend charges against
        (services/billing.ts) — identical for every organization, not per-tenant data.
        Your plan, seats and renewal above are read from your organization&rsquo;s billing
        record. Checkout &amp; management run through Stripe.
      </div>
      <C2CToast msg={toast} />
    </div>
  );
}
