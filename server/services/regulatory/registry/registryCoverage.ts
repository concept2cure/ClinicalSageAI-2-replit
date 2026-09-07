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
/* The governed path's own mapping — the authority on whether a document class
   can be resolved at all. Reading it here is what stops this report claiming a
   readiness the product cannot deliver. */
import { AGENCY_TO_CODE } from '../../c2c/document-class.js';
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

/**
 * Whether a GOVERNED document can be created for this type at all.
 *
 * This is a different question from the blueprint tiers below, and the report
 * used to answer only the blueprint one. A governed document is created by
 * services/c2c/scaffold-project-documents through `resolveDocumentClass`, which
 * needs the program type in PROGRAM_TO_DOC_TYPE and the agency in
 * AGENCY_TO_CODE. AGENCY_TO_CODE deliberately omits Swissmedic, ANVISA, CDSCO,
 * HSA, Notified_Body, ISO, IEC and IMDRF because `c2c_documents_agency_check`
 * rejects them at insert time — so for those entries there is nothing to build,
 * however complete the blueprint.
 *
 *  - `supported`        — the governed path can resolve a document class.
 *  - `unmapped_agency`  — the agency has no c2c_documents.agency value.
 *  - `unmapped_program` — the application family maps to no doc_type.
 */
export type GovernedAuthoring = 'supported' | 'unmapped_agency' | 'unmapped_program';

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
  /**
   * The named person recorded on the installed asset's manifest (`reviewedBy`),
   * or null. Kept apart from `officialAssetTrusted` on purpose: the XFA forms
   * fill from a code-reviewed map and verify their bytes, which earns "backed",
   * but only someone who has opened the filled form in Acrobat can vouch that
   * the map lands values in the right boxes. A client must see both facts.
   */
  reviewer: string | null;
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
  /** Every required form's installed asset names a human reviewer. Independent of
   *  `formsFullyBacked`; see RequiredFormCoverage.reviewer. */
  formsHumanReviewed: boolean;
  /** A regional eCTD backbone reference exists for this region. */
  hasEctdBackbone: boolean;
  validationProfile: string;
  /**
   * Whether a governed document can be started for this type. Reported as its
   * own fact so the blueprint measurement stays readable, and used to cap
   * `readiness` — see readinessOf.
   */
  governedAuthoring: GovernedAuthoring;
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
type FormManifest = {
  assetTrusted?: unknown;
  fillSupported?: unknown;
  fieldMap?: unknown;
  reviewedBy?: unknown;
  xfaDynamic?: unknown;
  sourceUrl?: unknown;
  sha256?: unknown;
};

/** Read a form's installed-asset manifest, or null when none is installed. */
function readFormManifest(formId: string): { dir: string; manifest: FormManifest } | null {
  const dir = process.env.IND_FORM_TEMPLATES_DIR || joinPath(process.cwd(), 'templates', 'forms', 'acroforms');
  try {
    const raw = readFileSync(joinPath(dir, `${formId}.pdf.manifest.json`), 'utf8');
    return { dir, manifest: JSON.parse(raw) as FormManifest };
  } catch {
    return null;
  }
}

function officialFormAssetTrusted(formId: string): boolean {
  const read = readFormManifest(formId);
  if (!read) return false;
  const { dir, manifest: m } = read;
  const fieldMapPopulated =
    m.fieldMap !== null && typeof m.fieldMap === 'object' && Object.keys(m.fieldMap as object).length > 0;
  if (m.assetTrusted === true && m.fillSupported === true && fieldMapPopulated && Boolean(m.reviewedBy)) {
    return true;
  }
  return xfaFillable(dir, formId, m);
}

/** The named human reviewer on the installed asset's manifest, or null. An
 *  empty string is no reviewer. See RequiredFormCoverage.reviewer for why this
 *  is reported separately from officialFormAssetTrusted. */
function officialFormReviewer(formId: string): string | null {
  const reviewer = readFormManifest(formId)?.manifest.reviewedBy;
  return typeof reviewer === 'string' && reviewer.trim().length > 0 ? reviewer : null;
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
      const reviewer = registered ? officialFormReviewer(form!.formId) : null;
      return {
        artifact,
        formNumber: registered ? form!.formNumber : undefined,
        registered,
        implemented,
        officialAssetTrusted,
        reviewer,
      };
    });
}

/** The same normalisation `resolveDocumentClass` applies to the wizard's agency. */
function agencyKey(agency: string): string {
  return String(agency ?? '').toUpperCase().replace(/[\s-]/g, '_');
}

/**
 * Can the governed path start a document for this entry? Static: both sides are
 * plain maps, so this needs no database and stays usable in a CI gate.
 *
 * The program side is checked against the entry's `applicationFamily`, which is
 * the value the wizard sends as the project's program type.
 */
function governedAuthoringOf(entry: RegulatoryApplicationType): GovernedAuthoring {
  if (!AGENCY_TO_CODE[agencyKey(entry.agency)]) return 'unmapped_agency';
  /* The program side is NOT decided here. resolveDocumentClass keys
     PROGRAM_TO_DOC_TYPE on the project's `program_type`, which the wizard
     supplies; the registry's nearest fields are `applicationFamily`
     ('clinical_trial', 'marketing_authorization' — a category) and
     `applicationType` ('IND', '510(k)' — a label). Neither IS the program type,
     so deriving `unmapped_program` from them would be inventing a verdict from
     a field that does not hold one. `unmapped_program` stays in the union for a
     caller that has the real program type; nothing produces it from the
     registry alone. The agency side needs no such guess: AGENCY_TO_CODE is
     keyed on exactly the value this entry carries. */
  return 'supported';
}

/**
 * The readiness tier, CAPPED by whether the product can start the filing.
 *
 * The blueprint tiers below are honest about what they measure — a static
 * section and task structure — but `production_ready` is read by a customer, a
 * salesperson and a CI gate as "this filing type works". For 54 registry
 * entries it did not: their agency has no `c2c_documents.agency` value, so the
 * wizard returns NO_RULE_PACK and no row is ever written. Two of them
 * (BR_DDCM, IN_CT04) carried the top tier. Every one of the 234 active entries
 * read `buildable` or better and none read `catalog_only`, so the backlog view
 * showed no gap at all.
 *
 * A type the governed path cannot begin is `catalog_only` by the tier's own
 * definition — "a selectable catalog entry with no bespoke authoring structure
 * yet" — whatever its blueprint. The blueprint tiers themselves are unchanged
 * and still reported on their own fields.
 */
function readinessOf(
  section: BlueprintTier,
  task: BlueprintTier,
  governed: GovernedAuthoring,
): ReadinessTier {
  if (governed !== 'supported') return 'catalog_only';
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
  const governedAuthoring = governedAuthoringOf(entry);
  const requiredForms = requiredFormCoverage(entry);
  // A filing is form-backed only when every required form is registered,
  // has a full builder AND the official FDA edition is installed and reviewed
  // for filling. The third condition is what the package actually carries.
  const formsFullyBacked = requiredForms.every(
    (f) => f.registered && f.implemented && f.officialAssetTrusted,
  );
  // Human review is a separate fact from integrity-backed fill (see officialFormReviewer).
  const formsHumanReviewed = requiredForms.every((f) => f.reviewer !== null);

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
    formsHumanReviewed,
    // Honest only when the region has an eCTD backbone AND this entry actually
    // files as eCTD. A device eSTAR/eCopy or ACTD entry in a backbone region
    // (e.g. a US 510(k)) does NOT get an eCTD backbone, so don't claim one.
    hasEctdBackbone: REGIONS_WITH_ECTD_BACKBONE.has(entry.region) && entry.dossierStandard === 'eCTD',
    validationProfile: entry.validationProfile,
    governedAuthoring,
    readiness: readinessOf(section, task, governedAuthoring),
  };
}

// ─── Portfolio coverage ───────────────────────────────────────────────────────

export interface CoverageSummary {
  total: number;
  byReadiness: Record<ReadinessTier, number>;
  /** How many types the governed path can actually start, and why not. */
  byGovernedAuthoring: Record<GovernedAuthoring, number>;
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

export interface RegistryCoverageReport {
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
export function buildCoverageReport(): RegistryCoverageReport {
  const entries = computeCoverage();

  const byReadiness: Record<ReadinessTier, number> = { production_ready: 0, buildable: 0, catalog_only: 0 };
  const byGovernedAuthoring: Record<GovernedAuthoring, number> = {
    supported: 0, unmapped_agency: 0, unmapped_program: 0,
  };
  const bySectionTier: Record<BlueprintTier, number> = { dedicated: 0, specific: 0, generic: 0 };
  const byTaskTier: Record<BlueprintTier, number> = { dedicated: 0, specific: 0, generic: 0 };
  const regionMap = new Map<Region, RegionCoverage>();

  for (const c of entries) {
    byReadiness[c.readiness]++;
    byGovernedAuthoring[c.governedAuthoring]++;
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
    summary: { total: entries.length, byReadiness, byGovernedAuthoring, bySectionTier, byTaskTier },
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
