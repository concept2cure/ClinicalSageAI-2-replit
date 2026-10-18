/** Append immutable legal-version references to existing communication/handoff records. */
import type { Request } from 'express';
import { z } from 'zod';
import type { CompanyLegalCommunicationLink } from '../../../shared/company-correspondence';
import { requestPgClient, type RequestSqlClient } from '../../db/requestDb';
import { governedActorId } from '../../middleware/orgMembership';
import { authedOrgId, usableOrgId } from '../../utils/authedOrgId';
import { writeChainedAuditRow } from '../auditService';
import { requireCurrentVaultProgramWrite } from '../vault/vault-write-authority';
import { readCurrentProgramActor } from '../c2c/current-program-access';
import { readVaultLifecycleSource } from '../vault/vault-lifecycle';
import { governedReason } from '../../routes/governed-reason';
import { readCompanyLegalDocument, CompanyDocumentsError } from './profile';
import { parseCompanyInput } from './validation';

export const communicationLegalLinkSchema = z.object({ registryIds: z.array(z.string().trim().min(1).max(100)).min(1).max(25),
  outcome: z.enum(['referenced', 'acknowledged', 'questioned', 'replacement_requested', 'rejected']).default('referenced'), reason: governedReason }).strict();
const targets = {
  agency: {
    resourceType: 'concept2cure_agency_communications',
    read: `SELECT audit_metadata AS metadata FROM concept2cure_agency_communications
      WHERE organization_id=$1 AND project_id=$2 AND event_id=$3 FOR UPDATE`,
    write: `UPDATE concept2cure_agency_communications SET audit_metadata=$4::jsonb
      WHERE organization_id=$1 AND project_id=$2 AND event_id=$3`,
  },
  handoff: {
    resourceType: 'concept2cure_submission_center_items',
    read: `SELECT metadata FROM concept2cure_submission_center_items
      WHERE organization_id=$1 AND project_id=$2 AND item_id=$3 FOR UPDATE`,
    write: `UPDATE concept2cure_submission_center_items SET metadata=$4::jsonb
      WHERE organization_id=$1 AND project_id=$2 AND item_id=$3`,
  },
} as const;

async function recordMetadata(q: RequestSqlClient, input: { organizationId: number; projectId: number; recordId: string;
  kind: keyof typeof targets; permittedVisibility: (tier: unknown) => boolean }) {
  const { organizationId, projectId, recordId, kind, permittedVisibility } = input, target = targets[kind];
  const { rows } = await q.query(target.read, [organizationId, projectId, recordId]);
  const metadata = rows[0]?.metadata;
  if (rows.length !== 1 || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)
    || (kind === 'agency' && !permittedVisibility((metadata as Record<string, unknown>).visibilityTier))) {
    throw new CompanyDocumentsError(404, 'COMMUNICATION_NOT_FOUND', 'The communication or handoff was not found in this project.');
  }
  return metadata as Record<string, unknown>;
}
interface LinkContext {
  req: Request; projectId: number; organizationId: number; userId: number; q: RequestSqlClient;
  outcome: CompanyLegalCommunicationLink['outcome']; reason: string;
}
async function verifiedLink(ctx: LinkContext, registryId: string, existing: CompanyLegalCommunicationLink[]): Promise<CompanyLegalCommunicationLink | null> {
  const { req, q, organizationId, userId, projectId, outcome, reason } = ctx;
  const { document } = await readCompanyLegalDocument(req, registryId);
  const access = await requireCurrentVaultProgramWrite(q, { organizationId, userId, programId: document.programId });
  if (access.projectId !== projectId) throw new CompanyDocumentsError(404, 'LEGAL_DOCUMENT_NOT_FOUND', 'Company document not found in this project.');
  const source = await readVaultLifecycleSource(q, organizationId, document.vaultDocumentId);
  if (!source || source.programId !== document.programId || source.contentHash !== document.contentHash || source.version !== document.version) {
    throw new CompanyDocumentsError(409, 'LEGAL_DOCUMENT_VERSION_CHANGED', 'The registered legal version no longer matches its Vault source.');
  }
  if (existing.some(link => link.registryId === registryId && link.contentHash === document.contentHash && link.outcome === outcome)) return null;
  return { registryId, programId: document.programId, vaultDocumentId: document.vaultDocumentId, version: document.version,
    contentHash: document.contentHash, linkedAt: new Date().toISOString(), linkedBy: userId, outcome, reason };
}

/** Access is rechecked in the same transaction as the append and its chained audit. */
export async function appendCommunicationLegalLinks(req: Request, projectId: number, kind: keyof typeof targets, recordId: string,
  permittedVisibility: (tier: unknown, currentRole: string) => boolean = () => true) {
  const input = parseCompanyInput(communicationLegalLinkSchema, req.body);
  const outcome = input.outcome ?? 'referenced';
  const organizationId = usableOrgId(authedOrgId(req)), userId = governedActorId(req);
  if (!organizationId || !userId) throw new CompanyDocumentsError(403, 'AUTH_REQUIRED', 'An authenticated organization member is required.');
  const q = requestPgClient(req), target = targets[kind];
  await q.query('BEGIN');
  let commitAttempted = false;
  try {
    const currentActor = await readCurrentProgramActor(q, { organizationId, userId, forShare: true });
    const previous = await recordMetadata(q, { organizationId, projectId, recordId, kind,
      permittedVisibility: tier => permittedVisibility(tier, currentActor.role) });
    const existing = Array.isArray(previous.companyLegalDocuments) ? previous.companyLegalDocuments as CompanyLegalCommunicationLink[] : [];
    const additions: CompanyLegalCommunicationLink[] = [];
    for (const registryId of [...new Set(input.registryIds)]) {
      const link = await verifiedLink({ req, projectId, organizationId, userId, q, outcome, reason: input.reason }, registryId, existing);
      if (link) additions.push(link);
    }
    const companyLegalDocuments = [...existing, ...additions];
    if (additions.length) {
      await q.query(target.write,
        [organizationId, projectId, recordId, JSON.stringify({ ...previous, companyLegalDocuments })]);
      await writeChainedAuditRow(q, { organizationId, userId, action: 'company_legal_communication_linked', resourceType: target.resourceType, resourceId: recordId,
        reason: input.reason, details: { projectId, kind, outcome, links: additions.map(({ registryId, vaultDocumentId, version, contentHash }) => ({ registryId, vaultDocumentId, version, contentHash })) } });
    }
    commitAttempted = true;
    await q.query('COMMIT');
    return { id: recordId, companyLegalDocuments, unchanged: additions.length === 0,
      message: 'Exact legal versions linked. An agency notice records its outcome; it does not change Vault approval or revoke authority.' };
  } catch (error) {
    if (commitAttempted) {
      await q.discard?.(new Error('Communication legal-link commit unconfirmed'));
      throw new CompanyDocumentsError(503, 'COMMUNICATION_LINK_COMMIT_UNCONFIRMED', 'The link outcome could not be confirmed. Reload this communication before retrying.');
    }
    await q.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
