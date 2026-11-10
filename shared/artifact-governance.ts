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

/**
 * The organisation's review rules (founder decision P-117, 2026-11-10: "Those
 * rules should be set by the client super admin in client security user
 * settings"). They are stored in the organisation's settings, under `security`,
 * written through the one governed settings writer with a reason, and read by
 * the approval act (server/services/artifact-approval-act.ts) and the settings
 * card (client/src/concept2cure/v2/onboarding/SessionPolicySetting.tsx).
 *
 * Review itself is not a setting: at least one independent reviewer is always
 * required (P-95), and a reviewer is never an author or the signer (P-18).
 */
export const DEFAULT_INDEPENDENT_REVIEWERS = 1;
export const MIN_INDEPENDENT_REVIEWERS = 1;
export const MAX_INDEPENDENT_REVIEWERS = 5;
/** P-116's rule, as the default: a one-person organisation may approve its own record, on the record. */
export const DEFAULT_SOLE_MEMBER_SELF_APPROVAL = true;

export interface ReviewPolicy {
  /** How many independent reviewers must approve a version before it can be approved. */
  independentReviewersRequired: number;
  /** Whether the organisation's only member may approve, lock or sign their own record, recorded as unreviewed. */
  soleMemberSelfApproval: boolean;
}

/** The organisation's effective review rules: the default where a value is unset or unreadable, held inside the bounds. */
export function reviewPolicyOf(settings: unknown): ReviewPolicy {
  const security = (settings as { security?: Record<string, unknown> } | null | undefined)?.security;
  const required = security?.independentReviewersRequired;
  const self = security?.soleMemberSelfApproval;
  return {
    independentReviewersRequired:
      typeof required === 'number' && Number.isFinite(required)
        ? Math.min(MAX_INDEPENDENT_REVIEWERS, Math.max(MIN_INDEPENDENT_REVIEWERS, Math.floor(required)))
        : DEFAULT_INDEPENDENT_REVIEWERS,
    soleMemberSelfApproval: typeof self === 'boolean' ? self : DEFAULT_SOLE_MEMBER_SELF_APPROVAL,
  };
}

/** Why a settings write that names a review rule is refused, or null. A stored value is never clamped silently. */
export function reviewPolicyRefusal(settingsUpdate: unknown): string | null {
  const security = (settingsUpdate as { security?: unknown } | null | undefined)?.security;
  if (security === null || typeof security !== 'object' || Array.isArray(security)) return null;
  const { independentReviewersRequired: required, soleMemberSelfApproval: self } = security as Record<string, unknown>;
  if (required !== undefined &&
      !(Number.isInteger(required) && (required as number) >= MIN_INDEPENDENT_REVIEWERS && (required as number) <= MAX_INDEPENDENT_REVIEWERS)) {
    return `Independent reviewers required must be a whole number from ${MIN_INDEPENDENT_REVIEWERS} to ${MAX_INDEPENDENT_REVIEWERS}.`;
  }
  if (self !== undefined && typeof self !== 'boolean') return 'Sole-member self-approval must be on or off.';
  return null;
}
