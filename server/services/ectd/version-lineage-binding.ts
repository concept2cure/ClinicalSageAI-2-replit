/**
 * Which filed leaf a later Vault version acts on — through the lineage the
 * Vault records, never by name.
 *
 * A leaf's staged file name carries its source key, and a Vault version's key
 * is its own uuid (leafSourceKey). So version 2 of a document filed as version 1
 * matched no filed leaf: a declared replace was refused, and one placed as `new`
 * shipped beside the filed version, both current at the agency (WO-9 §20, left
 * open on 2026-09-29; decided as P-42 on 2026-10-22).
 *
 * The Vault records each version's predecessor (`supersedes_id`, VR-08), and the
 * database admits that link only within one document: same program, document
 * code and organization, one live successor. readPredecessorIds reads it under
 * that same rule, so a link the database would refuse today is not lineage here
 * either. Both readers of filed state bind through this module — the packager
 * (package-from-core) and the IND checklist's current inventory — so they cannot
 * disagree on what a version acts on.
 *
 * @module server/services/ectd/version-lineage-binding
 */

import { readPredecessorIds, type FamilyQueryable } from '../vault/vault-version-family';
import { leafSourceKey } from './leaf-source-resolver';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * For each Vault version named, the source keys of its recorded predecessors,
 * nearest first. A version with none is absent from the map. Organization-scoped
 * by readPredecessorIds; a malformed uuid is skipped, not cast.
 */
export async function readVaultPredecessorKeys(
  q: FamilyQueryable,
  organizationId: number,
  documentUuids: Iterable<string>,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const uuid of new Set(documentUuids)) {
    if (!UUID.test(uuid)) continue;
    const ids = await readPredecessorIds(q, { organizationId, documentId: uuid });
    if (ids.length > 0) out.set(uuid, ids.map((id) => leafSourceKey('vault_documents', null, id)));
  }
  return out;
}

export type LineageBinding<T> =
  | { kind: 'bound'; target: T }
  | { kind: 'ambiguous'; count: number }
  | { kind: 'none' };

/**
 * The one candidate (a filed leaf, or a current inventory entry) that carries an
 * earlier version of the document. More than one is ambiguous and binds nothing:
 * which of them the act supersedes is not established, so it is not chosen.
 */
export function bindToFiledPredecessor<T>(
  candidates: readonly T[],
  predecessorKeys: readonly string[] | undefined,
  carries: (candidate: T, key: string) => boolean,
): LineageBinding<T> {
  if (!predecessorKeys || predecessorKeys.length === 0) return { kind: 'none' };
  const hits = candidates.filter((c) => predecessorKeys.some((key) => carries(c, key)));
  if (hits.length === 1) return { kind: 'bound', target: hits[0] };
  if (hits.length > 1) return { kind: 'ambiguous', count: hits.length };
  return { kind: 'none' };
}
