/**
 * Workspace derivation helpers — the pure projection functions that turn a
 * registry entry's properties into workspace configuration values.
 *
 * Extracted from workspace-config.ts for modularity. These are the building
 * blocks the resolver and selection catalog both use.
 *
 * @module shared/regulatory/workspace-derivation
 */

import type { ApplicationFamily, ProductClass } from './document-taxonomy.js';
import {
  APP_REGISTRY,
  type AppRegistryEntry,
  type WorkspaceAppId,
} from './app-registry.js';
import type { WorkspaceScope, WorkspaceVocabulary } from './service-registry.js';

export type WorkspaceApp = AppRegistryEntry;

function app(id: WorkspaceAppId): WorkspaceApp {
  return { ...APP_REGISTRY[id] };
}

// ─── Family classification ─────────────────────────────────────────────────

const DOSSIER_FAMILIES: ReadonlySet<ApplicationFamily> = new Set<ApplicationFamily>([
  'marketing_authorization',
  'device_approval',
  'device_clearance',
  'clinical_trial',
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

// ─── Derivation functions ──────────────────────────────────────────────────

export function scopeFor(family: ApplicationFamily | null, stage?: string | null): WorkspaceScope {
  if (!family) return 'document';
  if (stage === 'pre_submission') return 'document';
  if (family === 'post_market') return 'registration';
  if (RECORD_FAMILIES.has(family)) return 'record';
  if (DOSSIER_FAMILIES.has(family) || CHANGE_FAMILIES.has(family)) return 'dossier';
  return 'document';
}

export function vocabularyFor(productClasses: ProductClass[], segment?: string): WorkspaceVocabulary {
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

export function appsFor(opts: {
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

  if (scope === 'dossier') ids.add('submission_center');

  if (spansAll || mod.includes('M3') || family === 'quality_cmc') ids.add('cmc');
  if (spansAll || mod.includes('M4')) {
    ids.add('nonclinical');
    if (vocabulary === 'drug') ids.add('iacuc');
  }
  if (spansAll || mod.includes('M5') || family === 'clinical_document') {
    ids.add('clinical_csr');
    ids.add('biostatistics');
  }

  const isInvestigational =
    family === 'clinical_trial' ||
    family === 'device_clearance' ||
    family === 'clinical_document' ||
    mod.includes('M5');
  if (isInvestigational) {
    ids.add('study_protocol_design');
    ids.add('irb');
  }

  if (productClasses.some((p) => ['biologic', 'atmp', 'vaccine'].includes(p))) {
    ids.add('ibc');
  }

  if (isDeviceOrIvd) {
    ids.add('risk');
    if (scope === 'dossier') {
      ids.add('human_factors');
      ids.add('cybersecurity');
      ids.add('cer');
      if (family === 'device_clearance') ids.add('substantial_equiv');
    }
  }

  if (vocabulary === 'ivd' || productClasses.includes('ivd')) {
    ids.add('analytical_performance');
  }

  if (productClasses.includes('biosimilar') || productClasses.includes('generic')) {
    ids.add('analytical_similarity');
  }

  if (family === 'safety_report' || family === 'marketing_authorization' || family === 'device_approval') {
    ids.add('pharmacovigilance');
  }

  if (isInvestigational) ids.add('etmf');

  if (family === 'marketing_authorization' || family === 'device_approval') {
    ids.add('market_access');
  }

  if (scope === 'dossier' || scope === 'registration') ids.add('labeling');

  return [...ids].map(app);
}

export function personaFor(vocabulary: WorkspaceVocabulary): string {
  switch (vocabulary) {
    case 'device': return 'Device regulatory strategist (FDA CDRH / EU MDR)';
    case 'ivd':    return 'IVD regulatory strategist (FDA CDRH / EU IVDR)';
    case 'drug':   return 'Drug/biologic regulatory strategist (FDA CDER/CBER / ICH)';
    case 'quality':return 'Quality systems author (21 CFR 820 / ICH Q10)';
    default:       return 'Regulatory co-author';
  }
}
