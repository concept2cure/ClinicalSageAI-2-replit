/**
 * Document relationships (plan critique 15, row D2): one Vault version names
 * the documents that support it, that it references, or that it is based on.
 *
 * Veeva relates documents this way. Here the only field that tried was
 * `parentDocumentId` on upload, which took any UUID unchecked, no client sent,
 * and VR-05 refused with no replacement. This is the replacement:
 *
 *   - A relationship goes from one live version to another live version of the
 *     same organisation, in any of its projects. The kind is one of three.
 *     Two versions of one document are already ordered by their version
 *     history and cannot also be related.
 *   - A relationship is removed, never deleted, and removing one requires a
 *     reason (21 CFR 11.10(e)). The table refuses every other change.
 *   - Every relate and unrelate writes a chained audit row against each of the
 *     two documents, in the same transaction as the change, so both histories
 *     show it.
 *   - The list answers both directions: what this version relates to, and what
 *     relates to it. A related version that has since been superseded says so.
 *
 * Failures are returned, not thrown; only an unexpected error escapes.
 */
import type { PoolClient } from 'pg';
import { pool } from '../../db.js';
import { writeChainedAuditRow } from '../auditService.js';
import { getCurrentAccessibleProgramScope,requireCurrentProgramAccess,requireProgramScopeStillCurrent,ProgramReadAccessError } from '../c2c/current-program-access';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import { requireGovernedReason } from '../../routes/governed-reason';
import { readVersionFamily, supersededSql } from './vault-version-family.js';
import { lockLiveVaultVersion, type LiveVaultVersion } from './vault-version-lock';
import { type Refusal, refuse, inRefusableTransaction } from './vault-refusal.js';

export const RELATIONSHIP_TYPES = ['supporting', 'references', 'based_on'] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** How each kind reads from each end. `from` is the version that names the other. */
export const RELATIONSHIP_WORDS: Record<RelationshipType, { outgoing: string; incoming: string }> = {
  supporting: { outgoing: 'Supported by', incoming: 'Supports' },
  references: { outgoing: 'References', incoming: 'Referenced by' },
  based_on: { outgoing: 'Based on', incoming: 'Basis for' },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_MAX = 500;

export type { Refusal } from './vault-refusal.js';

/** The other end of a relationship, as the list shows it. */
export interface RelatedVersion {
  documentId: string;
  title: string | null;
  version: string | null;
  documentType: string | null;
  programId: string;
  programName: string | null;
  /** A later version of it exists: the relationship names this one. */
  superseded: boolean;
}

export interface Relationship {
  id: string;
  type: RelationshipType;
  direction: 'outgoing' | 'incoming';
  /** What the relationship says, read from this version's end. */
  label: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
  other: RelatedVersion;
}

interface Actor {
  programId: string;
  organizationId: number;
  userId: number | null;
  ipAddress?: string;
  userAgent?: string;
}

/** A related version, as lockLiveVaultVersion (vault-version-lock.ts, moved from here 2026-10-19) reads it. */
type VersionRow = LiveVaultVersion;
async function relationshipWriteAccess(client: PoolClient,a: Actor): Promise<Refusal | null> {
  const parent=await requireCurrentProgramAccess(client,{organizationId:a.organizationId,userId:a.userId ?? undefined,
    programId:a.programId,forShare:true});
  return GOVERNED_WRITE_ROLES.has(parent.actor.role.toLowerCase()) ? null :
    refuse(403,'VAULT_WRITE_ROLE_REQUIRED','Your current organization role can read the Vault but cannot change it. Nothing was changed.');
}
async function programRefusable<T>(work:()=>Promise<T | Refusal>): Promise<T | Refusal> {
  try {return await work();} catch(error) {
    if (error instanceof ProgramReadAccessError) return refuse(error.status,error.code,error.message);
    throw error;
  }
}

const named = (v: VersionRow) => `${v.title ?? 'Untitled'} v${v.version ?? '?'}`;

/** One chained row per end, so each document's history shows the change. */
async function recordBothEnds(
  client: PoolClient,
  a: Actor,
  action: 'vault.document.relate' | 'vault.document.unrelate',
  rel: { id: string; type: RelationshipType; from: VersionRow; to: VersionRow; note?: string | null; reason?: string },
): Promise<void> {
  const words = RELATIONSHIP_WORDS[rel.type];
  const verb = action === 'vault.document.relate' ? 'Related' : 'Relationship removed';
  const ends = [
    { doc: rel.from, description: `${verb}: ${words.outgoing.toLowerCase()} ${named(rel.to)}` },
    { doc: rel.to, description: `${verb}: ${words.incoming.toLowerCase()} ${named(rel.from)}` },
  ];
  for (const end of ends) {
    await writeChainedAuditRow(client, {
      tenantId: a.organizationId,
      userId: a.userId ?? undefined,
      action,
      resourceType: 'vault_document',
      resourceId: end.doc.id,
      ipAddress: a.ipAddress,
      userAgent: a.userAgent,
      details: {
        description: end.description,
        relationshipId: rel.id,
        relationshipType: rel.type,
        fromDocumentId: rel.from.id,
        toDocumentId: rel.to.id,
        ...(rel.note !== undefined ? { note: rel.note } : {}),
        ...(rel.reason !== undefined ? { reason: rel.reason } : {}),
      },
    });
  }
}

/** The request's own refusal, before the database is asked; null when it may proceed. */
function addRefusal(p: { documentId: string; toDocumentId: unknown; type: unknown; note: unknown }): Refusal | null {
  if (typeof p.toDocumentId !== 'string' || !UUID_RE.test(p.toDocumentId)) {
    return refuse(400, 'TARGET_REQUIRED', 'Choose the document to relate this one to.');
  }
  if (!RELATIONSHIP_TYPES.includes(p.type as RelationshipType)) {
    return refuse(400, 'INVALID_TYPE', 'A relationship is supporting, references or based on.');
  }
  if (p.toDocumentId.toLowerCase() === p.documentId.toLowerCase()) {
    return refuse(400, 'SELF_RELATIONSHIP', 'A document cannot be related to itself.');
  }
  if (p.note != null && (typeof p.note !== 'string' || p.note.trim().length > NOTE_MAX)) {
    return refuse(400, 'INVALID_NOTE', `A note is at most ${NOTE_MAX} characters.`);
  }
  return null;
}

/** Relate one version of this project to another version of the organisation. */
export async function addRelationship(
  a: Actor & { documentId: string; toDocumentId: unknown; type: unknown; note?: unknown },
): Promise<{ ok: true; id: string } | Refusal> {
  if (!UUID_RE.test(a.documentId)) return refuse(404, 'DOCUMENT_NOT_FOUND', 'No such document in this project.');
  const early = addRefusal({ documentId: a.documentId, toDocumentId: a.toDocumentId, type: a.type, note: a.note });
  if (early) return early;
  const type = a.type as RelationshipType;
  const toId = a.toDocumentId as string;
  const note = typeof a.note === 'string' && a.note.trim() ? a.note.trim() : null;

  return programRefusable(()=>inRefusableTransaction(async (client) => {
    const role=await relationshipWriteAccess(client,a); if (role) return role;
    const from = await lockLiveVaultVersion(client, { documentId: a.documentId, organizationId: a.organizationId, userId: a.userId, programId: a.programId });
    if (!from) return refuse(404, 'DOCUMENT_NOT_FOUND', 'No such document in this project.');
    const to = await lockLiveVaultVersion(client, { documentId: toId, organizationId: a.organizationId, userId: a.userId });
    if (!to) return refuse(404, 'TARGET_NOT_FOUND', 'The document to relate it to was not found in this organization.');
    const family = await readVersionFamily(client, { programId: a.programId, organizationId: a.organizationId, documentId: from.id });
    if (family?.some((v) => v.id === to.id)) {
      return refuse(409, 'SAME_DOCUMENT', 'These are versions of one document; their order is already recorded in its version history.');
    }
    await requireCurrentProgramAccess(client,{organizationId:a.organizationId,userId:a.userId ?? undefined,programId:from.program_id,forShare:true});
    await requireCurrentProgramAccess(client,{organizationId:a.organizationId,userId:a.userId ?? undefined,programId:to.program_id,forShare:true});
    const ins = await client.query(
      `INSERT INTO public.vault_document_relationships
         (organization_id, program_id, from_document_id, to_document_id, relationship_type, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (from_document_id, to_document_id, relationship_type) WHERE removed_at IS NULL DO NOTHING
       RETURNING id::text AS id`,
      [a.organizationId, a.programId, from.id, to.id, type, note, a.userId],
    );
    if (ins.rows.length === 0) {
      return refuse(409, 'ALREADY_RELATED', `It is already ${RELATIONSHIP_WORDS[type].outgoing.toLowerCase()} that version.`);
    }
    const id = String(ins.rows[0].id);
    await recordBothEnds(client, a, 'vault.document.relate', { id, type, from, to, note });
    return { ok: true as const, id };
  }));
}

/** Remove a relationship, with the person's reason. The row stays, marked removed. */
export async function removeRelationship(
  a: Actor & { relationshipId: string; reason: unknown },
): Promise<{ ok: true } | Refusal> {
  const reason = requireGovernedReason(a.reason);
  if (!reason.ok) return refuse(422, 'REASON_REQUIRED', reason.error);
  if (!UUID_RE.test(a.relationshipId)) return refuse(404, 'RELATIONSHIP_NOT_FOUND', 'No such relationship.');

  return programRefusable(()=>inRefusableTransaction(async (client) => {
    const role=await relationshipWriteAccess(client,a); if (role) return role;
    const { rows } = await client.query(
      `SELECT id::text AS id, relationship_type, from_document_id::text AS from_id, to_document_id::text AS to_id,
              removed_at
         FROM public.vault_document_relationships
        WHERE id = $1 AND organization_id = $2 AND program_id = $3
        FOR UPDATE`,
      [a.relationshipId, a.organizationId, a.programId],
    );
    const rel = rows[0];
    if (!rel) return refuse(404, 'RELATIONSHIP_NOT_FOUND', 'No such relationship in this project.');
    if (rel.removed_at) return refuse(409, 'ALREADY_REMOVED', 'That relationship was already removed.');
    const from = await lockLiveVaultVersion(client, { documentId: rel.from_id, organizationId: a.organizationId, userId: a.userId });
    const to = await lockLiveVaultVersion(client, { documentId: rel.to_id, organizationId: a.organizationId, userId: a.userId });
    if (!from || !to) return refuse(409, 'DOCUMENT_GONE', 'One of its documents is no longer in the Vault, so nothing was changed.');
    await requireCurrentProgramAccess(client,{organizationId:a.organizationId,userId:a.userId ?? undefined,programId:from.program_id,forShare:true});
    await requireCurrentProgramAccess(client,{organizationId:a.organizationId,userId:a.userId ?? undefined,programId:to.program_id,forShare:true});
    await client.query(
      `UPDATE public.vault_document_relationships
          SET removed_at = now(), removed_by = $2, removal_reason = $3
        WHERE id = $1 AND organization_id = $4`,
      [rel.id, a.userId, reason.reason, a.organizationId],
    );
    await recordBothEnds(client, a, 'vault.document.unrelate', { id: rel.id, type: rel.relationship_type, from, to, reason: reason.reason });
    return { ok: true as const };
  }));
}

/** Every live relationship of a version, both directions, oldest first. */
export async function listRelationships(
  q: { query: PoolClient['query'] } | typeof pool,
  p: { programId: string; organizationId: number; documentId: string; userId:number | undefined },
): Promise<{ ok: true; relationships: Relationship[]; scope:'verified-accessible-related-programs' } | Refusal> {
  if (!UUID_RE.test(p.documentId)) return refuse(404, 'DOCUMENT_NOT_FOUND', 'No such document in this project.');
  await requireCurrentProgramAccess(q,{organizationId:p.organizationId,userId:p.userId,programId:p.programId});
  const identity={organizationId:p.organizationId,userId:p.userId};
  const scope=await getCurrentAccessibleProgramScope(q,identity);
  const owned = await q.query(
    `SELECT d.organization_id FROM vault.documents d
      WHERE d.id = $1 AND d.program_id = $2 AND d.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM regulatory_programs rp
                     WHERE rp.id = d.program_id AND rp.organization_id = $3 AND rp.deleted_at IS NULL)`,
    [p.documentId, p.programId, p.organizationId],
  );
  if (owned.rows.length === 0) return refuse(404, 'DOCUMENT_NOT_FOUND', 'No such document in this project.');
  if (owned.rows[0].organization_id==null) return refuse(409,'VAULT_TENANT_RECONCILIATION_REQUIRED','This Vault record needs a verified organization relationship.');
  if (Number(owned.rows[0].organization_id)!==p.organizationId) return refuse(404,'DOCUMENT_NOT_FOUND','Document not found.');
  const { rows } = await q.query(
    `SELECT r.id::text AS id, r.relationship_type AS type, r.note, r.created_at,
            CASE WHEN r.from_document_id = $1 THEN 'outgoing' ELSE 'incoming' END AS direction,
            o.id::text AS other_id, o.document_title AS other_title, o.version AS other_version,
            o.document_type AS other_type, o.program_id::text AS other_program_id, rp.name AS other_program_name,
            ${supersededSql('o')} AS other_superseded,
            COALESCE(u.name, u.email) AS created_by
       FROM public.vault_document_relationships r
       JOIN vault.documents o
         ON o.id = CASE WHEN r.from_document_id = $1 THEN r.to_document_id ELSE r.from_document_id END
       JOIN regulatory_programs rp ON rp.id = o.program_id AND rp.organization_id = $2 AND rp.deleted_at IS NULL
       LEFT JOIN LATERAL public.actor_name(r.created_by) u ON TRUE
      WHERE r.organization_id = $2 AND r.removed_at IS NULL
        AND (r.from_document_id = $1 OR r.to_document_id = $1)
        AND o.deleted_at IS NULL AND o.organization_id=$2 AND o.program_id=ANY($3::uuid[])
      ORDER BY r.created_at, r.id`,
    [p.documentId, p.organizationId, scope.programIds],
  );
  await requireProgramScopeStillCurrent(q,identity,scope);
  return {
    ok: true,
    scope:'verified-accessible-related-programs',
    relationships: rows.map((r) => {
      const type = r.type as RelationshipType;
      const direction = r.direction as Relationship['direction'];
      return {
        id: r.id,
        type,
        direction,
        label: RELATIONSHIP_WORDS[type][direction],
        note: r.note ?? null,
        createdAt: new Date(r.created_at).toISOString(),
        createdBy: r.created_by ?? null,
        other: {
          documentId: r.other_id,
          title: r.other_title ?? null,
          version: r.other_version ?? null,
          documentType: r.other_type ?? null,
          programId: r.other_program_id,
          programName: r.other_program_name ?? null,
          superseded: Boolean(r.other_superseded),
        },
      };
    }),
  };
}
