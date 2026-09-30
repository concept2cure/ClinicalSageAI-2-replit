/**
 * Document vault — data contract + canonical fixtures.
 *
 * Extracted from data/workbench.ts so the vault follows the same
 * surface/data/hooks layout as the other MDX surfaces (engineering,
 * udi, postmarket, analytics). Expanded to the kit shape in
 * ui_kits/mdx/data/vault.js: folder hierarchy, retention
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
  foldersForView,
  type VaultViewId,
} from '../../../../../shared/constants/domain/vault-taxonomy';

/** 'uploaded' is not a rung on the authoring ladder — it is the absence of
 *  one. An ingested file is complete AS a file and has no drafting lifecycle,
 *  so 'draft' understates a finished record and 'final' claims an approval
 *  nobody gave. The v2 surface reached the same conclusion independently; see
 *  the note on `uploaded` in v2/fixtures/vault-data.ts. */
export type VaultFileStatus = 'draft' | 'review' | 'final' | 'locked' | 'uploaded';

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

/**
 * Folder rail derives from the shared device-view preset
 * (foldersForView('device') — the kit's submission-type structure), with
 * counts computed from the fixture files so a folder's badge can never
 * advertise documents that aren't there.
 */
export function vaultFoldersForFiles(files: VaultFile[]): VaultFolder[] {
  const counts = new Map<string, number>();
  for (const f of files) counts.set(f.folder, (counts.get(f.folder) ?? 0) + 1);
  return [
    { id: 'root', label: 'All artifacts', count: files.length, parent: null, active: true },
    ...foldersForView('device').map(p => ({
      id: p.id,
      label: p.label,
      count: counts.get(p.id) ?? 0,
      parent: 'root',
    })),
  ];
}

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

/** KPI strip in the kit's card shape, with counts derived from the fixture
 *  files so the sample screen can never contradict its own table. */
export function vaultKpisForFiles(files: VaultFile[]): VaultKpi[] {
  const sealed = files.filter(f => f.status === 'locked' || f.status === 'final').length;
  const review = files.filter(f => f.status === 'review').length;
  const esig = files.filter(f => f.esig).length;
  const mb = files.reduce((s, f) => s + (parseFloat(f.size) || 0), 0);
  return [
    { label: 'Artifacts in vault', metric: String(files.length), meta: `${esig} e-signed · ${review} awaiting review` },
    { label: 'Locked or final',    metric: String(sealed), meta: 'By recorded status' },
    /* Retention review is NOT derivable from VaultFile: the shape carries no
       record date and no retention clock — `updated` is a humanized string
       like "6 hours ago". This asserted `metric: '3'`, a hardcoded literal
       sitting between three genuinely derived figures, indistinguishable from
       them, under a meta line telling the reader to audit before purge. An em
       dash is this codebase's mark for a figure that is unknown, as against 0
       for one that is genuinely zero; the warn tone goes with the 3, because
       there is no longer a count to be alarmed about. */
    { label: 'Retention review',   metric: '—', meta: 'Not assessed — no retention date is recorded on these artifacts' },
    { label: 'Vault size',         metric: mb.toFixed(1), unit: 'MB', meta: 'Across all folders' },
  ];
}

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

/*
 * VAULT_FILES, VAULT_FOLDERS and VAULT_VERSIONS — removed.
 *
 * Fourteen example artifacts — test reports, a labeling IFU, a 510(k) cover
 * letter, "FDA response · pre-submission Q319-2024" — fourteen of them marked
 * `esig: true` with an invented content hash, plus a Part 11 version history
 * for them. The vault is the surface subtitled "21 CFR Part 11 audit trail ·
 * SHA-256 chained"; an example document, hash, signature or version there is
 * the opposite of the record the surface exists to hold. VaultSurface reads
 * GET /api/mdx/vault or says it could not.
 *
 * The KPI copy lost two claims of the same kind: "Locked + signed · SHA-256
 * sealed for active submissions" counted rows by status and asserted a seal
 * nothing checked, and "7-year+ retention" stated a policy no artifact
 * records.
 */

