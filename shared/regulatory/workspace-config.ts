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
  type SubmissionTypeContext,
} from './submission-type-bridge.js';
import type {
  RegulatoryApplicationType,
  ApplicationFamily,
  ProductClass,
  Region,
} from './document-taxonomy.js';

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

/**
 * Full discipline workspaces a client opens from inside the project. Each is its
 * own surface (not a panel on the editor), shared across every document type,
 * and produces an artifact that flows back into the project's file tree.
 */
export type WorkspaceAppId =
  | 'study_protocol_design' // protocol, schedule-of-activities, CRF shells, feasibility
  | 'irb'                   // IRB / ethics — human-subjects governance
  | 'iacuc'                 // IACUC — animal-care governance
  | 'ibc'                   // IBC — biosafety governance
  | 'submission_center' // assemble + transmit (dossier scope only)
  | 'cmc'               // CMC / Module 3 quality workbench
  | 'nonclinical'       // Module 4 nonclinical
  | 'biostatistics'     // SAP, power, group-sequential, endpoint defensibility
  | 'clinical_csr'      // Module 5 / clinical study report authoring
  | 'risk'              // ISO 14971 risk management
  | 'human_factors'     // IEC 62366-1
  | 'cybersecurity'     // FDA §524B
  | 'substantial_equiv' // 510(k) predicate / SE
  | 'labeling'          // labeling / SPL / artwork
  | 'pharmacovigilance';// PV / ICSR / safety

export interface WorkspaceApp {
  id: WorkspaceAppId;
  label: string;
  /** Artifact keys this app produces back into the project file tree. */
  produces: string[];
  /** Where those artifacts land in the dossier tree (CTD-ish hint). */
  landsAt: string;
}

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
}

// ─── App catalog (the full discipline workspaces) ────────────────────────────

const APP_CATALOG: Record<WorkspaceAppId, Omit<WorkspaceApp, 'id'>> = {
  study_protocol_design: { label: 'Study & Protocol Design', produces: ['protocol', 'schedule_of_activities', 'crf_shells', 'feasibility'], landsAt: 'protocol / M5 (5.3.5)' },
  irb:               { label: 'IRB / Ethics (human subjects)', produces: ['irb_submission', 'informed_consent'], landsAt: 'study governance' },
  iacuc:             { label: 'IACUC (animal care)', produces: ['iacuc_protocol'], landsAt: 'nonclinical governance' },
  ibc:               { label: 'IBC (biosafety)', produces: ['ibc_registration'], landsAt: 'study governance' },
  submission_center: { label: 'Submission Center', produces: ['assembled_bundle', 'transmittal'], landsAt: 'gateway / transmit' },
  cmc:               { label: 'CMC (Module 3)', produces: ['quality_overall_summary', 'drug_substance', 'drug_product', 'stability'], landsAt: 'M3' },
  nonclinical:       { label: 'Nonclinical (Module 4)', produces: ['nonclinical_overview', 'tox_reports'], landsAt: 'M4' },
  biostatistics:     { label: 'Biostatistics', produces: ['sap', 'power_analysis', 'statistical_methods'], landsAt: 'protocol / M5 (5.3.5)' },
  clinical_csr:      { label: 'Clinical / CSR', produces: ['clinical_study_report', 'clinical_overview', 'clinical_summary'], landsAt: 'M5 / M2.5 / M2.7' },
  risk:              { label: 'Risk Management (ISO 14971)', produces: ['risk_management_file'], landsAt: 'GSPR / design controls' },
  human_factors:     { label: 'Human Factors (IEC 62366-1)', produces: ['hf_validation_report'], landsAt: 'device performance' },
  cybersecurity:     { label: 'Cybersecurity (§524B)', produces: ['sbom', 'cyber_risk_assessment'], landsAt: 'device performance' },
  substantial_equiv: { label: 'Substantial Equivalence', produces: ['se_comparison', 'predicate_analysis'], landsAt: '510(k) SE' },
  labeling:          { label: 'Labeling', produces: ['draft_labeling', 'spl', 'ifu'], landsAt: 'M1 / labeling' },
  pharmacovigilance: { label: 'Pharmacovigilance', produces: ['icsr', 'psur'], landsAt: 'safety / M5.3.6' },
};

function app(id: WorkspaceAppId): WorkspaceApp {
  return { id, ...APP_CATALOG[id] };
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
]);

const CHANGE_FAMILIES: ReadonlySet<ApplicationFamily> = new Set<ApplicationFamily>([
  'variation',
  'renewal',
  'supplement',
]);

const RECORD_FAMILIES: ReadonlySet<ApplicationFamily> = new Set<ApplicationFamily>([
  'safety_report',
]);

/** US/EU/JP/… (taxonomy region) → fda/ema/pmda/… (gateway region). */
const GATEWAY_REGION_BY_TAXONOMY_REGION: Record<string, string> = {
  US: 'fda', EU: 'ema', JP: 'pmda', CA: 'ca', UK: 'uk', CN: 'cn',
  AU: 'au', CH: 'ch', BR: 'br', IN: 'in', KR: 'kr', SG: 'sg',
};

function scopeFor(family: ApplicationFamily | null): WorkspaceScope {
  if (!family) return 'document';
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
      if (family === 'device_clearance') ids.add('substantial_equiv');
    }
  }

  // Safety / PV.
  if (family === 'safety_report') ids.add('pharmacovigilance');

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
export function resolveWorkspaceConfig(need: string): WorkspaceConfig {
  const key = (need ?? '').trim();

  // 1) Filing registry (the 158-type canonical source).
  const entry: RegulatoryApplicationType | null = resolveToRegistryEntry(key);
  if (entry) {
    const ctx: SubmissionTypeContext | null = getSubmissionTypeContext(entry.id);
    const family = entry.applicationFamily ?? null;
    const scope = scopeFor(family);
    const vocabulary = vocabularyFor(entry.productClass ?? [], entry.segment);
    const ctdModule = entry.ctdModule ?? null;
    const apps = appsFor({ scope, vocabulary, family, ctdModule, productClasses: entry.productClass ?? [] });
    const services = servicesFor({ scope, vocabulary, family, ctdModule, productClasses: entry.productClass ?? [], isRegulatory: true });

    const gateway =
      scope === 'dossier' && entry.region && GATEWAY_REGION_BY_TAXONOMY_REGION[entry.region]
        ? { region: GATEWAY_REGION_BY_TAXONOMY_REGION[entry.region] }
        : null;

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

export default { resolveWorkspaceConfig };
