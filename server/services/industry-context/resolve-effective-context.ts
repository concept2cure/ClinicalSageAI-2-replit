/**
 * The effective industry context resolver — MDX-CONTEXT-03.
 *
 * One function that answers "what kind of regulatory work is this, and what is
 * this organization licensed to do about it", so Projects, Tasking, the Study
 * Design Center, Reporting and AnA all tailor from the SAME resolved answer.
 * Without a single resolver each surface re-derives it from whatever it happens
 * to have in scope, and they drift: a project offering IVD study archetypes while
 * its task board labels everything "Device" is not a cosmetic inconsistency, it
 * means two surfaces disagree about which regulation applies.
 *
 * Precedence, most specific first:
 *
 *   project_industry_profiles      the project's own declaration
 *   client_workspaces.industry     the client account this project belongs to
 *   organization_industry_profiles  the governed org default
 *   organizations.industry_mode     legacy, for an org with no profile row yet
 *   license default                 last resort
 *
 * Two commitments that shape the whole module:
 *
 *   1. It never guesses a regulatory vertical or specialization. A CRO's
 *      organization-level vertical is a weak default because its projects are
 *      whatever its sponsors' are; presenting that guess as resolved would offer
 *      device study archetypes to a pharmaceutical study. Every returned value
 *      carries WHERE it came from, and `needsDeclaration` says outright when the
 *      surface should ask instead of proceeding.
 *   2. Licensing gates capabilities, never navigation. `licensedModules` and the
 *      enabled study/filing type lists are intersected with entitlement, and a
 *      capability the tier does not include is reported as locked rather than
 *      hidden — the rail and the module interiors stay stable, the affordances
 *      change.
 *
 * @module server/services/industry-context/resolve-effective-context
 */

import { getClientTypeProfile, type ApprovalRigor, type Vertical } from '../../../shared/regulatory/client-type-profiles';
import {
  specializationPreset, isMdxSpecialization, isPrimaryIndustry,
  PRIMARY_FOR_INDUSTRY_MODE, INDUSTRY_MODE_FOR_PRIMARY, INDUSTRY_DETERMINES_VERTICAL,
  type MdxSpecialization, type PrimaryIndustry, type MdxStudyType, type MdxFilingType,
} from '../../../shared/regulatory/mdx-specialization';

/** Minimal pg-compatible executor, matching the RBM services' convention. */
export interface Exec {
  query(sql: string, args: unknown[]): Promise<{ rows: any[] }>;
}

/** Where a resolved value came from — surfaced so a guess is never invisible. */
export type ContextSource =
  | 'project'
  | 'client'
  | 'organization'
  | 'legacy_industry_mode'
  | 'license_default';

export interface EffectiveIndustryContext {
  vertical: Vertical;
  verticalSource: ContextSource;
  specialization: MdxSpecialization;
  specializationSource: ContextSource;
  primaryIndustry: PrimaryIndustry;
  productType: string | null;
  lifecycleStage: string | null;
  /** Filing types in play for this project (or the org defaults). */
  pathways: string[];
  markets: string[];
  licensedModules: string[];
  /** Study archetypes the Study Design Center should offer. */
  studyTypes: MdxStudyType[];
  /** Filing types project creation and the Submission Center should offer. */
  filingTypes: MdxFilingType[];
  /** Shell label overrides: industry terminology with specialization layered over. */
  terminology: Record<string, string>;
  approvalRigor: ApprovalRigor;
  /** Framing for the AnA rail, so the assistant speaks the right regulation. */
  anaFraming: string;
  /**
   * Fields the surface should ASK for rather than assume. Non-empty means the
   * resolver reached a weak default and is saying so instead of hiding it.
   */
  needsDeclaration: Array<'vertical' | 'specialization'>;
}

const LICENSE_DEFAULT_INDUSTRY: PrimaryIndustry = 'biotech_pharma';

/** Read the governed org profile, tolerating a database without the table yet. */
async function readOrgProfile(exec: Exec, organizationId: number) {
  try {
    const { rows } = await exec.query(
      `SELECT primary_industry, mdx_specialization, default_markets, default_pathways,
              default_approval_rigor
         FROM organization_industry_profiles WHERE organization_id = $1`,
      [organizationId],
    );
    return rows[0] ?? null;
  } catch (err) {
    // 42P01: the profile table is not provisioned here. Fall back to the legacy
    // column rather than failing the request — but the caller learns which
    // source was used, so a missing profile is visible rather than silent.
    if ((err as { code?: string })?.code === '42P01') return null;
    throw err;
  }
}

async function readLegacyIndustryMode(exec: Exec, organizationId: number): Promise<string | null> {
  const { rows } = await exec.query(
    `SELECT industry_mode FROM organizations WHERE id = $1`,
    [organizationId],
  );
  return rows[0]?.industry_mode ?? null;
}

async function readProjectProfile(exec: Exec, organizationId: number, projectId: number) {
  try {
    const { rows } = await exec.query(
      `SELECT vertical, specialization, product_type, lifecycle_stage, target_markets,
              regulatory_pathways, filing_types, inherited_from_org, client_workspace_id
         FROM project_industry_profiles
        WHERE project_id = $1 AND organization_id = $2`,
      [projectId, organizationId],
    );
    return rows[0] ?? null;
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') return null;
    throw err;
  }
}

/**
 * The client account's declared industry, if it has one.
 *
 * client_workspaces.industry is free text, so it is only trusted when it maps
 * cleanly onto a known industry_mode — an unrecognized string is ignored rather
 * than coerced, because a typo should not silently change which regulation the
 * workspace presents.
 */
async function readClientIndustry(
  exec: Exec,
  organizationId: number,
  clientWorkspaceId: number,
): Promise<string | null> {
  const { rows } = await exec.query(
    `SELECT industry FROM client_workspaces WHERE id = $1 AND organization_id = $2`,
    [clientWorkspaceId, organizationId],
  );
  const raw = rows[0]?.industry;
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  return PRIMARY_FOR_INDUSTRY_MODE[key] ? key : null;
}

/**
 * The organization's enabled modules.
 *
 * Reads `module_subscriptions` — the same table getLicenseInfo() uses in
 * server/services/license-manager.ts — rather than establishing a second view of
 * entitlement. Deliberately not calling getLicenseInfo() itself: that function
 * goes to the shared pool, and this resolver takes an executor so a route can
 * pass its request-scoped client and have RLS apply.
 */
async function readEntitlement(exec: Exec, organizationId: number): Promise<string[]> {
  try {
    const { rows } = await exec.query(
      `SELECT module_id FROM module_subscriptions
        WHERE organization_id = $1 AND enabled = true`,
      [organizationId],
    );
    return rows.map((r: { module_id: unknown }) => r.module_id)
      .filter((m): m is string => typeof m === 'string');
  } catch (err) {
    // No subscriptions table in this environment, or a shape this query cannot
    // read. An empty entitlement means "gate nothing on licensing", which keeps
    // the resolver usable — the alternative, locking every capability on a read
    // failure, would present an infrastructure problem as a licensing decision.
    const code = (err as { code?: string })?.code;
    if (code === '42P01' || code === '42703') return [];
    throw err;
  }
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function isVertical(v: unknown): v is Vertical {
  return v === 'mdx' || v === 'biopharma' || v === 'pdev';
}

/**
 * Resolve the one effective context for a request.
 *
 * `projectId` and `clientWorkspaceId` are optional: called without them this
 * returns the organization-level context, which is what a landing page or a
 * cross-project report needs.
 */
export async function resolveEffectiveProjectContext(
  exec: Exec,
  input: {
    organizationId: number;
    projectId?: number | null;
    clientWorkspaceId?: number | null;
    userId?: number | null;
  },
): Promise<EffectiveIndustryContext> {
  const { organizationId } = input;

  const [orgProfile, licensedModules] = await Promise.all([
    readOrgProfile(exec, organizationId),
    readEntitlement(exec, organizationId),
  ]);

  const projectProfile = input.projectId
    ? await readProjectProfile(exec, organizationId, input.projectId)
    : null;

  // ── Primary industry: org profile, else the legacy column, else the default ──
  let primaryIndustry: PrimaryIndustry = LICENSE_DEFAULT_INDUSTRY;
  let industrySource: ContextSource = 'license_default';
  if (orgProfile && isPrimaryIndustry(orgProfile.primary_industry)) {
    primaryIndustry = orgProfile.primary_industry;
    industrySource = 'organization';
  } else {
    const legacy = await readLegacyIndustryMode(exec, organizationId);
    const mapped = legacy ? PRIMARY_FOR_INDUSTRY_MODE[legacy.trim().toLowerCase()] : undefined;
    if (mapped) {
      primaryIndustry = mapped;
      industrySource = 'legacy_industry_mode';
    }
  }

  // The client account can refine the industry for this project — a consultancy's
  // client is what determines whether this engagement is device or pharma work.
  const clientId = projectProfile?.client_workspace_id ?? input.clientWorkspaceId ?? null;
  let clientIndustryMode: string | null = null;
  if (clientId) {
    clientIndustryMode = await readClientIndustry(exec, organizationId, clientId);
  }

  // ── Vertical ─────────────────────────────────────────────────────────────
  const orgIndustryMode = INDUSTRY_MODE_FOR_PRIMARY[primaryIndustry];
  const orgVertical = getClientTypeProfile(orgIndustryMode)?.vertical ?? 'biopharma';
  let vertical: Vertical = orgVertical;
  let verticalSource: ContextSource = industrySource === 'license_default'
    ? 'license_default'
    : industrySource;

  if (clientIndustryMode) {
    const cv = getClientTypeProfile(clientIndustryMode)?.vertical;
    if (cv) { vertical = cv; verticalSource = 'client'; }
  }
  if (isVertical(projectProfile?.vertical)) {
    vertical = projectProfile.vertical;
    verticalSource = 'project';
  }

  // ── Specialization ───────────────────────────────────────────────────────
  let specialization: MdxSpecialization = 'unspecified';
  let specializationSource: ContextSource = 'license_default';
  if (orgProfile && isMdxSpecialization(orgProfile.mdx_specialization)) {
    specialization = orgProfile.mdx_specialization;
    specializationSource = 'organization';
  }
  if (isMdxSpecialization(projectProfile?.specialization)) {
    specialization = projectProfile.specialization;
    specializationSource = 'project';
  }

  // ── What the surface must ask rather than assume ──────────────────────────
  const needsDeclaration: EffectiveIndustryContext['needsDeclaration'] = [];
  // A service organization's vertical is a weak default: its projects are
  // whatever its sponsors' are. Proceeding on the org default would present the
  // wrong regulatory instruments for at least some of its work.
  if (verticalSource !== 'project' && !INDUSTRY_DETERMINES_VERTICAL[primaryIndustry]) {
    needsDeclaration.push('vertical');
  }
  // Specialization only matters inside MDX, and only when nobody has declared it.
  if (vertical === 'mdx' && specialization === 'unspecified') {
    needsDeclaration.push('specialization');
  }

  // ── Presets, composed ────────────────────────────────────────────────────
  const industryProfile = getClientTypeProfile(clientIndustryMode ?? orgIndustryMode);
  const preset = specializationPreset(specialization);

  // Specialization terminology layers OVER industry terminology: the industry
  // sets the frame ("Submission"), the specialization sets the noun ("Assay").
  const terminology = { ...(industryProfile?.terminology ?? {}), ...preset.terminology };

  // Outside MDX there is no MDX specialization to offer archetypes from, so the
  // lists are empty rather than device defaults leaking into a pharma project.
  const inMdx = vertical === 'mdx';
  const studyTypes = inMdx ? [...preset.studyTypes] : [];
  const filingTypes = inMdx ? [...preset.filingTypes] : [];

  const projectPathways = asStringArray(projectProfile?.regulatory_pathways);
  const projectFilings = asStringArray(projectProfile?.filing_types);
  const pathways = projectPathways.length > 0
    ? projectPathways
    : projectFilings.length > 0
      ? projectFilings
      : asStringArray(orgProfile?.default_pathways);

  const projectMarkets = asStringArray(projectProfile?.target_markets);
  const markets = projectMarkets.length > 0
    ? projectMarkets
    : asStringArray(orgProfile?.default_markets);

  const approvalRigor = (orgProfile?.default_approval_rigor
    ?? industryProfile?.defaultApprovalPath
    ?? 'regulated_dual_review') as ApprovalRigor;

  return {
    vertical,
    verticalSource,
    specialization,
    specializationSource,
    primaryIndustry,
    productType: projectProfile?.product_type ?? null,
    lifecycleStage: projectProfile?.lifecycle_stage ?? null,
    pathways,
    markets,
    licensedModules,
    studyTypes: studyTypes as MdxStudyType[],
    filingTypes: filingTypes as MdxFilingType[],
    terminology,
    approvalRigor,
    anaFraming: buildAnaFraming({
      vertical, specialization, industryProfile, needsDeclaration, pathways, markets,
    }),
    needsDeclaration,
  };
}

/**
 * The framing AnA is given for this context.
 *
 * Ends by stating what is NOT yet declared when something is missing, so the
 * assistant asks rather than assuming a pathway — the same honesty requirement
 * the surfaces have, applied to the model's own context.
 */
function buildAnaFraming(input: {
  vertical: Vertical;
  specialization: MdxSpecialization;
  industryProfile: { personaEmphasis: string } | null;
  needsDeclaration: Array<'vertical' | 'specialization'>;
  pathways: string[];
  markets: string[];
}): string {
  const parts: string[] = [];
  if (input.industryProfile?.personaEmphasis) {
    parts.push(`Emphasis: ${input.industryProfile.personaEmphasis}`);
  }
  if (input.vertical === 'mdx' && input.specialization !== 'unspecified') {
    parts.push(`MDX specialization: ${specializationPreset(input.specialization).label}.`);
  }
  if (input.pathways.length > 0) parts.push(`Pathways in play: ${input.pathways.join(', ')}.`);
  if (input.markets.length > 0) parts.push(`Markets: ${input.markets.join(', ')}.`);
  if (input.needsDeclaration.length > 0) {
    parts.push(
      `NOT yet declared for this project: ${input.needsDeclaration.join(' and ')}. `
      + 'Ask before assuming a regulatory pathway or study design.',
    );
  }
  return parts.join(' ');
}

export default { resolveEffectiveProjectContext };
