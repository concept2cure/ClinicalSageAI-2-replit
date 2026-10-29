/**
 * A governed artifact's state, said one way wherever it is shown.
 *
 * The governed artifact registry (concept2cure_artifacts) is read by the
 * organization's Artifacts center and by each project's Vault, whose
 * "Governed artifacts" branch lists every artifact of the project (fold F3
 * slice A, D2, 2026-10-29). The signature rule was the Artifacts center's
 * (server/routes/artifacts-center-routes.ts computed the facts,
 * AdminSurfaces.tsx the state); it lives here so the server that computes it
 * and every screen that shows it read the same answer.
 */

/** What an artifact's e-signature says about its CURRENT version. */
export type ArtifactSignatureState = 'none' | 'current' | 'stale' | 'unknown';

export interface ArtifactSignatureFacts {
  /** An active signature exists on the artifact, at any version. */
  sig: boolean;
  /** The version the newest active signature covers; null when unsigned or when it cannot be resolved. */
  sigVersion: number | null;
  /**
   * True when that version is earlier than the current one. Null when that
   * cannot be told: "we cannot tell whether this approval still applies" and
   * "this approval is current" are different claims to a reviewer.
   */
  sigStale: boolean | null;
}

function finiteOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The signature facts from the registry's own columns: whether any active
 * signature exists, the version the newest one covers, and the artifact's
 * current version.
 *
 * `sig` keeps its meaning (any active signature): some writers set
 * artifact_version_id to a predecessor snapshot, so "signed" redefined as
 * "the signature's version equals the current one" would report freshly
 * signed artifacts as unsigned. The version is reported and compared instead.
 */
export function artifactSignatureFacts(input: {
  isSigned: unknown;
  signedVersion: unknown;
  version: unknown;
}): ArtifactSignatureFacts {
  const sig = input.isSigned === true;
  const sigVersion = finiteOrNull(input.signedVersion);
  const version = finiteOrNull(input.version);
  return {
    sig,
    sigVersion,
    sigStale: sig && sigVersion !== null && version !== null ? sigVersion !== version : null,
  };
}

/** The four states. A version edited after it was signed is not "signed". */
export function artifactSignatureState(a: { sig: boolean; sigStale?: boolean | null }): ArtifactSignatureState {
  if (!a.sig) return 'none';
  if (a.sigStale === true) return 'stale';
  if (a.sigStale === false) return 'current';
  return 'unknown';
}

/**
 * Where a registry row came from, as the row itself records it.
 *
 * The registry is not AnA's alone: the CMC compile composes Module 3 sections
 * from recorded facts with a deterministic composer, device imports file one
 * row per imported file, and the extraction pipeline files what it extracted.
 * Calling all of them "drafted by AnA" would attribute governed content to a
 * model (CLAUDE.md Rule 2). Each origin below is read from a column its writer
 * sets; a row that records none has no origin, and nothing is guessed.
 */
export type ArtifactOrigin = 'ana' | 'cmc-composer' | 'import' | 'extraction';

export const ARTIFACT_ORIGIN_LABELS: Readonly<Record<ArtifactOrigin, string>> = Object.freeze({
  ana: 'Drafted by AnA',
  'cmc-composer': 'Composed from CMC records',
  import: 'Imported file',
  extraction: 'Extracted from a source file',
});

export function artifactOrigin(row: {
  /** metadata.compiledFrom: 'module3-os' from the CMC compile (module3-convergence-service.ts). */
  compiledFrom?: string | null;
  /** concept2cure_artifacts.type: 'imported' from device imports (mdx-imports.ts). */
  type?: string | null;
  /** concept2cure_artifacts.category: 'extracted' from the extraction pipeline. */
  category?: string | null;
  /** metadata.source: 'ana_document_studio' from AnA's draft-version store. */
  recordedSource?: string | null;
  /** The model the writer recorded (metadata.model / modelTier / aiModel). */
  model?: string | null;
}): ArtifactOrigin | null {
  if (row.compiledFrom === 'module3-os') return 'cmc-composer';
  if (row.type === 'imported') return 'import';
  if (row.category === 'extracted') return 'extraction';
  if (row.recordedSource === 'ana_document_studio' || (typeof row.model === 'string' && row.model.trim() !== '')) return 'ana';
  return null;
}
