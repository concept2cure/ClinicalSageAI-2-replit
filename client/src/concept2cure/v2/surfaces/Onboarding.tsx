import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import {
  LIC_ARCHETYPES,
  LIC_DTC,
  LIC_PRICING,
  licBundle as licBundleOf,
} from '../fixtures/onboarding-data';
import { getAuthHeaders, getOrgId } from '@/utils/authToken';
import { probeAuditRowOutcome, serverMessage } from '@/lib/queryClient';
import { useLiveData } from '../dataConnect';
import { GatewayAccountsSetting } from './GatewayAccountsSetting';
import { useOnboardingDiscovery } from '../useOnboardingDiscovery';
import { DISCOVERY_FIELD_LABELS } from '@shared/types/onboarding-discovery';
import { DiscoveryQuestions, DISCOVERY_CONTEXT_FIELDS, DISCOVERY_PROJECT_FIELDS } from './DiscoveryQuestions';
import { OnboardingSecurity } from './OnboardingSecurity';
import { DiscoveryNextSteps } from './DiscoveryNextSteps';
import { OnboardingInvitations, invitationOutcome, type OnboardingInvitationOutcome } from './OnboardingInvitations';
import { ASSIGNABLE_ORG_ROLES, type AssignableOrgRole } from '@shared/constants/org-roles';
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

/** The wizard archetype that stands for a recorded primary industry. The
 *  mapping above is many-to-one, so this names one archetype per industry —
 *  the one whose write-back is that same industry, never a different one. */
export function primaryIndustryToArchetype(primary: string | null | undefined): string | null {
  switch (primary) {
    case 'medical_device_diagnostics':
      return 'medtech';
    case 'cro':
      return 'cro';
    case 'regulatory_consulting':
      return 'regulatory';
    case 'academic_research':
      return 'academic';
    case 'biotech_pharma':
      return 'biotech';
    default:
      return null;
  }
}

/** Org-scoped membership roles accepted by POST /api/tenant-users
 * (createUserSchema in server/routes/tenant-users.ts). */
export type OrgMemberRole = AssignableOrgRole;

/** Wizard personnel role (PLATFORM-role vocabulary, LIC_ROLES/GRANTABLE_ROLES)
 * → the org-scoped role vocabulary the invite endpoint accepts. Platform-tier
 * roles are deliberately DOWN-SCOPED: an actual platform/finance grant can only
 * be made through the governed access-management grant API
 * (POST /api/admin/access/grants — requires the target user to exist and the
 * caller to be a platform/business admin), never from this wizard. Unknown
 * roles fail closed to least-privilege 'member'. */
export function inviteRoleToOrgRole(role: string): OrgMemberRole {
  if (ASSIGNABLE_ORG_ROLES.includes(role as AssignableOrgRole)) return role as AssignableOrgRole;
  switch (role) {
    case 'admin':
    case 'owner':
    case 'business_admin':
    case 'super_admin':
      return 'admin';
    case 'platform_admin':
    case 'manager':
      return 'manager';
    case 'viewer':
      return 'viewer';
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
    // Enterprise pricing is custom (perUserMonthly/baseMonthly null), so
    // POST /api/billing/checkout cannot price it and no plan can be
    // provisioned from here. The prospect is not left with nothing: the
    // enterprise path files a real licence request instead (see
    // `enterpriseRequestBody` and step 3a of activate()).
    return {
      unavailable:
        'Enterprise plans use custom pricing finalized with our team \u2014 there is no self-service enterprise checkout, so no plan was provisioned by this wizard.',
    };
  }
  if (model === 'dtc') {
    // The free (Researcher) tier IS provisioned by the same endpoint: the
    // service's free branch sets organizations.tier='free', invalidates the
    // tenant posture and runs provisionModulesForTier(org,'free') without
    // touching Stripe (server/services/billing.ts createDTCCheckoutSession).
    // It returns `sessionId: 'free'` and the success URL rather than a Stripe
    // Checkout link — activate() reads that and reports the plan as
    // PROVISIONED instead of redirecting to a checkout that does not exist.
    // Only the route's request schema had refused the tier; it now accepts it.
    return { path: '/api/billing/dtc-checkout', body: { tier, billingCycle } };
  }
  return {
    path: '/api/billing/checkout',
    body: { tier, billingCycle, seats: Math.max(1, Math.floor(seats) || 1) },
  };
}

/** Who the enterprise onboarding request comes from. Collected explicitly on
 * the review step (prefilled from the signed-in user) rather than scavenged
 * from the invite list: an invitee is not necessarily the person our team
 * should reply to, and a request sent to the wrong address is worse than one
 * the user was asked to confirm. */
export interface OnboardingContact {
  name: string;
  email: string;
}

/** The signed-in user's own contact details from the session payload the login
 * flows store (`trialsage_user`), or null when nothing usable is there.
 * Never throws — a malformed payload just means the fields start empty. */
export function contactFromStoredUser(raw: string | null): OnboardingContact | null {
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as Record<string, unknown>;
    const email = typeof u?.email === 'string' ? u.email.trim() : '';
    if (!email) return null;
    const name =
      (typeof u?.name === 'string' && u.name.trim()) ||
      [u?.firstName, u?.lastName].filter((v) => typeof v === 'string' && v.trim()).join(' ').trim() ||
      '';
    return { name, email };
  } catch {
    return null;
  }
}

/** Enough of an address to be worth sending. The server validates properly
 * (zod .email()); this only stops the button firing a request that cannot
 * reach anyone. */
export function isUsableEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** The body POST /api/auth/license-request accepts (licenseRequestSchema in
 * server/routes/auth.ts): name, email, organization, message. The message
 * carries the whole wizard selection so the request our team reviews says what
 * the prospect actually configured, not just that someone asked. */
export function enterpriseRequestBody(input: {
  contact: OnboardingContact;
  organization: string;
  archetypeLabel: string;
  model: string;
  planName: string;
  cycle: string;
  seats: number;
  inviteCount: number;
}): { name: string; email: string; organization: string; message: string } {
  const lines = [
    'Enterprise onboarding requested from the workspace setup wizard.',
    `Organization type: ${input.archetypeLabel}`,
    `Pricing model: ${input.model === 'dtc' ? 'Self-service' : 'Enterprise (per-user)'}`,
    `Plan: ${input.planName} (enterprise tier)`,
    `Billing: ${input.cycle}${input.model === 'b2b' ? ` \u2014 ${input.seats} seats` : ''}`,
    `Personnel to invite: ${input.inviteCount}`,
  ];
  return {
    name: input.contact.name.trim() || input.contact.email.trim(),
    email: input.contact.email.trim(),
    organization: input.organization.trim() || input.contact.email.trim(),
    message: lines.join('\n').slice(0, 2000),
  };
}

/** Honest per-step record of what activate() actually did. */
export interface ActivationOutcome {
  discoverySaved: boolean;
  invitations: OnboardingInvitationOutcome[];
  /** Whether the typed organization name reached the governed org record.
   *  It used to be collected, required, and sent nowhere. */
  nameSaved: boolean;
  profileSaved: boolean;
  invitesAttempted: number;
  invitesSent: number;
  invitesFailed: string[];
  /** 'provisioned' is the free tier: the plan is live on the organization and
   *  there is nothing to pay, so there is no checkout to redirect to. It is a
   *  distinct value from 'redirecting' on purpose — collapsing the two would
   *  make the summary claim a payment step that never happened. */
  checkout: 'ready' | 'provisioned' | 'unavailable' | 'failed';
  checkoutNote: string | null;
  checkoutUrl: string | null;
  /** The enterprise onboarding request: 'sent' = a licence_requests row exists
   *  for our team to review; 'no-contact' = no address was given so nothing was
   *  sent; 'failed' = the intake refused or was unreachable; 'not-requested' =
   *  a non-enterprise plan, where no request belongs. */
  enterpriseRequest: 'sent' | 'failed' | 'no-contact' | 'not-requested';
  enterpriseNote: string | null;
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

export function Onboarding(props: SurfaceViewProps) {
  // Re-mount on tenant change so names, personnel and private setup links never carry across tenants.
  return <OnboardingWizard key={String(getOrgId())} {...props} />;
}

const STEPS = [
  'Organization', 'Client discovery', 'Project discovery', 'Pricing model',
  'Choose plan', 'Invite personnel', 'Modules', 'Security & setup',
  'Agency accounts', 'Review & activate',
];

function OnboardingWizard({ onNav }: SurfaceViewProps) {
  const discovery = useOnboardingDiscovery();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [step, setStep] = useState(0);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => { stepTitle.current?.focus(); }, [step]);
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
  const orgRead = useLiveData<{ organization?: { name?: string | null } }>(
    orgIdForProfile ? `/api/organizations/${encodeURIComponent(String(orgIdForProfile))}` : null,
    [orgIdForProfile],
  );
  const profileRead = useLiveData<{ primaryIndustry?: string | null } | null>('/api/mdx/industry-profile');
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
  const outcomeTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (outcome) outcomeTitle.current?.focus(); }, [outcome]);
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
  const roles = ASSIGNABLE_ORG_ROLES.map(id => ({ id, label: id === 'admin' ? 'Organization administrator' : id.charAt(0).toUpperCase() + id.slice(1) }));

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
    setActivating(true);
    const activationOrgId = getOrgId();
    const current = () => mounted.current && String(getOrgId()) === String(activationOrgId);
    // A refused discovery save stops activation before any membership/billing writes.
    const discoverySaved = await discovery.save(true);
    if (!discoverySaved) {
      if (current()) setActivating(false);
      return;
    }
    if (!current()) return;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    };

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
    const orgIdForName = activationOrgId;
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

    if (!current()) return;
    // 1. Governed org industry profile (audited upsert).
    let profileSaved = false;
    try {
      const res = await fetch('/api/mdx/industry-profile', {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          primaryIndustry: archetypeToPrimaryIndustry(org.archetype),
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
    const invitations: OnboardingInvitationOutcome[] = [];
    for (const inv of pending) {
      if (!current()) return;
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
            organizationId: activationOrgId,
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
    if (!current()) return;
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

    if (!current()) return;
    // 3. Prepare checkout last; the person hands over private invitation links before leaving.
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
          checkout = 'ready';
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

    if (!current()) return;
    setOutcome({
      discoverySaved,
      invitations,
      nameSaved,
      profileSaved,
      invitesAttempted: pending.length,
      invitesSent,
      invitesFailed,
      checkout,
      checkoutNote,
      checkoutUrl,
      enterpriseRequest,
      enterpriseNote,
    });
    setActivating(false);
  };

  const missingHere = discovery.assessment.missingFields.filter((field) =>
    step === 1 ? DISCOVERY_CONTEXT_FIELDS.includes(field)
      : step === 2 ? DISCOVERY_PROJECT_FIELDS.includes(field)
        : step === 7 ? field === 'securityNeeds' : false,
  );
  const invitationEmails = invites.filter((invite) => invite.email.trim()).map((invite) => invite.email.trim().toLowerCase());
  const invitesValid = invitationEmails.every(isUsableEmail) && new Set(invitationEmails).size === invitationEmails.length;
  const discoveryAvailable = !discovery.loading && !discovery.error && discovery.canEdit && !discovery.busy;
  const canNext = !discovery.loading && !discovery.error && !discovery.busy && (
    !discovery.canEdit || (step === 0 ? org.name.trim().length > 1
      : step === 5 ? invitesValid : missingHere.length === 0)
  );
  const continueWizard = async () => {
    if (!canNext) return;
    if (discovery.canEdit && [1, 2, 7].includes(step) && !(await discovery.save(false))) return;
    setStep((current) => current + 1);
  };

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
    };
    let summary: string;
    if (outcome) {
      facts.activationOutcome = {
        discoverySaved: outcome.discoverySaved,
        nameSaved: outcome.nameSaved,
        profileSaved: outcome.profileSaved,
        invitesAttempted: outcome.invitesAttempted,
        invitesSent: outcome.invitesSent,
        invitesFailedCount: outcome.invitesFailed.length,
        checkout: outcome.checkout,
        enterpriseRequest: outcome.enterpriseRequest,
      };
      const parts = [
        outcome.discoverySaved ? 'discovery questionnaire saved' : 'discovery questionnaire not saved',
        outcome.nameSaved ? 'organization name saved' : 'organization name not saved',
        outcome.profileSaved ? 'industry profile saved' : 'industry profile not saved',
        outcome.invitesAttempted === 0
          ? 'no invitations requested'
          : `${outcome.invitesSent} of ${outcome.invitesAttempted} invitation(s) recorded` +
            (outcome.invitesFailed.length ? ` (${outcome.invitesFailed.length} need attention)` : ''),
        outcome.checkout === 'provisioned'
          ? 'plan provisioned (nothing to pay)'
          : outcome.checkout === 'ready'
            ? 'secure checkout is ready; no paid plan provisioned yet'
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
        'Discovery drafts can be saved during setup. Organization changes, invitations and billing run only on activation.';
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
  }, [step, activating, outcome, org.name, org.archetype, model, tier, cycle, seats, invites]);
  usePublishSurfaceContext('onboarding', anaContext);

  return (
    <div className="sp" style={{ maxWidth: 960 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Onboarding {I.dot} {currentOrgName ?? 'your organization'}</div>
          <h1 className="sp-title">Set up your workspace</h1>
          <p className="sp-state">
            Discover your company's needs and first project, then configure the
            organization, plan, personnel, security and agency accounts.
            Changes here are saved to this organization's own record.
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
          {!outcome && <h2 className="pj-seclbl" ref={stepTitle} tabIndex={-1}>{STEPS[step]}</h2>}
          {!outcome && <div className="ob-discovery-toolbar">
            <span className="scaf-note">
              {discovery.loading ? 'Reading saved discovery…'
                : discovery.record ? `Discovery revision ${discovery.record.revision}${discovery.dirty ? ' · unsaved changes' : ' · saved'}`
                  : 'Discovery has not been saved yet.'}
            </span>
            <button type="button" className="sp-ask" disabled={!discoveryAvailable || activating} onClick={() => void discovery.save(false)}>
              {discovery.busy ? 'Saving discovery…' : 'Save discovery draft'}
            </button>
          </div>}
          {discovery.error && <div className="ob-discovery-note ob-discovery-error" role="alert">
            {discovery.error} <button type="button" className="sp-ask" disabled={discovery.loading} onClick={discovery.reloadSaved}>Reload saved discovery</button>
            {discovery.dirty && <p className="scaf-note">Reloading replaces your unsaved discovery answers with the saved version.</p>}
          </div>}
          {!discovery.loading && !discovery.error && !discovery.canEdit && <p className="scaf-note" role="status">You can review the saved discovery and setup guidance. Only the organization's owner or administrator can edit discovery and activate workspace setup. Your Account settings remain available from the account menu.</p>}
          {discovery.note && <p className="ob-discovery-note" role="status">{discovery.note}</p>}
          {outcome ? (
            <div className="ob-done">
              <div className="ob-done-ic">{I.checkCircle || I.check}</div>
              <h2 ref={outcomeTitle} tabIndex={-1}>
                {outcome.checkout === 'ready'
                  ? 'Checkout ready — review your activation summary'
                  : (org.name || 'Your workspace') + ' — activation summary'}
              </h2>
              <div className="ob-review" style={{ textAlign: 'left' }}>
                <div className="ob-rev-row">
                  <span className="k">Client discovery</span>
                  <span className="v">{outcome.discoverySaved ? 'Completed and saved to your organization.' : 'Not saved.'}</span>
                </div>
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
                    {outcome.invitesAttempted === 0
                      ? 'No invitations requested.'
                      : outcome.invitesSent +
                        ' of ' +
                        outcome.invitesAttempted +
                        ' invitations recorded' +
                        (outcome.invitesFailed.length
                          ? ' — need attention: ' + outcome.invitesFailed.join(', ')
                          : '') +
                        '.'}
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
                      : outcome.checkout === 'ready'
                      ? 'Secure checkout is ready for the ' +
                        selTier.name +
                        ' plan' +
                        (model === 'dtc' && selTier.trialDays > 0
                          ? ' (' + selTier.trialDays + '-day trial)'
                          : '') +
                        '. No paid plan is active from this checkout yet. Modules for the ' +
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
              <OnboardingInvitations invitations={outcome.invitations} />
              <DiscoveryNextSteps assessment={discovery.assessment} onNav={onNav} />
              <div
                className="cm-pushbar"
                style={{ justifyContent: 'center', marginTop: 16 }}
              >
                {outcome.checkout === 'ready' && outcome.checkoutUrl && <button type="button" className="sp-primary" onClick={() => window.location.assign(outcome.checkoutUrl!)}>Continue to secure checkout</button>}
                <button
                  className={outcome.checkout === 'ready' ? 'sp-ask' : 'sp-primary'}
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
                    disabled={!discoveryAvailable}
                    value={org.name}
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
                        disabled={!discoveryAvailable}
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
                </div>
              )}

              {step === 1 && <DiscoveryQuestions discovery={discovery} section="context" />}
              {step === 2 && <DiscoveryQuestions discovery={discovery} section="project" />}
              {step === 7 && <OnboardingSecurity discovery={discovery} onNav={onNav} />}
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
                  </div>
                  {invites.map((inv, i) => (
                    <div key={i} className="ob-invite">
                      <input
                        id={`ob-invite-email-${i}`}
                        aria-label={`Email for invitee ${i + 1}`}
                        type="email"
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
                    Invitations grant organization membership with the role you choose.
                    Platform and finance access require separate governed grants.
                    New members receive a password setup email, or a private setup link
                    if this server cannot send email. Existing users accept a membership invitation in Account.
                  </div>
                  {!invitesValid && <p className="scaf-note" role="alert">Enter valid, distinct email addresses before continuing.</p>}
                </div>
              )}

              {step === 6 && (
                <div>
                  <div className="pj-seclbl" style={{ marginTop: 0 }}>
                    Plan features for the{' '}
                    <b>&nbsp;{tier}&nbsp;</b> tier
                  </div>
                  <div className="scaf-note" style={{ marginBottom: 10 }}>
                    Once the plan is active, {org.name || 'your organization'} is
                    receives the features its tier qualifies for. Your apps remain
                    subject to the supported launch scope and organization entitlements.
                    This is a plan preview; activation and payment results are reported separately.
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

              {step === 8 && (
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

              {step === 9 && (
                <div className="ob-review">
                  <DiscoveryNextSteps assessment={discovery.assessment} onNav={onNav} />
                  <div className="ob-rev-row">
                    <span className="k">Discovery questions</span>
                    <span className="v">{discovery.assessment.completionPercent}% answered{discovery.record?.completedAt && !discovery.dirty ? ' · saved as complete' : ' · completed on activation'}</span>
                  </div>
                  <div className="ob-discovery-summary">
                    {(['companyGoal', 'projectName', 'projectGoal', 'successCriteria'] as const).map((field) => <div className="ob-rev-row" key={field}>
                      <span className="k">{DISCOVERY_FIELD_LABELS[field]}</span><span className="v">{discovery.answers[field] || 'Not answered'}</span>
                    </div>)}
                  </div>
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
                        activating || !discoveryAvailable || !discovery.assessment.readyToComplete || !invitesValid || (tier === 'enterprise' && !isUsableEmail(contact.email))
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

              {!outcome && (
                <>
                {missingHere.length > 0 && [1, 2, 7].includes(step) && <p className="scaf-note" role="status">Required: {missingHere.map((field) => DISCOVERY_FIELD_LABELS[field]).join(', ')}.</p>}
                <div className="ob-nav">
                  <button
                    className="sp-ask"
                    disabled={step === 0 || discovery.busy || activating}
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
                      disabled={!canNext}
                      onClick={() => void continueWizard()}
                    >
                      {discovery.canEdit && [1, 2, 7].includes(step) ? 'Save & continue' : 'Continue'} {I.arrowRight || '›'}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
