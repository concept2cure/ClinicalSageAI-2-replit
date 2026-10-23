/** Real current-access, lifecycle and disposition SQL. Verified-byte retrieval
 * is the explicit seam; native PostgreSQL concurrency is not qualified here. */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDispositionHarness, type DispositionHarness, type DispositionFixture } from '../../../document-data-disposition/__tests__/disposition-fixture';

const h = vi.hoisted(() => ({ pool: null as unknown, read: vi.fn() }));
vi.mock('../../../../db', () => ({ db: {}, get pool() { return h.pool; } }));
vi.mock('../../../../routes/c2c/project-vault', () => ({ readVerifiedVaultBytes: h.read }));
import { createDeviceAttachmentResolver } from '../estar-attachment-plan';
const BYTES = Buffer.from('%PDF-1.7\nGoverned device evidence, exact immutable bytes');
const SHA = createHash('sha256').update(BYTES).digest('hex');
let harness: DispositionHarness;
let f: DispositionFixture;
beforeAll(async () => {
  harness = await createDispositionHarness();
  await harness.pg.exec(`ALTER TABLE vault.documents ADD COLUMN file_name text, ADD COLUMN mime_type text,
    ADD COLUMN s3_key text, ADD COLUMN storage_version_id text, ADD COLUMN storage_provider text, ADD COLUMN version text;
    ALTER TABLE canonical_documents ADD COLUMN content_hash text, ADD COLUMN created_at timestamptz DEFAULT now();
    CREATE TABLE company_legal_registry (id text,organization_id integer,document jsonb);`);
  h.pool = harness.db;
}, 120_000);
afterAll(async () => { await harness?.close(); });
beforeEach(async () => {
  await harness.pg.query("UPDATE users SET status='active' WHERE id=42");
  f = await harness.seed();
  await f.pg.query(`UPDATE vault.documents SET content_hash=$2,document_code='evidence',version='1.0',
    file_name='evidence.pdf',mime_type='application/pdf',storage_version_id='recorded-version',storage_provider='local' WHERE id=$1`, [f.vault,SHA]);
  await f.pg.query(`INSERT INTO canonical_documents (canonical_id,organization_id,source_refs,stage,content_hash)
    VALUES ($1,$2,$3,'approved',$4)`, [randomUUID(),f.org,JSON.stringify({vault_documents:{nativeId:f.vault}}),SHA]);
  h.read.mockReset(); h.read.mockResolvedValue({ ok: true, bytes: BYTES });
});
function resolve(userId: number | null = 42) {
  const input = { organizationId: f.org, programUuid: f.program, userId, submissionType: '510k' };
  return createDeviceAttachmentResolver(input)({ kind: 'vault_document', documentId: f.vault });
}

describe('exact Vault source admission for official eSTAR attachments', () => {
  it('admits a current byte-approved version accessible to the current actor', async () => {
    const result = await resolve();
    expect(result).toMatchObject({ ok:true, fileName:'evidence.pdf',bytes:BYTES });
  });
  it.each(['missing actor','inactive actor','private project','unapproved','not reviewed','superseded','wrong approval hash','missing recorded hash','wrong tenant attribution','retired'])('refuses %s before reading bytes', async state => {
    if (state==='inactive actor') await f.pg.query("UPDATE users SET status='inactive' WHERE id=42");
    if (state==='private project') {
      await f.pg.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=42",[f.org]);
      await f.pg.query("UPDATE project_visibility_settings SET visibility='private' WHERE organization_id=$1",[f.org]);
      await f.pg.query('UPDATE projects SET owner_id=99,created_by_id=99 WHERE organization_id=$1',[f.org]);
    }
    if (state==='unapproved') await f.pg.query("UPDATE canonical_documents SET stage='authoring' WHERE organization_id=$1",[f.org]);
    if (state==='not reviewed') await f.pg.query('DELETE FROM canonical_documents WHERE organization_id=$1',[f.org]);
    if (state==='wrong approval hash') await f.pg.query('UPDATE canonical_documents SET content_hash=$2 WHERE organization_id=$1',[f.org,'f'.repeat(64)]);
    if (state==='missing recorded hash') await f.pg.query('UPDATE vault.documents SET content_hash=NULL WHERE id=$1',[f.vault]);
    if (state==='wrong tenant attribution') await f.pg.query('UPDATE vault.documents SET organization_id=$2 WHERE id=$1',[f.vault,f.org+1]);
    if (state==='retired') await f.pg.query('UPDATE vault.documents SET deleted_at=now() WHERE id=$1',[f.vault]);
    if (state==='superseded') await f.pg.query(`INSERT INTO vault.documents (id,organization_id,program_id,document_code,supersedes_id,content_hash)
      VALUES ($1,$2,$3,'evidence',$4,$5)`,[randomUUID(),f.org,f.program,f.vault,'b'.repeat(64)]);
    const result=await resolve(state==='missing actor' ? null : 42);
    expect(result).toMatchObject({ok:false}); expect(h.read).not.toHaveBeenCalled();
    if (state==='inactive actor') await f.pg.query("UPDATE users SET status='active' WHERE id=42");
  });
  it('rechecks actor access after asynchronous byte retrieval', async () => {
    h.read.mockImplementation(async () => { await f.pg.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=42',[f.org]); return {ok:true,bytes:BYTES}; });
    expect(await resolve()).toMatchObject({ok:false});
  });
  it('rechecks approval and source hash after asynchronous byte retrieval', async () => {
    h.read.mockImplementation(async () => { await f.pg.query("UPDATE canonical_documents SET stage='withdrawn' WHERE organization_id=$1",[f.org]); return {ok:true,bytes:BYTES}; });
    expect(await resolve()).toMatchObject({ok:false});
  });
  it.each(['keep_data','remove_data'] as const)('refuses original bytes after %s disposition', async choice => {
    await f.pg.query("UPDATE canonical_documents SET stage='authoring' WHERE organization_id=$1",[f.org]);
    await f.apply(choice,{targetType:'vault_document',targetId:f.vault});
    // Owner-level fixture seam: a retained positive lifecycle projection must
    // not override the separately authoritative original-byte withdrawal.
    await f.pg.query("UPDATE canonical_documents SET stage='approved' WHERE organization_id=$1",[f.org]);
    expect(await resolve()).toMatchObject({ok:false}); expect(h.read).not.toHaveBeenCalled();
  });
  it('refuses changed bytes and a changed recorded hash during retrieval', async () => {
    h.read.mockResolvedValueOnce({ok:true,bytes:Buffer.from('%PDF-1.7\nAltered content')});
    expect(await resolve()).toMatchObject({ok:false});
    h.read.mockImplementation(async () => {await f.pg.query('UPDATE vault.documents SET content_hash=$2 WHERE id=$1',[f.vault,'f'.repeat(64)]);return{ok:true,bytes:BYTES};});
    expect(await resolve()).toMatchObject({ok:false});
  });
  it('applies the canonical company legal target restriction for FDA', async () => {
    const legal={id:'legal-fixture',title:'Scoped legal original',kind:'power_of_attorney',programId:f.program,
      vaultDocumentId:f.vault,contentHash:SHA,version:'1.0',agencies:['EMA'],countries:[],submissionTypes:[],language:'en',
      effectiveOn:null,expiresOn:null,active:true,registeredAt:'2026-10-23T00:00:00Z',registeredBy:'42'};
    await f.pg.query('INSERT INTO company_legal_registry VALUES ($1,$2,$3)',[legal.id,f.org,JSON.stringify(legal)]);
    expect(await resolve()).toMatchObject({ok:false}); expect(h.read).not.toHaveBeenCalled();
  });
});
