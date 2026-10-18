/** Offline composition controls only. PostgreSQL isolation is proved separately by the lead. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  sourceVerify: vi.fn(), scopeVerify: vi.fn(), scopeAssert: vi.fn(), tenantVerify: vi.fn(),
  legacyWrapper: vi.fn(), embed: vi.fn(), embeddingForClient: vi.fn(), currentClient: null as any,
}));
vi.mock('../../../../server/services/c2c/current-program-access.js', () => ({
  ProgramReadAccessError: class extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } },
  assertVerifiedProgramScope: h.scopeAssert, requireProgramScopeStillCurrent: h.scopeVerify,
}));
vi.mock('../../../../server/services/ana/source-read-scope.js', () => ({ revalidateAnaSourceReadScope: h.sourceVerify }));
vi.mock('../../../../server/services/vault/retrieval-source-access.js', () => ({
  pinRetrievalReadScope: (scope: any) => Object.freeze({ ...scope, accessibleProgramIds: Object.freeze([...scope.accessibleProgramIds]) }),
  withRetrievalReadScope: h.legacyWrapper,
}));
vi.mock('../../../../server/db/currentTenant.js', () => ({
  assertTenantIsCurrent: h.tenantVerify, isTenantUuid: (s: unknown) => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s),
}));
vi.mock('../../../../server/services/enhancedEmbeddingService.js', () => ({
  EnhancedEmbeddingService: class {}, getEmbeddingService: h.embeddingForClient,
}));
vi.mock('../../../../server/services/vault/vault-search.js', () => ({ anyTermsQuery: (query: string) => query }));
import { AdvancedRAGPipeline, type RetrievalOptions } from '../../../../server/services/advancedRAGPipeline.ts';
const P='12345678-1234-4234-8234-123456789012', P2='22345678-1234-4234-8234-123456789012';
const O='32345678-1234-4234-8234-123456789012', D='42345678-1234-4234-8234-123456789012';
const HASH='a'.repeat(64), CHUNK='52345678-1234-4234-8234-123456789012';
const ACTOR={userId:3,role:'viewer'};
const SOURCE={organizationId:7,userId:3,role:'viewer',projectId:null,programId:null,accessibleProgramIds:[P],actorFiltered:true as const};
const chunk = () => ({chunk_id:CHUNK,document_id:D,program_id:P,content_hash:HASH,
  title:'Verified source',content:'Authorized participant endpoint.',page_number:null,section_title:null,chunk_index:0,similarity:0.75});
function setup(options: { autocommit?: boolean; savepointError?: any; vectorError?: any; hashChanged?: boolean; missingHash?: boolean; malformedRow?: boolean; revokeAfterRead?: boolean } = {}) {
  let aborted=false;
  const client={query:vi.fn(async (sql:string, params?:unknown[]) => {
    if (sql==='SAVEPOINT vault_dense_search') {
      if (options.savepointError) throw options.savepointError;
      if (options.autocommit) throw Object.assign(new Error('SAVEPOINT can only be used in transaction blocks'),{code:'25P01'});
      return {rows:[]};
    }
    if (sql==='ROLLBACK TO SAVEPOINT vault_dense_search') {aborted=false;return {rows:[]};}
    if (aborted) throw Object.assign(new Error('current transaction is aborted'),{code:'25P02'});
    if (sql==='RELEASE SAVEPOINT vault_dense_search') return {rows:[]};
    if (sql.startsWith('SELECT id FROM organizations')) return {rows:[{id:7}]};
    if (sql.includes('SELECT c.id::text AS id')) return {rows:[{id:CHUNK,document_id:D,program_id:P,
      content_hash:options.missingHash?null:options.hashChanged?'b'.repeat(64):HASH,title:'Verified source',original_file_available:true}]};
    if (sql.includes('WITH scoped AS MATERIALIZED')) {
      if (options.vectorError) {aborted=!options.autocommit;throw options.vectorError;}
      return {rows:[chunk()]};
    }
    if (sql.includes('c.id AS chunk_id')) {
      if (options.revokeAfterRead) h.sourceVerify.mockRejectedValue(new Error('current actor changed'));
      return {rows:[options.malformedRow?{...chunk(),similarity:'0.75'}:options.missingHash?{...chunk(),content_hash:null}:chunk()]};
    }
    throw new Error('Unexpected SQL reached composition fixture: '+sql);
  })};
  h.currentClient=client;
  const verifiedScope={scope:'verified-accessible-programs' as const,actor:ACTOR,programIds:[P],reconciliationRequired:false};
  const vaultRead={sqlClient:client,organizationId:7,userId:3,programId:null,verifiedScope};
  const optionsInput:RetrievalOptions={strategy:'basic',corpus:'vault',organizationId:7,organizationUuid:O,
    vaultRead,sourceReadScope:SOURCE,limit:1,useReranking:false,useMmr:false};
  const pipeline:any=Object.create(AdvancedRAGPipeline.prototype);
  pipeline.pool={query:vi.fn(()=>{throw new Error('A request read fell back to the global pool');}),connect:vi.fn(()=>{throw new Error('A request read acquired a separate pool client');})};
  pipeline.embeddingService={embed:h.embed};
  return {client,options:optionsInput,pipeline};
}
beforeEach(()=>{
  vi.clearAllMocks();
  h.scopeAssert.mockImplementation((q:any)=>{if(q!==h.currentClient)throw new Error('Wrong request executor');});
  h.scopeVerify.mockResolvedValue(undefined);
  h.sourceVerify.mockImplementation(async (_q:any,scope:any)=>scope);
  h.tenantVerify.mockResolvedValue(undefined);
  h.legacyWrapper.mockImplementation(async (_scope:any,callback:any)=>callback(h.currentClient,_scope));
  h.embed.mockRejectedValue(new Error('Offline keyless fixture'));
  h.embeddingForClient.mockReturnValue({embed:h.embed});
});
describe('merged recall RAG source admission composition',()=>{
  it('uses one request executor, filtered before ranking, with both scopes current',async()=>{
    const {client,options,pipeline}=setup();
    const result=await pipeline.retrieve('participant',options);
    expect(result.totalCandidates).toBe(1);
    expect(result.documents[0]).toMatchObject({documentId:D,contentHash:HASH,programId:P,lexicalOnly:true});
    expect(h.legacyWrapper).not.toHaveBeenCalled();
    for(const [q] of h.sourceVerify.mock.calls)expect(q).toBe(client);
    for(const [q] of h.scopeVerify.mock.calls)expect(q).toBe(client);
    expect(h.embeddingForClient).toHaveBeenCalledWith(client);
    const ranked=client.query.mock.calls.find(([sql])=>sql.includes('c.id AS chunk_id'))!;
    expect(ranked[0].indexOf('d.program_id = ANY(')).toBeLessThan(ranked[0].indexOf('ORDER BY'));
    expect(ranked[1]).toContainEqual([P]);
    expect(pipeline.pool.query).not.toHaveBeenCalled();
    expect(pipeline.pool.connect).not.toHaveBeenCalled();
  });
  it('refuses mismatched source actor before embedding or reading text',async()=>{
    const {client,options,pipeline}=setup();
    options.sourceReadScope={...SOURCE,userId:4};
    await expect(pipeline.retrieve('participant',options)).rejects.toThrow('does not match');
    expect(h.embed).not.toHaveBeenCalled();expect(client.query).not.toHaveBeenCalled();
  });
  it('refuses a changed source role before any embedding or source read',async()=>{
    const {client,options,pipeline}=setup();
    h.sourceVerify.mockRejectedValue(new Error('current actor changed'));
    await expect(pipeline.retrieve('participant',options)).rejects.toThrow('current actor changed');
    expect(h.embed).not.toHaveBeenCalled();expect(client.query).not.toHaveBeenCalled();
  });
  it('keeps an evaluated empty accessible scope empty without embedding',async()=>{
    const {client,options,pipeline}=setup();
    options.vaultRead={...options.vaultRead!,verifiedScope:{...options.vaultRead!.verifiedScope,programIds:[]}};
    options.sourceReadScope={...SOURCE,accessibleProgramIds:[]};
    expect(await pipeline.retrieve('participant',options)).toMatchObject({documents:[],totalCandidates:0});
    expect(h.embed).not.toHaveBeenCalled();expect(client.query).not.toHaveBeenCalled();
  });
  it('retains an explicit narrower programme filter instead of widening it',async()=>{
    const {client,options,pipeline}=setup();
    options.vaultRead={...options.vaultRead!,verifiedScope:{...options.vaultRead!.verifiedScope,programIds:[P,P2]}};
    options.sourceReadScope={...SOURCE,accessibleProgramIds:[P,P2]};options.filters={allowedProgramIds:[P]};
    await pipeline.retrieve('participant',options);
    const ranked=client.query.mock.calls.find(([sql])=>sql.includes('c.id AS chunk_id'))!;
    expect(ranked[1]).toContainEqual([P]);expect(ranked[1]).toContainEqual([P,P2]);
  });
  it('refuses an original-byte identity change after candidate discovery',async()=>{
    const {options,pipeline}=setup({hashChanged:true});
    await expect(pipeline.retrieve('participant',options)).rejects.toThrow('source identity changed');
  });
  it('refuses an unbound original hash in exact source admission',async()=>{
    const {options,pipeline}=setup({missingHash:true});
    await expect(pipeline.retrieve('participant',options)).rejects.toThrow('source identity changed');
  });
  it('preserves upstream authorized legacy passage reads without inventing a byte binding',async()=>{
    const {options,pipeline}=setup({missingHash:true});
    options.sourceReadScope=undefined;
    const result=await pipeline.retrieve('participant',options);
    expect(result.documents[0].content).toContain('Authorized participant');
    expect(result.documents[0].contentHash).toBeUndefined();
  });
  it('keeps keyless ranking disclosed and current-source predicates on initial and final reads',async()=>{
    const {client,options,pipeline}=setup();
    const result=await pipeline.retrieve('participant',options);
    expect(result.documents[0].lexicalOnly).toBe(true);
    const sourceReads=client.query.mock.calls.filter(([sql])=>sql.includes('vault.document_chunks'));
    expect(sourceReads.length).toBeGreaterThan(1);
    for(const [sql] of sourceReads){expect(sql).toContain('d.deleted_at IS NULL');expect(sql).toContain('p.deleted_at IS NULL');expect(sql).toContain('NOT EXISTS');}
  });
  it('recovers a missing vector type inside a caller transaction before lexical fallback',async()=>{
    h.embed.mockResolvedValue({embedding:[0.1,0.2]});
    const {client,options,pipeline}=setup({vectorError:Object.assign(new Error('type "vector" does not exist'),{code:'42704'})});
    expect((await pipeline.retrieve('participant',options)).documents[0].lexicalOnly).toBe(true);
    const statements=client.query.mock.calls.map(([sql])=>sql);
    expect(statements.indexOf('ROLLBACK TO SAVEPOINT vault_dense_search')).toBeGreaterThan(statements.indexOf('SAVEPOINT vault_dense_search'));
    expect(statements.indexOf('RELEASE SAVEPOINT vault_dense_search')).toBeLessThan(statements.findIndex(sql=>sql.includes('c.id AS chunk_id')));
    expect(statements).not.toContain('BEGIN');expect(statements).not.toContain('COMMIT');
  });
  it('supports exact PostgreSQL no-transaction savepoint rejection without opening a caller transaction',async()=>{
    h.embed.mockResolvedValue({embedding:[0.1,0.2]});
    const {client,options,pipeline}=setup({autocommit:true,vectorError:Object.assign(new Error('type "vector" does not exist'),{code:'42704'})});
    expect((await pipeline.retrieve('participant',options)).documents[0].lexicalOnly).toBe(true);
    const statements=client.query.mock.calls.map(([sql])=>sql);
    expect(statements).not.toContain('ROLLBACK TO SAVEPOINT vault_dense_search');expect(statements).not.toContain('RELEASE SAVEPOINT vault_dense_search');
    expect(statements).not.toContain('BEGIN');expect(statements).not.toContain('COMMIT');
  });
  it('does not treat a savepoint permission denial as absent optional vector support',async()=>{
    h.embed.mockResolvedValue({embedding:[0.1,0.2]});
    const {client,options,pipeline}=setup({savepointError:Object.assign(new Error('permission denied'),{code:'42501'})});
    await expect(pipeline.retrieve('participant',options)).rejects.toThrow('could not be read');
    expect(client.query.mock.calls.some(([sql])=>sql.includes('c.id AS chunk_id'))).toBe(false);
  });
  it('does not hide an unrelated missing SQL type behind lexical results',async()=>{
    h.embed.mockResolvedValue({embedding:[0.1,0.2]});
    const {client,options,pipeline}=setup({vectorError:Object.assign(new Error('type "other_type" does not exist'),{code:'42704'})});
    await expect(pipeline.retrieve('participant',options)).rejects.toThrow('could not be read');
    expect(client.query.mock.calls.some(([sql])=>sql.includes('c.id AS chunk_id'))).toBe(false);
  });
  it('refuses malformed ranked rows instead of exposing unverified counts',async()=>{
    const {options,pipeline}=setup({malformedRow:true});
    await expect(pipeline.retrieve('participant',options)).rejects.toThrow('could not be verified');
  });
  it('withdraws a read whose current actor changes after lexical results arrive',async()=>{
    const {options,pipeline}=setup({revokeAfterRead:true});
    await expect(pipeline.retrieve('participant',options)).rejects.toThrow('could not be read');
  });
  it('does not let retrieval scope authorize generation',async()=>{
    const {options,pipeline}=setup();
    await expect(pipeline.queryWithGeneration('participant',options)).rejects.toThrow('retrieval only');
    expect(h.embed).not.toHaveBeenCalled();
  });
});
