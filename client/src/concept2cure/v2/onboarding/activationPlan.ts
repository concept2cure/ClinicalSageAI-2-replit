import type { InvitationOutcome } from './invitationOutcome';

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
  /** Whether the typed organization name reached the governed org record.
   *  It used to be collected, required, and sent nowhere. */
  nameSaved: boolean;
  discoverySaved: boolean;
  profileSaved: boolean;
  invitesAttempted: number;
  invitesSent: number;
  invitesFailed: string[];
  invitations: InvitationOutcome[];
  /** 'provisioned' is the free tier: the plan is live on the organization and
   *  there is nothing to pay, so there is no checkout to redirect to. It is a
   *  distinct value from 'redirecting' on purpose — collapsing the two would
   *  make the summary claim a payment step that never happened. */
  checkout: 'redirecting' | 'provisioned' | 'unavailable' | 'failed';
  checkoutNote: string | null;
  checkoutUrl: string | null;
  /** The enterprise onboarding request: 'sent' = a licence_requests row exists
   *  for our team to review; 'no-contact' = no address was given so nothing was
   *  sent; 'failed' = the intake refused or was unreachable; 'not-requested' =
   *  a non-enterprise plan, where no request belongs. */
  enterpriseRequest: 'sent' | 'failed' | 'no-contact' | 'not-requested';
  enterpriseNote: string | null;
}
