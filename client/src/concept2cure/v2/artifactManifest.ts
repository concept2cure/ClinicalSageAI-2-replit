/**
 * The governed-artifact manifest: one CSV index of governed artifacts, written
 * one way for every screen that offers it (fold F3 slice B, D2, 2026-10-29).
 *
 * The Artifacts center wrote its own manifest (AdminSurfaces.tsx
 * `exportManifest`, with a hand-rolled cell escape beside download.ts `toCsv`).
 * The project Vault's governed-artifact branch needed the same index, so the
 * builder moved here and both call it, rather than a second copy. Both screens'
 * rows come from the registry's one read (server/services/artifact-registry-read.ts),
 * so a row says the same thing in either file.
 *
 * It is an index of records, not the files: each row's governance as the
 * registry records it. What a row does not record is said as not recorded.
 */
import { ARTIFACT_ORIGIN_LABELS, type ArtifactOrigin, type ArtifactSignatureState } from '@shared/artifact-governance';
import { UNKNOWN_VAULT_STATUS, vaultStatus } from './fixtures/vault-data';
import { downloadCsv } from './download';

/** One governed artifact as the manifest writes it. */
export interface ArtifactManifestRow {
  name: string;
  artifactId: string;
  ctdSection: string | null;
  kind: string;
  format: string | null;
  origin: ArtifactOrigin | null;
  model: string | null;
  author: string | null;
  /** The registry status in the Vault's vocabulary (server artifactRegistryStatus). */
  status: string;
  /** 'v5'. */
  version: string;
  signature: ArtifactSignatureState;
  signedVersion: number | null;
  reviewed: boolean;
  sourceCount: number;
  contentHash: string | null;
  /** The stored content's size, not a rendered file's. */
  size: string | null;
  project: string;
  updated: string;
}

export const ARTIFACT_MANIFEST_HEADERS = [
  'Name', 'Artifact ID', 'CTD section', 'Kind', 'Format', 'Origin', 'Model', 'Author', 'Status', 'Version',
  'Signed', 'Human review', 'Cited sources', 'Recorded hash', 'Stored content size', 'Project', 'Updated',
] as const;

const NOT_RECORDED = 'Not recorded';

/** The signature cell, as the Artifacts center has written it. */
function signedCell(r: Pick<ArtifactManifestRow, 'signature' | 'signedVersion'>): string {
  switch (r.signature) {
    case 'current':
      return 'yes';
    case 'stale':
      return `earlier version only (v${r.signedVersion})`;
    case 'unknown':
      return 'yes, version not determined';
    default:
      return 'no';
  }
}

/**
 * The status cell: the Vault's label for a status it knows, else the value the
 * row records (the Artifacts center lists archived rows, which the Vault's
 * vocabulary has no label for), and "Not recorded" only when there is none.
 */
function statusCell(status: string): string {
  if (!status || status === 'unknown') return NOT_RECORDED;
  const known = vaultStatus(status);
  return known === UNKNOWN_VAULT_STATUS ? status : known.label;
}

/** One row's cells, in ARTIFACT_MANIFEST_HEADERS order. */
export function artifactManifestCells(r: ArtifactManifestRow): Array<string | number> {
  return [
    r.name,
    r.artifactId,
    r.ctdSection ?? 'None',
    r.kind,
    r.format ? r.format.toUpperCase() : NOT_RECORDED,
    r.origin ? ARTIFACT_ORIGIN_LABELS[r.origin] : NOT_RECORDED,
    r.model ?? NOT_RECORDED,
    r.author ?? NOT_RECORDED,
    statusCell(r.status),
    r.version,
    signedCell(r),
    r.reviewed ? 'Recorded on the current version' : 'None recorded on the current version',
    r.sourceCount,
    r.contentHash ?? NOT_RECORDED,
    r.size ?? NOT_RECORDED,
    r.project,
    r.updated,
  ];
}

/** Hand the manifest to the browser. False when the browser refused the download. */
export function downloadArtifactManifest(filename: string, rows: readonly ArtifactManifestRow[]): boolean {
  return downloadCsv(filename, ARTIFACT_MANIFEST_HEADERS, rows.map(artifactManifestCells));
}
