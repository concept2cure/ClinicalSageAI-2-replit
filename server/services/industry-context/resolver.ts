/**
 * industry-context resolver (CONTEXT-03).
 *
 * One server-side resolver that merges the layered industry context —
 * project → organization — into a single
 * EffectiveIndustryContext that every module (Projects, Tasking, Study
 * Design, Reporting, AnA) reads. Replaces the scattered, partial signals
 * documented in docs/MDX_INDUSTRY_CONTEXT_GAP_ANALYSIS.md.
 *
 * The precedence merge (`mergeIndustryContext`) is pure and exported so it
 * can be unit-tested without a database or a license service.
 */

import { db } from '../../db';
import { and, eq } from 'drizzle-orm';
import {
  organizationIndustryProfiles,
  projectIndustryProfiles,
} from 'shared/schema';
import { getLicenseInfo } from '../license-manager';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('industry-context-resolver');

export type IndustryVertical = 'mdx' | 'biopharma';

export type MdxSpecialization =
  | 'medical_device'
  | 'ivd_diagnostics'
  | 'both'
  | 'samd'
  | 'companion_diagnostic'
  | 'combination_product';

export type PrimaryIndustry =
  | 'medical_device_diagnostics'
  | 'biotech_pharma'
  | 'cro'
  | 'regulatory_consulting'
  | 'academic_research';

export type ApprovalRigor =
  | 'single_reviewer'
  | 'regulated_dual_review'
  | 'qa_lock'
  | 'signoff_required';

export interface EffectiveIndustryContext {
  /** null when neither the project nor the organization profile sets it. */
  vertical: IndustryVertical | null;
  specialization: MdxSpecialization | null;
  /** Which profile the specialization came from; null when neither sets one. */
  specializationSource: 'project' | 'organization' | null;
  productType: string | null;
  lifecycleStage: string | null;
  pathways: string[];
  markets: string[];
  filingTypes: string[];
  /** null when the license could not be read — never [] for "not read". */
  licensedModules: string[] | null;
  /** null while the vertical is unset. */
  terminology: Record<string, string> | null;
  /** null when no organization profile is on file. */
  approvalRigor: ApprovalRigor | null;
  /** Where the effective vertical came from; 'none' when no profile sets it. */
  source: 'project' | 'organization' | 'none';
}

/** A profile layer could not be read, so no effective context was resolved (routes answer 503). */
export class IndustryContextUnavailableError extends Error {
  readonly code = 'INDUSTRY_CONTEXT_UNAVAILABLE';
  constructor(readonly layer: 'organization_profile' | 'project_profile') {
    super(`The ${layer.replace('_', ' ')} could not be read, so the industry context was not resolved.`);
    this.name = 'IndustryContextUnavailableError';
  }
}

/** primary_industry → vertical. Only device/diagnostics maps to the MDX vertical. */
export function verticalForPrimaryIndustry(pi: string | null | undefined): IndustryVertical {
  return pi === 'medical_device_diagnostics' ? 'mdx' : 'biopharma';
}

/** Default approval rigor per industry when no explicit value is stored. */
export function defaultRigorForPrimaryIndustry(pi: string | null | undefined): ApprovalRigor {
  switch (pi) {
    case 'medical_device_diagnostics':
    case 'biotech_pharma':
    case 'regulatory_consulting':
      return 'regulated_dual_review';
    case 'cro':
      return 'signoff_required';
    case 'academic_research':
      return 'single_reviewer';
    default:
      return 'regulated_dual_review';
  }
}

/** Vertical-driven UI terminology. Kept minimal and deterministic. */
export function terminologyForVertical(v: IndustryVertical): Record<string, string> {
  return v === 'mdx'
    ? { product: 'Device', submission: 'Submission', study: 'Study' }
    : { product: 'Product', submission: 'Submission', study: 'Study' };
}

/** The layered inputs the pure merge consumes. */
export interface ContextLayers {
  project?: {
    vertical?: string | null;
    specialization?: string | null;
    productType?: string | null;
    lifecycleStage?: string | null;
    regulatoryPathways?: string[] | null;
    targetMarkets?: string[] | null;
    filingTypes?: string[] | null;
  } | null;
  org?: {
    primaryIndustry?: string | null;
    mdxSpecialization?: string | null;
    defaultPathways?: string[] | null;
    defaultMarkets?: string[] | null;
    defaultApprovalRigor?: string | null;
  } | null;
  /** Omitted or null = the license was not read. */
  licensedModules?: string[] | null;
}

function firstNonEmptyArray(...arrs: Array<string[] | null | undefined>): string[] {
  for (const a of arrs) if (Array.isArray(a) && a.length > 0) return a;
  return [];
}

/**
 * Pure precedence merge: project overrides org. Never throws; a field no layer
 * sets stays null (source 'none') rather than taking a default.
 */
export function mergeIndustryContext(layers: ContextLayers): EffectiveIndustryContext {
  const { project, org, licensedModules = null } = layers;

  // Vertical: an explicit project vertical wins; else derive from the org's
  // primary industry; else unset. 2026-10-15: "else" used to be 'biopharma' from
  // a 'license_default' source — a source nothing reads.
  let vertical: IndustryVertical | null;
  let source: EffectiveIndustryContext['source'];
  if (project?.vertical === 'mdx' || project?.vertical === 'biopharma') {
    vertical = project.vertical;
    source = 'project';
  } else if (org?.primaryIndustry) {
    vertical = verticalForPrimaryIndustry(org.primaryIndustry);
    source = 'organization';
  } else {
    vertical = null;
    source = 'none';
  }

  const projectSpecialization = (project?.specialization as MdxSpecialization | null | undefined) ?? null;
  const orgSpecialization = (org?.mdxSpecialization as MdxSpecialization | null | undefined) ?? null;
  const specialization = projectSpecialization ?? orgSpecialization;

  // The per-industry default applies only to an organization profile on file.
  const approvalRigor = (org?.defaultApprovalRigor as ApprovalRigor | null | undefined)
    ?? (org ? defaultRigorForPrimaryIndustry(org.primaryIndustry) : null);

  return {
    vertical,
    specialization,
    specializationSource: projectSpecialization ? 'project' : orgSpecialization ? 'organization' : null,
    productType: project?.productType ?? null,
    lifecycleStage: project?.lifecycleStage ?? null,
    pathways: firstNonEmptyArray(project?.regulatoryPathways, org?.defaultPathways),
    markets: firstNonEmptyArray(project?.targetMarkets, org?.defaultMarkets),
    filingTypes: firstNonEmptyArray(project?.filingTypes),
    licensedModules,
    terminology: vertical ? terminologyForVertical(vertical) : null,
    approvalRigor,
    source,
  };
}

export interface ResolveInput {
  organizationId: number;
  clientId?: number | null;
  projectId?: string | null; // regulatory_programs.id (uuid)
  userId?: number | string | null;
}

/**
 * Load the stored layers and merge them into one effective context. Reads
 * the org profile, the optional project profile, and the org's licensed
 * modules. An absent profile leaves its fields unset; a profile that cannot
 * be read throws IndustryContextUnavailableError; an unreadable license is
 * reported as licensedModules null.
 */
export async function resolveEffectiveProjectContext(
  input: ResolveInput,
): Promise<EffectiveIndustryContext> {
  const { organizationId, projectId } = input;

  let org: ContextLayers['org'] = null;
  try {
    const [row] = await db
      .select()
      .from(organizationIndustryProfiles)
      .where(eq(organizationIndustryProfiles.organizationId, organizationId))
      .limit(1);
    if (row) {
      org = {
        primaryIndustry: row.primaryIndustry,
        mdxSpecialization: row.mdxSpecialization,
        defaultPathways: row.defaultPathways,
        defaultMarkets: row.defaultMarkets,
        defaultApprovalRigor: row.defaultApprovalRigor,
      };
    }
  } catch (err) {
    // 2026-10-15: this answered with biopharma defaults (and work-packages then
    // compiled a device plan for an IVD tenant). An absent row is not an error —
    // a failed read is, and nothing is resolved from it.
    log.error('org industry profile lookup failed; context not resolved', { organizationId, err });
    throw new IndustryContextUnavailableError('organization_profile');
  }

  let project: ContextLayers['project'] = null;
  if (projectId) {
    try {
      const [row] = await db
        .select()
        .from(projectIndustryProfiles)
        // Scope to the caller's org: program_id is globally unique with no FK,
        // so a bare programId match would return another tenant's project layer.
        .where(and(
          eq(projectIndustryProfiles.programId, projectId),
          eq(projectIndustryProfiles.organizationId, organizationId),
        ))
        .limit(1);
      if (row) {
        project = {
          vertical: row.vertical,
          specialization: row.specialization,
          productType: row.productType,
          lifecycleStage: row.lifecycleStage,
          regulatoryPathways: row.regulatoryPathways,
          targetMarkets: row.targetMarkets,
          filingTypes: row.filingTypes,
        };
      }
    } catch (err) {
      // 2026-10-15: this silently dropped the project layer and answered with the org's.
      log.error('project industry profile lookup failed; context not resolved', { projectId, err });
      throw new IndustryContextUnavailableError('project_profile');
    }
  }

  // 2026-10-15: a failed read was reported as [] ("nothing licensed").
  // getLicenseInfo answers null for a read it could not make, so null stays null.
  let licensedModules: string[] | null = null;
  try {
    const lic = await getLicenseInfo(organizationId);
    licensedModules = lic ? lic.enabledModules : null;
    if (!lic) log.error('license could not be read; licensedModules reported as null', { organizationId });
  } catch (err) {
    log.error('license lookup failed; licensedModules reported as null', { organizationId, err });
  }

  return mergeIndustryContext({ project, org, licensedModules });
}
