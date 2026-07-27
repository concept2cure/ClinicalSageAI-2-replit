/**
 * industry-context resolver (CONTEXT-03).
 *
 * One server-side resolver that merges the layered industry context —
 * project → client → organization → license default — into a single
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
  vertical: IndustryVertical;
  specialization: MdxSpecialization | null;
  productType: string | null;
  lifecycleStage: string | null;
  pathways: string[];
  markets: string[];
  filingTypes: string[];
  licensedModules: string[];
  terminology: Record<string, string>;
  approvalRigor: ApprovalRigor;
  /** Where the effective vertical/specialization came from (for debugging/UI). */
  source: 'project' | 'organization' | 'license_default';
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
    : { product: 'Program', submission: 'Submission', study: 'Study' };
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
  licensedModules?: string[];
}

function firstNonEmptyArray(...arrs: Array<string[] | null | undefined>): string[] {
  for (const a of arrs) if (Array.isArray(a) && a.length > 0) return a;
  return [];
}

/**
 * Pure precedence merge: project overrides org, org overrides the license
 * default. Never throws; missing layers fall through to safe defaults.
 */
export function mergeIndustryContext(layers: ContextLayers): EffectiveIndustryContext {
  const { project, org, licensedModules = [] } = layers;

  // Vertical: an explicit project vertical wins; else derive from the org's
  // primary industry; else biopharma.
  let vertical: IndustryVertical;
  let source: EffectiveIndustryContext['source'];
  if (project?.vertical === 'mdx' || project?.vertical === 'biopharma') {
    vertical = project.vertical;
    source = 'project';
  } else if (org?.primaryIndustry) {
    vertical = verticalForPrimaryIndustry(org.primaryIndustry);
    source = 'organization';
  } else {
    vertical = 'biopharma';
    source = 'license_default';
  }

  const specialization =
    (project?.specialization as MdxSpecialization | undefined) ??
    (org?.mdxSpecialization as MdxSpecialization | undefined) ??
    null;

  const approvalRigor = (org?.defaultApprovalRigor as ApprovalRigor | undefined)
    ?? defaultRigorForPrimaryIndustry(org?.primaryIndustry);

  return {
    vertical,
    specialization,
    productType: project?.productType ?? null,
    lifecycleStage: project?.lifecycleStage ?? null,
    pathways: firstNonEmptyArray(project?.regulatoryPathways, org?.defaultPathways),
    markets: firstNonEmptyArray(project?.targetMarkets, org?.defaultMarkets),
    filingTypes: firstNonEmptyArray(project?.filingTypes),
    licensedModules,
    terminology: terminologyForVertical(vertical),
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
 * modules; falls through to safe defaults when a layer is absent (fail-open,
 * so a missing profile degrades to biopharma rather than erroring a request).
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
    // Fail-open to defaults so a new tenant / transient error doesn't 500 the
    // request, but never silently — a real outage must be visible in logs.
    log.warn('org industry profile lookup failed; using defaults', { organizationId, err });
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
      log.warn('project industry profile lookup failed; inheriting org', { projectId, err });
    }
  }

  let licensedModules: string[] = [];
  try {
    const lic = await getLicenseInfo(organizationId);
    licensedModules = lic?.enabledModules ?? [];
  } catch (err) {
    log.warn('license lookup failed; empty entitlements', { organizationId, err });
  }

  return mergeIndustryContext({ project, org, licensedModules });
}
