import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag, connected } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { getJwtOrgId } from '@/utils/authToken';
import { useLiveB2bPricing, useLiveDtcPricing } from '../livePricing';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  LIC_ARCHETYPES,
  LIC_DTC,
  LIC_PRICING,
  LIC_TIER_LEVEL,
  licBundle as licBundleOf,
} from '../fixtures/onboarding-data';
import '../styles/project-home-v2.css';

/* ── Helpers ── */

function _lim(n: number): string | number {
  return n === -1 ? 'Unlimited' : n;
}

/* Org-membership roles — the REAL vocabulary of organization_users.role
   (tenant-users.ts createUserSchema). Platform/business roles (owner,
   business_admin, …) are platform_role_grants and are granted from the Admin
   console, not from workspace onboarding. */
const ORG_ROLES: Array<{ id: string; label: string }> = [
  { id: 'admin', label: 'Admin' },
  { id: 'manager', label: 'Manager' },
  { id: 'member', label: 'Member' },
  { id: 'viewer', label: 'Viewer' },
];

/** organizations.client_type from the chosen archetype (tenant IA segment). */
function clientTypeForArchetype(archetypeId: string, family: string): string {
  if (family === 'medtech') return 'medtech';
  if (archetypeId === 'biotech' || archetypeId === 'virtual_biotech') return 'biotech';
  if (archetypeId === 'cro') return 'cro';
  return 'pharma';
}

/** What actually happened on activation — rendered verbatim on the done screen. */
interface ActivationResult {
  live: boolean;
  profileSaved: boolean;
  invitesCreated: number;
  invitesPendingConsent: number;
  inviteFailures: string[];
  checkoutOpened: boolean;
  error: string | null;
}

/* ── Onboarding wizard ──
   Grounded in the real org model and wired to the real backend:
     PATCH /api/organizations/:id/profile   (governed, audited) — org name +
           client type from the chosen archetype
     POST  /api/tenant-users                — one membership/invitation per
           personnel row (organization_invitations for cross-org emails)
     POST  /api/billing/checkout | /dtc-checkout — Stripe Checkout session
   Offline/unauthenticated the wizard stays fully explorable but activation
   provisions nothing and says so — it never fakes a workspace. */

export function Onboarding({ onAsk }: SurfaceViewProps) {
  const [step, setStep] = useState(0);
  const [org, setOrg] = useState({ name: '', archetype: 'virtual_biotech' });
  const [model, setModel] = useState('dtc');
  const [tier, setTier] = useState('standard');
  const [cycle, setCycle] = useState('annual');
  const [seats, setSeats] = useState(5);
  const [invites, setInvites] = useState([{ email: '', role: 'admin' }]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActivationResult | null>(null);

  const archetypes: Array<{ id: string; label: string; family: string }> = LIC_ARCHETYPES;
  const family =
    (archetypes.find((a) => a.id === org.archetype) || ({} as any)).family ||
    'pharma';
  /* Plan cards adopt the live /api/billing price book (fail-closed to the
     curated fixtures) — the same numbers Stripe charges at checkout. */
  const dtcPricing = useLiveDtcPricing(LIC_DTC);
  const b2bPricing = useLiveB2bPricing(
    family,
    (LIC_PRICING[family] || LIC_PRICING.pharma || []) as any,
  );
  const tiers: any[] = model === 'dtc' ? dtcPricing.tiers : b2bPricing.tiers;
  const selTier: any = tiers.find((t: any) => t.tier === tier) || tiers[0] || {};
  const bundle = licBundleOf(seats);
  const roles: Array<{ id: string; label: string }> = ORG_ROLES;
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

  const activate = async () => {
    if (busy) return;
    const live = connected();
    const res: ActivationResult = {
      live,
      profileSaved: false,
      invitesCreated: 0,
      invitesPendingConsent: 0,
      inviteFailures: [],
      checkoutOpened: false,
      error: null,
    };

    if (!live) {
      // Honest sample path — nothing is provisioned and the done screen says so.
      setResult(res);
      setDone(true);
      return;
    }

    setBusy(true);
    const orgId = getJwtOrgId();
    const archetype = archetypes.find((a) => a.id === org.archetype);

    // 1) Governed org-profile write (name + client type + industry mode).
    try {
      const pr = await apiRequest(
        'PATCH',
        `/api/organizations/${encodeURIComponent(orgId)}/profile`,
        {
          name: org.name.trim(),
          clientType: clientTypeForArchetype(org.archetype, family),
          industryMode: org.archetype,
          reason: `Onboarding: workspace set up as ${archetype ? archetype.label : org.archetype}`,
        },
      );
      res.profileSaved = pr.ok;
      if (!pr.ok) res.error = 'Organization profile was not saved (admin role required).';
    } catch (e) {
      res.error =
        'Organization profile was not saved -- ' +
        (e instanceof Error && e.message ? e.message : 'request failed');
    }

    // 2) Personnel — one real membership/invitation per row. Sequential so
    // seat-licensing headers stay coherent; cross-org emails come back 202 as
    // pending consent invitations (organization_invitations).
    for (const inv of invites) {
      const email = inv.email.trim();
      if (!email) continue;
      try {
        const r = await apiRequest('POST', '/api/tenant-users', {
          email,
          name: email.split('@')[0],
          role: inv.role,
          organizationId: Number(orgId),
        });
        if (r.status === 202) res.invitesPendingConsent += 1;
        else if (r.ok) res.invitesCreated += 1;
        else res.inviteFailures.push(email);
      } catch (e) {
        res.inviteFailures.push(
          email + (e instanceof Error && e.message ? ` (${e.message})` : ''),
        );
      }
    }

    // 3) Stripe Checkout — skipped for enterprise (sales-led) and free tiers.
    if (tier !== 'enterprise' && selTier.baseMonthly !== 0) {
      try {
        const path = model === 'dtc' ? '/api/billing/dtc-checkout' : '/api/billing/checkout';
        const body: Record<string, unknown> =
          model === 'dtc'
            ? { tier, billingCycle: cycle }
            : { tier, billingCycle: cycle, seats };
        const cr = await apiRequest('POST', path, body);
        if (cr.ok) {
          const payload = (await cr.json().catch(() => null)) as { checkoutUrl?: string } | null;
          if (payload?.checkoutUrl) {
            window.open(payload.checkoutUrl, '_blank', 'noopener');
            res.checkoutOpened = true;
          }
        }
      } catch (_e) {
        /* Checkout not opening is reported on the done screen, never faked. */
      }
    }

    setBusy(false);
    setResult(res);
    setDone(true);
  };

  const canNext = step === 0 ? org.name.trim().length > 1 : true;

  return (
    <div className="sp" style={{ maxWidth: 960 }}>
      <SampleTag sample={!connected()} />
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
          {done ? (
            <div className="ob-done">
              <div className="ob-done-ic">{I.checkCircle || I.check}</div>
              <h2>
                {result && !result.live
                  ? 'Walkthrough complete -- nothing was provisioned'
                  : `${org.name || 'Your workspace'} is set up`}
              </h2>
              {result && !result.live ? (
                <p>
                  The backend is not reachable (not signed in), so no organization profile,
                  personnel, or billing was created. Sign in and run this wizard again to
                  activate for real.
                </p>
              ) : (
                <>
                  <p>
                    {tier === 'enterprise'
                      ? 'Our team will contact you to finalize the Enterprise agreement.'
                      : result?.checkoutOpened
                        ? 'Stripe Checkout opened in a new tab -- the ' +
                          selTier.name +
                          ' plan activates when payment completes, and modules for the ' +
                          tier +
                          ' tier auto-provision.'
                        : 'Plan checkout was not started -- open Plans & licensing to pick up the ' +
                          selTier.name +
                          ' plan.'}
                  </p>
                  {result && (
                    <div
                      className="ob-review"
                      style={{ textAlign: 'left', margin: '12px auto 0', maxWidth: 460 }}
                    >
                      <div className="ob-rev-row">
                        <span className="k">Organization profile</span>
                        <span className="v">
                          {result.profileSaved ? 'Saved -- audited' : 'Not saved'}
                        </span>
                      </div>
                      <div className="ob-rev-row">
                        <span className="k">Personnel</span>
                        <span className="v">
                          {result.invitesCreated} added
                          {result.invitesPendingConsent > 0
                            ? ` -- ${result.invitesPendingConsent} pending consent`
                            : ''}
                          {result.inviteFailures.length > 0
                            ? ` -- ${result.inviteFailures.length} failed`
                            : ''}
                        </span>
                      </div>
                      {result.inviteFailures.length > 0 && (
                        <div className="ob-rev-row">
                          <span className="k">Failed invites</span>
                          <span className="v">{result.inviteFailures.join(', ')}</span>
                        </div>
                      )}
                      {result.error && (
                        <div className="ob-rev-row">
                          <span className="k">Attention</span>
                          <span className="v">{result.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
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
                      - roles are governed &amp; audited (21 CFR Part 11)
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
                    These are organization-membership roles (organization_users).
                    Each row becomes a real member -- or, for an email that
                    already belongs to another organization, a pending
                    invitation that the person must accept. Platform and
                    finance roles are granted separately in the Admin console.
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
                    On activation, {org.name || 'your organization'} is
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
                          ' invited',
                      ],
                    ] as [string, string][]
                  ).map(([k, v], i) => (
                    <div key={i} className="ob-rev-row">
                      <span className="k">{k}</span>
                      <span className="v">{v}</span>
                    </div>
                  ))}
                  <div className="cm-pushbar" style={{ marginTop: 16 }}>
                    <button className="sp-primary" onClick={activate} disabled={busy}>
                      {I.rocket || I.check}{' '}
                      {busy
                        ? 'Activating...'
                        : tier === 'enterprise'
                          ? 'Request Enterprise onboarding'
                          : model === 'dtc' && selTier.trialDays > 0
                            ? 'Start ' + selTier.trialDays + '-day trial'
                            : 'Activate workspace'}
                    </button>
                  </div>
                  {!connected() && (
                    <div className="scaf-note" style={{ marginTop: 10 }}>
                      Not signed in -- activation will provision nothing until you
                      authenticate.
                    </div>
                  )}
                </div>
              )}

              {!done && (
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
