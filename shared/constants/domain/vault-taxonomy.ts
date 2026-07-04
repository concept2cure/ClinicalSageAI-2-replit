/**
 * Document Vault taxonomy — canonical cross-client vocabulary.
 *
 * The vault is the platform-wide document management system: Pharma and
 * Biotech clients file CTD/eCTD dossiers (IND, NDA, ANDA, BLA, MAA, DMF),
 * Device and IVD clients file 510(k)/PMA/De Novo/CER, and service
 * organizations (CRO/CDMO) work across their sponsors' programs with
 * TMF-structured trial documentation (DIA TMF Reference Model). This module
 * defines the ONE taxonomy those views share:
 *
 *   - VaultDocKind        — what a stored document IS (protocol, CSR, batch
 *                           record, test report, labeling, SBOM, ...)
 *   - VaultFilingType     — the filing/submission framework it belongs to
 *                           (IND, NDA, BLA, MAA, DMF, 510(k), PMA, CER, ...)
 *   - Folder presets      — per-segment folder taxonomies (CTD modules for
 *                           pharma/biotech, DHF/submission folders for
 *                           device/ivd, TMF zones for CROs)
 *
 * Segment ids reuse the canonical `ClientSegmentType` from
 * organization-types.ts — no new client vocabulary is invented here. The
 * per-view helpers (`vaultViewForOrganization`) also honor the service-org
 * rule: a CRO/CDMO does not own a program, so its vault view spans all
 * segments and defaults to TMF-structured folders.
 *
 * Consumed by the client vault surfaces (client/src/concept2cure/mdx/
 * data/vault.ts today; pharma/biotech/CRO vault views as they ship) and
 * available to the server aggregator (server/routes/mdx-vault.ts) for
 * family bucketing.
 *
 * @module shared/constants/domain/vault-taxonomy
 */

import type { DomainEntry } from './index.js';
import type { ClientSegmentType, OrganizationType } from './organization-types.js';
import { orgToClientSegment } from './organization-types.js';
import { TMF_ZONE_REFS } from './tmf-reference-model.js';

// ─── Vault views ─────────────────────────────────────────────────────────────

/**
 * A vault view is either one of the four regulatory client segments or the
 * cross-sponsor service view ('service': CRO/CDMO/academic/government —
 * organizations that work across other sponsors' programs).
 */
export type VaultViewId = ClientSegmentType | 'service';

export const VAULT_VIEWS: DomainEntry<VaultViewId>[] = [
  { value: 'pharma',  label: 'Pharmaceutical', description: 'Small-molecule programs — CTD/eCTD dossier structure (IND, NDA, ANDA, DMF, MAA).' },
  { value: 'biotech', label: 'Biotechnology',  description: 'Biologic/ATMP/vaccine programs — CTD/eCTD dossier structure (IND, BLA, MAA, IMPD).' },
  { value: 'device',  label: 'Medical Device', description: 'Device programs — submission + DHF/RMF structure (510(k), PMA, De Novo, IDE, CER).' },
  { value: 'ivd',     label: 'IVD / Diagnostics', description: 'IVD programs — submission + performance-evaluation structure (510(k), PMA, IVDR PE).' },
  { value: 'service', label: 'CRO / Service',  description: 'Cross-sponsor service view — TMF-structured (DIA TMF Reference Model) with access to every sponsor segment.' },
];

// ─── Document kinds ──────────────────────────────────────────────────────────

/**
 * What a stored document IS, independent of which filing it supports.
 * Ids are stable and include (as a compatible superset) every kind the
 * shipped vault surfaces already use ('report', 'cert', 'label', 'code',
 * 'supplier', 'resp', plus the kit's 'submission'/'clinical'/'qms'/
 * 'capa'/'template').
 */
export type VaultDocKind =
  | 'protocol'      // clinical/nonclinical study protocols + amendments
  | 'csr'           // clinical study reports (ICH E3)
  | 'report'        // test / study / validation reports
  | 'nonclinical'   // pharm/tox study documentation (CTD M4)
  | 'cmc'           // chemistry, manufacturing & controls (CTD M3)
  | 'batch_record'  // executed batch records / certificates of analysis
  | 'spec'          // specifications + analytical methods
  | 'cert'          // certificates, charters, signed statements
  | 'label'         // labeling, IFU, package inserts, artwork
  | 'code'          // software artifacts / SBOM / engineering packages
  | 'supplier'      // supplier certs + quality agreements
  | 'resp'          // agency correspondence (queries, responses, letters)
  | 'submission'    // assembled submission packages / sequences
  | 'clinical'      // clinical documentation (DSMB, IB, consent, TMF content)
  | 'qms'           // quality-system records (SOPs, management review)
  | 'capa'          // CAPA / deviation / nonconformance records
  | 'template';     // approved boilerplate + blank forms

interface VaultDocKindEntry extends DomainEntry<VaultDocKind> {
  /** Views where this kind is a first-class filter ('all' = every view). */
  views: VaultViewId[] | 'all';
}

export const VAULT_DOC_KINDS: VaultDocKindEntry[] = [
  { value: 'protocol',     label: 'Protocols',            views: ['pharma', 'biotech', 'service'], description: 'Study protocols and amendments (ICH E6).' },
  { value: 'csr',          label: 'Clinical study reports', views: ['pharma', 'biotech', 'service'], description: 'ICH E3 clinical study reports.' },
  { value: 'report',       label: 'Test reports',         views: 'all', description: 'Test, study, and validation reports.' },
  { value: 'nonclinical',  label: 'Nonclinical',          views: ['pharma', 'biotech'], description: 'Pharmacology/toxicology documentation (CTD Module 4).' },
  { value: 'cmc',          label: 'CMC',                  views: ['pharma', 'biotech'], description: 'Chemistry, manufacturing and controls (CTD Module 3).' },
  { value: 'batch_record', label: 'Batch records',        views: ['pharma', 'biotech'], description: 'Executed batch records and certificates of analysis.' },
  { value: 'spec',         label: 'Specifications',       views: ['pharma', 'biotech', 'device', 'ivd'], description: 'Specifications and analytical methods.' },
  { value: 'cert',         label: 'Certificates',         views: 'all', description: 'Certificates, charters, and signed statements.' },
  { value: 'label',        label: 'Labeling',             views: 'all', description: 'Labeling, IFU, package inserts, artwork.' },
  { value: 'code',         label: 'Software / SBOM',      views: ['device', 'ivd'], description: 'Software artifacts, SBOMs, engineering packages.' },
  { value: 'supplier',     label: 'Supplier docs',        views: ['device', 'ivd', 'pharma', 'biotech'], description: 'Supplier certificates and quality agreements.' },
  { value: 'resp',         label: 'Agency correspondence', views: 'all', description: 'Agency queries, responses, and decision letters.' },
  { value: 'submission',   label: 'Submissions',          views: 'all', description: 'Assembled submission packages and sequences.' },
  { value: 'clinical',     label: 'Clinical docs',        views: ['pharma', 'biotech', 'device', 'ivd', 'service'], description: 'DSMB charters, investigator brochures, consent, TMF content.' },
  { value: 'qms',          label: 'Quality system',       views: ['device', 'ivd', 'pharma', 'biotech'], description: 'SOPs, management reviews, quality-system records.' },
  { value: 'capa',         label: 'CAPA',                 views: ['device', 'ivd', 'pharma', 'biotech'], description: 'CAPA, deviation, and nonconformance records.' },
  { value: 'template',     label: 'Templates',            views: 'all', description: 'Approved boilerplate and blank forms.' },
];

// ─── Filing types (frameworks) ───────────────────────────────────────────────

/**
 * The filing/submission framework a document belongs to. These are the
 * "framework" pills of the vault's document panel, per view.
 */
export type VaultFilingType =
  | 'ind' | 'nda' | 'anda' | 'bla' | 'maa' | 'impd' | 'dmf' | 'ectd'
  | 'k510' | 'pma' | 'denovo' | 'ide' | 'cer' | 'ivdr_pe' | 'presub'
  | 'tmf' | 'eng' | 'qms' | 'agency';

interface VaultFilingTypeEntry extends DomainEntry<VaultFilingType> {
  views: VaultViewId[] | 'all';
}

export const VAULT_FILING_TYPES: VaultFilingTypeEntry[] = [
  { value: 'ind',     label: 'IND',       views: ['pharma', 'biotech'], description: 'Investigational New Drug application', regulatoryRefs: ['21 CFR 312'] },
  { value: 'nda',     label: 'NDA',       views: ['pharma'],            description: 'New Drug Application', regulatoryRefs: ['21 CFR 314'] },
  { value: 'anda',    label: 'ANDA',      views: ['pharma'],            description: 'Abbreviated New Drug Application (generics)', regulatoryRefs: ['21 CFR 314.94'] },
  { value: 'bla',     label: 'BLA',       views: ['biotech'],           description: 'Biologics License Application', regulatoryRefs: ['42 USC 262 (PHS Act 351)'] },
  { value: 'maa',     label: 'MAA',       views: ['pharma', 'biotech'], description: 'EU Marketing Authorisation Application' },
  { value: 'impd',    label: 'IMPD',      views: ['pharma', 'biotech'], description: 'EU Investigational Medicinal Product Dossier' },
  { value: 'dmf',     label: 'DMF',       views: ['pharma', 'biotech'], description: 'Drug Master File', regulatoryRefs: ['21 CFR 314.420'] },
  { value: 'ectd',    label: 'eCTD',      views: ['pharma', 'biotech'], description: 'eCTD sequence artifacts (Modules 1–5)', regulatoryRefs: ['ICH M8'] },
  { value: 'k510',    label: '510(k)',    views: ['device', 'ivd'],     description: 'Premarket notification', regulatoryRefs: ['21 CFR 807'] },
  { value: 'pma',     label: 'PMA',       views: ['device', 'ivd'],     description: 'Premarket approval', regulatoryRefs: ['21 CFR 814'] },
  { value: 'denovo',  label: 'De Novo',   views: ['device', 'ivd'],     description: 'De Novo classification request' },
  { value: 'ide',     label: 'IDE',       views: ['device', 'ivd'],     description: 'Investigational Device Exemption', regulatoryRefs: ['21 CFR 812'] },
  { value: 'cer',     label: 'CER',       views: ['device'],            description: 'Clinical Evaluation Report (EU MDR)', regulatoryRefs: ['EU MDR 2017/745 Art. 61'] },
  { value: 'ivdr_pe', label: 'IVDR PE',   views: ['ivd'],               description: 'IVDR Performance Evaluation', regulatoryRefs: ['EU IVDR 2017/746'] },
  { value: 'presub',  label: 'Pre-Sub',   views: 'all',                 description: 'Pre-submission / regulatory meeting packages' },
  { value: 'tmf',     label: 'TMF',       views: ['service', 'pharma', 'biotech'], description: 'Trial Master File content (DIA TMF Reference Model)' },
  { value: 'eng',     label: 'Engineering', views: ['device', 'ivd'],   description: 'DHF + RMF engineering artifacts', regulatoryRefs: ['ISO 13485', 'ISO 14971'] },
  { value: 'qms',     label: 'QMS',       views: 'all',                 description: 'Quality-system documentation' },
  { value: 'agency',  label: 'Agency',    views: 'all',                 description: 'FDA / notified-body correspondence' },
];

// ─── Folder presets ──────────────────────────────────────────────────────────

export interface VaultFolderPreset {
  id: string;
  label: string;
  description?: string;
}

/** CTD/eCTD dossier folders — the pharma + biotech native structure. */
const CTD_FOLDERS: VaultFolderPreset[] = [
  { id: 'module-1', label: 'Module 1 · Administrative', description: 'Regional administrative information and prescribing information.' },
  { id: 'module-2', label: 'Module 2 · Summaries', description: 'CTD overviews and summaries (QOS, nonclinical/clinical overviews).' },
  { id: 'module-3', label: 'Module 3 · Quality', description: 'CMC — drug substance and drug product quality documentation.' },
  { id: 'module-4', label: 'Module 4 · Nonclinical', description: 'Nonclinical study reports (pharmacology, PK, toxicology).' },
  { id: 'module-5', label: 'Module 5 · Clinical', description: 'Clinical study reports and related information.' },
  { id: 'sequences', label: 'eCTD sequences', description: 'Assembled and transmitted sequence packages.' },
  { id: 'corresp', label: 'Agency correspondence', description: 'Queries, responses, meeting minutes, decision letters.' },
  { id: 'shared', label: 'Shared · Templates', description: 'Approved boilerplate and blank forms.' },
];

/** Device/IVD folders — submission + design-history structure. */
const DEVICE_FOLDERS: VaultFolderPreset[] = [
  { id: 'k510', label: '510(k) submissions' },
  { id: 'pma', label: 'PMA submissions' },
  { id: 'cer', label: 'Clinical evaluation' },
  { id: 'eng', label: 'Engineering (DHF + RMF)' },
  { id: 'udi', label: 'Labeling and UDI' },
  { id: 'pv', label: 'Post-market vigilance' },
  { id: 'qms', label: 'Quality system' },
  { id: 'corresp', label: 'Agency correspondence' },
  { id: 'shared', label: 'Shared · Templates' },
];

/**
 * TMF zone folders for the service (CRO/CDMO) view — derived from the TMF
 * Reference Model zone mirror (tmf-reference-model.ts) so the vault's folder
 * rail and the eTMF (/api/etmf) share one zone structure.
 */
const TMF_FOLDERS: VaultFolderPreset[] = [
  ...TMF_ZONE_REFS.map(z => ({ id: z.id, label: z.name })),
  { id: 'corresp', label: 'Sponsor / agency correspondence' },
  { id: 'shared', label: 'Shared · Templates' },
];

export const VAULT_FOLDER_PRESETS: Record<VaultViewId, VaultFolderPreset[]> = {
  pharma: CTD_FOLDERS,
  biotech: CTD_FOLDERS,
  device: DEVICE_FOLDERS,
  ivd: DEVICE_FOLDERS,
  service: TMF_FOLDERS,
};

// ─── View helpers ────────────────────────────────────────────────────────────

function appliesToView(views: VaultViewId[] | 'all', view: VaultViewId): boolean {
  return views === 'all' || views.includes(view);
}

/** Document kinds that are first-class filters in a view. */
export function docKindsForView(view: VaultViewId): VaultDocKindEntry[] {
  return VAULT_DOC_KINDS.filter(k => appliesToView(k.views, view));
}

/** Filing frameworks shown as framework pills in a view. */
export function filingTypesForView(view: VaultViewId): VaultFilingTypeEntry[] {
  return VAULT_FILING_TYPES.filter(f => appliesToView(f.views, view));
}

/** Folder taxonomy preset for a view. */
export function foldersForView(view: VaultViewId): VaultFolderPreset[] {
  return VAULT_FOLDER_PRESETS[view];
}

export function isVaultViewId(value: unknown): value is VaultViewId {
  return typeof value === 'string'
    && VAULT_VIEWS.some(v => v.value === value);
}

/**
 * The vault view for an organization. Product owners map to their segment
 * (pharma/biotech/device/ivd); service organizations (CRO, CDMO, academic,
 * government, other) get the cross-sponsor 'service' view — they do not
 * own a program, so their vault spans the sponsors they work for.
 */
export function vaultViewForOrganization(orgType: OrganizationType): VaultViewId {
  return orgToClientSegment(orgType) ?? 'service';
}

export default {
  VAULT_VIEWS,
  VAULT_DOC_KINDS,
  VAULT_FILING_TYPES,
  VAULT_FOLDER_PRESETS,
  docKindsForView,
  filingTypesForView,
  foldersForView,
  isVaultViewId,
  vaultViewForOrganization,
};
