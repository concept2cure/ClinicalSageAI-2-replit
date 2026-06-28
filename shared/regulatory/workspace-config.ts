/**
 * Workspace configuration — the single source of truth that turns a *selected
 * document type* into a *rendered workspace*.
 *
 * The platform has ONE project workspace, not one per pathway. Its shell is
 * fixed — a file tree + document editor in the center, the AnA co-author panel
 * on the right — and it SELF-TAILORS from the document type the client selects
 * at project creation. An SOP, a CSR, an IND, or a full NDA are all just
 * different rows in the registry; each yields a different `WorkspaceConfig`,
 * and the same shell renders it.
 *
 * Boundary definitions (the load-bearing distinction):
 *
 *   • SERVICE — a capability that feeds AnA and is available INLINE as the client
 *     authors. No standalone workspace; it goes *into* the document (predicate /
 *     precedent intelligence, CDISC validation, regulatory-intelligence readiness,
 *     knowledge-base lookup, literature/evidence search). Services are AnA's
 *     toolset and the author's inline helpers.
 *
 *   • APP — a robust, standalone solution that has its OWN significant workspace
 *     and ALSO feeds artifacts into the document (Study & Protocol Design,
 *     Biostatistics, CMC, IRB/IACUC/IBC, Submission Center). An app is a service
 *     that grew a full surface of its own.
 *
 *   • Everything — apps and services alike — is SELECTED FROM WITHIN THE PROJECT.
 *
 * Three tiers compose a project:
 *
 *   1. THE SHELL    — fixed three zones: file tree + editor (center) and the AnA
 *      co-author panel (right). Always present; the document type only changes
 *      what the tree contains, what schema the editor enforces, and AnA's context.
 *
 *   2. THE APPS     — full, dedicated discipline workspaces opened FROM INSIDE the
 *      project. Each is its own surface, SHARED across every document type
 *      (per-discipline, never per-type), inherits the project's context, and
 *      produces an artifact that flows back into the project's file tree.
 *
 *   3. THE SERVICES — capabilities AnA draws on and the author invokes inline.
 *      No surface of their own; they enrich the document being built.
 *
 * This module is the projection:  registry entry → WorkspaceConfig (shell + apps).
 *
 * It is PURE and deterministic (no DB, no network). It reads the canonical
 * 158-type `global-document-registry` via the submission-type bridge, plus a
 * small supplementary catalog for document types that are NOT regulatory
 * filings (e.g. SOPs live in the QMS, not the filing registry). Scale is data:
 * the only difference between an SOP workspace and an NDA workspace is the
 * values below — not different code, not different editors.
 *
 * @module shared/regulatory/workspace-config
 */

import {
  resolveToRegistryEntry,
  getSubmissionTypeContext,
  getAllActiveSubmissionTypes,
  type SubmissionTypeContext,
} from './submission-type-bridge.js';
import type {
  RegulatoryApplicationType,
  ApplicationFamily,
  ProductClass,
  Region,
} from './document-taxonomy.js';
import { getRegionProfile } from './region-profiles.js';
import { getClientTypeProfile } from './client-type-profiles.js';
import { toGatewaySlug } from './region-identity.js';
import { resolveProgramModel } from './program-model.js';
import { resolveValidationProfile } from './validation-profile.js';
import {
  APP_REGISTRY,
  type AppRegistryEntry,
  type WorkspaceAppId,
} from './app-registry.js';

// ─── Workspace vocabulary ────────────────────────────────────────────────────

/**
 * The structural shape of what the client selected. Drives how the center file
 * tree is rendered and whether a transmit gateway is even applicable.
 *
 *  - 'dossier'      a multi-module application (NDA, BLA, IND, 510(k), PMA) —
 *                   full CTD/eSTAR tree, assembled + transmitted to an agency.
 *  - 'document'     a single structured document (CSR, CER, SOP, a QOS) — one
 *                   authored artifact with an internal section tree.
 *  - 'record'       a form/data record (ICSR, MedWatch, annual report) — driven
 *                   by fields, not prose.
 *  - 'registration' a perpetual, product-scoped function (labeling/CCDS,
 *                   registration status) that outlives any single submission.
 */
export type WorkspaceScope = 'dossier' | 'document' | 'record' | 'registration';

/** Domain language the shell speaks for this type. */
export type WorkspaceVocabulary = 'drug' | 'device' | 'ivd' | 'quality' | 'generic';

/**
 * The fixed shell zones — always present in every project, regardless of the
 * selected document type. The type changes their CONTENTS, never their presence.
 */
export const WORKSPACE_SHELL = ['file_tree', 'editor', 'co_author'] as const;
export type WorkspaceShellZone = (typeof WORKSPACE_SHELL)[number];

// The app id + discipline types and the catalog data live in the canonical
// app-registry (single source of truth, shared with license entitlements).
export type { WorkspaceAppId, AppDiscipline } from './app-registry.js';

/** A discipline app as surfaced in the workspace — its full registry entry. */
export type WorkspaceApp = AppRegistryEntry;

/** Cross-cutting capabilities available on any artifact (not full apps). */
export type WorkspaceCapability = 'validator' | 'esignature' | 'audit_trail';

/**
 * The configuration the fixed workspace shell renders from. Every field is a
 * projection of the selected registry entry — nothing here is bespoke code.
 */
export interface WorkspaceConfig {
  /** The raw selection the client made (e.g. 'NDA', 'CSR', 'SOP', 'US_510K'). */
  need: string;
  /** Whether the need resolved to a known type. */
  known: boolean;

  /** Resolved identity (registry id, label, agency, region). */
  resolved: {
    id: string;
    displayName: string;
    agency: string | null;
    region: Region | null;
    applicationFamily: ApplicationFamily | null;
  };

  /** Structural shape → how the center file tree renders. */
  scope: WorkspaceScope;
  /** Domain language the shell speaks. */
  vocabulary: WorkspaceVocabulary;

  /** The fixed shell zones (always all three) — present for context/clarity. */
  shell: readonly WorkspaceShellZone[];

  /** CENTER-LEFT: the file/section tree the editor navigates. */
  tree: {
    /** Section-blueprint id the tree is built from (when applicable). */
    blueprintId: string | null;
    /** Coarse CTD location, when this lives in a CTD (e.g. 'M1–M5', 'M5 (5.3.5)'). */
    ctdModule: string | null;
    /** A single-document tree (CSR/SOP) vs a multi-module dossier tree. */
    multiModule: boolean;
  };

  /** CENTER: the editor is always the same component; only its schema differs. */
  editor: {
    /** Validation/readiness profile id the editor + validator enforce. */
    validationProfile: string;
    /** Dossier format the output conforms to (eCTD, eSTAR, regional, none). */
    dossierStandard: string;
    /** Artifacts this type requires to be considered ready. */
    requiredArtifacts: string[];
  };

  /** FAR-RIGHT: the AnA co-author panel, tailored — same panel, typed context. */
  coAuthor: {
    /** Persona the co-author adopts for this domain. */
    persona: string;
    /** One-line grounding context handed to AnA for this type. */
    context: string;
  };

  /** Full discipline apps the client can open from inside this project. */
  apps: WorkspaceApp[];

  /** Services AnA draws on and the author invokes inline (no standalone surface). */
  services: WorkspaceService[];

  /** Cross-cutting capabilities available on any artifact here. */
  capabilities: WorkspaceCapability[];

  /** The transmit target, when the scope is a transmittable dossier. */
  gateway: { region: string } | null;

  /** Lifecycle actions available (submit / amend / supplement / withdraw …). */
  lifecycleActions: string[];

  /**
   * REGION overlay — present only when a region is supplied to the resolver.
   * Core fields (language, dossierStandard, gatewayUrl) are pure; the rest are
   * filled by the server enrichment service (M1 backbone, component checklist,
   * gateway size limit, translation mandate).
   */
  region?: WorkspaceRegionConfig;

  /**
   * CLIENT-TYPE (vertical) overlay — present only when a clientType/industry is
   * supplied. Core fields (vertical, persona emphasis, terminology, default
   * approval path, default need) are pure; `entitlement` is filled by the
   * server enrichment service from the org license.
   */
  clientType?: WorkspaceClientTypeConfig;

  /**
   * PROGRAM overlay — the grounded program model (segment, evidence model, the
   * claim spine being argued, the grounded validation profile). Present for
   * product filings; absent for non-product selections (SOP, ICH modules).
   * This is what makes the workspace scaffold the *program*, not just the dossier.
   */
  program?: WorkspaceProgram;
}

/** The grounded program a filing builds — segment + evidence + claim spine. */
export interface WorkspaceProgram {
  segment: string;
  evidenceModel: string | null;
  /** Grounded validation profile id (`<segment>-<evidenceModel>`). */
  validationProfile: string;
  /** Standards corpus in force for the segment (ICH/ISO/CLSI/CFR). */
  standards: string[];
  /** Claims that must be supported for a complete, defensible argument. */
  requiredClaims: {
    id: string;
    label: string;
    supportedByApps: WorkspaceAppId[];
    projectsTo: string[];
  }[];
}

/** Region overlay block. Core fields pure; optional fields = server enrichment. */
export interface WorkspaceRegionConfig {
  code: string;
  language: string;
  dossierStandard: string;
  gatewayUrl?: string;
  // ── server enrichment overlay (optional) ──
  m1BackbonePath?: string;
  requiredModule1Components?: string[];
  gatewaySizeLimitBytes?: number;
  translationMandate?: string;
}

/** Client-type (vertical) overlay. Core fields pure; `entitlement` = enrichment. */
export interface WorkspaceClientTypeConfig {
  industry: string;
  vertical: string;
  personaEmphasis: string;
  terminology: Record<string, string>;
  defaultApprovalPath: string;
  defaultNeed: string;
  // ── server enrichment overlay (optional) ──
  entitlement?: { tier: string; enabledModules: string[] };
  /** Apps the org's license permits (subset of config.apps). Set by enrichment. */
  accessibleApps?: WorkspaceAppId[];
  /** Apps gated behind a module the org hasn't enabled, with the module needed. */
  lockedApps?: { id: WorkspaceAppId; requiredModule: string }[];
}

/**
 * Resolver input. A bare string keeps the original document-type-only behavior
 * byte-for-byte; the object form adds the optional clientType + region axes.
 */
export type WorkspaceConfigInput =
  | string
  | { need: string; clientType?: string; region?: string };

// ─── App catalog (resolved from the canonical app-registry) ──────────────────

function app(id: WorkspaceAppId): WorkspaceApp {
  return { ...APP_REGISTRY[id] };
}

// ─── Service catalog (AnA toolset + inline authoring helpers) ─────────────────

/**
 * Services are capabilities with NO standalone workspace — they feed AnA and are
 * invoked inline while the client authors. Each maps to a real backend service
 * domain. The selected document type decides which are in scope.
 */
export type WorkspaceServiceId =
  | 'knowledge_base'             // ICH / pathways / standards / deficiencies lookup
  | 'regulatory_intelligence'   // CRL/RTF prediction, blended readiness scoring
  | 'cross_artifact_intelligence' // consistency across the dossier
  | 'readiness_assessment'      // per-domain readiness verdicts
  | 'precedent_intelligence'    // precedent mining / predicate intelligence
  | 'literature_search'         // PubMed / scientific literature
  | 'evidence_search'           // evidence fabric / sufficiency
  | 'cdisc_validation'          // SDTM / ADaM conformance
  | 'statistical_defensibility' // endpoint / power sanity (thin; not the biostat app)
  | 'substantial_equivalence_check' // predicate comparison analysis (device/IVD)
  | 'external_intelligence';    // agency feeds / review-timeline signals

export interface WorkspaceService {
  id: WorkspaceServiceId;
  label: string;
  /** Where the capability shows up. */
  feeds: 'ana' | 'inline' | 'both';
}

const SERVICE_CATALOG: Record<WorkspaceServiceId, Omit<WorkspaceService, 'id'>> = {
  knowledge_base:               { label: 'Knowledge base (ICH / standards / deficiencies)', feeds: 'both' },
  regulatory_intelligence:      { label: 'Regulatory intelligence (CRL/RTF, readiness)', feeds: 'both' },
  cross_artifact_intelligence:  { label: 'Cross-artifact consistency', feeds: 'ana' },
  readiness_assessment:         { label: 'Readiness assessment', feeds: 'both' },
  precedent_intelligence:       { label: 'Precedent / predicate intelligence', feeds: 'both' },
  literature_search:            { label: 'Literature search', feeds: 'inline' },
  evidence_search:              { label: 'Evidence search / sufficiency', feeds: 'both' },
  cdisc_validation:             { label: 'CDISC validation (SDTM / ADaM)', feeds: 'inline' },
  statistical_defensibility:    { label: 'Statistical defensibility check', feeds: 'ana' },
  substantial_equivalence_check:{ label: 'Substantial-equivalence check', feeds: 'both' },
  external_intelligence:        { label: 'External agency intelligence', feeds: 'ana' },
};

function svc(id: WorkspaceServiceId): WorkspaceService {
  return { id, ...SERVICE_CATALOG[id] };
}

// ─── Supplementary (non-filing) document catalog ─────────────────────────────

/**
 * Document types a client can select that are NOT regulatory filings — they
 * live in the QMS or are cross-cutting authored documents — so the registry
 * (which is a *filing* registry) does not carry them. The "select your need"
 * catalog is the UNION of the filing registry and this list. Same contract.
 */
interface SupplementaryDoc {
  id: string;
  displayName: string;
  family: ApplicationFamily;
  vocabulary: WorkspaceVocabulary;
  validationProfile: string;
  requiredArtifacts: string[];
  persona: string;
  context: string;
}

const SUPPLEMENTARY_CATALOG: Record<string, SupplementaryDoc> = {
  SOP: {
    id: 'QMS_SOP',
    displayName: 'Standard Operating Procedure',
    family: 'quality_system',
    vocabulary: 'quality',
    validationProfile: 'qms_controlled_document',
    requiredArtifacts: ['purpose_scope', 'responsibilities', 'procedure', 'revision_history'],
    persona: 'Quality systems author (21 CFR 820 / ICH Q10)',
    context: 'Controlled QMS procedure: effective-dated, version-controlled, e-signed, training-gated.',
  },
  WORK_INSTRUCTION: {
    id: 'QMS_WI',
    displayName: 'Work Instruction',
    family: 'quality_system',
    vocabulary: 'quality',
    validationProfile: 'qms_controlled_document',
    requiredArtifacts: ['scope', 'steps', 'revision_history'],
    persona: 'Quality systems author (21 CFR 820 / ICH Q10)',
    context: 'Controlled work instruction subordinate to a parent SOP.',
  },
};

// ─── Derivation helpers ──────────────────────────────────────────────────────

const DOSSIER_FAMILIES: ReadonlySet<ApplicationFamily> = new Set<ApplicationFamily>([
  'marketing_authorization',
  'device_approval',
  'device_clearance',
  'clinical_trial',
  // A companion-diagnostic PMA / 510(k) is a full IVD marketing dossier, reviewed
  // concurrently with the paired therapeutic. It assembles + transmits like any
  // dossier (submission center + agency gateway + the IVD discipline app set).
  'companion_diagnostic',
]);

const CHANGE_FAMILIES: ReadonlySet<ApplicationFamily> = new Set<ApplicationFamily>([
  'variation',
  'renewal',
  'supplement',
]);

const RECORD_FAMILIES: ReadonlySet<ApplicationFamily> = new Set<ApplicationFamily>([
  'safety_report',
]);

function scopeFor(family: ApplicationFamily | null, stage?: string | null): WorkspaceScope {
  if (!family) return 'document';
  // A pre-submission interaction (meeting request, co-development agreement,
  // scientific advice) authors a single document even when it shares a dossier
  // family — e.g. a CDx co-development agreement is companion_diagnostic but is
  // not itself the marketing dossier.
  if (stage === 'pre_submission') return 'document';
  if (family === 'post_market') return 'registration'; // labeling/registration-status family
  if (RECORD_FAMILIES.has(family)) return 'record';
  if (DOSSIER_FAMILIES.has(family) || CHANGE_FAMILIES.has(family)) return 'dossier';
  // clinical_document, dossier_module, quality_cmc, quality_system,
  // software_documentation, master_file, designation, pre_submission → a single
  // authored document (possibly a module-sized subtree).
  return 'document';
}

function vocabularyFor(productClasses: ProductClass[], segment?: string): WorkspaceVocabulary {
  if (productClasses.includes('ivd')) return 'ivd';
  if (productClasses.includes('medical_device')) return 'device';
  if (segment === 'medical_devices') return 'device';
  if (segment === 'diagnostics_ivd') return 'ivd';
  if (
    productClasses.some((p) =>
      ['small_molecule', 'biologic', 'biosimilar', 'generic', 'vaccine', 'atmp'].includes(p),
    )
  ) {
    return 'drug';
  }
  return 'generic';
}

/** Decide which full discipline apps are available inside the project. */
function appsFor(opts: {
  scope: WorkspaceScope;
  vocabulary: WorkspaceVocabulary;
  family: ApplicationFamily | null;
  ctdModule: string | null;
  productClasses: ProductClass[];
}): WorkspaceApp[] {
  const { scope, vocabulary, family, ctdModule, productClasses } = opts;
  const ids = new Set<WorkspaceAppId>();

  const mod = (ctdModule ?? '').toUpperCase();
  const spansAll = scope === 'dossier';
  const isDeviceOrIvd =
    vocabulary === 'device' || vocabulary === 'ivd' ||
    productClasses.includes('medical_device') || productClasses.includes('ivd');

  // Dossier scope can assemble + transmit; single documents/records cannot.
  if (scope === 'dossier') ids.add('submission_center');

  // CMC / Module 3 quality.
  if (spansAll || mod.includes('M3') || family === 'quality_cmc') ids.add('cmc');
  // Nonclinical / Module 4. Animal studies pull in IACUC governance.
  if (spansAll || mod.includes('M4')) {
    ids.add('nonclinical');
    if (vocabulary === 'drug') ids.add('iacuc');
  }
  // Clinical / Module 5 + biostatistics (a CSR alone still needs both).
  if (spansAll || mod.includes('M5') || family === 'clinical_document') {
    ids.add('clinical_csr');
    ids.add('biostatistics');
  }

  // Investigational context (a trial is being designed/run): study & protocol
  // design plus human-subjects IRB governance. Covers IND/CTA (clinical_trial),
  // device IDE (device_clearance), and standalone clinical documents (CSR).
  const isInvestigational =
    family === 'clinical_trial' ||
    family === 'device_clearance' ||
    family === 'clinical_document' ||
    mod.includes('M5');
  if (isInvestigational) {
    ids.add('study_protocol_design');
    ids.add('irb');
  }

  // Biosafety (IBC) where recombinant / gene-therapy / biologic agents are in play.
  if (productClasses.some((p) => ['biologic', 'atmp', 'vaccine'].includes(p))) {
    ids.add('ibc');
  }

  // Device / IVD disciplines.
  if (isDeviceOrIvd) {
    ids.add('risk');
    if (scope === 'dossier') {
      ids.add('human_factors');
      ids.add('cybersecurity');
      ids.add('cer'); // EU MDR/IVDR clinical evaluation / performance evaluation
      if (family === 'device_clearance') ids.add('substantial_equiv');
    }
  }

  // IVD performance: analytical performance is the core IVD evidence (CLSI EP).
  if (vocabulary === 'ivd' || productClasses.includes('ivd')) {
    ids.add('analytical_performance');
  }

  // Biosimilar / generic: the program rests on analytical similarity / bioequivalence.
  if (productClasses.includes('biosimilar') || productClasses.includes('generic')) {
    ids.add('analytical_similarity');
  }

  // Safety / PV.
  if (family === 'safety_report') ids.add('pharmacovigilance');

  // Trial Master File travels with any investigational program.
  if (isInvestigational) ids.add('etmf');

  // Market access / reimbursement opens once a product is heading to market.
  if (family === 'marketing_authorization' || family === 'device_approval') {
    ids.add('market_access');
  }

  // Labeling participates in any dossier and is its own registration function.
  if (scope === 'dossier' || scope === 'registration') ids.add('labeling');

  return [...ids].map(app);
}

/** Decide which inline/AnA services are in scope for this selection. */
function servicesFor(opts: {
  scope: WorkspaceScope;
  vocabulary: WorkspaceVocabulary;
  family: ApplicationFamily | null;
  ctdModule: string | null;
  productClasses: ProductClass[];
  isRegulatory: boolean;
}): WorkspaceService[] {
  const { scope, vocabulary, family, ctdModule, productClasses, isRegulatory } = opts;
  const ids = new Set<WorkspaceServiceId>(['knowledge_base', 'cross_artifact_intelligence']);

  // Non-regulatory docs (SOP/WI) get authoring aids only — no agency intelligence.
  if (!isRegulatory) {
    return [...ids].map(svc);
  }

  ids.add('regulatory_intelligence');
  ids.add('readiness_assessment');

  const mod = (ctdModule ?? '').toUpperCase();
  const spansAll = scope === 'dossier';
  const isDeviceOrIvd =
    vocabulary === 'device' || vocabulary === 'ivd' ||
    productClasses.includes('medical_device') || productClasses.includes('ivd');
  const isClinical = spansAll || mod.includes('M5') || family === 'clinical_document' || family === 'clinical_trial';

  if (isClinical) {
    ids.add('literature_search');
    ids.add('evidence_search');
    ids.add('cdisc_validation');
    ids.add('statistical_defensibility');
    ids.add('precedent_intelligence');
  }
  if (isDeviceOrIvd) {
    ids.add('precedent_intelligence'); // predicate intelligence
    ids.add('evidence_search');
    if (family === 'device_clearance' || scope === 'dossier') ids.add('substantial_equivalence_check');
  }
  // Transmittable dossiers get agency review-timeline signals.
  if (scope === 'dossier') ids.add('external_intelligence');

  return [...ids].map(svc);
}

function personaFor(vocabulary: WorkspaceVocabulary): string {
  switch (vocabulary) {
    case 'device': return 'Device regulatory strategist (FDA CDRH / EU MDR)';
    case 'ivd':    return 'IVD regulatory strategist (FDA CDRH / EU IVDR)';
    case 'drug':   return 'Drug/biologic regulatory strategist (FDA CDER/CBER / ICH)';
    case 'quality':return 'Quality systems author (21 CFR 820 / ICH Q10)';
    default:       return 'Regulatory co-author';
  }
}

// ─── The resolver ────────────────────────────────────────────────────────────

const BASE_CAPABILITIES: WorkspaceCapability[] = ['validator', 'esignature', 'audit_trail'];

/**
 * Project any selected "need" — a submission type, a single document type, or a
 * QMS document — into the configuration the one fixed workspace renders.
 *
 * Resolution order:
 *   1. The canonical filing registry (NDA, IND, CSR, 510(k), PMA, …) via the bridge.
 *   2. The supplementary non-filing catalog (SOP, work instruction, …).
 *   3. An honest unknown fallback (a blank single-document workspace).
 */
function resolveBaseConfig(need: string): WorkspaceConfig {
  const key = (need ?? '').trim();

  // 1) Filing registry (the 158-type canonical source).
  const entry: RegulatoryApplicationType | null = resolveToRegistryEntry(key);
  if (entry) {
    const ctx: SubmissionTypeContext | null = getSubmissionTypeContext(entry.id);
    const family = entry.applicationFamily ?? null;
    const scope = scopeFor(family, entry.stage ?? null);
    const vocabulary = vocabularyFor(entry.productClass ?? [], entry.segment);
    const ctdModule = entry.ctdModule ?? null;
    const apps = appsFor({ scope, vocabulary, family, ctdModule, productClasses: entry.productClass ?? [] });
    const services = servicesFor({ scope, vocabulary, family, ctdModule, productClasses: entry.productClass ?? [], isRegulatory: true });

    const gwSlug = scope === 'dossier' && entry.region ? toGatewaySlug(entry.region) : undefined;
    const gateway = gwSlug ? { region: gwSlug } : null;

    // Ground the workspace in the program model: segment, evidence model, the
    // claim spine being argued, and the grounded validation profile. Present
    // only when the filing resolves to a concrete product segment.
    const programModel = resolveProgramModel(key);
    const program: WorkspaceProgram | undefined =
      programModel.segment && programModel.axes
        ? {
            segment: programModel.segment.id,
            evidenceModel: programModel.axes.evidenceModel,
            validationProfile: resolveValidationProfile(key).profileId,
            standards: programModel.segment.standards,
            requiredClaims: (programModel.claimSpine?.claims ?? []).map((c) => ({
              id: c.id,
              label: c.label,
              supportedByApps: c.supportedByApps,
              projectsTo: c.projectsTo,
            })),
          }
        : undefined;

    return {
      need: key,
      known: true,
      resolved: {
        id: entry.id,
        displayName: entry.displayName,
        agency: entry.agency ?? null,
        region: entry.region ?? null,
        applicationFamily: family,
      },
      scope,
      vocabulary,
      shell: WORKSPACE_SHELL,
      tree: {
        blueprintId: entry.defaultSectionBlueprint ?? null,
        ctdModule,
        multiModule: scope === 'dossier',
      },
      editor: {
        validationProfile: entry.validationProfile ?? 'generic_document',
        dossierStandard: entry.dossierStandard ?? 'none',
        requiredArtifacts: entry.requiredArtifacts ?? [],
      },
      coAuthor: {
        persona: personaFor(vocabulary),
        context:
          ctx?.description ??
          entry.description ??
          `${entry.displayName} (${entry.agency ?? 'agency'})`,
      },
      apps,
      services,
      capabilities: BASE_CAPABILITIES,
      gateway,
      lifecycleActions: entry.lifecycleActions ?? [],
      program,
    };
  }

  // 2) Supplementary non-filing document (SOP, work instruction, …).
  const supp = SUPPLEMENTARY_CATALOG[key.toUpperCase().replace(/[\s-]+/g, '_')];
  if (supp) {
    const scope = scopeFor(supp.family);
    const apps = appsFor({ scope, vocabulary: supp.vocabulary, family: supp.family, ctdModule: null, productClasses: [] });
    const services = servicesFor({ scope, vocabulary: supp.vocabulary, family: supp.family, ctdModule: null, productClasses: [], isRegulatory: false });
    return {
      need: key,
      known: true,
      resolved: { id: supp.id, displayName: supp.displayName, agency: null, region: null, applicationFamily: supp.family },
      scope,
      vocabulary: supp.vocabulary,
      shell: WORKSPACE_SHELL,
      tree: { blueprintId: supp.id.toLowerCase(), ctdModule: null, multiModule: false },
      editor: { validationProfile: supp.validationProfile, dossierStandard: 'none', requiredArtifacts: supp.requiredArtifacts },
      coAuthor: { persona: supp.persona, context: supp.context },
      apps,
      services,
      capabilities: BASE_CAPABILITIES,
      gateway: null,
      lifecycleActions: ['draft', 'review', 'approve', 'effective', 'revise'],
    };
  }

  // 3) Honest unknown — a blank single-document workspace, never a crash.
  return {
    need: key,
    known: false,
    resolved: { id: key || 'unknown', displayName: key || 'Untitled document', agency: null, region: null, applicationFamily: null },
    scope: 'document',
    vocabulary: 'generic',
    shell: WORKSPACE_SHELL,
    tree: { blueprintId: null, ctdModule: null, multiModule: false },
    editor: { validationProfile: 'generic_document', dossierStandard: 'none', requiredArtifacts: [] },
    coAuthor: { persona: 'Regulatory co-author', context: 'Unrecognized document type — author freely; no profile applied.' },
    apps: [],
    services: [svc('knowledge_base')],
    capabilities: ['esignature', 'audit_trail'],
    gateway: null,
    lifecycleActions: ['draft', 'review', 'approve'],
  };
}

/** Pure core of the region overlay (language, dossier standard, gateway URL). */
function buildRegionCore(region: string): WorkspaceRegionConfig | undefined {
  const p = getRegionProfile(region);
  if (!p) return undefined;
  return {
    code: p.region,
    language: p.language,
    dossierStandard: p.dossierStandard,
    gatewayUrl: p.submissionGateway,
  };
}

/** Pure core of the client-type overlay (vertical preset). */
function buildClientTypeCore(industry: string): WorkspaceClientTypeConfig | undefined {
  const p = getClientTypeProfile(industry);
  if (!p) return undefined;
  return {
    industry: p.industry,
    vertical: p.vertical,
    personaEmphasis: p.personaEmphasis,
    terminology: p.terminology,
    defaultApprovalPath: p.defaultApprovalPath,
    defaultNeed: p.defaultNeed,
  };
}

/**
 * Resolve the workspace configuration for a selection.
 *
 * - String form: `resolveWorkspaceConfig('NDA')` — document-type only, byte-for-
 *   byte identical to the original behavior (no region/clientType blocks).
 * - Object form: `resolveWorkspaceConfig({ need, clientType?, region? })` — adds
 *   the pure CORE of the region and/or client-type overlays when supplied. The
 *   server enrichment layer fills the remaining (server-only) overlay fields.
 */
export function resolveWorkspaceConfig(input: WorkspaceConfigInput): WorkspaceConfig {
  if (typeof input === 'string') return resolveBaseConfig(input);

  const base = resolveBaseConfig(input.need);
  if (input.clientType) {
    const ct = buildClientTypeCore(input.clientType);
    if (ct) base.clientType = ct;
  }
  if (input.region) {
    const rg = buildRegionCore(input.region);
    if (rg) base.region = rg;
  }
  return base;
}

// ─── The "select your need" catalog ──────────────────────────────────────────

/** One selectable option in the project-creation picker. */
export interface SelectionOption {
  /** The key to hand to resolveWorkspaceConfig once chosen. */
  value: string;
  label: string;
  scope: WorkspaceScope;
  vocabulary: WorkspaceVocabulary;
  agency: string | null;
  region: string | null;
}

/** A labeled group of options in the picker. */
export interface SelectionGroup {
  id: string;
  label: string;
  options: SelectionOption[];
}

/** Friendly group order + labels, keyed by the structural scope. */
const SELECTION_GROUPS: ReadonlyArray<readonly [string, string]> = [
  ['submissions', 'Submissions — full applications'],
  ['documents', 'Documents'],
  ['records', 'Safety & post-market records'],
  ['registration', 'Product registration & labeling'],
  ['qms', 'Quality system documents'],
];

function groupForScope(scope: WorkspaceScope): string {
  switch (scope) {
    case 'dossier': return 'submissions';
    case 'record': return 'records';
    case 'registration': return 'registration';
    default: return 'documents';
  }
}

/**
 * The unified picker a client uses at project creation. It is the UNION of the
 * canonical filing registry (NDA, IND, CSR, 510(k), …) and the supplementary
 * non-filing catalog (SOP, work instruction). Every option's `value` feeds
 * straight into resolveWorkspaceConfig — selection IS configuration.
 *
 * Grouped by structural scope so a client sees "full submissions" separately
 * from "single documents" and "QMS documents" — the same distinction that
 * decides how the workspace renders.
 */
export function buildSelectionCatalog(): SelectionGroup[] {
  const byGroup = new Map<string, SelectionOption[]>();
  for (const [id] of SELECTION_GROUPS) byGroup.set(id, []);

  // Filing registry (158 canonical types).
  for (const e of getAllActiveSubmissionTypes()) {
    const scope = scopeFor(e.applicationFamily ?? null, e.stage ?? null);
    const option: SelectionOption = {
      value: e.id,
      label: e.displayName,
      scope,
      vocabulary: vocabularyFor(e.productClass ?? [], e.segment),
      agency: e.agency ?? null,
      region: e.region ?? null,
    };
    byGroup.get(groupForScope(scope))!.push(option);
  }

  // Supplementary non-filing documents (QMS).
  for (const [key, doc] of Object.entries(SUPPLEMENTARY_CATALOG)) {
    const scope = scopeFor(doc.family);
    byGroup.get('qms')!.push({
      value: key,
      label: doc.displayName,
      scope,
      vocabulary: doc.vocabulary,
      agency: null,
      region: null,
    });
  }

  // Deterministic order within each group: region, then label.
  for (const opts of byGroup.values()) {
    opts.sort(
      (a, b) => (a.region ?? '').localeCompare(b.region ?? '') || a.label.localeCompare(b.label),
    );
  }

  return SELECTION_GROUPS
    .map(([id, label]) => ({ id, label, options: byGroup.get(id)! }))
    .filter((g) => g.options.length > 0);
}

export default { resolveWorkspaceConfig, buildSelectionCatalog };
