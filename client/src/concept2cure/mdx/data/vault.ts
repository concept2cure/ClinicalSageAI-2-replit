/**
 * Document vault — data contract + canonical fixtures.
 *
 * Extracted from data/workbench.ts so the vault follows the same
 * surface/data/hooks layout as the other MDX surfaces (engineering,
 * udi, postmarket, analytics). Expanded to the kit shape in
 * design-system/ui_kits/mdx/data/vault.js: folder hierarchy, retention
 * and distribution policy per artifact, KPI strip, and document
 * frameworks for the DocumentsPanel filter row.
 *
 * Wire shape (live):
 *   GET /api/mdx/vault?program_id=<uuid>       — artifact list
 *   GET /api/mdx/vault/:artifactId/versions    — version history
 * (server/routes/mdx-vault.ts, backed by concept2cure_artifacts +
 * c2c_artifact_versions). These fixture shapes are the schema contract
 * hooks/useVault.ts maps API rows into — keep them in lockstep.
 */

import type { Tone } from './workbench';
import {
  docKindsForView,
  filingTypesForView,
  type VaultViewId,
} from '../../../../../shared/constants/domain/vault-taxonomy';

export type VaultFileStatus = 'draft' | 'review' | 'final' | 'locked';

/** Who a stored artifact may be released to under the program's policy. */
export type VaultDistribution =
  | 'org-internal'
  | 'cro-shared'
  | 'supplier-shared'
  | 'public';

export interface VaultFolder {
  id: string;
  label: string;
  count: number;
  /** Parent folder id — null on the root node. */
  parent?: string | null;
  active?: boolean;
}

export interface VaultFilter {
  id: string;
  label: string;
}

export interface VaultFile {
  id: string;
  name: string;
  kind: string;
  type: string;
  size: string;
  prog: string;
  /** Owning folder id (see VAULT_FOLDERS). */
  folder: string;
  ver: string;
  versions: number;
  status: VaultFileStatus;
  updated: string;
  author: string;
  linked: number;
  esig: boolean;
  hash: string;
  blocker?: boolean;
  /** Records-retention policy, e.g. '15 years', 'product life + 10y'. */
  retention?: string;
  distribution?: VaultDistribution;
}

export interface VaultVersion {
  v: string;
  when: string;
  author: string;
  note: string;
  status: 'final' | 'superseded';
}

export interface VaultKpi {
  label: string;
  metric: string;
  unit?: string;
  meta: string;
  tone?: Tone;
}

export const VAULT_FOLDERS: VaultFolder[] = [
  { id: 'root',    label: 'All programs',              count: 1842, parent: null,   active: true },
  { id: 'or801',   label: 'OR-801 Screw',              count: 284,  parent: 'root' },
  { id: 'cv330',   label: 'CV-330 Monitor',            count: 412,  parent: 'root' },
  { id: 'bx204',   label: 'BX-204 CGM',                count: 318,  parent: 'root' },
  { id: 'dx102',   label: 'DX-102 IVD',                count: 176,  parent: 'root' },
  { id: 'iv415',   label: 'IV-415 CoDx',               count: 241,  parent: 'root' },
  { id: 'pm660',   label: 'PM-660 Monitor SW',         count: 138,  parent: 'root' },
  { id: 'shared',  label: 'Shared · Templates',        count: 62,   parent: 'root' },
  { id: 'corresp', label: 'Regulatory correspondence', count: 89,   parent: 'root' },
];

/**
 * Type filters and framework pills come from the shared cross-client
 * taxonomy (shared/constants/domain/vault-taxonomy.ts), which serves
 * pharma / biotech / device / ivd product owners plus the CRO/CDMO
 * service view. This is the DEVICE view (the MDX module); the pharma,
 * biotech, and service vault views derive theirs from the same source.
 */
export function vaultFiltersForView(view: VaultViewId): VaultFilter[] {
  return [
    { id: 'all', label: 'All types' },
    ...docKindsForView(view).map(k => ({ id: k.value, label: k.label })),
  ];
}

export const VAULT_FILTERS: VaultFilter[] = vaultFiltersForView('device');

export const VAULT_KPIS: VaultKpi[] = [
  { label: 'Artifacts in vault', metric: '1,842', meta: '12 awaiting signature · 3 retention review' },
  { label: 'Locked + signed',    metric: '1,204', meta: 'SHA-256 sealed for active submissions', tone: 'ok' },
  { label: 'In review',          metric: '96',    meta: '4 with open blockers', tone: 'warn' },
  { label: 'Vault size',         metric: '4.2',   unit: 'GB', meta: 'Across 9 folders · 7-year+ retention' },
];

/** Framework filter row for the artifact list (kit DocumentsPanel shape),
 *  derived per-view from the shared filing-type taxonomy. */
export function vaultFrameworksForView(
  view: VaultViewId,
): Array<{ id: string; label: string; desc?: string }> {
  return filingTypesForView(view).map(f => ({
    id: f.value,
    label: f.label,
    desc: f.description,
  }));
}

export const VAULT_DOC_FRAMEWORKS = vaultFrameworksForView('device');

export const VAULT_FILES: VaultFile[] = [
  { id: 'f1',  name: 'TR-OR801-009 · Pull-out force, axial',     kind: 'report',   type: 'pdf',  size: '4.2 MB',  prog: 'OR-801', folder: 'or801',   ver: 'v3.2',  versions: 3, status: 'final',  updated: '30 min ago',  author: 'S. Marchetti',  linked: 4, esig: true,  hash: 'a91e…4f02', retention: '15 years',          distribution: 'org-internal' },
  { id: 'f2',  name: 'Biocompat -11 systemic toxicity · final',  kind: 'report',   type: 'pdf',  size: '2.8 MB',  prog: 'OR-801', folder: 'or801',   ver: 'v2.0',  versions: 2, status: 'review', updated: '2h ago',     author: 'L. Tran',       linked: 3, esig: false, hash: 'b742…19cc', retention: '15 years',          distribution: 'supplier-shared', blocker: true },
  { id: 'f3',  name: 'ENG-OR801 rev D · drawing package',        kind: 'code',     type: 'zip',  size: '18.4 MB', prog: 'OR-801', folder: 'or801',   ver: 'rev D', versions: 5, status: 'final',  updated: 'yesterday',  author: 'Eng team',      linked: 7, esig: true,  hash: 'c0d8…7791', retention: 'product life + 10y', distribution: 'org-internal' },
  { id: 'f4',  name: 'Proposed labeling · Instructions for use', kind: 'label',    type: 'docx', size: '3.1 MB',  prog: 'OR-801', folder: 'or801',   ver: 'v1.4',  versions: 4, status: 'review', updated: '3h ago',     author: 'S. Marchetti',  linked: 2, esig: false, hash: 'd111…22aa', retention: 'product life + 10y', distribution: 'public' },
  { id: 'f5',  name: 'FDA 510(k) cover letter — OR-801',         kind: 'cert',     type: 'docx', size: '0.4 MB',  prog: 'OR-801', folder: 'or801',   ver: 'v0.3',  versions: 3, status: 'draft',  updated: '5h ago',     author: 'S. Marchetti',  linked: 1, esig: false, hash: 'e9b1…5140', retention: '15 years',          distribution: 'org-internal' },
  { id: 'f6',  name: 'Supplier cert · Ti-6Al-4V ELI lot 22K',    kind: 'supplier', type: 'pdf',  size: '0.9 MB',  prog: 'OR-801', folder: 'or801',   ver: 'v1.0',  versions: 1, status: 'final',  updated: '1d ago',     author: 'Supplier',      linked: 2, esig: true,  hash: 'f212…0094', retention: '15 years',          distribution: 'supplier-shared' },
  { id: 'f7',  name: 'FDA response · pre-submission Q319-2024',  kind: 'resp',     type: 'pdf',  size: '1.2 MB',  prog: 'OR-801', folder: 'corresp', ver: 'v1.0',  versions: 1, status: 'locked', updated: '2w ago',     author: 'FDA',           linked: 0, esig: true,  hash: '77ac…b102', retention: '25 years',          distribution: 'org-internal' },
  { id: 'f8',  name: 'SBOM · PM-660 patient monitor firmware 2.1', kind: 'code',   type: 'json', size: '0.2 MB',  prog: 'PM-660', folder: 'pm660',   ver: 'v2.1',  versions: 6, status: 'review', updated: '1h ago',     author: 'A. Müller',     linked: 1, esig: false, hash: '18aa…6671', retention: '15 years',          distribution: 'org-internal' },
  { id: 'f9',  name: 'DSMB charter · CV-330 pivotal',            kind: 'cert',     type: 'docx', size: '0.7 MB',  prog: 'CV-330', folder: 'cv330',   ver: 'v1.2',  versions: 2, status: 'review', updated: '4h ago',     author: 'CRO',           linked: 3, esig: false, hash: '3cc1…2278', retention: '25 years',          distribution: 'cro-shared' },
  { id: 'f10', name: 'FAERS export · IV-415 · Q1-2026',          kind: 'report',   type: 'csv',  size: '0.3 MB',  prog: 'IV-415', folder: 'iv415',   ver: 'v1.0',  versions: 1, status: 'final',  updated: '6h ago',     author: 'A. Müller',     linked: 2, esig: false, hash: '4fa0…9091', retention: '15 years',          distribution: 'org-internal' },
  { id: 'f11', name: 'Analytical sensitivity · DX-102 · 14 analytes', kind: 'report', type: 'xlsx', size: '1.1 MB', prog: 'DX-102', folder: 'dx102', ver: 'v0.4',  versions: 4, status: 'draft',  updated: '8h ago',     author: 'P. Shah',       linked: 1, esig: false, hash: '8e22…1b33', retention: '15 years',          distribution: 'org-internal' },
  { id: 'f12', name: 'Gamma sterilization validation summary',   kind: 'report',   type: 'pdf',  size: '3.4 MB',  prog: 'OR-801', folder: 'or801',   ver: 'v2.0',  versions: 2, status: 'final',  updated: '1w ago',     author: 'Contract lab',  linked: 2, esig: true,  hash: 'c199…0e44', retention: '15 years',          distribution: 'org-internal' },
];

export const VAULT_VERSIONS: VaultVersion[] = [
  { v: 'v3.2', when: '30 min ago',  author: 'S. Marchetti',      note: 'Replaced cover page per reviewer · corrected n=30 → n=30 per diameter', status: 'final' },
  { v: 'v3.1', when: '6 hours ago', author: 'Claude · Opus 4.5', note: 'AI-drafted revision — TOC regeneration',                                  status: 'superseded' },
  { v: 'v3.0', when: 'yesterday',   author: 'S. Marchetti',      note: 'Incorporated peer review feedback from L. Tran',                          status: 'superseded' },
];
