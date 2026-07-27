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
import '../styles/project-home-v2.css';

/* ── Helpers ── */

function _lim(n: number): string | number {
  return n === -1 ? 'Unlimited' : n;
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
   nothing here is fabricated sample data. `activate()` is a flagged MOCK
   ACTION — see the comment at that function. */

export function Onboarding({ onAsk }: SurfaceViewProps) {
  const [step, setStep] = useState(0);
  const [org, setOrg] = useState({ name: '', archetype: 'virtual_biotech' });
  const [model, setModel] = useState('dtc');
  const [tier, setTier] = useState('standard');
  const [cycle, setCycle] = useState('annual');
  const [seats, setSeats] = useState(5);
  const [invites, setInvites] = useState([{ email: '', role: 'owner' }]);
  const [done, setDone] = useState(false);

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

  // FLAG — MOCK ACTION (for the actions pass): this fakes activation. Real
  // endpoints exist and should be wired here: DTC self-service -> POST
  // /api/billing/dtc-checkout (returns a Stripe Checkout URL to redirect to;
  // the free tier provisions immediately), per-user / enterprise -> POST
  // /api/billing/checkout, and personnel invites -> the access-management grant
  // API. Until then no workspace is created, no trial starts, no plan is
  // provisioned, and no invites are sent — the done-screen copy below is
  // written honestly to reflect that activation happens through billing
  // checkout, not here.
  const activate = () => {
    setDone(true);
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
          {done ? (
            <div className="ob-done">
              <div className="ob-done-ic">{I.checkCircle || I.check}</div>
              <h2>{org.name || 'Your workspace'} is ready to activate</h2>
              <p>
                {tier === 'enterprise'
                  ? 'Enterprise plans use custom pricing finalized with our team.'
                  : model === 'dtc' && selTier.trialDays > 0
                    ? 'Next: start your ' +
                      selTier.trialDays +
                      '-day trial on the ' +
                      selTier.name +
                      ' plan through secure checkout.'
                    : 'Next: activate the ' +
                      selTier.name +
                      ' plan through secure checkout.'}
                {' '}Modules for the {tier} tier are provisioned automatically
                once the plan is active.
              </p>
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
                    <button className="sp-primary" onClick={activate}>
                      {I.rocket || I.check}{' '}
                      {tier === 'enterprise'
                        ? 'Request Enterprise onboarding'
                        : model === 'dtc' && selTier.trialDays > 0
                          ? 'Start ' + selTier.trialDays + '-day trial'
                          : 'Activate workspace'}
                    </button>
                  </div>
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
