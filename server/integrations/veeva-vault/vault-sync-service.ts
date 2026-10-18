/**
 * Veeva Vault coexistence sync service (workflow layer, part 2).
 *
 * Composes the protocol client + field mapping + link store into the two
 * coexistence verbs:
 *   - pushDocument: authored C2C bytes → Vault document (create), link recorded
 *   - pullDocument: Vault document → bytes + mapped C2C metadata, link recorded
 *
 * Every sync upserts `veeva_vault_links` (org-scoped, unique per local and
 * Vault document) with the exchanged hash. This records identity and drift;
 * it does not make a remote create idempotent. Reconcile a confirmed upload
 * before considering another push. Ancillary audit failure after exchange
 * and local persistence is disclosed without misreporting a failed upload.
 * A failed local link cannot roll back the already completed remote action.
 *
 * Dependencies (client, db pool, audit) are injectable so the workflow logic
 * is testable offline; defaults wire the real implementations.
 *
 * @module server/integrations/veeva-vault/vault-sync-service
 */

import { createHash } from 'crypto';
import type { AuditWriteResult } from '../../services/auditService';
import { auditRowOutcomeFrom, type AuditRowOutcome } from '../../services/audit/audit-write-outcome';
import { VeevaVaultClient, type VaultUploadResult, type VaultDocument } from './client';
import {
  toVaultFields,
  fromVaultDocument,
  type C2cDocumentMeta,
  type VaultFieldMappingOptions,
} from './field-mapping';

/** Minimal query surface the link store needs (pg Pool compatible). */
export interface QueryablePool {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

/** Minimal audit surface (auditService compatible). */
export interface AuditSink {
  logAction(entry: {
    organizationId: number;
    userId: number;
    action: string;
    resourceType: string;
    resourceId: number;
    details: Record<string, unknown>;
  }): Promise<AuditWriteResult>;
}

export interface LocalDocumentRef {
  /** Polymorphic local reference, e.g. 'coauthor_documents'. */
  documentTable: string;
  documentId: number;
}

export interface PushDocumentParams {
  organizationId: number;
  userId: number;
  local: LocalDocumentRef;
  meta: C2cDocumentMeta;
  fileName: string;
  bytes: Buffer | Uint8Array;
  mimeType?: string;
  mapping?: VaultFieldMappingOptions;
}

export interface PushDocumentResult extends VaultUploadResult {
  contentSha256: string;
  localLink: 'linked';
  auditTrail: AuditRowOutcome;
}

export interface PullDocumentParams {
  organizationId: number;
  userId: number;
  vaultDocumentId: number;
  /** Local document to associate the pulled content with. */
  local: LocalDocumentRef;
  mapping?: VaultFieldMappingOptions;
}

export interface PullDocumentResult {
  vaultDocument: VaultDocument;
  localLink: 'linked';
  auditTrail: AuditRowOutcome;
  meta: ReturnType<typeof fromVaultDocument>;
  bytes: Buffer;
  contentSha256: string;
}

export interface VaultSyncRecoveryReceipt {
  organizationId: number;
  local: LocalDocumentRef;
  direction: 'push' | 'pull';
  remoteState: 'uploaded' | 'downloaded';
  remote: VaultUploadResult;
  contentSha256: string;
}

/** The remote action completed; local SQL completion is not established.
 * Never expose the caught SQL/provider text or invite another remote create. */
export class VaultLinkUnconfirmedError extends Error {
  readonly code = 'VEEVA_LINK_UNCONFIRMED';
  readonly localLink = 'unconfirmed';
  readonly recovery = { action:'reconcile-existing-link', retryUpload:false } as const;
  constructor(readonly receipt: VaultSyncRecoveryReceipt, readonly auditTrail: AuditRowOutcome) {
    super('The Vault exchange completed, but its local document link could not be confirmed. Reconcile the existing remote document and content hash before another push. Do not upload again automatically.');
    this.name='VaultLinkUnconfirmedError';
  }
}

function sha256(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

/** Upsert the org-scoped local key; conflicting remote identity remains refused. */
export async function upsertVaultLink(
  pool: QueryablePool,
  link: {
    organizationId: number;
    local: LocalDocumentRef;
    vaultDocumentId: number;
    vaultMajorVersion: number | null;
    vaultMinorVersion: number | null;
    contentSha256: string;
    direction: 'push' | 'pull';
    createdBy: number;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO veeva_vault_links (
       organization_id, document_table, document_id, vault_document_id,
       vault_major_version, vault_minor_version, content_sha256,
       last_direction, last_synced_at, created_by, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, now())
     ON CONFLICT (organization_id, document_table, document_id) DO UPDATE SET
       vault_document_id   = EXCLUDED.vault_document_id,
       vault_major_version = EXCLUDED.vault_major_version,
       vault_minor_version = EXCLUDED.vault_minor_version,
       content_sha256      = EXCLUDED.content_sha256,
       last_direction      = EXCLUDED.last_direction,
       last_synced_at      = now(),
       updated_at          = now()`,
    [
      link.organizationId,
      link.local.documentTable,
      link.local.documentId,
      link.vaultDocumentId,
      link.vaultMajorVersion,
      link.vaultMinorVersion,
      link.contentSha256,
      link.direction,
      link.createdBy,
    ],
  );
}

export class VaultSyncService {
  constructor(
    private readonly client: VeevaVaultClient,
    private readonly pool: QueryablePool,
    private readonly audit: AuditSink,
  ) {}

  /** Build with real wiring (env credentials, app db pool, canonical audit). */
  static async fromDefaults(): Promise<VaultSyncService> {
    const [{ pool }, auditService] = await Promise.all([
      import('../../db.js') as Promise<any>,
      import('../../services/auditService.js').then((m: any) => m.default ?? m),
    ]);
    return new VaultSyncService(VeevaVaultClient.fromEnv(), pool, auditService);
  }

  /** Push authored bytes to Vault as a new document; record + audit the link. */
  async pushDocument(params: PushDocumentParams): Promise<PushDocumentResult> {
    const fields = toVaultFields(params.meta, params.mapping);
    const upload = await this.client.uploadDocument({
      fileName: params.fileName,
      bytes: params.bytes,
      mimeType: params.mimeType,
      fields,
    });
    const contentSha256 = sha256(params.bytes);
    let linkConfirmed = false;
    try { await upsertVaultLink(this.pool, {
      organizationId: params.organizationId,
      local: params.local,
      vaultDocumentId: upload.documentId,
      vaultMajorVersion: upload.majorVersion,
      vaultMinorVersion: upload.minorVersion,
      contentSha256,
      direction: 'push',
      createdBy: params.userId,
    }); linkConfirmed=true; } catch { /* The exchange already happened; reconcile instead of repeating it. */ }
    const auditTrail = await this.writeAudit({
      organizationId: params.organizationId,
      userId: params.userId,
      action: 'VEEVA_VAULT_PUSH',
      resourceType: params.local.documentTable,
      resourceId: params.local.documentId,
      details: {
        vaultDocumentId: upload.documentId,
        localLink: linkConfirmed ? 'linked' : 'unconfirmed',
        fileName: params.fileName,
        contentSha256,
        vaultFields: fields,
      },
    });
    if (!linkConfirmed) throw new VaultLinkUnconfirmedError({ organizationId:params.organizationId,
      local:{...params.local}, direction:'push', remoteState:'uploaded', remote:upload, contentSha256 }, auditTrail);
    return { ...upload, contentSha256, localLink:'linked', auditTrail };
  }

  /** Pull a Vault document's metadata + file; record + audit the link. */
  async pullDocument(params: PullDocumentParams): Promise<PullDocumentResult> {
    const vaultDocument = await this.client.getDocument(params.vaultDocumentId);
    const bytes = await this.client.downloadDocumentFile(params.vaultDocumentId);
    const meta=fromVaultDocument(vaultDocument, params.mapping);
    const contentSha256 = sha256(bytes);
    let linkConfirmed = false;
    try { await upsertVaultLink(this.pool, {
      organizationId: params.organizationId,
      local: params.local,
      vaultDocumentId: vaultDocument.id,
      vaultMajorVersion: vaultDocument.majorVersion ?? null,
      vaultMinorVersion: vaultDocument.minorVersion ?? null,
      contentSha256,
      direction: 'pull',
      createdBy: params.userId,
    }); linkConfirmed=true; } catch { /* The exchange already happened; reconcile instead of repeating it. */ }
    const auditTrail = await this.writeAudit({
      organizationId: params.organizationId,
      userId: params.userId,
      action: 'VEEVA_VAULT_PULL',
      resourceType: params.local.documentTable,
      resourceId: params.local.documentId,
      details: {
        vaultDocumentId: vaultDocument.id,
        localLink: linkConfirmed ? 'linked' : 'unconfirmed',
        vaultName: vaultDocument.name,
        contentSha256,
      },
    });
    if (!linkConfirmed) throw new VaultLinkUnconfirmedError({ organizationId:params.organizationId,
      local:{...params.local}, direction:'pull', remoteState:'downloaded',
      remote:{documentId:vaultDocument.id,majorVersion:vaultDocument.majorVersion??null,minorVersion:vaultDocument.minorVersion??null}, contentSha256 }, auditTrail);
    return { vaultDocument, meta, bytes, contentSha256, localLink:'linked', auditTrail };
  }

  private async writeAudit(entry:Parameters<AuditSink['logAction']>[0]):Promise<AuditRowOutcome> {
    let result:AuditWriteResult|undefined;
    let thrown:string|undefined;
    try { result=await this.audit.logAction(entry); }
    catch(error) { thrown=error instanceof Error ? error.message : String(error); }
    return auditRowOutcomeFrom(result,{action:entry.action,resourceType:entry.resourceType,resourceId:entry.resourceId,thrown});
  }
}

export default { VaultSyncService, upsertVaultLink };
