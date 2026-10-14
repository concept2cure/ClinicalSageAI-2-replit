/** Human-review board admission and current-content facts on real canonical DDL. */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertNoSchemaGaps, createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import type { RequestSqlClient } from '../../../db/requestDb';
import { AUTHORING_REVIEW_BINDING_BASIS } from '../../../../shared/authoring/peer-review';
import { authoringSnapshotHash, fullVisibleAuthoringSnapshot } from '../../authoring/authoring-content-digests';
import { buildAuthoringReviewBoard, type BuildReviewBoardInput } from '../authoring-review-board';

const ORG = 7;
const AUTHOR = 11;
const READER = 22;
const OTHER_REVIEWER = 33;
const PROGRAM = 'a0000000-0000-4000-8000-000000000001';
const PRIVATE_PROGRAM = 'a0000000-0000-4000-8000-000000000002';
let database: JourneyDb;
let sql: RequestSqlClient;

beforeAll(async () => {
  database = await createJourneyDb({
    prereqSql: `
      CREATE TABLE organizations (id INTEGER PRIMARY KEY,name TEXT,status TEXT NOT NULL);
      CREATE TABLE users (id INTEGER PRIMARY KEY,name TEXT,email TEXT,status TEXT NOT NULL);
      CREATE TABLE organization_users (organization_id INTEGER,user_id INTEGER,role TEXT,
        PRIMARY KEY(organization_id,user_id));
      CREATE TABLE regulatory_programs (id UUID PRIMARY KEY,organization_id INTEGER,name TEXT,deleted_at TIMESTAMPTZ);
      CREATE TABLE projects (id INTEGER PRIMARY KEY,organization_id INTEGER,regulatory_program_id UUID,
        client_workspace_id INTEGER,status TEXT,owner_id INTEGER,created_by_id INTEGER,settings JSONB);
      CREATE TABLE project_visibility_settings (project_id INTEGER,organization_id INTEGER,visibility TEXT);
      CREATE TABLE project_members (project_id INTEGER,organization_id INTEGER,user_id INTEGER,role TEXT,status TEXT);
      CREATE TABLE concept2cure_artifacts (id INTEGER PRIMARY KEY,organization_id INTEGER,project_id INTEGER);
      CREATE TABLE concept2cure_review_assignments (artifact_id INTEGER,reviewer_id INTEGER,organization_id INTEGER,status TEXT);
      INSERT INTO organizations VALUES (7,'Review tenant','active'),(9,'Foreign tenant','active');
      INSERT INTO users VALUES (11,'Author','author@example.test','active'),
        (22,'Reader','reader@example.test','active'),(33,'Other reviewer','other@example.test','active'),
        (44,'Foreign reader','foreign@example.test','active');
      INSERT INTO organization_users VALUES (7,11,'member'),(7,22,'member'),(7,33,'member'),(9,44,'member');
      INSERT INTO regulatory_programs VALUES ('${PROGRAM}',7,'Accessible project',NULL),
        ('${PRIVATE_PROGRAM}',7,'Private project',NULL);
      INSERT INTO projects VALUES (101,7,'${PROGRAM}',NULL,'active',11,11,'{}'),
        (102,7,'${PRIVATE_PROGRAM}',NULL,'active',11,11,'{}');
      INSERT INTO project_visibility_settings VALUES (101,7,'org_public'),(102,7,'private');
    `,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'migrations/20260728_authoring_reviews.sql',
    ],
  });
  sql = database.pool as RequestSqlClient;
}, 60_000);

beforeEach(async () => { await sql.query('BEGIN'); });
afterEach(async () => { await sql.query('ROLLBACK'); });
afterAll(async () => {
  try { if (database) assertNoSchemaGaps(database); }
  finally { await database?.close(); }
});

interface Fixture { id: string; sections: [string,string] }
async function document(programId: string | null = PROGRAM): Promise<Fixture> {
  const id = randomUUID();
  const sections: [string,string] = [randomUUID(),randomUUID()];
  await sql.query(`INSERT INTO authoring_documents
    (id,title,module,locale,product_code,version,status,created_by,tenant_id,client_program_id)
    VALUES ($1,'Private review title','M2','en','PRODUCT-7','0.4','draft',$2,$3,$4)`,
  [id,String(AUTHOR),ORG,programId]);
  for (const [index,sectionId] of sections.entries()) {
    await sql.query(`INSERT INTO authoring_sections
      (id,doc_id,code,title,content,order_index,tenant_id,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'2026-10-01T12:00:00Z')`,
    [sectionId,id,`2.5.${index + 1}`,`Section ${index + 1}`,`<p>Private section ${index + 1} prose</p>`,index,ORG]);
  }
  await sql.query(`INSERT INTO authoring_comments
    (id,section_id,doc_id,body,created_by,tenant_id,user_name,user_email)
    VALUES ($1,$2,$3,'Private reviewer comment',$4,$5,'Author','author@example.test')`,
  [randomUUID(),sections[0],id,String(AUTHOR),ORG]);
  await pendingReview(id);
  return {id,sections};
}
async function grant(doc: Fixture, actor = READER, sectionId: string | null = null): Promise<void> {
  await sql.query(`INSERT INTO doc_permissions
    (id,doc_id,section_id,tenant_id,principal_id,email,role,granted_by)
    VALUES ($1,$2,$3,$4,$5,$6,'VIEWER',$7)`,
  [randomUUID(),doc.id,sectionId,ORG,String(actor),actor === READER ? 'reader@example.test' : `${actor}@example.test`,String(AUTHOR)]);
}
async function pendingReview(docId: string, reviewer = READER, email = 'reader@example.test'): Promise<void> {
  await sql.query(`INSERT INTO authoring_reviews
    (id,doc_id,reviewer_id,reviewer_name,reviewer_email,review_status,requested_at,requested_by,tenant_id)
    VALUES ($1,$2,$3,'Recorded reviewer',$4,'pending','2026-10-10T12:00:00Z',$5,$6)
    ON CONFLICT(doc_id,reviewer_id,tenant_id) DO NOTHING`,
  [randomUUID(),docId,String(reviewer),email,String(AUTHOR),ORG]);
}
function board(overrides: Partial<BuildReviewBoardInput> = {}) {
  return buildAuthoringReviewBoard({sql,orgId:ORG,userId:String(READER),userEmail:'reader@example.test',
    scope:'all',programId:null,limit:25,itemId:null,...overrides});
}
async function bindReview(docId: string, status = 'approved', reviewer = READER): Promise<string> {
  const docs = await sql.query(`SELECT * FROM authoring_documents WHERE id=$1 AND tenant_id=$2`,[docId,ORG]);
  const sections = await sql.query(`SELECT id::text,code,title,content FROM authoring_sections
    WHERE doc_id=$1 AND tenant_id=$2 ORDER BY order_index,created_at,id`,[docId,ORG]);
  const snapshot = fullVisibleAuthoringSnapshot({
    doc:docs.rows[0] as unknown as Parameters<typeof fullVisibleAuthoringSnapshot>[0]['doc'],
    sections:sections.rows as unknown as Parameters<typeof fullVisibleAuthoringSnapshot>[0]['sections'],
  });
  const hash = authoringSnapshotHash(snapshot);
  await sql.query(`UPDATE authoring_reviews SET review_status=$1,review_comments='Recorded decision reason',
    reviewed_at='2026-10-11T12:00:00Z',reviewed_snapshot=$2::jsonb,reviewed_snapshot_hash=$3,review_binding_basis=$4
    WHERE doc_id=$5 AND tenant_id=$6 AND reviewer_id=$7`,
  [status,JSON.stringify(snapshot),hash,AUTHORING_REVIEW_BINDING_BASIS,docId,ORG,String(reviewer)]);
  return hash;
}

describe('board ACL before private projection', () => {
  it.each(['all','mine','requested'] as const)('does not disclose a same-tenant private document in %s scope', async (scope) => {
    const doc = await document();
    const result = await board({scope,itemId:doc.id});
    expect(result.queue).toEqual([]);
    expect(result.thread).toEqual([]);
    expect(result.meta).toMatchObject({total:0,threadDocumentId:null});
    expect(JSON.stringify(result)).not.toMatch(/Private review title|Private section|Private reviewer comment/);
  });
  it('a section-only grant cannot disclose the full document review or thread', async () => {
    const doc = await document();
    await grant(doc,READER,doc.sections[0]);
    expect((await board({itemId:doc.id})).queue).toEqual([]);
  });
  it('never parses an inaccessible private body when assembling an admitted document', async () => {
    const hidden = await document();
    const admitted = await document();
    await grant(admitted);
    await sql.query('UPDATE authoring_sections SET code=NULL WHERE id=$1 AND tenant_id=$2',[hidden.sections[1],ORG]);
    expect((await board()).queue.map(row => row.id)).toEqual([admitted.id]);
  });
  it('refuses an unsupported admitted full snapshot instead of claiming verified standing', async () => {
    const doc = await document();
    await grant(doc);
    await sql.query('UPDATE authoring_sections SET code=NULL WHERE id=$1 AND tenant_id=$2',[doc.sections[1],ORG]);
    await expect(board()).rejects.toMatchObject({status:503,code:'AUTHORING_REVIEW_SNAPSHOT_UNAVAILABLE'});
  });
  it('an explicit full-document grant permits the canonical board and selected thread', async () => {
    const doc = await document();
    await grant(doc);
    const result = await board({itemId:doc.id});
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]).toMatchObject({id:doc.id,doc:'Private review title',comments:1,myReviewStanding:'pending'});
    expect(result.thread[0]?.body).toBe('Private reviewer comment');
  });
  it('does not let a document ACL bypass private project admission', async () => {
    const doc = await document(PRIVATE_PROGRAM);
    await grant(doc);
    expect((await board()).queue).toEqual([]);
  });
  it('retains full-ACL organization-wide documents only in the unfiltered board', async () => {
    const doc = await document(null);
    await grant(doc);
    expect((await board()).queue.map(row => row.id)).toEqual([doc.id]);
    expect((await board({programId:PROGRAM})).queue).toEqual([]);
  });
});

describe('board current membership and authoritative ownership', () => {
  it.each(['departed','inactive-user','inactive-organization','foreign','malformed-id'] as const)(
    'refuses %s actor instead of returning cached private content', async (kind) => {
      const doc = await document();
      await grant(doc);
      let userId = String(READER);
      if (kind === 'departed') await sql.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2',[ORG,READER]);
      if (kind === 'inactive-user') await sql.query("UPDATE users SET status='inactive' WHERE id=$1",[READER]);
      if (kind === 'inactive-organization') await sql.query("UPDATE organizations SET status='inactive' WHERE id=$1",[ORG]);
      if (kind === 'foreign') userId = '44';
      if (kind === 'malformed-id') userId = '22garbage';
      await expect(board({userId})).rejects.toMatchObject({status:403});
    },
  );
  it('does not treat a forged reviewer email as the caller assignment', async () => {
    const doc = await document();
    await grant(doc);
    await sql.query('DELETE FROM authoring_reviews WHERE doc_id=$1 AND tenant_id=$2',[doc.id,ORG]);
    await pendingReview(doc.id,OTHER_REVIEWER,'reader@example.test');
    expect((await board({scope:'mine'})).queue).toEqual([]);
    expect((await board()).queue[0]).toMatchObject({myReviewId:null,myReviewStatus:null,myReviewStanding:null});
  });
  it('uses the current authoritative email for sign-off ownership, not the old token label', async () => {
    const doc = await document();
    await grant(doc);
    await sql.query('DELETE FROM authoring_reviews WHERE doc_id=$1 AND tenant_id=$2',[doc.id,ORG]);
    const workflow = randomUUID();
    await sql.query('UPDATE authoring_documents SET current_workflow_id=$1 WHERE id=$2 AND tenant_id=$3',[workflow,doc.id,ORG]);
    await sql.query(`INSERT INTO authoring_workflow_steps
      (id,workflow_id,doc_id,step_no,role,approver_email,tenant_id)
      VALUES ($1,$2,$3,1,'APPROVER','former@example.test',$4)`,[randomUUID(),workflow,doc.id,ORG]);
    expect((await board({scope:'mine',userEmail:'former@example.test'})).queue).toEqual([]);
    await sql.query("UPDATE authoring_workflow_steps SET approver_email='reader@example.test' WHERE doc_id=$1 AND tenant_id=$2",[doc.id,ORG]);
    expect((await board({scope:'mine',userEmail:'former@example.test'})).queue[0]?.atMySignOff).toBe(true);
  });
  it('an unavailable requested item does not silently substitute another private thread', async () => {
    const privateDoc = await document();
    const allowed = await document();
    await grant(allowed);
    const result = await board({itemId:privateDoc.id});
    expect(result.queue.map(row => row.id)).toEqual([allowed.id]);
    expect(result.thread).toEqual([]);
    expect(result.meta.threadDocumentId).toBeNull();
  });
  it.each(['document-grant','membership','project-sharing','actor-email'] as const)(
    'refuses assembled output after a mid-read %s change', async (kind) => {
      const doc = await document();
      await grant(doc);
      let changed = false;
      const changingSql: RequestSqlClient = {query:async (text,params) => {
        const result = await sql.query(text,params);
        if (!changed && text.includes('FROM authoring_comments c')) {
          changed = true;
          if (kind === 'document-grant') await sql.query('UPDATE doc_permissions SET revoked_at=NOW() WHERE tenant_id=$1 AND doc_id=$2 AND principal_id=$3',[ORG,doc.id,String(READER)]);
          if (kind === 'membership') await sql.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2',[ORG,READER]);
          if (kind === 'project-sharing') await sql.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=101 AND organization_id=$1",[ORG]);
          if (kind === 'actor-email') await sql.query("UPDATE users SET email='changed@example.test' WHERE id=$1",[READER]);
        }
        return result;
      }};
      await expect(board({sql:changingSql,itemId:doc.id})).rejects.toMatchObject({status:expect.any(Number)});
      expect(changed).toBe(true);
    },
  );
});

describe('board saved-content review standing', () => {
  it('retains legacy approval and reason as unbound open work', async () => {
    const doc = await document();
    await grant(doc);
    await sql.query(`UPDATE authoring_reviews SET review_status='approved',review_comments='Earlier approval',
      reviewed_at='2026-10-11T12:00:00Z' WHERE doc_id=$1 AND tenant_id=$2`,[doc.id,ORG]);
    const row = (await board()).queue[0];
    expect(row).toMatchObject({id:doc.id,state:'in-review',myReviewStatus:'approved',myReviewStanding:'unbound',awaitingMyReview:true});
    expect(row.reviews[0]).toMatchObject({status:'approved',comments:'Earlier approval',standing:'unbound'});
    expect((await board({scope:'mine'})).queue[0]?.id).toBe(doc.id);
  });
  it('a current nonempty approval is not returned as open peer work', async () => {
    const doc = await document();
    await grant(doc);
    await bindReview(doc.id);
    expect((await board()).queue).toEqual([]);
    const history = await board({scope:'requested',userId:String(AUTHOR),userEmail:'author@example.test'});
    expect(history.queue[0]).toMatchObject({id:doc.id,state:'approved'});
    expect(history.queue[0].reviews[0]).toMatchObject({status:'approved',standing:'current'});
  });
  it.each(['second-section','document-title','section-title','version','order'] as const)(
    'a %s change invalidates the full binding while retaining exact prior facts', async (change) => {
      const doc = await document();
      await grant(doc);
      const reviewedHash = await bindReview(doc.id);
      if (change === 'second-section') await sql.query("UPDATE authoring_sections SET content='<p>Changed second text</p>' WHERE id=$1 AND tenant_id=$2",[doc.sections[1],ORG]);
      if (change === 'document-title') await sql.query("UPDATE authoring_documents SET title='Changed title' WHERE id=$1 AND tenant_id=$2",[doc.id,ORG]);
      if (change === 'section-title') await sql.query("UPDATE authoring_sections SET title='Changed heading' WHERE id=$1 AND tenant_id=$2",[doc.sections[1],ORG]);
      if (change === 'version') await sql.query("UPDATE authoring_documents SET version='0.5' WHERE id=$1 AND tenant_id=$2",[doc.id,ORG]);
      if (change === 'order') await sql.query('UPDATE authoring_sections SET order_index=5 WHERE id=$1 AND tenant_id=$2',[doc.sections[0],ORG]);
      const row = (await board()).queue[0];
      expect(row).toMatchObject({id:doc.id,state:'in-review',myReviewStatus:'approved',myReviewStanding:'stale',awaitingMyReview:true});
      expect(row.reviews[0]).toMatchObject({status:'approved',comments:'Recorded decision reason',standing:'stale'});
      const retained = await sql.query('SELECT reviewed_snapshot_hash,reviewed_snapshot FROM authoring_reviews WHERE doc_id=$1 AND tenant_id=$2',[doc.id,ORG]);
      expect(retained.rows[0].reviewed_snapshot_hash).toBe(reviewedHash);
      expect((retained.rows[0].reviewed_snapshot as {sections:Array<{content:string}>}).sections[1].content).toBe('<p>Private section 2 prose</p>');
    },
  );
  it('a departed reviewer does not erase their verified unchanged historical verdict', async () => {
    const doc = await document();
    await grant(doc);
    await sql.query('DELETE FROM authoring_reviews WHERE doc_id=$1 AND tenant_id=$2',[doc.id,ORG]);
    await pendingReview(doc.id,OTHER_REVIEWER,'other@example.test');
    await bindReview(doc.id,'approved',OTHER_REVIEWER);
    await sql.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2',[ORG,OTHER_REVIEWER]);
    const row = (await board({scope:'requested',userId:String(AUTHOR)})).queue[0];
    expect(row.reviews[0]).toMatchObject({status:'approved',standing:'current'});
  });
  it('a stale rejection does not claim the current text is rejected', async () => {
    const doc = await document();
    await grant(doc);
    await bindReview(doc.id,'rejected');
    await sql.query("UPDATE authoring_sections SET content='Revised to address rejection' WHERE id=$1 AND tenant_id=$2",[doc.sections[1],ORG]);
    const row = (await board()).queue[0];
    expect(row.state).toBe('in-review');
    expect(row.reviews[0]).toMatchObject({status:'rejected',standing:'stale'});
  });
});
