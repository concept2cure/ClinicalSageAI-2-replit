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
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join as joinPath } from 'node:path';
import { getOfficialXfaFieldMap } from '../../ind-forms/official-field-maps.js';
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
  /**
   * The official FDA edition is installed AND its manifest is reviewed and
   * fillable (`assetTrusted` + `fillSupported` + non-empty `fieldMap`). Without
   * it the builder renders a labeled draft or a reconstruction — never the
   * form FDA ingests — so a filing is not form-backed however 'full' the code.
   */
  officialAssetTrusted: boolean;
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

/**
 * Whether the official FDA edition of a form is installed and reviewed for
 * filling. Reads the sidecar manifest the fill service gates on
 * (`templates/forms/acroforms/<formId>.pdf.manifest.json`, or
 * IND_FORM_TEMPLATES_DIR) — the same file, so this report and the renderer
 * cannot disagree. Absent or unreviewed ⇒ false. Never throws.
 *
 * ── Why the coverage report has to read it ───────────────────────────────────
 * `implementationStatus: 'full'` describes the BUILDER (field builders, QC,
 * rendering), not whether an official FDA edition is installed and fillable.
 * Reporting US NDA/BLA/IND as "forms fully backed" on the builder flag alone
 * told a product owner the package would carry the official 356h/1571 when it
 * would not.
 *
 * TWO CONTRACTS, because there are two kinds of official form and the renderer
 * fills both:
 *   - AcroForm (1572, 356h, 3454, 3455): the field map lives in the manifest, so
 *     a named reviewer must vouch for it — `assetTrusted` + `fillSupported` +
 *     a non-empty `fieldMap` + `reviewedBy`.
 *   - dynamic XFA (1571, 3674): no AcroForm widgets exist to name, so the map is
 *     the code-reviewed OFFICIAL_XFA_FIELD_MAPS and the evidence is integrity —
 *     `xfaDynamic` + `fillSupported`, an fda.gov `sourceUrl`, and a `sha256` that
 *     matches the bytes on disk. These are exactly the checks readXfaTemplate
 *     makes, so the report and the renderer still cannot disagree.
 */
function officialFormAssetTrusted(formId: string): boolean {
  const dir = process.env.IND_FORM_TEMPLATES_DIR || joinPath(process.cwd(), 'templates', 'forms', 'acroforms');
  try {
    const raw = readFileSync(joinPath(dir, `${formId}.pdf.manifest.json`), 'utf8');
    const m = JSON.parse(raw) as {
      assetTrusted?: unknown;
      fillSupported?: unknown;
      fieldMap?: unknown;
      reviewedBy?: unknown;
      xfaDynamic?: unknown;
      sourceUrl?: unknown;
      sha256?: unknown;
    };
    const fieldMapPopulated =
      m.fieldMap !== null && typeof m.fieldMap === 'object' && Object.keys(m.fieldMap as object).length > 0;
    if (m.assetTrusted === true && m.fillSupported === true && fieldMapPopulated && Boolean(m.reviewedBy)) {
      return true;
    }
    return xfaFillable(dir, formId, m);
  } catch {
    return false;
  }
}

/**
 * The dynamic-XFA half of the contract above: mirrors readXfaTemplate's checks
 * so this report cannot claim a form the renderer would refuse, nor deny one it
 * would fill.
 */
function xfaFillable(
  dir: string,
  formId: string,
  m: { xfaDynamic?: unknown; fillSupported?: unknown; sourceUrl?: unknown; sha256?: unknown },
): boolean {
  if (m.xfaDynamic !== true || m.fillSupported !== true) return false;
  const map = getOfficialXfaFieldMap(formId);
  if (!map || Object.keys(map).length === 0) return false;
  try {
    const url = new URL(String(m.sourceUrl ?? ''));
    const sourceIsFda =
      url.protocol === 'https:' && (url.hostname === 'fda.gov' || url.hostname.endsWith('.fda.gov'));
    if (!sourceIsFda) return false;
    const bytes = readFileSync(joinPath(dir, `${formId}.pdf`));
    return createHash('sha256').update(bytes).digest('hex') === m.sha256;
  } catch {
    return false;
  }
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
      const officialAssetTrusted = registered ? officialFormAssetTrusted(form!.formId) : false;
      return {
        artifact,
        formNumber: registered ? form!.formNumber : undefined,
        registered,
        implemented,
        officialAssetTrusted,
      };
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
  // A filing is form-backed only when every required form is registered,
  // has a full builder AND the official FDA edition is installed and reviewed
  // for filling. The third condition is what the package actually carries.
  const formsFullyBacked = requiredForms.every(
    (f) => f.registered && f.implemented && f.officialAssetTrusted,
  );

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
    // Honest only when the region has an eCTD backbone AND this entry actually
    // files as eCTD. A device eSTAR/eCopy or ACTD entry in a backbone region
    // (e.g. a US 510(k)) does NOT get an eCTD backbone, so don't claim one.
    hasEctdBackbone: REGIONS_WITH_ECTD_BACKBONE.has(entry.region) && entry.dossierStandard === 'eCTD',
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
