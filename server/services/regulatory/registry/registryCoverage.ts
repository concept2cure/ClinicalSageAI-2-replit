/**
 * Registry Coverage — Portfolio-wide document-type readiness.
 *
 * `registryValidation` answers "is THIS project's type valid?". This module
 * answers the product-management question: across the entire global registry,
 * which document types are actually backed by a real, region-specific dossier
 * structure, a real task plan, and the required agency forms — and which are
 * still catalog metadata resolving to a generic CTD outline?
 *
 * It is pure and synchronous (it reads the static blueprint/form catalogs, it
 * does not instantiate documents), so it can back both a CI readiness gate and
 * an operator-facing coverage report.
 *
 * Readiness tiers:
 *  - `production_ready` — dedicated region-specific section blueprint AND a
 *    dedicated task blueprint are wired for this exact type.
 *  - `buildable`        — a real (non-generic) section structure exists, even if
 *    the task plan is the shared default.
 *  - `catalog_only`     — the type resolves to the generic CTD fallback; it is a
 *    selectable catalog entry but has no bespoke authoring structure yet.
 *
 * @module server/services/regulatory/registry/registryCoverage
 */

import {
  GLOBAL_REGISTRY,
  getApplicationType,
} from '../../../../shared/regulatory/global-document-registry.js';
import {
  SECTION_BLUEPRINTS,
  TASK_BLUEPRINTS,
  resolveTaskBlueprintKey,
} from '../../../../shared/regulatory/project-bootstrap.js';
import { DEDICATED_SECTION_BLUEPRINT_IDS } from '../sectionBlueprintCatalog.js';
import { DEDICATED_TASK_BLUEPRINT_IDS } from '../taskBlueprintCatalog.js';
import { FDAFormsRegistry, governedFormDefinition } from '../../../config/FDAFormsRegistry.js';
import type {
  RegulatoryApplicationType,
  Region,
  Agency,
  ApplicationFamily,
  FilingCategory,
  LifecycleStage,
  Segment,
} from '../../../../shared/regulatory/document-taxonomy.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlueprintTier = 'dedicated' | 'specific' | 'generic';
export type ReadinessTier = 'production_ready' | 'buildable' | 'catalog_only';

export interface RequiredFormCoverage {
  /** Raw required-artifact token from the registry, e.g. `form_1571`. */
  artifact: string;
  /** Normalised FDA form number, e.g. `1571`, when the artifact is a form. */
  formNumber?: string;
  /** Present in the canonical FDA forms registry. */
  registered: boolean;
  /** Registry marks it as a fully-implemented builder (`implementationStatus: 'full'`). */
  implemented: boolean;
}

export interface DocumentCoverage {
  id: string;
  displayName: string;
  region: Region;
  agency: Agency;
  applicationFamily: ApplicationFamily;
  segment?: Segment;
  category?: FilingCategory;
  stage: LifecycleStage;
  sectionBlueprint: BlueprintTier;
  taskBlueprint: BlueprintTier;
  requiredForms: RequiredFormCoverage[];
  /** Every required *form* artifact is registered (and implemented when a builder is expected). */
  formsFullyBacked: boolean;
  /** A regional eCTD backbone reference exists for this region. */
  hasEctdBackbone: boolean;
  validationProfile: string;
  readiness: ReadinessTier;
}

// ─── Static backing sets ──────────────────────────────────────────────────────

const DEDICATED_SECTION = new Set<string>([
  ...DEDICATED_SECTION_BLUEPRINT_IDS,
  // US IND (and its amendment) use the deep 108-section eCTD map directly.
  'US_IND',
  'US_IND_AMENDMENT',
]);
const DEDICATED_TASK = new Set<string>(DEDICATED_TASK_BLUEPRINT_IDS);

/** Regions with a regional eCTD backbone reference template in `templates/ectd`. */
const REGIONS_WITH_ECTD_BACKBONE = new Set<Region>(['US', 'EU', 'CA', 'JP']);

function normalizedFormNumber(value: string): string {
  // Strip a leading "fda" or "form" qualifier so that the required-artifact
  // token `form_1571`, the registry `formNumber` "1571", and "FDA 1571" all
  // normalise to the same key.
  return value
    .toLowerCase()
    .replace(/^(?:fda|form)[\s_-]*/i, '')
    .replace(/[^a-z0-9]/g, '');
}

const FORM_REGISTRY_BY_NUMBER = new Map(
  Object.values(FDAFormsRegistry).map((form) => [normalizedFormNumber(form.formNumber), form]),
);

// ─── Per-entry coverage ───────────────────────────────────────────────────────

function sectionTier(entry: RegulatoryApplicationType): BlueprintTier {
  if (DEDICATED_SECTION.has(entry.id)) return 'dedicated';
  const key = entry.defaultSectionBlueprint;
  if (key in SECTION_BLUEPRINTS && key !== 'default_sections') return 'specific';
  return 'generic';
}

function taskTier(entry: RegulatoryApplicationType): BlueprintTier {
  if (DEDICATED_TASK.has(entry.id)) return 'dedicated';
  // Resolve through the SAME family resolver the runtime bootstrap uses, so the
  // coverage report reflects the real per-family task plan an entry receives
  // (not just an explicit `${id}_tasks` key that never exists in TASK_BLUEPRINTS).
  const key = resolveTaskBlueprintKey(entry);
  if (key in TASK_BLUEPRINTS && key !== 'default_tasks') return 'specific';
  return 'generic';
}

function requiredFormCoverage(entry: RegulatoryApplicationType): RequiredFormCoverage[] {
  return entry.requiredArtifacts
    .filter((a) => /^form[\s_-]/i.test(a) || /^form_?\d/i.test(a))
    .map((artifact) => {
      const formNumber = normalizedFormNumber(artifact);
      const form = FORM_REGISTRY_BY_NUMBER.get(formNumber);
      const registered = Boolean(form);
      const implemented = registered
        ? governedFormDefinition(form!).implementationStatus === 'full'
        : false;
      return { artifact, formNumber: registered ? form!.formNumber : undefined, registered, implemented };
    });
}

function readinessOf(section: BlueprintTier, task: BlueprintTier): ReadinessTier {
  if (section === 'dedicated' && task === 'dedicated') return 'production_ready';
  if (section === 'dedicated' || section === 'specific') return 'buildable';
  return 'catalog_only';
}

/** Compute the coverage record for a single registry entry (or id/legacy type). */
export function getDocumentCoverage(idOrEntry: string | RegulatoryApplicationType): DocumentCoverage | null {
  const entry = typeof idOrEntry === 'string' ? getApplicationType(idOrEntry) : idOrEntry;
  if (!entry) return null;

  const section = sectionTier(entry);
  const task = taskTier(entry);
  const requiredForms = requiredFormCoverage(entry);
  const formsFullyBacked = requiredForms.every((f) => f.registered && f.implemented);

  return {
    id: entry.id,
    displayName: entry.displayName,
    region: entry.region,
    agency: entry.agency,
    applicationFamily: entry.applicationFamily,
    segment: entry.segment,
    category: entry.category,
    stage: entry.stage,
    sectionBlueprint: section,
    taskBlueprint: task,
    requiredForms,
    formsFullyBacked,
    hasEctdBackbone: REGIONS_WITH_ECTD_BACKBONE.has(entry.region),
    validationProfile: entry.validationProfile,
    readiness: readinessOf(section, task),
  };
}

// ─── Portfolio coverage ───────────────────────────────────────────────────────

export interface CoverageSummary {
  total: number;
  byReadiness: Record<ReadinessTier, number>;
  bySectionTier: Record<BlueprintTier, number>;
  byTaskTier: Record<BlueprintTier, number>;
}

export interface RegionCoverage {
  region: Region;
  agency: Agency;
  total: number;
  productionReady: number;
  buildable: number;
  catalogOnly: number;
}

export interface CoverageReport {
  summary: CoverageSummary;
  byRegion: RegionCoverage[];
  entries: DocumentCoverage[];
}

/** Compute coverage for every active registry entry. */
export function computeCoverage(): DocumentCoverage[] {
  return GLOBAL_REGISTRY.filter((e) => e.active)
    .map((e) => getDocumentCoverage(e))
    .filter((c): c is DocumentCoverage => c !== null);
}

/** Build the full portfolio coverage report. */
export function buildCoverageReport(): CoverageReport {
  const entries = computeCoverage();

  const byReadiness: Record<ReadinessTier, number> = { production_ready: 0, buildable: 0, catalog_only: 0 };
  const bySectionTier: Record<BlueprintTier, number> = { dedicated: 0, specific: 0, generic: 0 };
  const byTaskTier: Record<BlueprintTier, number> = { dedicated: 0, specific: 0, generic: 0 };
  const regionMap = new Map<Region, RegionCoverage>();

  for (const c of entries) {
    byReadiness[c.readiness]++;
    bySectionTier[c.sectionBlueprint]++;
    byTaskTier[c.taskBlueprint]++;

    let r = regionMap.get(c.region);
    if (!r) {
      r = { region: c.region, agency: c.agency, total: 0, productionReady: 0, buildable: 0, catalogOnly: 0 };
      regionMap.set(c.region, r);
    }
    r.total++;
    if (c.readiness === 'production_ready') r.productionReady++;
    else if (c.readiness === 'buildable') r.buildable++;
    else r.catalogOnly++;
  }

  return {
    summary: { total: entries.length, byReadiness, bySectionTier, byTaskTier },
    byRegion: [...regionMap.values()].sort((a, b) => b.total - a.total),
    entries,
  };
}

/** Registry entries that are still catalog-only (the coverage backlog). */
export function getCatalogOnlyGaps(): DocumentCoverage[] {
  return computeCoverage().filter((c) => c.readiness === 'catalog_only');
}

// ─── Biotech lifecycle spine ──────────────────────────────────────────────────

/**
 * The core biotech drug-development lifecycle the platform must cover end to end:
 * preclinical/Pre-IND → IND (clinical) → marketing authorization (NDA/BLA), for
 * each primary region. Every id here must resolve to at least `buildable`.
 */
export const BIOTECH_LIFECYCLE_SPINE: ReadonlyArray<{ id: string; phase: string; region: Region }> = [
  { id: 'US_PRE_IND', phase: 'preclinical_pre_ind', region: 'US' },
  { id: 'US_IND', phase: 'investigational', region: 'US' },
  { id: 'US_NDA', phase: 'marketing_authorization', region: 'US' },
  { id: 'US_BLA', phase: 'marketing_authorization', region: 'US' },
  { id: 'EU_CTA', phase: 'investigational', region: 'EU' },
  { id: 'EU_MAA', phase: 'marketing_authorization', region: 'EU' },
  { id: 'CA_CTA', phase: 'investigational', region: 'CA' },
  { id: 'CA_NDS', phase: 'marketing_authorization', region: 'CA' },
  { id: 'JP_CTN', phase: 'investigational', region: 'JP' },
  { id: 'JP_MKT_APPROVAL', phase: 'marketing_authorization', region: 'JP' },
];

export interface LifecycleSpineStatus {
  id: string;
  phase: string;
  region: Region;
  present: boolean;
  readiness: ReadinessTier | 'missing';
  meetsBar: boolean;
}

/** Readiness of every node on the biotech lifecycle spine. */
export function getLifecycleSpineStatus(): LifecycleSpineStatus[] {
  return BIOTECH_LIFECYCLE_SPINE.map(({ id, phase, region }) => {
    const c = getDocumentCoverage(id);
    const readiness = c?.readiness ?? 'missing';
    return {
      id,
      phase,
      region,
      present: c !== null,
      readiness,
      meetsBar: readiness === 'production_ready' || readiness === 'buildable',
    };
  });
}
