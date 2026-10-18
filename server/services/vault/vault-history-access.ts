/** Read projection only. The canonical reader verifies the unchanged chain
 * before this helper withholds a derived description of a private counterpart. */
import type { RequestSqlClient } from '../../db/requestDb';
import type { RecordAuditHistory } from '../../routes/audit-trail-ledger.routes';
import { hashPayload } from '../audit/chain';
import { verifySequencedRow } from '../audit/chain-row';
import { getCurrentAccessibleProgramScope,requireProgramScopeStillCurrent } from '../c2c/current-program-access';

export class VaultHistoryAccessError extends Error {
  constructor(readonly status:409 | 503,readonly code:string,message:string) {super(message);}
}
const object=(value:unknown):Record<string,unknown> => value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
const generic=(action:string) => action==='vault.document.unrelate' ? 'Document relationship removed' : 'Document relationship recorded';

function relationshipPayloadMatches(row:Record<string,unknown>,hash:string):boolean {
  return row.sha256_chain===hash && typeof row.payload_hash==='string' && hashPayload(row.new_values)===row.payload_hash;
}
const sequenceOf=(value:unknown)=>typeof value==='string' || typeof value==='number' || typeof value==='bigint' ? value : null;

async function verifyRelationshipPayload(q:RequestSqlClient,organizationId:number,row:Record<string,unknown>,hash:string):Promise<void> {
  const actor=row.actor_id==null ? null : Number(row.actor_id);const seq=row.chain_seq;
  const at=row.occurred_at;
  if (!relationshipPayloadMatches(row,hash) || (actor!==null && !Number.isSafeInteger(actor)) || typeof row.action!=='string' || typeof row.target!=='string' ||
      !(at instanceof Date || typeof at==='string')) {
    throw new VaultHistoryAccessError(409,'VAULT_HISTORY_PROVENANCE_UNVERIFIED','The retained relationship audit record could not be verified.');
  }
  if (seq==null) return;
  const verified=await verifySequencedRow(q,{action:row.action,actor_id:actor,target:row.target,payload_hash:String(row.payload_hash),
    occurred_at:at,tenant_id:organizationId,sha256_chain:hash,hmac_seal:typeof row.hmac_seal==='string' ? row.hmac_seal : null,
    chain_seq:sequenceOf(seq)});
  if (verified.link!=='linked' || (verified.seal!=='valid' && verified.seal!=='no-key')) {
    throw new VaultHistoryAccessError(409,'VAULT_HISTORY_PROVENANCE_UNVERIFIED','The retained relationship audit record could not be verified.');
  }
}

async function projectRelationshipHistory(q:RequestSqlClient,input:{organizationId:number;userId:number | undefined},
  history:RecordAuditHistory):Promise<RecordAuditHistory> {
  const scope=await getCurrentAccessibleProgramScope(q,input);
  const ids=history.data.filter(entry=>entry.source==='audit_logs').map(entry=>entry.id.replace(/^AUD-/,''));
  const rows=await q.query(`SELECT a.id::text AS id,a.action,a.record_id,a.actor_id,a.target,a.payload_hash,a.new_values,
    a.occurred_at,a.sha256_chain,a.hmac_seal,a.chain_seq FROM audit_logs a
    WHERE a.tenant_id=$1 AND a.id::text=ANY($2::text[]) AND a.action=ANY($3::text[])`,
  [input.organizationId,ids,['vault.document.relate','vault.document.unrelate']]);
  const byId=new Map(rows.rows.map(row=>['AUD-'+String(row.id),row]));
  const data=[] as typeof history.data;
  for (const entry of history.data) {
    const row=byId.get(entry.id);
    if (!row) {data.push(entry);continue;}
    if (history.meta.chain.ok!==true) {
      // Verification was attempted by the canonical reader. Its actual verdict
      // remains intact; unverified counterpart payload is never used as authority.
      data.push({...entry,event:generic(String(row.action)),reason:null});continue;
    }
    await verifyRelationshipPayload(q,input.organizationId,row,entry.hash);
    const payload=object(row.new_values);const own=String(row.record_id ?? '');
    const from=payload.fromDocumentId;const to=payload.toDocumentId;
    const other=own===from ? to : own===to ? from : null;
    const identity=typeof other==='string' ? await q.query(`SELECT d.program_id::text AS program_id FROM vault.documents d
      JOIN regulatory_programs rp ON rp.id=d.program_id AND rp.organization_id=$1 AND rp.deleted_at IS NULL
      WHERE d.id::text=$2 AND d.organization_id=$1 AND d.deleted_at IS NULL`,[input.organizationId,other]) : {rows:[]};
    const readable=identity.rows.length===1 && scope.programIds.includes(String(identity.rows[0].program_id));
    data.push(readable ? entry : {...entry,event:generic(String(row.action)),reason:null});
  }
  await requireProgramScopeStillCurrent(q,input,scope);
  return {...history,data};
}

export async function projectVaultRelationshipHistory(q:RequestSqlClient,input:{organizationId:number;userId:number | undefined},
  history:RecordAuditHistory):Promise<RecordAuditHistory> {
  try {return await projectRelationshipHistory(q,input,history);} catch(error) {
    if (error instanceof VaultHistoryAccessError || (error instanceof Error && 'status' in error)) throw error;
    throw new VaultHistoryAccessError(503,'VAULT_HISTORY_ACCESS_UNAVAILABLE','Current relationship history access could not be verified.');
  }
}
