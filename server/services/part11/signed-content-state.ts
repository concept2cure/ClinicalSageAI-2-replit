/**
 * Whether a governed target's signature still binds its content (21 CFR
 * 11.70), re-derived now: the read side of a content binder.
 *
 * Every target with a content binder (governed-target-binders.ts) has a read
 * that asks "does the signature still match the record": the protocol
 * workspace (protocol-signature-manifestation.ts, contentBinding 'changed'),
 * an agency response (response-logic.ts, 'changed-after-approval'), a
 * commitment's fulfilment (commitment-fulfilment.ts, bindsRecord), a QMS
 * release (current-release-approval.ts, 'changed') and an eCTD sequence
 * (sequence-release-signature.ts, 'invalid'). Each re-derives through
 * deriveGovernedTargetBinding, the binder the signature was taken with, so
 * the recipe is never copied. Those reads carry domain rules beyond the
 * comparison (signing policy, renewal, training eligibility) and stay where
 * they are.
 *
 * This is that read for the routes that sign through signGovernedAct and
 * have no read model of their own: the labeling document and translation
 * approvals and the residual-risk acceptance (D5, 2026-10-29;
 * docs/evidence/D5-CONTENT-DIGEST-BINDERS/2026-10-29/). It takes the newest
 * signature on each target that is still in force, and says:
 *   - matches     its digest is the record's digest now, by the same basis;
 *   - changed     same basis, another digest: the record changed after signing;
 *   - source-changed  another digest, but only because a source the recipe
 *                 binds moved on (P-64: the document a translation translates):
 *                 derived with the source the signature recorded, the record
 *                 still gives the signed digest;
 *   - unverified  it cannot be checked: the row does not hash to its
 *                 manifest, it binds another basis (a signature from before
 *                 the binder, which bound the ledger chain hash), or the
 *                 record's content cannot be derived now;
 *   - withdrawn   every signature on the target is out of force (revoked, or
 *                 voided for a refused act);
 *   - unsigned    no signature on the target;
 *   - unavailable the signatures could not be read. Never shown as unsigned.
 *
 * Each signature is re-derived by the recipe it recorded (P-64): the
 * manifest's `bindingRecipe`, or, for a signature from before that member, the
 * recipe tag its `bindingNote` names. So an approval taken by
 * labeling-translation/v1 is checked by v1, not by v2.
 *
 * Read only, on the caller's client.
 *
 * @module server/services/part11/signed-content-state
 */
import type { BoundSource } from './governed-target-binders';
import {
  GOVERNED_REVOCATION_SIGNATURE_TYPE,
  BINDING_BASIS,
  deriveGovernedTargetBinding,
  isSignatureWithdrawn,
  manifestSignatureHash,
  type SignatureDbClient,
} from './signature-persistence';

export type SignedContentState = 'matches' | 'changed' | 'source-changed' | 'unverified' | 'withdrawn' | 'unsigned' | 'unavailable';

export interface SignedContentFacet {
  state: SignedContentState;
  signatureId: number | null;
  signerName: string | null;
  /** ISO 8601. */
  signedAt: string | null;
  meaning: string | null;
  bindingBasis: string | null;
  /** The digest the signature bound. */
  signedDigest: string | null;
  /** The record's digest now, by the same binder; null when not derivable. */
  currentDigest: string | null;
  /** Why the state is not `matches`, in words; null when it is. */
  reason: string | null;
}

type Row = Record<string, unknown>;
const HEX64 = /^[0-9a-f]{64}$/;

const EMPTY: Omit<SignedContentFacet, 'state' | 'reason'> = {
  signatureId: null, signerName: null, signedAt: null, meaning: null, bindingBasis: null, signedDigest: null, currentDigest: null,
};

function manifestOf(row: Row): unknown {
  if (typeof row.signature_manifest !== 'string') return row.signature_manifest;
  try { return JSON.parse(row.signature_manifest); } catch { return null; }
}

function referenceOf(row: Row): Omit<SignedContentFacet, 'state' | 'reason' | 'currentDigest'> {
  const at = row.signed_at instanceof Date ? row.signed_at : row.signed_at == null ? null : new Date(String(row.signed_at));
  return {
    signatureId: Number(row.id),
    signerName: row.signer_name == null ? null : String(row.signer_name),
    signedAt: at && Number.isFinite(at.getTime()) ? at.toISOString() : null,
    meaning: row.signature_meaning == null ? null : String(row.signature_meaning),
    bindingBasis: row.binding_basis == null ? null : String(row.binding_basis),
    signedDigest: row.bound_payload_digest == null ? null : String(row.bound_payload_digest),
  };
}

/** Why a signature row cannot be compared with the record, or null when it can. */
function uncheckable(row: Row): string | null {
  const manifest = manifestOf(row);
  if (!manifest || typeof row.signature_hash !== 'string' || manifestSignatureHash(manifest) !== row.signature_hash) {
    return 'The signature row does not match its recorded manifest, so what it bound cannot be relied on.';
  }
  if (row.binding_basis === BINDING_BASIS.GOVERNED_ACTION_LEDGER) {
    return 'This signature was taken before its content was bound: it binds the ledger chain hash, which is not a content digest.';
  }
  if (typeof row.bound_payload_digest !== 'string' || !HEX64.test(row.bound_payload_digest)) {
    return 'The signature records no content digest.';
  }
  return null;
}

const RECIPE_IN_NOTE = /\(recipe ([a-z0-9][\w.-]*\/v\d+)\)/;

/** The recipe the signature recorded: its manifest's bindingRecipe, else the tag its bindingNote names; undefined when neither. */
function recipeOf(manifest: unknown): string | undefined {
  const m = manifest as { bindingRecipe?: unknown; bindingNote?: unknown } | null;
  if (typeof m?.bindingRecipe === 'string' && m.bindingRecipe) return m.bindingRecipe;
  return typeof m?.bindingNote === 'string' ? RECIPE_IN_NOTE.exec(m.bindingNote)?.[1] : undefined;
}

/** The source the signature recorded binding, when its manifest names one whole. */
function sourceOf(manifest: unknown): BoundSource | null {
  const s = (manifest as { boundSource?: Record<string, unknown> } | null)?.boundSource;
  return s && typeof s.target === 'string' && typeof s.version === 'string' && typeof s.contentDigest === 'string'
    ? { target: s.target, version: s.version, contentDigest: s.contentDigest } : null;
}

type Derived = Awaited<ReturnType<typeof deriveGovernedTargetBinding>>;

/** One signature being checked: where it is, its row, and the recipe it recorded. */
interface Check { client: SignatureDbClient; orgId: number; target: string; row: Row; recipe: string | undefined }

/** A digest that differs: `source-changed` when, as of the source the signature recorded, the record still gives the signed digest. */
async function changedFacet({ client, orgId, target, row, recipe }: Check, current: Derived): Promise<SignedContentFacet> {
  const ref = referenceOf(row);
  const changed: SignedContentFacet = { state: 'changed', ...ref, currentDigest: current.digest, reason: 'The record changed after it was signed: its content digest is not the one the signature bound.' };
  const signedSource = sourceOf(manifestOf(row));
  const nowSource = sourceOf(current.manifest ?? null);
  if (!signedSource || !nowSource || signedSource.contentDigest === nowSource.contentDigest) return changed;
  const asSigned = await deriveGovernedTargetBinding(client, target, orgId, { recipe, asOfSource: signedSource });
  if (asSigned.digest !== row.bound_payload_digest) return changed;
  return {
    state: 'source-changed', ...ref, currentDigest: current.digest,
    reason: `The source it binds changed after it was signed: it was signed against ${signedSource.target} at version ${signedSource.version}, which is now at version ${nowSource.version} with other content. The record itself is as it was signed.`,
  };
}

async function facetOf(client: SignatureDbClient, orgId: number, target: string, row: Row): Promise<SignedContentFacet> {
  const ref = referenceOf(row);
  const cannot = uncheckable(row);
  if (cannot) return { state: 'unverified', ...ref, currentDigest: null, reason: cannot };
  const recipe = recipeOf(manifestOf(row));
  let current: Derived;
  try {
    current = await deriveGovernedTargetBinding(client, target, orgId, recipe ? { recipe } : undefined);
    if (current.digest && current.basis === row.binding_basis && current.digest !== row.bound_payload_digest) {
      return await changedFacet({ client, orgId, target, row, recipe }, current);
    }
  } catch {
    return { state: 'unverified', ...ref, currentDigest: null, reason: "The record's content could not be read to compare with the signature." };
  }
  if (!current.digest || current.basis !== row.binding_basis) {
    return { state: 'unverified', ...ref, currentDigest: current.digest, reason: `The record's content cannot be derived by the signature's basis now: ${current.fallbackReason ?? `its basis is '${current.basis}'`}.` };
  }
  return { state: 'matches', ...ref, currentDigest: current.digest, reason: null };
}

/**
 * The signed-content state of each target, keyed by target. One read of the
 * signatures; then each signed target's content is derived once, in turn.
 */
export async function readSignedContentStates(
  client: SignatureDbClient,
  orgId: number,
  targets: readonly string[],
): Promise<Map<string, SignedContentFacet>> {
  const out = new Map<string, SignedContentFacet>();
  if (targets.length === 0) return out;
  let rows: Row[];
  try {
    rows = (await client.query(
      `SELECT id, signed_target, signer_name, signed_at, signature_meaning, signature_hash, signature_manifest,
              binding_basis, bound_payload_digest, is_valid, superseded_by, verification_status
         FROM electronic_signatures
        WHERE organization_id = $1 AND signed_target = ANY($2::text[]) AND signature_type <> $3
        ORDER BY signed_at DESC, id DESC`,
      [orgId, [...targets], GOVERNED_REVOCATION_SIGNATURE_TYPE],
    )).rows;
  } catch {
    for (const t of targets) out.set(t, { state: 'unavailable', ...EMPTY, reason: 'The signatures on this record could not be read.' });
    return out;
  }
  for (const target of targets) {
    const on = rows.filter((r) => r.signed_target === target);
    const live = on.find((r) => !isSignatureWithdrawn(r));
    if (live) out.set(target, await facetOf(client, orgId, target, live));
    else if (on.length > 0) out.set(target, { state: 'withdrawn', ...referenceOf(on[0]), currentDigest: null, reason: 'Every signature on this record has been withdrawn.' });
    else out.set(target, { state: 'unsigned', ...EMPTY, reason: 'No signature has been given on this record.' });
  }
  return out;
}
