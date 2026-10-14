import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import {
  LIC_ARCHETYPES,
  LIC_DTC,
  LIC_PRICING,
  LIC_TIER_LEVEL,
  licBundle as licBundleOf,
} from '../fixtures/onboarding-data';
import { getAuthHeaders, getOrgId } from '@/utils/authToken';
import { probeAuditRowOutcome, serverMessage } from '@/lib/queryClient';
import { useLiveData } from '../dataConnect';
import { GatewayAccountsSetting } from './GatewayAccountsSetting';
import { emptyDiscovery, parseDiscovery, onboardingDiscoverySchema, type OnboardingDiscovery } from '@shared/types/onboarding-discovery';
import { ASSIGNABLE_ORG_ROLES } from '@shared/constants/org-roles';
import { DiscoveryQuestionnaire } from '../onboarding/DiscoveryQuestionnaire';
import { DiscoveryReview } from '../onboarding/DiscoveryReview';
import { OnboardingSecurity } from '../onboarding/OnboardingSecurity';
import { invitationOutcome, type InvitationOutcome } from '../onboarding/invitationOutcome';
import { InvitationResults } from '../onboarding/InvitationResults';
import { changedDiscoveryFields, hydrateDiscoveryDraft } from '../onboarding/discoveryDraft';
import '../styles/project-home-v2.css';

const STEPS = ['Organization', 'Your work', 'Project discovery', 'Pricing model', 'Choose plan', 'Invite personnel', 'Modules', 'Agency accounts', 'Security & setup', 'Review & activate'];

/* ── Helpers ── */

function _lim(n: number): string | number {
  return n === -1 ? 'Unlimited' : n;
}

import {
  archetypeToPrimaryIndustry, primaryIndustryToArchetype, inviteNameFromEmail,
  checkoutRequestFor, contactFromStoredUser, isUsableEmail, enterpriseRequestBody,
  type OnboardingContact, type ActivationOutcome,
} from '../onboarding/activationPlan';
export * from '../onboarding/activationPlan';

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

export function Onboarding({ onAsk, onNav }: SurfaceViewProps) {
  const [step, setStep] = useState(0);
  const [org, setOrg] = useState({ name: '', archetype: 'virtual_biotech' });
  /* This wizard sets up the organisation the person is signed into — its
     writes go to that organisation's own record (PATCH /api/organizations/:id
     /profile, PATCH /api/mdx/industry-profile). It opened with a blank name
     and "Virtual biotech" pre-selected, under "new organization", so a
     person who believed they were creating a second organisation overwrote
     the first: an untouched archetype wrote biotech_pharma over whatever the
     org actually was (launch sweep finding 85, 2026-09-23). The form now
     starts from the organisation's recorded name and industry, once, and
     never over something the person has already typed or picked. */
  const orgIdForProfile = getOrgId();
  const [readAttempt, setReadAttempt] = useState(0);
  const orgRead = useLiveData<{ organization?: { name?: string | null } }>(
    orgIdForProfile ? `/api/organizations/${encodeURIComponent(String(orgIdForProfile))}` : null,
    [orgIdForProfile],
  );
  const profileRead = useLiveData<{ primaryIndustry?: string | null; defaultMarkets?: string[]; defaultPathways?: string[]; defaultApprovalRigor?: OnboardingDiscovery['setup']['approvalRigor'] } | null>('/api/mdx/industry-profile', [readAttempt]);
  const [discovery, setDiscovery] = useState<OnboardingDiscovery>(emptyDiscovery);
  const discoveryEdited = useRef(new Set<string>());
  const discoveryRead = useLiveData<{ settings?: { onboardingDiscovery?: unknown } }>(
    orgIdForProfile ? `/api/organizations/${encodeURIComponent(String(orgIdForProfile))}/settings` : null,
    [orgIdForProfile, readAttempt],
  );
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const savedDiscoveryRaw = discoveryRead.data?.settings?.onboardingDiscovery;
  const unsupportedDiscovery = savedDiscoveryRaw != null && parseDiscovery(savedDiscoveryRaw) === null;
  useEffect(() => {
    if (discoveryRead.loading || discoveryRead.error || profileRead.loading || profileRead.error) return;
    const saved = parseDiscovery(discoveryRead.data?.settings?.onboardingDiscovery);
    const initial = emptyDiscovery();
    initial.company.markets = profileRead.data?.defaultMarkets ?? [];
    initial.company.pathways = profileRead.data?.defaultPathways ?? [];
    initial.setup.approvalRigor = profileRead.data?.defaultApprovalRigor ?? null;
    setDiscovery((d) => hydrateDiscoveryDraft(d, saved ?? initial, discoveryEdited.current));
  }, [discoveryRead.data, discoveryRead.loading, discoveryRead.error, profileRead.data, profileRead.loading, profileRead.error]);
  const changeDiscovery = (next: OnboardingDiscovery) => {
    changedDiscoveryFields(discovery, next).forEach((field) => discoveryEdited.current.add(field));
    setDiscovery(next); setDiscoveryError(null);
  };
  const currentOrgName = orgRead.data?.organization?.name?.trim() || null;
  const edited = useRef({ name: false, archetype: false });
  useEffect(() => {
    if (currentOrgName && !edited.current.name) setOrg((o) => ({ ...o, name: currentOrgName }));
  }, [currentOrgName]);
  useEffect(() => {
    const recorded = primaryIndustryToArchetype(profileRead.data?.primaryIndustry);
    if (recorded && !edited.current.archetype) setOrg((o) => ({ ...o, archetype: recorded }));
  }, [profileRead.data]);
  const [model, setModel] = useState('dtc');
  const [tier, setTier] = useState('standard');
  const [cycle, setCycle] = useState('annual');
  const [seats, setSeats] = useState(5);
  const [invites, setInvites] = useState([{ email: '', role: 'member' }]);
  const [outcome, setOutcome] = useState<ActivationOutcome | null>(null);
  const [activating, setActivating] = useState(false);
  /* Who our team replies to about an enterprise onboarding request. Prefilled
     from the signed-in user's own session payload; editable, because the person
     configuring the workspace is not always the person to contact. */
  const [contact, setContact] = useState<OnboardingContact>(() => {
    try {
      return (
        contactFromStoredUser(sessionStorage.getItem('trialsage_user')) ??
        contactFromStoredUser(localStorage.getItem('trialsage_user')) ?? { name: '', email: '' }
      );
    } catch {
      return { name: '', email: '' };
    }
  });

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
  const roles = ASSIGNABLE_ORG_ROLES.map((id) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) }));
  const tierLevel: Record<string, number> = LIC_TIER_LEVEL;

  /* `onNav` comes from the shell (V2App passes it to every surface). A local
     one used to SHADOW it here, and its entire body was
     `localStorage.setItem('c2c_open_surface', id)` — a key nothing has ever
     read. So "Create your first project" and "Open admin console" were buttons
     that did nothing at all when clicked. */

  const setInvite = (i: number, k: string, v: string) =>
    setInvites((a) =>
      a.map((x, j) => (j === i ? { ...x, [k]: v } : x)),
    );
  const addInvite = () =>
    setInvites((a) => [...a, { email: '', role: 'member' }]);
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
    const validatedDiscovery = onboardingDiscoverySchema.safeParse(discovery);
    if (!validatedDiscovery.success || !discovery.company.goals.trim() || discovery.company.useCases.length === 0) {
      setDiscoveryError('Review your discovery answers: a company goal, a workspace use, and valid field values are required.');
      return;
    }
    setActivating(true);
    setDiscoveryError(null);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    };

    // Save discovery first: a refusal leaves this review open, before billing
    // or invitations run. The existing writer commits its audit atomically.
    if (!orgIdForProfile || discoveryRead.loading || discoveryRead.error || profileRead.loading || profileRead.error || unsupportedDiscovery) {
      setDiscoveryError('The organization setup record could not be read. Try loading it again before activation.');
      setActivating(false);
      return;
    }
    try {
      const path = `/api/organizations/${encodeURIComponent(String(orgIdForProfile))}/settings`;
      const res = await fetch(path, { method: 'PATCH', headers, credentials: 'include', body: JSON.stringify({
        settings: { onboardingDiscovery: validatedDiscovery.data }, reason: 'Client discovery reviewed during workspace activation.',
      }) });
      probeAuditRowOutcome('PATCH', path, res);
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.success !== true) {
        setDiscoveryError(serverMessage(body) || 'Discovery answers were not saved. Review your access and try again.');
        setActivating(false);
        return;
      }
    } catch {
      setDiscoveryError('Could not reach the server to save discovery answers. Your answers are still here; try again.');
      setActivating(false);
      return;
    }

    /* ── 0. The organization's NAME ─────────────────────────────────────────
       Step 1 required it — `canNext = org.name.trim().length > 1`, so the
       wizard could not be advanced without typing it — and then it was sent
       nowhere. The user named their organization, completed the whole
       activation, and the record still carried whatever name it was created
       with. The summary panel at the end even printed the typed name back to
       them, which is what made the loss invisible.

       PATCH /api/organizations/:id/profile is the governed write (the same one
       Admin → Setup uses); it audits a reason for change, so this one states
       what it is. */
    let nameSaved = false;
    const typedName = org.name.trim();
    const orgIdForName = getOrgId();
    if (typedName && orgIdForName) {
      try {
        const res = await fetch(`/api/organizations/${encodeURIComponent(String(orgIdForName))}/profile`, {
          method: 'PATCH',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            name: typedName,
            reason: 'Organization name set during workspace activation.',
          }),
        });
        // A raw fetch, so the transport's audit-row check runs here explicitly:
        // a saved name whose audit entry was lost is reported, not hidden.
        probeAuditRowOutcome('PATCH', '/api/organizations/:id/profile', res);
        nameSaved = res.ok;
      } catch {
        nameSaved = false;
      }
    }

    // 1. Governed org industry profile (audited upsert).
    let profileSaved = false;
    try {
      const res = await fetch('/api/mdx/industry-profile', {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          primaryIndustry: archetypeToPrimaryIndustry(org.archetype),
          defaultMarkets: discovery.company.markets,
          defaultPathways: discovery.company.pathways,
          defaultApprovalRigor: discovery.setup.approvalRigor,
          reason: 'Organization industry set during workspace activation.',
        }),
      });
      probeAuditRowOutcome('PATCH', '/api/mdx/industry-profile', res);
      profileSaved = res.ok;
    } catch {
      profileSaved = false;
    }

    // 2. Personnel invites — real org membership / invitation rows.
    const pending = invites.filter((x) => x.email.trim());
    let invitesSent = 0;
    const invitesFailed: string[] = [];
    const invitations: InvitationOutcome[] = [];
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
            role: inv.role,
            organizationId: getOrgId(),
          }),
        });
        probeAuditRowOutcome('POST', '/api/tenant-users', res);
        const reply = invitationOutcome(email, res.status, await res.json().catch(() => null));
        invitations.push(reply);
        if (reply.recorded) invitesSent += 1;
        if (!reply.recorded || reply.state === 'activation-failed' || reply.state === 'delivery-unconfirmed') invitesFailed.push(email);
      } catch {
        invitations.push(invitationOutcome(email, 0, null));
        invitesFailed.push(email);
      }
    }

    /* ── 3a. The enterprise onboarding request ─────────────────────────────
       The review step's primary button says "Request Enterprise onboarding".
       Its entire effect was `checkoutRequestFor` returning `unavailable` and
       activate() falling through — a prospect completed six steps, asked for
       enterprise onboarding, and no request of any kind was created or sent to
       anybody. The summary then said "no plan was provisioned", which was true
       and beside the point: nothing had been REQUESTED either.

       POST /api/auth/license-request is the real intake and always was: public,
       rate-limited (5/hour), zod-validated, and it INSERTS a licence_requests
       row (status 'pending', created_at) for our team to work. It had no caller
       anywhere in the client — a documented sales intake with a writer that was
       never built. This is that writer.

       It is fired only for the enterprise tier, and only with an address: with
       no contact the request is NOT sent and the summary says so, because a
       request nobody can reply to is not a request. */
    let enterpriseRequest: ActivationOutcome['enterpriseRequest'] = 'not-requested';
    let enterpriseNote: string | null = null;
    if (tier === 'enterprise') {
      if (!isUsableEmail(contact.email)) {
        enterpriseRequest = 'no-contact';
        enterpriseNote =
          'No request was sent — no contact email was given, and our team would have had no way to reply. Add one and activate again.';
      } else {
        try {
          const res = await fetch('/api/auth/license-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(
              enterpriseRequestBody({
                contact,
                organization: typedName,
                archetypeLabel:
                  (archetypes.find((a) => a.id === org.archetype) || ({} as any)).label ||
                  org.archetype,
                model,
                planName: selTier.name || 'Enterprise',
                cycle,
                seats,
                inviteCount: invites.filter((x) => x.email.trim()).length,
              }),
            ),
          });
          if (res.ok) {
            enterpriseRequest = 'sent';
            enterpriseNote = `Request recorded for ${contact.email.trim()} — our team reviews enterprise onboarding requests and replies to that address.`;
          } else {
            enterpriseRequest = 'failed';
            const body = await res.json().catch(() => null);
            const why =
              // Was `body.error.message || body.error` — a by-hand envelope read
              // that carried an enum token or internal text straight to the UI.
              serverMessage(body) ??
              (res.status === 429
                ? 'too many requests from here in the last hour'
                : 'the intake did not say why');
            enterpriseNote = `The request was NOT recorded — ${why}. Nothing was sent; retry, or email our team directly.`;
          }
        } catch {
          enterpriseRequest = 'failed';
          enterpriseNote =
            'Could not reach the onboarding intake — the request was NOT recorded. Retry, or email our team directly.';
        }
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
        // The free tier has nothing to charge: the service provisioned the plan
        // itself and answers `sessionId: 'free'` with the success URL. Following
        // that URL would bounce the user to a "checkout=success" screen for a
        // checkout that never happened, so the wizard reports the plan as live
        // and stays put — the outcome panel already offers the next step.
        if (data && data.sessionId === 'free') {
          checkout = 'provisioned';
          checkoutNote = null;
        } else if (typeof url === 'string' && url) {
          checkout = 'redirecting';
          checkoutUrl = url;
        } else {
          checkout = 'failed';
          checkoutNote =
            'The billing service did not return a checkout link — no plan was provisioned. Retry from Usage & Billing.';
        }
      } catch {
        checkout = 'failed';
        checkoutNote =
          'Could not reach the billing service — no plan was provisioned. Retry from Usage & Billing.';
      }
    }

    setOutcome({
      nameSaved,
      discoverySaved: true,
      profileSaved,
      invitesAttempted: pending.length,
      invitesSent,
      invitesFailed,
      invitations,
      checkout,
      checkoutNote,
      checkoutUrl,
      enterpriseRequest,
      enterpriseNote,
    });
    setActivating(false);
    // Keep the outcome and setup links in view. The customer continues to the
    // checkout explicitly after reviewing the handoff; never lose these links
    // to an automatic payment redirect.
  };

  const discoveryValidation = onboardingDiscoverySchema.safeParse(discovery);
  const validDiscovery = discoveryValidation.success;
  const validInvites = invites.every((x) => !x.email.trim() || isUsableEmail(x.email)) &&
    new Set(invites.filter((x) => x.email.trim()).map((x) => x.email.trim().toLowerCase())).size === invites.filter((x) => x.email.trim()).length;
  const canNext = step === 0 ? org.name.trim().length > 1 : step === 1
    ? discovery.company.goals.trim().length > 0 && discovery.company.useCases.length > 0 && validDiscovery
    : step === 2 ? validDiscovery : step === 5 ? validInvites : true;

  /* WHAT ANA SEES HERE. Identity stays off the wire: invite addresses, the
     contact's name/email, the failed-invite strings (which may embed addresses)
     and the Stripe checkout URL are never published. After activation the
     summary reports each step's real outcome — partial reads as partial. */
  const anaContext = useMemo(() => {
    const inviteCount = invites.filter((x) => x.email.trim()).length;
    const facts: Record<string, unknown> = {
      step,
      stepLabel: STEPS[step],
      pricingModel: model,
      tier,
      cycle,
      seats,
      archetype: org.archetype,
      organizationNameEntered: org.name.trim().length > 0,
      inviteCount,
      useCaseCount: discovery.company.useCases.length,
      discoveryProductContext: discovery.project.productType,
      discoveryExperience: discovery.user.sophistication,
      discoveryGuidance: discovery.user.preferredGuidance,
    };
    let summary: string;
    if (outcome) {
      facts.activationOutcome = {
        nameSaved: outcome.nameSaved,
        discoverySaved: outcome.discoverySaved,
        profileSaved: outcome.profileSaved,
        invitesAttempted: outcome.invitesAttempted,
        invitesSent: outcome.invitesSent,
        invitesFailedCount: outcome.invitesFailed.length,
        checkout: outcome.checkout,
        enterpriseRequest: outcome.enterpriseRequest,
      };
      const parts = [
        outcome.nameSaved ? 'organization name saved' : 'organization name not saved',
        outcome.profileSaved ? 'industry profile saved' : 'industry profile not saved',
        outcome.invitesAttempted === 0
          ? 'no invitations requested'
          : `${outcome.invitesSent} of ${outcome.invitesAttempted} invitation(s) recorded` +
            (outcome.invitesFailed.length ? ` (${outcome.invitesFailed.length} need follow-up)` : ''),
        outcome.checkout === 'provisioned'
          ? 'plan provisioned (nothing to pay)'
          : outcome.checkout === 'redirecting'
          ? 'secure checkout link ready; payment not yet completed'
            : `checkout ${outcome.checkout}` +
              (outcome.checkoutNote ? ` — ${outcome.checkoutNote}` : ''),
      ];
      if (outcome.enterpriseRequest !== 'not-requested') {
        parts.push(
          outcome.enterpriseRequest === 'sent'
            ? 'an enterprise onboarding request was recorded for our team to review'
            : outcome.enterpriseRequest === 'no-contact'
              ? 'no enterprise request was sent — no contact email was given'
              : 'the enterprise onboarding request was NOT recorded',
        );
      }
      summary = `Workspace activation summary — ${parts.join('; ')}.`;
    } else if (activating) {
      summary =
        'Workspace setup — activation is running; profile, invitations and checkout have not all reported.';
    } else {
      summary =
        `Workspace setup wizard, step ${step + 1} of ${STEPS.length} (${STEPS[step]}). ` +
        'Discovery and plan choices await activation. Agency accounts and account security save through their own setup controls.';
    }
    return {
      summary,
      facts,
      // Stepping the wizard is not offered: every step fills a purchase order.
      availableActions: [
        'Explain what this step configures and what Activate will and will not do',
        'Explain the pricing models, plan tiers and what each tier provisions',
      ],
    };
  }, [step, activating, outcome, org.name, org.archetype, model, tier, cycle, seats, invites, discovery]);
  usePublishSurfaceContext('onboarding', anaContext);

  return (
    <div className="sp" style={{ maxWidth: 960 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Onboarding {I.dot} {currentOrgName ?? 'your organization'}</div>
          <h1 className="sp-title">Set up your workspace</h1>
          <p className="sp-state">
            Discover your company's needs, your work and first project, then
            choose a plan, invite your team and review security and agency setup.
            Changes here are saved to this organization's own record.
          </p>
        </div>
      </div>

      {discoveryRead.loading && <div className="scaf-note" role="status">Loading saved setup…</div>}
      <div className="ob-steps" aria-label="Workspace setup steps">
        {STEPS.map((s, i) => (
          <div
            key={i}
            className={
              'ob-step' + (i === step ? ' on' : '') + (i < step ? ' done' : '')
            }
            aria-current={i === step ? 'step' : undefined}
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
                  ? 'Your setup summary — checkout is ready'
                  : (org.name || 'Your workspace') + ' — activation summary'}
              </h2>
              <div className="ob-review" style={{ textAlign: 'left' }}>
                <div className="ob-rev-row"><span className="k">Discovery answers</span><span className="v">Saved to your organization's setup record.</span></div>
                {/* One row, once. This was rendered twice with two different
                    wordings for the same fact — a summary that says the same
                    thing twice invites the reader to look for the difference. */}
                <div className="ob-rev-row">
                  <span className="k">Organization name</span>
                  <span className="v">
                    {outcome.nameSaved
                      ? 'Saved — recorded on the organization (audited).'
                      : 'Not saved — set it in Admin → Setup.'}
                  </span>
                </div>
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
                    {outcome.invitesAttempted === 0 ? 'No invitations requested.' : 'See each invitation outcome below.'}
                  </span>
                </div>
                {outcome.enterpriseRequest !== 'not-requested' && (
                  <div className="ob-rev-row">
                    <span className="k">Enterprise onboarding</span>
                    <span className="v">{outcome.enterpriseNote}</span>
                  </div>
                )}
                <div className="ob-rev-row">
                  <span className="k">Plan</span>
                  <span className="v">
                    {outcome.checkout === 'provisioned'
                      ? 'Provisioned — the ' +
                        selTier.name +
                        ' plan is active on this organization and the ' +
                        tier +
                        '-tier modules are enabled. Nothing to pay.'
                      : outcome.checkout === 'redirecting'
                      ? 'Secure checkout is ready for the ' +
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
                {/* The "Workspace name — not yet persisted" row that used to
                    sit here contradicted the Organization name row above it
                    (which reports the audited PATCH that does persist it).
                    Two rows about one fact, disagreeing, is worse than either. */}
              </div>
              <InvitationResults invitations={outcome.invitations} />
              <DiscoveryReview value={discovery} />
              <div
                className="cm-pushbar"
                style={{ justifyContent: 'center', marginTop: 16 }}
              >
                {outcome.checkoutUrl && <button className="sp-primary" onClick={() => window.location.assign(outcome.checkoutUrl!)}>Continue to secure checkout</button>}
                <button
                  className="sp-primary"
                  onClick={() => { window.__C2C_NEW_PROJECT = true; onNav('projects'); }}
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
                    aria-label="Organization name" placeholder="e.g. Bright Biosciences"
                    value={org.name}
                    maxLength={120}
                    onChange={(e) =>
                      { edited.current.name = true; setOrg({ ...org, name: e.target.value }); }
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
                          { edited.current.archetype = true; setOrg({ ...org, archetype: a.id }); }
                        }
                      >
                        <span className="ob-arch-l">{a.label}</span>
                        <span className="ob-arch-f">
                          {a.family} pricing
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="scaf-note" style={{ marginTop: 12 }}>Have a company profile, protocol or prior filing? You can set up from a document and review every proposed value.</div>
                  <button className="sp-ask" onClick={() => onNav('onboarding-ingest')}>{I.upload} Set up from a document</button>
                </div>
              )}

              {(step === 1 || step === 2) && <DiscoveryQuestionnaire stage={step === 1 ? 'company' : 'project'} value={discovery} onChange={changeDiscovery} onAsk={onAsk} />}
              {(step === 1 || step === 2) && !discoveryValidation.success && <div className="scaf-note" role="alert">Review your entries: {[...new Set(discoveryValidation.error.issues.map((issue) => issue.message))].join(' ')}</div>}

              {step === 3 && (
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
                      {I.building} Enterprise (per-user)
                    </div>
                    <div className="ob-model-d">
                      Per-user pricing tuned to your archetype, seat bundle
                      discounts, AI token allowances, SSO/SCIM and compliance
                      packs. Best for teams &amp; regulated orgs.
                    </div>
                  </button>
                </div>
              )}

              {step === 4 && (
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
                        <label htmlFor="ob-seats">Seats</label>
                        <input
                          id="ob-seats"
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

              {step === 5 && (
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
                        id={`ob-invite-email-${i}`}
                        aria-label={`Email for invitee ${i + 1}`}
                        className="ob-in"
                        style={{ flex: 1, margin: 0 }}
                        placeholder="name@org.com"
                        value={inv.email}
                        onChange={(e) =>
                          setInvite(i, 'email', e.target.value)
                        }
                      />
                      <select
                        id={`ob-invite-role-${i}`}
                        aria-label={`Role for invitee ${i + 1}`}
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
                          aria-label="Remove invite"
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
                    These are organization roles. Reviewer and approver roles can sign;
                    authors cannot approve their own documents. Platform and finance
                    access are granted separately through governed access management.
                  </div>
                  {!validInvites && <div className="scaf-note" role="alert">Use a valid email for each person and remove duplicate addresses before continuing.</div>}
                </div>
              )}

              {step === 6 && (
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

              {step === 7 && (
                <GatewayAccountsSetting
                  note={
                    <div className="scaf-note">
                      Nothing is needed here to activate: the platform account is used
                      until you choose your own. You can change this at any time in
                      Admin, Setup.
                    </div>
                  }
                />
              )}

              {step === 8 && <OnboardingSecurity onNav={onNav} />}

              {step === 9 && (
                <div className="ob-review">
                  <DiscoveryReview value={discovery} />
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
                  {/* Enterprise has no self-service checkout, so the button
                      below files a real licence request instead. It needs an
                      address to reply to — asked for here rather than guessed
                      from the invite list, and stated plainly so the prospect
                      knows what the button will actually do. */}
                  {tier === 'enterprise' && (
                    <div style={{ marginTop: 14 }}>
                      <div className="pj-seclbl" style={{ marginTop: 0 }}>
                        Who should we contact
                      </div>
                      <div className="scaf-note" style={{ marginBottom: 10 }}>
                        Enterprise pricing is finalized with our team, so this does not
                        provision a plan. It records an onboarding request — your
                        selections above included — that our team reviews and replies to.
                      </div>
                      <div className="ob-invite">
                        <input
                          className="ob-in"
                          style={{ flex: 1, margin: 0 }}
                          aria-label="Contact name"
                          placeholder="Contact name"
                          value={contact.name}
                          onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                        />
                        <input
                          className="ob-in"
                          style={{ flex: 1, margin: 0 }}
                          aria-label="Contact email"
                          placeholder="name@org.com"
                          value={contact.email}
                          onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                        />
                      </div>
                      {!isUsableEmail(contact.email) && (
                        <div className="scaf-note" style={{ marginTop: 8 }}>
                          A contact email is required — without one there is nobody for
                          our team to reply to, so no request would be sent.
                        </div>
                      )}
                    </div>
                  )}
                  <div className="cm-pushbar" style={{ marginTop: 16 }}>
                    <button
                      className="sp-primary"
                      disabled={
                        activating || !orgIdForProfile || discoveryRead.loading || Boolean(discoveryRead.error) || profileRead.loading || Boolean(profileRead.error) || unsupportedDiscovery || !validDiscovery || !validInvites || (tier === 'enterprise' && !isUsableEmail(contact.email))
                      }
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

              <div role="alert" className={discoveryError ? 'scaf-note' : 'sr-only'}>{discoveryError}</div>
              {(discoveryRead.error || profileRead.error) && <div className="scaf-note" role="alert">Your saved discovery answers or industry profile could not be loaded. <button className="sp-ask" onClick={() => setReadAttempt((n) => n + 1)}>Load setup again</button></div>}
              {unsupportedDiscovery && <div className="scaf-note" role="alert">The saved discovery record could not be understood. Ask your administrator to review it before replacing it.</div>}

              {!outcome && (
                <div className="ob-nav">
                  <button
                    className="sp-ask"
                    disabled={step === 0 || activating}
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                  >
                    {I.left} Back
                  </button>
                  <span className="ob-nav-c">
                    Step {step + 1} of {STEPS.length}
                  </span>
                  {step < STEPS.length - 1 ? (
                    <button
                      className="sp-primary"
                      disabled={!canNext || activating}
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
