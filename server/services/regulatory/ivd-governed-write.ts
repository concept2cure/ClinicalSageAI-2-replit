/** Governed IVD save transaction; uses the existing assessment/document writers. */
import type { Request } from 'express';
import { requestPgClient } from '../../db/requestDb';
import { requireGovernedProgramWriteTx } from '../c2c/governed-program-write';
import { setTenantContextTx } from '../tenant/governed-tenant-context';
import { recordGovernedAction } from '../../routes/c2c/actions';
import { requireGovernedReason } from '../../routes/governed-reason';
import { resolveOrgId, resolveUserId } from '../../types/auth-request';

interface Client { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> }
export class IvdWriteRefusal extends Error {
  constructor(readonly status: 400 | 401 | 404, readonly code: string, message: string) { super(message); }
}
export async function governedIvdWrite(req: Request, input: { programId: unknown; reason: unknown; command: 'create' | 'delete'; kind: string },
  run: (client: Client, organizationId: number, actorId: number) => Promise<Record<string, unknown>>) {
  const organizationId = resolveOrgId(req); const actorId = resolveUserId(req);
  if (!organizationId || !actorId) throw new IvdWriteRefusal(401, 'AUTH_REQUIRED', 'An identified organization member is required.');
  if (typeof input.programId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.programId)) throw new IvdWriteRefusal(400, 'PROGRAM_REQUIRED', 'Open a program before saving an IVD record.');
  const reason = requireGovernedReason(input.reason);
  if (!reason.ok) throw new IvdWriteRefusal(400, 'REASON_REQUIRED', reason.error);
  const client = requestPgClient(req);
  await client.query('BEGIN');
  try {
    await setTenantContextTx(client, organizationId);
    await requireGovernedProgramWriteTx(client, organizationId, actorId, input.programId);
    const row = await run(client, organizationId, actorId);
    if (typeof row.id !== 'string' || !row.id) throw new Error('IVD saved identity unavailable');
    const governance = await recordGovernedAction(client, { orgId: organizationId, userId: actorId, command: input.command,
      target: `${input.kind}:${row.id}`, reason: reason.reason, domain: 'ivd', surface: 'api', payload: { programId: input.programId, kind: input.kind } });
    await client.query('COMMIT'); return { ...row, id: row.id, governance };
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
}
