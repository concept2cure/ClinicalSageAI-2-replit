import React, { useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  LIC_ARCHETYPES,
  LIC_DTC,
  LIC_PRICING,
  LIC_ROLES,
  LIC_TIER_LEVEL,
  licBundle as licBundleOf,
} from '../fixtures/onboarding-data';
import { getAuthHeaders, getOrgId } from '@/utils/authToken';
import '../styles/project-home-v2.css';

/* ── Helpers ── */

function _lim(n: number): string | number {
  return n === -1 ? 'Unlimited' : n;
}

/* ── Activation mappers (pure; unit-tested in onboardingActivation.test.ts) ── */

/** Allowed values of organization_industry_profiles.primary_industry — must
 * stay in lockstep with the PRIMARY_INDUSTRY enum validated by
 * PATCH /api/mdx/industry-profile (server/routes/mdx-industry-context.ts). */
export type PrimaryIndustry =
  | 'medical_device_diagnostics'
  | 'biotech_pharma'
  | 'cro'
  | 'regulatory_consulting'
  | 'academic_research';

/** Wizard archetype (organizations.industry_mode vocabulary, LIC_ARCHETYPES)
 * → governed org industry profile primaryIndustry. Unknown values fall back
 * to biotech_pharma, the platform's broadest default. */
export function archetypeToPrimaryIndustry(archetype: string): PrimaryIndustry {
  switch (archetype) {
    case 'medtech':
      return 'medical_device_diagnostics';
    case 'cro':
      return 'cro';
    case 'regulatory':
    case 'medical_writing':
      return 'regulatory_consulting';
    case 'academic':
      return 'academic_research';
    case 'virtual_biotech':
    case 'biotech':
    case 'big_pharma':
    case 'pharma':
    default:
      return 'biotech_pharma';
  }
}

/** Org-scoped membership roles accepted by POST /api/tenant-users
 * (createUserSchema in server/routes/tenant-users.ts). */
export type OrgMemberRole = 'admin' | 'manager' | 'member' | 'viewer';

/** Wizard personnel role (PLATFORM-role vocabulary, LIC_ROLES/GRANTABLE_ROLES)
 * → the org-scoped role vocabulary the invite endpoint accepts. Platform-tier
 * roles are deliberately DOWN-SCOPED: an actual platform/finance grant can only
 * be made through the governed access-management grant API
 * (POST /api/admin/access/grants — requires the target user to exist and the
 * caller to be a platform/business admin), never from this wizard. Unknown
 * roles fail closed to least-privilege 'member'. */
export function inviteRoleToOrgRole(role: string): OrgMemberRole {
  switch (role) {
    case 'owner':
    case 'business_admin':
    case 'super_admin':
      return 'admin';
    case 'platform_admin':
      return 'manager';
    case 'support':
    default:
      return 'member';
  }
}

/** POST /api/tenant-users requires a display name (min 2 chars) the wizard
 * does not collect; derive a provisional one from the email local part (the
 * invitee sets their real name when they accept). Falls back to the full
 * email when the local part is too short to satisfy the schema. */
export function inviteNameFromEmail(email: string): string {
  const local = (email.split('@')[0] || '').trim();
  return local.length >= 2 ? local : email;
}

export interface CheckoutRequest {
  path: string;
  body: Record<string, unknown>;
}
export interface CheckoutUnavailable {
  unavailable: string;
}

/** Wizard plan selection → the billing checkout call that can honestly be
 * made today, or the reason none can (surfaced verbatim on the completion
 * screen instead of pretending the plan was provisioned). */
export function checkoutRequestFor(
  model: string,
  tier: string,
  cycle: string,
  seats: number,
): CheckoutRequest | CheckoutUnavailable {
  const billingCycle = cycle === 'annual' ? 'annual' : 'monthly';
  if (tier === 'enterprise') {
    // TODO(onboarding): no enterprise onboarding-request endpoint exists yet —
    // enterprise pricing is custom (perUserMonthly/baseMonthly null), so
    // POST /api/billing/checkout cannot price it. Do not call checkout here.
    return {
      unavailable:
        'Enterprise plans use custom pricing finalized with our team — there is no self-service enterprise checkout yet, so no plan was provisioned.',
    };
  }
  if (model === 'dtc') {
    if (tier === 'free') {
      // TODO(onboarding): POST /api/billing/dtc-checkout rejects tier "free"
      // (its schema only accepts standard|professional|enterprise) even though
      // the billing service can provision the free tier directly. Until the
      // route accepts it, the free tier cannot be provisioned from here.
      return {
        unavailable:
          'The free tier cannot be provisioned from this wizard yet — the self-service checkout endpoint only accepts paid tiers, so no plan was provisioned.',
      };
    }
    return { path: '/api/billing/dtc-checkout', body: { tier, billingCycle } };
  }
  return {
    path: '/api/billing/checkout',
    body: { tier, billingCycle, seats: Math.max(1, Math.floor(seats) || 1) },
  };
}

/** Honest per-step record of what activate() actually did. */
export interface ActivationOutcome {
  profileSaved: boolean;
  invitesAttempted: number;
  invitesSent: number;
  invitesFailed: string[];
  checkout: 'redirecting' | 'unavailable' | 'failed';
  checkoutNote: string | null;
  checkoutUrl: string | null;
}

/* ── Onboarding wizard ──
   Grounded in the real org model: organizations.industry_mode
   (LIC_ARCHETYPES) -> pricing family -> tier -> seats/billing_cycle ->
   tier->module provisioning -> personnel roles -> activate via /api/billing.

   DATA HONESTY: this surface renders NO persisted org data — it is a
   config-driven input wizard. The pricing / archetype / role / tier-level /
   bundle constants it shows are CANONICAL CONFIG, mirrored verbatim from the
   server source of truth (server/services/billing.ts PRICING / DTC_PRICING /
   BUNDLE_DISCOUNTS; access-management.ts GRANTABLE_ROLES) that drives the real
   Stripe checkout — the genuine plan catalog, not a fabricated stand-in — so
   they are kept, not re-anchored. (GET /api/billing/pricing and
   /api/billing/dtc-pricing exist but STUB the same hardcoded constant and
   return a reshaped subset that drops fields this wizard renders — features,
   includedTokensMonthly, baseMonthly — so they are not a viable live anchor
   today.) The legacy page-level "Sample data" SampleTag has been removed:
   nothing here is fabricated sample data. `activate()` calls the real
   activation endpoints and reports per-step results honestly — see the
   comment at that function for exactly what is and is not wired. */

export function Onboarding({ onAsk }: SurfaceViewProps) {
  const [step, setStep] = useState(0);
  const [org, setOrg] = useState({ name: '', archetype: 'virtual_biotech' });
  const [model, setModel] = useState('dtc');
  const [tier, setTier] = useState('standard');
  const [cycle, setCycle] = useState('annual');
  const [seats, setSeats] = useState(5);
  const [invites, setInvites] = useState([{ email: '', role: 'owner' }]);
  const [outcome, setOutcome] = useState<ActivationOutcome | null>(null);
  const [activating, setActivating] = useState(false);

  const archetypes: Array<{ id: string; label: string; family: string }> = LIC_ARCHETYPES;
  const family =
    (archetypes.find((a) => a.id === org.archetype) || ({} as any)).family ||
    'pharma';
  const dtcTiers: any[] = LIC_DTC;
  const pricingMap: Record<string, any[]> = LIC_PRICING;
  const tiers: any[] =
    model === 'dtc'
      ? dtcTiers
      : pricingMap[family] || pricingMap.pharma || [];
  const selTier: any = tiers.find((t: any) => t.tier === tier) || tiers[0] || {};
  const bundle = licBundleOf(seats);
  const roles: Array<{ id: string; label: string }> = LIC_ROLES;
  const tierLevel: Record<string, number> = LIC_TIER_LEVEL;

  const onNav = (id: string) => {
    try {
      localStorage.setItem('c2c_open_surface', id);
    } catch (_e) { /* noop */ }
  };

  const STEPS = [
    'Organization',
    'Pricing model',
    'Choose plan',
    'Invite personnel',
    'Modules',
    'Review & activate',
  ];

  const setInvite = (i: number, k: string, v: string) =>
    setInvites((a) =>
      a.map((x, j) => (j === i ? { ...x, [k]: v } : x)),
    );
  const addInvite = () =>
    setInvites((a) => [...a, { email: '', role: 'support' }]);
  const rmInvite = (i: number) =>
    setInvites((a) => a.filter((_, j) => j !== i));

  const provisionedFeatures = (): string[] => {
    if (model === 'b2b') {
      const idx = tiers.findIndex((t: any) => t.tier === tier);
      const set: string[] = [];
      for (let i = 0; i <= idx; i++) {
        (tiers[i].features || []).forEach((f: string) => {
          if (!/everything in/i.test(f)) set.push(f);
        });
      }
      return [...new Set(set)];
    }
    return [
      'Deep research (' +
        (selTier.deepResearchCredits === -1
          ? 'unlimited'
          : selTier.deepResearchCredits) +
        '/mo)',
      selTier.builderCredits
        ? 'AnA Builder (' +
          (selTier.builderCredits === -1
            ? 'unlimited'
            : selTier.builderCredits) +
          '/mo)'
        : null,
      _lim(selTier.maxProjects) + ' projects',
      _lim(selTier.maxStorageGB) + ' GB storage',
    ].filter(Boolean) as string[];
  };

  /* activate() — wires the wizard to the real activation endpoints and
     records, per step, what actually happened (ActivationOutcome), so the
     completion screen states exactly what was done vs not done:

       1. PATCH /api/mdx/industry-profile — persists the governed org industry
          profile (archetype → primaryIndustry), tenant-scoped and audited.
       2. POST /api/tenant-users (one per invite with an email) — creates the
          org membership / pending invitation; seat- and quota-gated server
          side. Wizard platform-tier roles are down-scoped to org roles (see
          inviteRoleToOrgRole) — platform/finance grants require the governed
          access-management grant API after the user exists.
       3. POST /api/billing/dtc-checkout (self-service) or
          POST /api/billing/checkout (per-user) — creates the real Stripe
          Checkout Session; on success the browser is redirected to the
          returned Checkout URL. Plan + tier modules are provisioned by the
          billing webhook once payment completes, not by this client. Checkout
          runs LAST because success navigates away from the app.

     Steps with no live endpoint stay explicitly NOT done (never reported as
     success): enterprise custom pricing and the DTC free tier (see
     checkoutRequestFor), and — TODO(onboarding): no endpoint lets a
     non-platform-admin persist the organization NAME or industry_mode typed
     in step 1 (PATCH /api/tenants/:id requires super_admin/platform_admin),
     so the workspace name is display-only here; the organization TYPE is
     captured via the governed industry profile in step 1 above. */
  const activate = async () => {
    setActivating(true);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    };

    // 1. Governed org industry profile (audited upsert).
    let profileSaved = false;
    try {
      const res = await fetch('/api/mdx/industry-profile', {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          primaryIndustry: archetypeToPrimaryIndustry(org.archetype),
        }),
      });
      profileSaved = res.ok;
    } catch (_e) {
      profileSaved = false;
    }

    // 2. Personnel invites — real org membership / invitation rows.
    const pending = invites.filter((x) => x.email.trim());
    let invitesSent = 0;
    const invitesFailed: string[] = [];
    for (const inv of pending) {
      const email = inv.email.trim();
      try {
        const res = await fetch('/api/tenant-users', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            email,
            name: inviteNameFromEmail(email),
            role: inviteRoleToOrgRole(inv.role),
            organizationId: getOrgId(),
          }),
        });
        // 201 = member created; 202 = pending cross-org invitation created.
        if (res.ok) invitesSent += 1;
        else invitesFailed.push(email);
      } catch (_e) {
        invitesFailed.push(email);
      }
    }

    // 3. Billing checkout — last, because success leaves the app for Stripe.
    const checkoutReq = checkoutRequestFor(model, tier, cycle, seats);
    let checkout: ActivationOutcome['checkout'];
    let checkoutNote: string | null = null;
    let checkoutUrl: string | null = null;
    if ('unavailable' in checkoutReq) {
      checkout = 'unavailable';
      checkoutNote = checkoutReq.unavailable;
    } else {
      try {
        const res = await fetch(checkoutReq.path, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(checkoutReq.body),
        });
        // /checkout returns { checkoutUrl }; /dtc-checkout returns { url }.
        const data = res.ok ? await res.json().catch(() => null) : null;
        const url = data && (data.checkoutUrl ?? data.url);
        if (typeof url === 'string' && url) {
          checkout = 'redirecting';
          checkoutUrl = url;
        } else {
          checkout = 'failed';
          checkoutNote =
            'The billing service did not return a checkout link — no plan was provisioned. Retry from Usage & Billing.';
        }
      } catch (_e) {
        checkout = 'failed';
        checkoutNote =
          'Could not reach the billing service — no plan was provisioned. Retry from Usage & Billing.';
      }
    }

    setOutcome({
      profileSaved,
      invitesAttempted: pending.length,
      invitesSent,
      invitesFailed,
      checkout,
      checkoutNote,
      checkoutUrl,
    });
    setActivating(false);
    if (checkoutUrl) window.location.assign(checkoutUrl);
  };

  const canNext = step === 0 ? org.name.trim().length > 1 : true;

  return (
    <div className="sp" style={{ maxWidth: 960 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Onboarding {I.dot} new organization</div>
          <h1 className="sp-title">Set up your workspace</h1>
          <p className="sp-state">
            Six steps: organization profile, pricing model, plan, personnel,
            module provisioning, then activate. Everything a client does begins
            with a workspace.
          </p>
        </div>
      </div>

      <div className="ob-steps">
        {STEPS.map((s, i) => (
          <div
            key={i}
            className={
              'ob-step' + (i === step ? ' on' : '') + (i < step ? ' done' : '')
            }
          >
            <span className="ob-step-n">
              {i < step ? I.check : i + 1}
            </span>
            <span className="ob-step-l">{s}</span>
          </div>
        ))}
      </div>

      <div className="pj-card">
        <div className="pj-card-b">
          {outcome ? (
            <div className="ob-done">
              <div className="ob-done-ic">{I.checkCircle || I.check}</div>
              <h2>
                {outcome.checkout === 'redirecting'
                  ? 'Taking you to secure checkout…'
                  : (org.name || 'Your workspace') + ' — activation summary'}
              </h2>
              <div className="ob-review" style={{ textAlign: 'left' }}>
                <div className="ob-rev-row">
                  <span className="k">Industry profile</span>
                  <span className="v">
                    {outcome.profileSaved
                      ? 'Saved — governed org profile recorded (audited).'
                      : 'Not saved — set it later in the admin console.'}
                  </span>
                </div>
                <div className="ob-rev-row">
                  <span className="k">Personnel</span>
                  <span className="v">
                    {outcome.invitesAttempted === 0
                      ? 'No invitations requested.'
                      : outcome.invitesSent +
                        ' of ' +
                        outcome.invitesAttempted +
                        ' invitations created' +
                        (outcome.invitesFailed.length
                          ? ' — not sent: ' + outcome.invitesFailed.join(', ')
                          : '') +
                        '.'}
                  </span>
                </div>
                <div className="ob-rev-row">
                  <span className="k">Plan</span>
                  <span className="v">
                    {outcome.checkout === 'redirecting'
                      ? 'Redirecting to secure checkout for the ' +
                        selTier.name +
                        ' plan' +
                        (model === 'dtc' && selTier.trialDays > 0
                          ? ' (' + selTier.trialDays + '-day trial)'
                          : '') +
                        '. Modules for the ' +
                        tier +
                        ' tier are provisioned automatically once payment completes.'
                      : outcome.checkoutNote ||
                        'No plan was provisioned.'}
                  </span>
                </div>
                <div className="ob-rev-row">
                  <span className="k">Workspace name</span>
                  <span className="v">
                    Not yet persisted — renaming the organization from this
                    wizard is not available; your organization type was
                    captured in the industry profile above.
                  </span>
                </div>
              </div>
              <div
                className="cm-pushbar"
                style={{ justifyContent: 'center', marginTop: 16 }}
              >
                <button
                  className="sp-primary"
                  onClick={() => onNav('projects')}
                >
                  {I.folder} Create your first project
                </button>
                <button
                  className="sp-ask"
                  onClick={() => onNav('admin-console')}
                >
                  {I.settings} Open admin console
                </button>
              </div>
            </div>
          ) : (
            <>
              {step === 0 && (
                <div>
                  <div className="pj-seclbl" style={{ marginTop: 0 }}>
                    Organization name
                  </div>
                  <input
                    className="ob-in"
                    placeholder="e.g. Bright Biosciences"
                    value={org.name}
                    onChange={(e) =>
                      setOrg({ ...org, name: e.target.value })
                    }
                  />
                  <div className="pj-seclbl">
                    Organization type{' '}
                    <span
                      style={{
                        color: 'var(--text-400)',
                        fontWeight: 400,
                        textTransform: 'none',
                        letterSpacing: 0,
                      }}
                    >
                      - sets your pathways, modules &amp; pricing
                    </span>
                  </div>
                  <div className="ob-arch">
                    {archetypes.map((a) => (
                      <button
                        key={a.id}
                        className={
                          'ob-arch-b' +
                          (org.archetype === a.id ? ' on' : '')
                        }
                        onClick={() =>
                          setOrg({ ...org, archetype: a.id })
                        }
                      >
                        <span className="ob-arch-l">{a.label}</span>
                        <span className="ob-arch-f">
                          {a.family} pricing
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="ob-models">
                  <button
                    className={'ob-model' + (model === 'dtc' ? ' on' : '')}
                    onClick={() => {
                      setModel('dtc');
                      setTier('standard');
                    }}
                  >
                    <div className="ob-model-t">
                      {I.zap || I.sparkles} Self-service
                    </div>
                    <div className="ob-model-d">
                      Sign up, pay, use — self-service flat monthly tiers with
                      deep-research &amp; builder credits and a free trial.
                      Best for startups and individuals.
                    </div>
                  </button>
                  <button
                    className={'ob-model' + (model === 'b2b' ? ' on' : '')}
                    onClick={() => {
                      setModel('b2b');
                      setTier('standard');
                    }}
                  >
                    <div className="ob-model-t">
                      {I.building || I.users} Enterprise (per-user)
                    </div>
                    <div className="ob-model-d">
                      Per-user pricing tuned to your archetype, seat bundle
                      discounts, AI token allowances, SSO/SCIM and compliance
                      packs. Best for teams &amp; regulated orgs.
                    </div>
                  </button>
                </div>
              )}

              {step === 2 && (
                <div>
                  <div className="lic-cycle" style={{ marginBottom: 14 }}>
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
                    {model === 'b2b' && (
                      <span
                        style={{
                          marginLeft: 14,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 13,
                        }}
                      >
                        <label>Seats</label>
                        <input
                          className="ob-seats"
                          type="number"
                          min="1"
                          value={seats}
                          onChange={(e) =>
                            setSeats(
                              Math.max(1, parseInt(e.target.value) || 1),
                            )
                          }
                        />
                        {bundle.label && (
                          <span className="lic-bundle">
                            {bundle.label} -{bundle.discountPct}%
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="ob-tiers">
                    {tiers.map((t: any) => {
                      const cur = t.tier === tier;
                      let price: string;
                      if (model === 'dtc') {
                        price =
                          t.baseMonthly == null
                            ? 'Custom'
                            : t.baseMonthly === 0
                              ? 'Free'
                              : '$' +
                                (cycle === 'annual'
                                  ? Math.round(
                                      t.baseMonthly *
                                        (1 - t.annualDiscountPct / 100),
                                    )
                                  : t.baseMonthly) +
                                '/mo';
                      } else {
                        const pu =
                          t.perUserMonthly == null
                            ? null
                            : Math.round(
                                t.perUserMonthly *
                                  (1 - (bundle.discountPct || 0) / 100) *
                                  (cycle === 'annual'
                                    ? 1 - t.annualDiscountPct / 100
                                    : 1),
                              );
                        price =
                          pu == null ? 'Custom' : '$' + pu + '/user/mo';
                      }
                      return (
                        <button
                          key={t.tier}
                          className={'ob-tier' + (cur ? ' on' : '')}
                          onClick={() => setTier(t.tier)}
                        >
                          <span className="ob-tier-h">
                            <span className="ob-tier-n">{t.name}</span>
                            <span
                              className={
                                'rd-chip tone-' + (cur ? 'ai' : 'idle')
                              }
                            >
                              {t.tier}
                            </span>
                          </span>
                          <span className="ob-tier-p">{price}</span>
                          <span className="ob-tier-s">
                            {model === 'dtc'
                              ? _lim(t.maxUsers) +
                                ' users - ' +
                                _lim(t.maxProjects) +
                                ' projects'
                              : t.includedTokensMonthly / 1000000 +
                                'M tokens/user - ' +
                                _lim(t.maxProjects) +
                                ' projects'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <div className="pj-seclbl" style={{ marginTop: 0 }}>
                    Invite personnel{' '}
                    <span
                      style={{
                        color: 'var(--text-400)',
                        fontWeight: 400,
                        textTransform: 'none',
                        letterSpacing: 0,
                      }}
                    >
                      - role grants on this platform are governed &amp; audited
                      (21 CFR Part 11)
                    </span>
                  </div>
                  {invites.map((inv, i) => (
                    <div key={i} className="ob-invite">
                      <input
                        className="ob-in"
                        style={{ flex: 1, margin: 0 }}
                        placeholder="name@org.com"
                        value={inv.email}
                        onChange={(e) =>
                          setInvite(i, 'email', e.target.value)
                        }
                      />
                      <select
                        value={inv.role}
                        onChange={(e) =>
                          setInvite(i, 'role', e.target.value)
                        }
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      {invites.length > 1 && (
                        <button
                          className="ob-rm"
                          onClick={() => rmInvite(i)}
                        >
                          {I.close || '×'}
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    className="sp-ask"
                    style={{ marginTop: 8 }}
                    onClick={addInvite}
                  >
                    {I.plus} Add another
                  </button>
                  <div className="scaf-note" style={{ marginTop: 12 }}>
                    Business-tier roles (owner, business_admin, super_admin)
                    confer finance access and can only be granted by a business
                    administrator.
                  </div>
                </div>
              )}

              {step === 4 && (
                <div>
                  <div className="pj-seclbl" style={{ marginTop: 0 }}>
                    Modules provisioned for the{' '}
                    <b>&nbsp;{tier}&nbsp;</b> tier
                  </div>
                  <div className="scaf-note" style={{ marginBottom: 10 }}>
                    Once the plan is active, {org.name || 'your organization'} is
                    auto-provisioned every module its tier qualifies for
                    (provisionModulesForTier - tier level{' '}
                    {tierLevel[tier] ?? '—'}).
                  </div>
                  <div className="ob-mods">
                    {provisionedFeatures().map((f, i) => (
                      <span key={i} className="ob-mod">
                        {I.check} {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="ob-review">
                  {(
                    [
                      ['Organization', org.name || '—'],
                      [
                        'Type',
                        (
                          archetypes.find(
                            (a) => a.id === org.archetype,
                          ) || ({} as any)
                        ).label,
                      ],
                      [
                        'Pricing model',
                        model === 'dtc'
                          ? 'Self-service'
                          : 'Enterprise (per-user)',
                      ],
                      ['Plan', selTier.name + ' - ' + tier],
                      [
                        'Billing',
                        cycle +
                          (model === 'b2b'
                            ? ' - ' +
                              seats +
                              ' seats' +
                              (bundle.label ? ' - ' + bundle.label : '')
                            : ''),
                      ],
                      [
                        'Personnel',
                        invites.filter((x) => x.email).length +
                          ' to invite',
                      ],
                    ] as [string, string][]
                  ).map(([k, v], i) => (
                    <div key={i} className="ob-rev-row">
                      <span className="k">{k}</span>
                      <span className="v">{v}</span>
                    </div>
                  ))}
                  <div className="cm-pushbar" style={{ marginTop: 16 }}>
                    <button
                      className="sp-primary"
                      disabled={activating}
                      onClick={() => {
                        void activate();
                      }}
                    >
                      {I.rocket || I.check}{' '}
                      {activating
                        ? 'Activating…'
                        : tier === 'enterprise'
                          ? 'Request Enterprise onboarding'
                          : model === 'dtc' && selTier.trialDays > 0
                            ? 'Start ' + selTier.trialDays + '-day trial'
                            : 'Activate workspace'}
                    </button>
                  </div>
                </div>
              )}

              {!outcome && (
                <div className="ob-nav">
                  <button
                    className="sp-ask"
                    disabled={step === 0}
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                  >
                    {I.arrowLeft || '‹'} Back
                  </button>
                  <span className="ob-nav-c">
                    Step {step + 1} of {STEPS.length}
                  </span>
                  {step < STEPS.length - 1 ? (
                    <button
                      className="sp-primary"
                      disabled={!canNext}
                      onClick={() => setStep((s) => s + 1)}
                    >
                      Continue {I.arrowRight || '›'}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
