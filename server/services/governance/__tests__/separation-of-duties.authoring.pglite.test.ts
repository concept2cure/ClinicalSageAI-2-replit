/** Authoring peer-review independence against the canonical DDL and immutable ledger.
 * W1 / D2, AUTHORING_HUMAN_REVIEW_BINDING_2026-10-14.md.
 * Identity/membership admission is the caller's separate gate; authorship must
 * retain historical writers even after their membership or grants are gone.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { assertNoSchemaGaps, createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { computeChainHash, sha256Hex } from '../../authoring/revision-ledger';
import {
  assertSignerIsNotAuthor,
  resolveTargetAuthors,
  SeparationOfDutiesAuthorUnresolvedError,
  SeparationOfDutiesError,
  SeparationOfDutiesUnverifiedError,
  type AuthorshipReader,
} from '../separation-of-duties';

const ORG = 7;
const FOREIGN_ORG = 9;
const CREATOR = 11;
const HISTORICAL_WRITER = 17;
const SECOND_WRITER = 19;
const REVIEWER = 23;
const FOREIGN_WRITER = 29;
let database: JourneyDb;
let sql: AuthorshipReader;

beforeAll(async () => {
  database = await createJourneyDb({
    prereqSql: `
      CREATE TABLE organizations (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, status TEXT NOT NULL);
      CREATE TABLE organization_users (
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        user_id INTEGER NOT NULL REFERENCES users(id), role TEXT NOT NULL,
        PRIMARY KEY (organization_id, user_id)
      );
      INSERT INTO organizations VALUES (7, 'Authoring tenant'), (9, 'Foreign tenant');
      INSERT INTO users VALUES
        (11, 'Original author', 'author@example.test', 'active'),
        (17, 'Earlier writer', 'writer@example.test', 'active'),
        (19, 'Other earlier writer', 'second@example.test', 'active'),
        (23, 'Independent reviewer', 'reviewer@example.test', 'active'),
        (29, 'Foreign writer', 'foreign@example.test', 'active');
      INSERT INTO organization_users VALUES
        (7, 11, 'author'), (7, 17, 'author'), (7, 19, 'author'), (7, 23, 'reviewer'), (9, 29, 'author');
    `,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
    ],
  });
  sql = database.pool;
});

afterAll(async () => {
  try { if (database) assertNoSchemaGaps(database); }
  finally { await database?.close(); }
});

interface DocumentFixture { id: string; sectionId: string; target: string; organizationId: number }

async function document(creator = String(CREATOR), organizationId = ORG): Promise<DocumentFixture> {
  const id = randomUUID();
  const sectionId = randomUUID();
  await sql.query(`INSERT INTO authoring_documents (id,title,module,status,created_by,tenant_id,version)
    VALUES ($1,'Saved controlled document','M2','draft',$2,$3,'0.4')`, [id,creator,organizationId]);
  await sql.query(`INSERT INTO authoring_sections (id,doc_id,code,title,content,tenant_id)
    VALUES ($1,$2,'2.5.1','Rationale','Current saved text',$3)`, [sectionId,id,organizationId]);
  return { id,sectionId,target:`authoring-document:${id}`,organizationId };
}

/** Writes the real chain shape, without a mocked author query or substitute table. */
async function revision(doc: DocumentFixture, author: string | null, inputs: unknown = {}): Promise<string> {
  const id = randomUUID();
  const content = `Earlier controlled text by ${author ?? 'unresolved writer'} (${id})`;
  const previous = await sql.query(`SELECT chain_sha256 FROM doc_revisions
    WHERE section_id=$1 AND tenant_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`, [doc.sectionId,doc.organizationId]);
  const previousChain = previous.rows[0]?.chain_sha256 ?? null;
  const contentHash = sha256Hex(content);
  const chain = computeChainHash({ prevChain:previousChain,contentSha256:contentHash,createdBy:author ?? '',origin:'human-edit' });
  await sql.query(`INSERT INTO doc_revisions
    (id,section_id,content,created_by,tenant_id,created_at,content_sha256,prev_chain_sha256,chain_sha256,origin,inputs)
    VALUES ($1,$2,$3,$4,$5,clock_timestamp(),$6,$7,$8,'human-edit',$9::jsonb)`,
  [id,doc.sectionId,content,author,doc.organizationId,contentHash,previousChain,chain,JSON.stringify(inputs)]);
  return id;
}

function assertIndependent(doc: DocumentFixture, actor = REVIEWER, client = sql) {
  return assertSignerIsNotAuthor(doc.target,doc.organizationId,actor,{ meaning:'review',client });
}

/** Retained native audit shape on the real immutable engine-backed table. */
async function audit(doc: DocumentFixture, operation: string, actor: string | null, metadata: unknown = {}, options: {
  sectionId?: string | null; documentId?: string; organizationId?: number;
} = {}): Promise<string> {
  const id = randomUUID();
  const { sectionId = doc.sectionId,documentId = doc.id,organizationId = doc.organizationId } = options;
  await sql.query(`INSERT INTO authoring_audit_trail
    (id,doc_id,section_id,operation_type,actor_id,actor_email,actor_role,metadata,tenant_id,created_at)
    VALUES ($1,$2,$3,$4,$5,'retained-actor@example.test','member',$6::jsonb,$7,clock_timestamp())`,
  [id,documentId,sectionId,operation,actor,JSON.stringify(metadata),organizationId]);
  return id;
}

describe('Authoring authorship uses the original creator and all historical controlled-text writers', () => {
  it('models the target and deduplicates creator plus the complete historical ledger', async () => {
    const doc = await document();
    await revision(doc,String(HISTORICAL_WRITER));
    await revision(doc,String(SECOND_WRITER));
    await revision(doc,String(HISTORICAL_WRITER));
    const authors = await resolveTargetAuthors(doc.target,ORG,sql);
    expect(authors).toMatchObject({ modelled:true,authors:[CREATOR,HISTORICAL_WRITER,SECOND_WRITER] });
    expect(authors.sources.some(source => /creator/i.test(source))).toBe(true);
    expect(authors.sources.some(source => /revision|ledger/i.test(source))).toBe(true);
  });

  it('refuses the original creator reviewing their document', async () => {
    const doc = await document();
    await expect(assertIndependent(doc,CREATOR)).rejects.toBeInstanceOf(SeparationOfDutiesError);
  });

  it('refuses an earlier content contributor after a different person saved the latest revision', async () => {
    const doc = await document();
    await revision(doc,String(HISTORICAL_WRITER));
    await revision(doc,String(SECOND_WRITER));
    await expect(assertIndependent(doc,HISTORICAL_WRITER)).rejects.toBeInstanceOf(SeparationOfDutiesError);
  });

  it('admits an independent reviewer only after authorship has been resolved', async () => {
    const doc = await document();
    await revision(doc,String(HISTORICAL_WRITER));
    await expect(assertIndependent(doc)).resolves.toMatchObject({ checked:true });
  });

  it('retains a historical contributor who has left the organization and has no current grant', async () => {
    const doc = await document();
    await revision(doc,String(HISTORICAL_WRITER));
    await sql.query('BEGIN');
    try {
      await sql.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2',[ORG,HISTORICAL_WRITER]);
      await sql.query("UPDATE users SET status='inactive' WHERE id=$1",[HISTORICAL_WRITER]);
      const authors = await resolveTargetAuthors(doc.target,ORG,sql);
      expect(authors.authors).toEqual([CREATOR,HISTORICAL_WRITER]);
      await expect(assertIndependent(doc,HISTORICAL_WRITER)).rejects.toBeInstanceOf(SeparationOfDutiesError);
    } finally { await sql.query('ROLLBACK'); }
  });

  it('granting another OWNER/AUTHOR and revoking creator grants cannot replace recorded authorship', async () => {
    const doc = await document();
    await revision(doc,String(HISTORICAL_WRITER));
    await sql.query(`UPDATE doc_permissions SET revoked_at=NOW(),revoked_by=$2
      WHERE doc_id=$1 AND tenant_id=$3`,[doc.id,String(REVIEWER),ORG]);
    await sql.query(`INSERT INTO doc_permissions (doc_id,tenant_id,principal_id,email,role,granted_by)
      VALUES ($1,$2,$3,'reviewer@example.test','OWNER',$4),($1,$2,$3,'reviewer@example.test','AUTHOR',$4)`,
    [doc.id,ORG,String(REVIEWER),String(CREATOR)]);
    expect((await resolveTargetAuthors(doc.target,ORG,sql)).authors).toEqual([CREATOR,HISTORICAL_WRITER]);
    await expect(assertIndependent(doc,CREATOR)).rejects.toBeInstanceOf(SeparationOfDutiesError);
    await expect(assertIndependent(doc)).resolves.toMatchObject({ checked:true });
  });

  it('machine contributor metadata cannot invent a human author or erase the actual saver', async () => {
    const doc = await document();
    await revision(doc,String(HISTORICAL_WRITER),{ contributors:[
      { id:String(REVIEWER),name:'Forged reviewer authorship' }, { id:'ana',name:'AnA (AI draft)' },
    ] });
    expect((await resolveTargetAuthors(doc.target,ORG,sql)).authors).toEqual([CREATOR,HISTORICAL_WRITER]);
    await expect(assertIndependent(doc,HISTORICAL_WRITER)).rejects.toBeInstanceOf(SeparationOfDutiesError);
    await expect(assertIndependent(doc)).resolves.toMatchObject({ checked:true });
  });
});

describe('Authoring parent and tenant scope', () => {
  it('does not disclose foreign document authors or admit a missing local record', async () => {
    const doc = await document(String(FOREIGN_WRITER),FOREIGN_ORG);
    await revision(doc,String(FOREIGN_WRITER));
    const local = await resolveTargetAuthors(doc.target,ORG,sql);
    expect(local.authors).toEqual([]);
    await expect(assertSignerIsNotAuthor(doc.target,ORG,REVIEWER,{ meaning:'review',client:sql }))
      .rejects.toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
  });

  it('ignores another same-tenant document and all foreign-tenant history', async () => {
    const doc = await document();
    const other = await document(String(SECOND_WRITER));
    const foreign = await document(String(FOREIGN_WRITER),FOREIGN_ORG);
    await revision(doc,String(HISTORICAL_WRITER));
    await revision(other,String(REVIEWER));
    await revision(foreign,String(REVIEWER));
    expect((await resolveTargetAuthors(doc.target,ORG,sql)).authors).toEqual([CREATOR,HISTORICAL_WRITER]);
    await expect(assertIndependent(doc)).resolves.toMatchObject({ checked:true });
  });

  it('canonical composite foreign keys refuse cross-tenant section and revision parentage', async () => {
    const doc = await document();
    await expect(sql.query(`INSERT INTO authoring_sections (id,doc_id,title,tenant_id)
      VALUES ($1,$2,'Foreign child',$3)`,[randomUUID(),doc.id,FOREIGN_ORG])).rejects.toThrow(/foreign key/i);
    await expect(sql.query(`INSERT INTO doc_revisions (id,section_id,content,created_by,tenant_id)
      VALUES ($1,$2,'Foreign history',$3,$4)`,[randomUUID(),doc.sectionId,String(FOREIGN_WRITER),FOREIGN_ORG])).rejects.toThrow(/foreign key/i);
  });

  it('also ignores a legacy section whose tenant disagrees with its document parent', async () => {
    const doc = await document();
    await sql.query('BEGIN');
    try {
      // Fault injection represents pre-composite-FK data; the real DDL is
      // restored by rollback and normal inserts remain constrained above.
      await sql.query('ALTER TABLE authoring_sections DROP CONSTRAINT authoring_sections_doc_tenant_fkey');
      const badSection = randomUUID();
      await sql.query(`INSERT INTO authoring_sections (id,doc_id,title,tenant_id)
        VALUES ($1,$2,'Legacy foreign child',$3)`,[badSection,doc.id,FOREIGN_ORG]);
      await revision({ ...doc,sectionId:badSection,organizationId:FOREIGN_ORG },String(REVIEWER));
      expect((await resolveTargetAuthors(doc.target,ORG,sql)).authors).toEqual([CREATOR]);
      await expect(assertIndependent(doc)).resolves.toMatchObject({ checked:true });
    } finally { await sql.query('ROLLBACK'); }
  });

  it('ignores a legacy revision whose tenant disagrees with its section parent', async () => {
    const doc = await document();
    await sql.query('BEGIN');
    try {
      await sql.query('ALTER TABLE doc_revisions DROP CONSTRAINT doc_revisions_section_tenant_fkey');
      await revision({ ...doc,organizationId:FOREIGN_ORG },String(REVIEWER));
      expect((await resolveTargetAuthors(doc.target,ORG,sql)).authors).toEqual([CREATOR]);
      await expect(assertIndependent(doc)).resolves.toMatchObject({ checked:true });
    } finally { await sql.query('ROLLBACK'); }
  });
});

describe('Unresolved or unreadable Authoring attribution never establishes independence', () => {
  it.each(['7x','author@example.test','10000000-0000-4000-8000-000000000001','0','-7','7.5','2147483648','07',' 7 ',''])(
    'refuses malformed creator identity %j even when one historical author is known', async creator => {
    const doc = await document(creator);
    await revision(doc,String(HISTORICAL_WRITER));
    await expect(assertIndependent(doc)).rejects.toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
    await expect(resolveTargetAuthors(doc.target,ORG,sql)).rejects.toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
  });

  it.each([null,'7x','writer@example.test','20000000-0000-4000-8000-000000000001','0','-7','7.5','2147483648','07',' 7 ',''])(
    'refuses malformed historical saver %j even with a known original creator', async saver => {
    const doc = await document();
    await revision(doc,saver);
    await expect(assertIndependent(doc)).rejects.toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
    await expect(resolveTargetAuthors(doc.target,ORG,sql)).rejects.toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
  });

  it.each(['authoring-document:','authoring-document:not-a-uuid','authoring-document:42','authoring-document'])(
    'a malformed target %s returns unresolved rather than a cast failure or admission', async target => {
    await expect(assertSignerIsNotAuthor(target,ORG,REVIEWER,{ meaning:'review',client:sql }))
      .rejects.toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
  });

  it('a syntactically valid missing document stays unresolved', async () => {
    await expect(assertSignerIsNotAuthor(`authoring-document:${randomUUID()}`,ORG,REVIEWER,{ meaning:'review',client:sql }))
      .rejects.toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
  });

  it('an actual database query failure is unverified, never an independence result', async () => {
    const doc = await document();
    const failing: AuthorshipReader = { query:async () => sql.query('SELECT 1 / 0 AS broken_authorship_read') };
    const quiet = vi.spyOn(console,'error').mockImplementation(() => undefined);
    try {
      await expect(assertIndependent(doc,REVIEWER,failing)).rejects.toBeInstanceOf(SeparationOfDutiesUnverifiedError);
    } finally { quiet.mockRestore(); }
  });
});

describe('The actual historical authorship rows are immutable', () => {
  it('engine UPDATE, DELETE and TRUNCATE guards retain contributor identity', async () => {
    const doc = await document();
    const id = await revision(doc,String(HISTORICAL_WRITER));
    await expect(sql.query('UPDATE doc_revisions SET created_by=$1 WHERE id=$2',[String(REVIEWER),id])).rejects.toThrow(/append-only/i);
    await expect(sql.query('DELETE FROM doc_revisions WHERE id=$1',[id])).rejects.toThrow(/append-only/i);
    await expect(sql.query('TRUNCATE doc_revisions')).rejects.toThrow(/append-only/i);
    const retained = await sql.query('SELECT created_by FROM doc_revisions WHERE id=$1',[id]);
    expect(retained.rows).toEqual([{ created_by:String(HISTORICAL_WRITER) }]);
    await expect(assertIndependent(doc,HISTORICAL_WRITER)).rejects.toBeInstanceOf(SeparationOfDutiesError);
  });
});

describe('Authoring heading and structure audit history', () => {
  it('an empty section creator is an author even when no prose revision was written', async () => {
    const doc = await document();
    const sectionId = randomUUID();
    await sql.query(`INSERT INTO authoring_sections (id,doc_id,code,title,content,tenant_id)
      VALUES ($1,$2,'2.5.2','Saved empty heading','',$3)`,[sectionId,doc.id,ORG]);
    await audit(doc,'CREATE',String(HISTORICAL_WRITER),{ section_code:'2.5.2' },{ sectionId });
    expect((await sql.query('SELECT id FROM doc_revisions WHERE section_id=$1',[sectionId])).rows).toEqual([]);
    const authors = await resolveTargetAuthors(doc.target,ORG,sql);
    expect(authors.authors).toEqual([CREATOR,HISTORICAL_WRITER]);
    expect(authors.sources.some(source => /audit|heading|structure/i.test(source))).toBe(true);
    await expect(assertIndependent(doc,HISTORICAL_WRITER)).rejects.toBeInstanceOf(SeparationOfDutiesError);
    await expect(assertIndependent(doc)).resolves.toMatchObject({ checked:true });
  });

  it.each(['title','code'] as const)('retains a %s-only contributor from the native from/to metadata shape', async field => {
    const doc = await document();
    const from = field === 'title' ? 'Rationale' : '2.5.1';
    const to = field === 'title' ? 'Updated regulatory heading' : '2.5.2';
    await sql.query(`UPDATE authoring_sections SET ${field}=$1 WHERE id=$2 AND tenant_id=$3`,[to,doc.sectionId,ORG]);
    await audit(doc,'RENAME',String(HISTORICAL_WRITER),{ source:'section-metadata',changes:[{ field,from,to }] });
    expect((await resolveTargetAuthors(doc.target,ORG,sql)).authors).toEqual([CREATOR,HISTORICAL_WRITER]);
    await expect(assertIndependent(doc,HISTORICAL_WRITER)).rejects.toBeInstanceOf(SeparationOfDutiesError);
  });

  it('a recorded null-to-heading change is distinct and contributes authorship', async () => {
    const doc = await document();
    await audit(doc,'RENAME',String(SECOND_WRITER),{
      source:'section-metadata',changes:[{ field:'title',from:null,to:'Established regulatory heading' }],
    });
    expect((await resolveTargetAuthors(doc.target,ORG,sql)).authors).toEqual([CREATOR,SECOND_WRITER]);
    await expect(assertIndependent(doc,SECOND_WRITER)).rejects.toBeInstanceOf(SeparationOfDutiesError);
  });

  it('a saved section-order contributor is an author without a section-scoped audit row', async () => {
    const doc = await document();
    const next = randomUUID();
    await sql.query(`INSERT INTO authoring_sections (id,doc_id,code,title,content,order_index,tenant_id)
      VALUES ($1,$2,'2.5.2','Next heading','',0,$3)`,[next,doc.id,ORG]);
    await sql.query('UPDATE authoring_sections SET order_index=1 WHERE id=$1 AND tenant_id=$2',[doc.sectionId,ORG]);
    await audit(doc,'REORDER_SECTIONS',String(HISTORICAL_WRITER),{ order:[next,doc.sectionId] },{ sectionId:null });
    expect((await resolveTargetAuthors(doc.target,ORG,sql)).authors).toEqual([CREATOR,HISTORICAL_WRITER]);
    await expect(assertIndependent(doc,HISTORICAL_WRITER)).rejects.toBeInstanceOf(SeparationOfDutiesError);
    await expect(assertIndependent(doc)).resolves.toMatchObject({ checked:true });
  });

  it.each(['CREATE','RENAME'])('the retained %s actor survives removal of the source section', async operation => {
    const doc = await document();
    const metadata = operation === 'RENAME'
      ? { source:'section-metadata',changes:[{ field:'title',from:'Original heading',to:'Revised heading' }] }
      : { section_code:'2.5.1' };
    await audit(doc,operation,String(HISTORICAL_WRITER),metadata);
    await sql.query('DELETE FROM authoring_sections WHERE id=$1 AND tenant_id=$2',[doc.sectionId,ORG]);
    expect((await sql.query('SELECT id FROM authoring_sections WHERE doc_id=$1',[doc.id])).rows).toEqual([]);
    expect((await resolveTargetAuthors(doc.target,ORG,sql)).authors).toEqual([CREATOR,HISTORICAL_WRITER]);
    await expect(assertIndependent(doc,HISTORICAL_WRITER)).rejects.toBeInstanceOf(SeparationOfDutiesError);
  });

  it('deduplicates original, prose, heading and order authors across the protected sources', async () => {
    const doc = await document();
    await revision(doc,String(HISTORICAL_WRITER));
    await audit(doc,'CREATE',String(HISTORICAL_WRITER));
    await audit(doc,'RENAME',String(SECOND_WRITER),{
      source:'section-metadata',changes:[{ field:'title',from:'Old heading',to:'New heading' }],
    });
    await audit(doc,'REORDER_SECTIONS',String(FOREIGN_WRITER),{ order:[doc.sectionId] },{ sectionId:null });
    expect((await resolveTargetAuthors(doc.target,ORG,sql)).authors).toEqual([CREATOR,HISTORICAL_WRITER,SECOND_WRITER,FOREIGN_WRITER]);
    await expect(assertIndependent(doc,FOREIGN_WRITER)).rejects.toBeInstanceOf(SeparationOfDutiesError);
    await expect(assertIndependent(doc)).resolves.toMatchObject({ checked:true });
  });
});

describe('Authoring heading and structure audit history exclusions and verification', () => {
  it('document creation with no section cannot fabricate a second author', async () => {
    const doc = await document();
    await audit(doc,'CREATE',String(REVIEWER),{ title:'Document header' },{ sectionId:null });
    expect((await resolveTargetAuthors(doc.target,ORG,sql)).authors).toEqual([CREATOR]);
    await expect(assertIndependent(doc)).resolves.toMatchObject({ checked:true });
  });

  it.each(['GRANT_PERMISSION','COMMENT','document_reviewed','review_requested','E_SIGN','SIGN','TRACK_CHANGES'])(
    '%s activity does not make its actor a controlled-content author', async operation => {
    const doc = await document();
    await audit(doc,operation,String(REVIEWER),{
      source:'section-metadata',changes:[{ field:'title',from:'Old heading',to:'New heading' }],
    });
    expect((await resolveTargetAuthors(doc.target,ORG,sql)).authors).toEqual([CREATOR]);
    await expect(assertIndependent(doc)).resolves.toMatchObject({ checked:true });
  });

  it.each([
    ['wrong source',{ source:'other-route',changes:[{ field:'title',from:'Old',to:'New' }] }],
    ['wrong source with malformed changes',{ source:'other-route',changes:null }],
    ['missing source',{ changes:[{ field:'code',from:'2.5.1',to:'2.5.2' }] }],
    ['an empty change list',{ source:'section-metadata',changes:[] }],
    ['unchanged heading',{ source:'section-metadata',changes:[{ field:'title',from:'Same heading',to:'Same heading' }] }],
    ['unchanged null code',{ source:'section-metadata',changes:[{ field:'code',from:null,to:null }] }],
    ['track-only changes',{ source:'section-metadata',changes:[{ field:'track_changes',from:false,to:true }] }],
    ['another metadata field',{ source:'section-metadata',changes:[{ field:'other_metadata',from:'Old',to:'New' }] }],
  ])('a RENAME with %s does not fabricate a heading contributor', async (_label,metadata) => {
    const doc = await document();
    await audit(doc,'RENAME',String(REVIEWER),metadata);
    expect((await resolveTargetAuthors(doc.target,ORG,sql)).authors).toEqual([CREATOR]);
    await expect(assertIndependent(doc)).resolves.toMatchObject({ checked:true });
  });

  it('ignores other-document and other-tenant audit identities before resolving actors', async () => {
    const doc = await document();
    const other = await document();
    await audit(other,'CREATE',String(REVIEWER));
    await audit(doc,'REORDER_SECTIONS','7x',{ order:[doc.sectionId] },{ organizationId:FOREIGN_ORG,sectionId:null });
    await audit(doc,'CREATE',String(REVIEWER),{}, { organizationId:FOREIGN_ORG });
    expect((await resolveTargetAuthors(doc.target,ORG,sql)).authors).toEqual([CREATOR]);
    await expect(assertIndependent(doc)).resolves.toMatchObject({ checked:true });
  });

  it.each([null,'7x','writer@example.test','20000000-0000-4000-8000-000000000001','0','-7','7.5','2147483648','07',' 7 ',''])(
    'a countable audit act with malformed actor %j leaves independence unresolved', async actor => {
    const doc = await document();
    await audit(doc,'RENAME',actor,{ source:'section-metadata',changes:[{ field:'title',from:'Old',to:'New' }] });
    await expect(resolveTargetAuthors(doc.target,ORG,sql)).rejects.toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
    await expect(assertIndependent(doc)).rejects.toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
  });

  it.each([
    ['missing changes',{ source:'section-metadata' }],
    ['null changes',{ source:'section-metadata',changes:null }],
    ['object changes',{ source:'section-metadata',changes:{ field:'title',from:'Old',to:'New' } }],
    ['string changes',{ source:'section-metadata',changes:'title changed' }],
    ['null element',{ source:'section-metadata',changes:[null] }],
    ['string element',{ source:'section-metadata',changes:['title changed'] }],
    ['numeric element',{ source:'section-metadata',changes:[7] }],
    ['array element',{ source:'section-metadata',changes:[[]] }],
    ['missing field',{ source:'section-metadata',changes:[{ from:'Old',to:'New' }] }],
    ['non-string field',{ source:'section-metadata',changes:[{ field:7,from:'Old',to:'New' }] }],
    ['missing title from',{ source:'section-metadata',changes:[{ field:'title',to:'New' }] }],
    ['missing title to',{ source:'section-metadata',changes:[{ field:'title',from:'Old' }] }],
    ['object title from',{ source:'section-metadata',changes:[{ field:'title',from:{ text:'Old' },to:'New' }] }],
    ['array code to',{ source:'section-metadata',changes:[{ field:'code',from:'2.5.1',to:['2.5.2'] }] }],
    ['boolean title from',{ source:'section-metadata',changes:[{ field:'title',from:false,to:'New' }] }],
    ['numeric code to',{ source:'section-metadata',changes:[{ field:'code',from:'2.5.1',to:2.5 }] }],
  ])('malformed native heading evidence: %s cannot prove reviewer independence', async (_label,metadata) => {
    const doc = await document();
    await audit(doc,'RENAME',String(HISTORICAL_WRITER),metadata);
    await expect(resolveTargetAuthors(doc.target,ORG,sql)).rejects.toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
    await expect(assertIndependent(doc)).rejects.toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
  });
});

describe('Authoring heading and structure audit history database protection', () => {
  it('an actual failed audit query remains unverified even when creator and prose facts are known', async () => {
    const doc = await document();
    await revision(doc,String(HISTORICAL_WRITER));
    const failing: AuthorshipReader = { query:async (statement,params) => statement.includes('authoring_audit_trail')
      ? sql.query('SELECT 1 / 0 AS failed_retained_audit_read') : sql.query(statement,params) };
    const quiet = vi.spyOn(console,'error').mockImplementation(() => undefined);
    try {
      await expect(assertIndependent(doc,REVIEWER,failing)).rejects.toBeInstanceOf(SeparationOfDutiesUnverifiedError);
    } finally { quiet.mockRestore(); }
  });

  it('actual audit UPDATE, DELETE and TRUNCATE guards preserve heading-author evidence', async () => {
    const doc = await document();
    const id = await audit(doc,'RENAME',String(HISTORICAL_WRITER),{
      source:'section-metadata',changes:[{ field:'title',from:'Old heading',to:'New heading' }],
    });
    await expect(sql.query('UPDATE authoring_audit_trail SET actor_id=$1 WHERE id=$2',[String(REVIEWER),id]))
      .rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    await expect(sql.query('DELETE FROM authoring_audit_trail WHERE id=$1',[id])).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    await expect(sql.query('TRUNCATE authoring_audit_trail')).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    expect((await sql.query('SELECT actor_id FROM authoring_audit_trail WHERE id=$1',[id])).rows)
      .toEqual([{ actor_id:String(HISTORICAL_WRITER) }]);
    await expect(assertIndependent(doc,HISTORICAL_WRITER)).rejects.toBeInstanceOf(SeparationOfDutiesError);
  });
});
