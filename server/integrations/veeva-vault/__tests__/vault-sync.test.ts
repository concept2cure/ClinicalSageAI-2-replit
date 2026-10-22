/**
 * Tests for the Vault coexistence workflow layer: field mapping (pure) and the
 * push/pull sync service against injected fakes. No network, no DB.
 */

import { describe, it, expect, vi } from 'vitest';
import { toVaultFields, fromVaultDocument } from '../field-mapping';
import { VaultSyncService, VaultLinkUnconfirmedError, upsertVaultLink } from '../vault-sync-service';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { VaultDocument } from '../client';

describe('toVaultFields', () => {
  it('maps title + section + known document type to Vault fields', () => {
    const fields = toVaultFields(
      { title: 'CSR Draft', documentType: 'csr', sectionCode: '5.3.5.1' },
      { lifecycle: 'Draft to Approved' },
    );
    expect(fields).toEqual({
      name__v: 'CSR Draft (5.3.5.1)',
      type__v: 'Clinical Study Report',
      lifecycle__v: 'Draft to Approved',
    });
  });

  it('honors per-org type overrides and extra constant fields', () => {
    const fields = toVaultFields(
      { title: 'IB v4', documentType: 'ib' },
      { typeMap: { ib: 'Investigator Brochure (Custom)' }, extraFields: { 'country__v': 'US' } },
    );
    expect(fields['type__v']).toBe('Investigator Brochure (Custom)');
    expect(fields['country__v']).toBe('US');
    expect(fields['name__v']).toBe('IB v4'); // no section suffix without sectionCode
  });

  it('omits type__v for an unknown document type rather than guessing', () => {
    const fields = toVaultFields({ title: 'Memo', documentType: 'unknown_kind' });
    expect(fields['type__v']).toBeUndefined();
  });
});

describe('fromVaultDocument', () => {
  it('recovers title, section code, and the C2C document type', () => {
    const doc: VaultDocument = {
      id: 9,
      name: 'CSR Draft (5.3.5.1)',
      type: 'Clinical Study Report',
      status: 'Approved',
      lifecycle: 'Draft to Approved',
      raw: {},
    };
    const meta = fromVaultDocument(doc);
    expect(meta.title).toBe('CSR Draft');
    expect(meta.sectionCode).toBe('5.3.5.1');
    expect(meta.documentType).toBe('csr');
    expect(meta.vaultStatus).toBe('Approved');
  });

  it('passes unmapped Vault types through verbatim (nothing silently dropped)', () => {
    const meta = fromVaultDocument({ id: 1, name: 'Site List', type: 'Custom Vault Type', raw: {} });
    expect(meta.documentType).toBe('Custom Vault Type');
    expect(meta.sectionCode).toBeNull();
  });
});

function makeFakes() {
  const client = {
    uploadDocument: vi.fn().mockResolvedValue({ documentId: 4711, majorVersion: 0, minorVersion: 1 }),
    getDocument: vi.fn().mockResolvedValue({
      id: 4711,
      name: 'Protocol v2 (5.3.5.1)',
      type: 'Protocol',
      majorVersion: 1,
      minorVersion: 0,
      raw: {},
    } satisfies VaultDocument),
    downloadDocumentFile: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 vault-bytes')),
  };
  const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
  const audit = { logAction: vi.fn().mockResolvedValue({ persisted: true, chained: true, tamperProof: true }) };
  const svc = new VaultSyncService(client as any, pool, audit);
  return { client, pool, audit, svc };
}

const LOCAL = { documentTable: 'coauthor_documents', documentId: 42 };
const pushParams=()=>({organizationId:7,userId:3,local:LOCAL,meta:{title:'X'},fileName:'x.pdf',bytes:Buffer.from('x')});

describe('VaultSyncService.pushDocument', () => {
  it('uploads with mapped fields, upserts the link, and audits — in one call path', async () => {
    const { client, pool, audit, svc } = makeFakes();
    const result = await svc.pushDocument({
      organizationId: 7,
      userId: 3,
      local: LOCAL,
      meta: { title: 'CSR Draft', documentType: 'csr', sectionCode: '5.3.5.1' },
      fileName: 'csr-draft.docx',
      bytes: Buffer.from('docx'),
    });

    expect(result.documentId).toBe(4711);
    expect(result.localLink).toBe('linked');expect(result.auditTrail).toEqual({persisted:true,chained:true});
    expect(result.contentSha256).toMatch(/^[0-9a-f]{64}$/);

    expect(client.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({ fields: expect.objectContaining({ name__v: 'CSR Draft (5.3.5.1)' }) }),
    );
    // Link upsert carries org scoping, the Vault id, and the push direction.
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO veeva_vault_links');
    expect(sql).toContain('ON CONFLICT (organization_id, document_table, document_id)');
    expect(params).toEqual(expect.arrayContaining([7, 'coauthor_documents', 42, 4711, 'push']));

    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VEEVA_VAULT_PUSH', organizationId: 7, resourceId: 42 }),
    );
  });

  it.each(['lost','throw','tamper-only','undefined'] as const)('completed push discloses audit=%s and never repeats the upload',async mode=>{
    const {client,pool,audit,svc}=makeFakes();
    if(mode==='throw')audit.logAction.mockRejectedValue(new Error('Private audit database failure'));
    else audit.logAction.mockResolvedValue(mode==='undefined'?undefined:{persisted:mode==='tamper-only',chained:false,tamperProof:mode==='tamper-only',error:'Private audit database failure'});
    const result=await svc.pushDocument(pushParams());
    expect(result).toMatchObject({documentId:4711,localLink:'linked',auditTrail:mode==='tamper-only'?{persisted:true,chained:false}:{persisted:false,code:'AUDIT_ROW_NOT_PERSISTED'}});
    expect(client.uploadDocument).toHaveBeenCalledTimes(1);expect(pool.query).toHaveBeenCalledTimes(1);expect(JSON.stringify(result)).not.toContain('Private audit');
  });
  it.each(['saved','lost','throw'] as const)('a local link failure after confirmed upload retains remote identity and audit=%s',async mode=>{
    const {client,pool,audit,svc}=makeFakes();pool.query.mockRejectedValue(new Error('Private local database conflict'));
    if(mode==='throw')audit.logAction.mockRejectedValue(new Error('Private audit failure'));
    else audit.logAction.mockResolvedValue({persisted:mode==='saved',chained:mode==='saved',tamperProof:false});
    const failure=await svc.pushDocument(pushParams()).then(()=>null,error=>error as VaultLinkUnconfirmedError);
    expect(failure).toBeInstanceOf(VaultLinkUnconfirmedError);
    expect(failure).toMatchObject({code:'VEEVA_LINK_UNCONFIRMED',localLink:'unconfirmed',recovery:{action:'reconcile-existing-link',retryUpload:false},
      receipt:{organizationId:7,local:LOCAL,direction:'push',remoteState:'uploaded',remote:{documentId:4711,majorVersion:0,minorVersion:1},contentSha256:createHash('sha256').update('x').digest('hex')},
      auditTrail:mode==='saved'?{persisted:true,chained:true}:{persisted:false,code:'AUDIT_ROW_NOT_PERSISTED'}});
    expect(client.uploadDocument).toHaveBeenCalledTimes(1);expect(JSON.stringify(failure)).not.toContain('Private');
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({action:'VEEVA_VAULT_PUSH',details:expect.objectContaining({localLink:'unconfirmed',vaultDocumentId:4711})}));
  });
  it('a remote upload refusal performs no local write and claims no transmitted receipt',async()=>{
    const {client,pool,audit,svc}=makeFakes();client.uploadDocument.mockRejectedValue(new Error('Controlled upload refusal'));
    await expect(svc.pushDocument(pushParams())).rejects.toThrow('Controlled upload refusal');
    expect(pool.query).not.toHaveBeenCalled();expect(audit.logAction).not.toHaveBeenCalled();
  });
});

describe('VaultSyncService.pullDocument', () => {
  it('fetches metadata + file, maps it back, links, and audits', async () => {
    const { pool, audit, svc } = makeFakes();
    const result = await svc.pullDocument({
      organizationId: 7,
      userId: 3,
      vaultDocumentId: 4711,
      local: LOCAL,
    });

    expect(result.auditTrail).toEqual({persisted:true,chained:true});expect(result.localLink).toBe('linked');
    expect(result.meta.title).toBe('Protocol v2');
    expect(result.meta.sectionCode).toBe('5.3.5.1');
    expect(result.meta.documentType).toBe('protocol');
    expect(result.bytes.toString()).toContain('vault-bytes');

    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual(expect.arrayContaining([7, 4711, 'pull']));
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VEEVA_VAULT_PULL', resourceId: 42 }),
    );
  });
  it.each(['lost','throw','tamper-only'] as const)('completed pull retains mapped metadata and bytes with audit=%s',async mode=>{
    const {client,pool,audit,svc}=makeFakes();
    if(mode==='throw')audit.logAction.mockRejectedValue(new Error('Private audit pull failure'));
    else audit.logAction.mockResolvedValue({persisted:mode==='tamper-only',chained:false,tamperProof:mode==='tamper-only',error:'Private audit pull failure'});
    const result=await svc.pullDocument({organizationId:7,userId:3,vaultDocumentId:4711,local:LOCAL});
    expect(result.meta).toMatchObject({title:'Protocol v2',documentType:'protocol'});expect(result.bytes.toString()).toContain('vault-bytes');
    expect(result.auditTrail).toMatchObject(mode==='tamper-only'?{persisted:true,chained:false}:{persisted:false,code:'AUDIT_ROW_NOT_PERSISTED'});
    expect(client.downloadDocumentFile).toHaveBeenCalledTimes(1);expect(pool.query).toHaveBeenCalledTimes(1);expect(JSON.stringify(result)).not.toContain('Private audit');
  });
  it('a failed local pull link exposes the actual downloaded version without claiming rollback or sending bytes in its error',async()=>{
    const {client,pool,svc}=makeFakes();pool.query.mockRejectedValue(new Error('Private database failure'));
    const failure=await svc.pullDocument({organizationId:7,userId:3,vaultDocumentId:4711,local:LOCAL}).then(()=>null,error=>error as VaultLinkUnconfirmedError);
    expect(failure).toMatchObject({code:'VEEVA_LINK_UNCONFIRMED',receipt:{direction:'pull',remoteState:'downloaded',remote:{documentId:4711,majorVersion:1,minorVersion:0}},auditTrail:{persisted:true,chained:true}});
    expect(client.uploadDocument).not.toHaveBeenCalled();expect(JSON.stringify(failure)).not.toMatch(/Private database|vault-bytes/);
  });
  it('a failed download performs no local link or misleading successful audit',async()=>{
    const {client,pool,audit,svc}=makeFakes();client.downloadDocumentFile.mockRejectedValue(new Error('Controlled download refusal'));
    await expect(svc.pullDocument({organizationId:7,userId:3,vaultDocumentId:4711,local:LOCAL})).rejects.toThrow('Controlled download refusal');
    expect(pool.query).not.toHaveBeenCalled();expect(audit.logAction).not.toHaveBeenCalled();
  });

});


describe('actual canonical Vault link schema and bounded recovery',()=>{
  it('a lost local completion can be reconciled with the existing link primitive without repeating remote upload',async()=>{
    const pg=new PGlite();
    try{
      await pg.exec(await readFile('migrations/20260610_veeva_vault_links.sql','utf8'));
      const {client,audit}=makeFakes();let loseResponse=true;
      const pool={query:async(sql:string,args?:unknown[])=>{const result=await pg.query(sql,args);if(loseResponse)throw new Error('Synthetic response lost after real autocommitted link INSERT');return result;}};
      const svc=new VaultSyncService(client as any,pool,audit);
      const failure=await svc.pushDocument(pushParams()).then(()=>null,error=>error as VaultLinkUnconfirmedError);
      expect(failure).toBeInstanceOf(VaultLinkUnconfirmedError);expect(failure!.receipt.remoteState).toBe('uploaded');
      expect((await pg.query('SELECT organization_id,vault_document_id FROM veeva_vault_links')).rows).toEqual([{organization_id:7,vault_document_id:4711}]);
      loseResponse=false;const receipt=failure!.receipt;
      // This is the already-exported local reconciliation primitive. It does
      // not invoke a provider, create an endpoint or establish UI recovery.
      await upsertVaultLink(pool,{organizationId:receipt.organizationId,local:receipt.local,vaultDocumentId:receipt.remote.documentId,
        vaultMajorVersion:receipt.remote.majorVersion,vaultMinorVersion:receipt.remote.minorVersion,contentSha256:receipt.contentSha256,direction:'push',createdBy:3});
      expect((await pg.query('SELECT count(*)::int AS n FROM veeva_vault_links')).rows).toEqual([{n:1}]);expect(client.uploadDocument).toHaveBeenCalledTimes(1);
      await expect(upsertVaultLink(pool,{organizationId:7,local:{...LOCAL,documentId:43},vaultDocumentId:4711,vaultMajorVersion:0,vaultMinorVersion:1,contentSha256:receipt.contentSha256,direction:'push',createdBy:3})).rejects.toMatchObject({code:'23505'});
      await upsertVaultLink(pool,{organizationId:8,local:LOCAL,vaultDocumentId:4711,vaultMajorVersion:0,vaultMinorVersion:1,contentSha256:receipt.contentSha256,direction:'push',createdBy:4});
      expect((await pg.query('SELECT organization_id FROM veeva_vault_links ORDER BY organization_id')).rows).toEqual([{organization_id:7},{organization_id:8}]);
    }finally{await pg.close();}
  });
});
