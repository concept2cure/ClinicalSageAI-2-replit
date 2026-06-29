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
  Region,
} from './document-taxonomy.js';
import { getRegionProfile } from './region-profiles.js';
import { getClientTypeProfile } from './client-type-profiles.js';
import { toGatewaySlug } from './region-identity.js';
import { resolveProgramModel } from './program-model.js';
import { resolveValidationProfile } from './validation-profile.js';
import type { WorkspaceAppId } from './app-registry.js';
import {
  servicesFor,
  getService,
  type WorkspaceServiceId,
  type WorkspaceService,
  type WorkspaceScope,
  type WorkspaceVocabulary,
} from './service-registry.js';
import {
  scopeFor,
  vocabularyFor,
  appsFor,
  personaFor,
  type WorkspaceApp,
} from './workspace-derivation.js';
import { SUPPLEMENTARY_CATALOG, buildSelectionCatalog } from './selection-catalog.js';

// Re-export the selection catalog so downstream consumers are unaffected.
export { buildSelectionCatalog, type SelectionOption, type SelectionGroup } from './selection-catalog.js';

// Re-export service types so downstream consumers are unaffected.
export type { WorkspaceServiceId, WorkspaceService, WorkspaceScope, WorkspaceVocabulary };
export { servicesFor, getService };

/**
 * The fixed shell zones — always present in every project, regardless of the
 * selected document type. The type changes their CONTENTS, never their presence.
 */
export const WORKSPACE_SHELL = ['file_tree', 'editor', 'co_author'] as const;
export type WorkspaceShellZone = (typeof WORKSPACE_SHELL)[number];

// The app id + discipline types and the catalog data live in the canonical
// app-registry (single source of truth, shared with license entitlements).
export type { WorkspaceAppId, AppDiscipline } from './app-registry.js';
export type { WorkspaceApp } from './workspace-derivation.js';

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
    services: [getService('knowledge_base')],
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

export default { resolveWorkspaceConfig, buildSelectionCatalog };
