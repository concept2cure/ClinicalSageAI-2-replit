/** Real SQL for saved-record review and current access decisions. The injected
 * tenant connection replaces checkout only; this does not qualify live RLS or
 * concurrent writers. No provider or authorization service is mocked. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RequestSqlClient } from '../../../db/requestDb';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import type { WithTenantConnectionOptions } from '../../../db/withTenantConnection';
import type { ToolContext } from '../AnaToolExecutor';
import { critiqueSavedDocument } from '../saved-document-critique';

const PROGRAM = '11111111-2222-4333-8444-000000000011';
const OTHER_PROGRAM = '11111111-2222-4333-8444-000000000012';
const FOREIGN_PROGRAM = '11111111-2222-4333-8444-000000000021';
const DOCUMENT = '11111111-2222-4333-8444-000000000041';
const OTHER_DOCUMENT = '11111111-2222-4333-8444-000000000042';
const FOREIGN_DOCUMENT = '11111111-2222-4333-8444-000000000051';
const sectionId = (n: number) => `22222222-2222-4333-8444-${String(n).padStart(12, '0')}`;
const METHODS = 'Enrolled: 186 subjects were treated according to the protocol.';
const RESULTS = 'Efficacy was assessed in all subjects (enrolled = 184) per the SAP.';
const COHERENT = 'The protocol specified the study procedures.';
const context: ToolContext = { organizationId: 7, userId: 7, projectRef: PROGRAM };

interface ReviewItem {
  kind: string;
  sectionId?: string;
  title?: string;
  finding?: { category: string; message: string; evidence: string[] };
}
interface ReviewPage {
  error?: string;
  complete?: boolean;
  documentId?: string;
  snapshotSha256?: string;
  documentScore?: number;
  precisionVerdict?: string;
  verdict?: string;
  coverage?: { sectionCount: number; textChars: number; pendingInsertions: number; pendingDeletions: number; citationGaps: number };
  pagination?: { offset: number; shown: number; total: number; nextOffset: number | null };
  items?: ReviewItem[];
}

let pg: PGlite;
const statements: string[] = [];
const connections: WithTenantConnectionOptions[] = [];
const connection = async (opts: WithTenantConnectionOptions, fn: (q: RequestSqlClient) => Promise<string>) => {
  connections.push(opts);
  return fn({ query: async (sql, params) => {
    statements.push(sql);
    return pg.query<Record<string, unknown>>(sql, params);
  } });
};

async function review(input: Record<string, unknown> = {}, ctx: ToolContext | undefined = context) {
  const raw = await critiqueSavedDocument({ document_id: DOCUMENT, ...input }, ctx, connection);
  expect(raw.length).toBeLessThanOrEqual(5000);
  const parsed: unknown = JSON.parse(raw);
  expect(parsed).toBeTypeOf('object');
  return parsed as ReviewPage;
}

async function denied(input: Record<string, unknown> = {}, ctx: ToolContext | undefined = context) {
  const result = await review(input, ctx);
  expect(result.error).toBeTypeOf('string');
  expect(result.complete).toBe(false);
  expect(result.documentScore).toBeUndefined();
  expect(result.precisionVerdict).toBeUndefined();
  expect(result.verdict).toBeUndefined();
  expect(result.items).toBeUndefined();
  return result;
}

async function replaceSections(count: number, text = COHERENT) {
  await pg.query('DELETE FROM authoring_sections WHERE doc_id=$1', [DOCUMENT]);
  await pg.query(`INSERT INTO authoring_sections(id,doc_id,tenant_id,code,title,order_index,created_at,updated_at,content)
    SELECT ('22222222-2222-4333-8444-' || lpad(n::text,12,'0'))::uuid,$1,7,n::text,
      'Saved section ' || n::text,n,'2026-10-01','2026-10-02',$2 FROM generate_series(1,$3::int) n`, [DOCUMENT, text, count]);
}

async function seedCitation(boundSection = sectionId(1)) {
  await replaceSections(2);
  await pg.query(`INSERT INTO cre_evidence_sources(id,organization_id,client_program_id,title,source_type,checksum,provenance,is_current)
    VALUES(101,7,$1,'Actual saved protocol','protocol',$2,'{}',true)`, [PROGRAM, 'a'.repeat(64)]);
  await pg.query(`INSERT INTO authoring_citations(section_id,tenant_id,source,reference_id)
    VALUES($1,7,'cre_evidence_source','101')`, [boundSection]);
  await pg.query('UPDATE authoring_sections SET content=$1 WHERE id=$2', [
    `<p>${COHERENT} <a data-cite="101">Cached protocol title</a></p>`, sectionId(1),
  ]);
}

async function withdrawCitation(choice: 'remove_data' | 'supersede' = 'remove_data') {
  await pg.query(`INSERT INTO document_data_dispositions(organization_id,program_id,captured_source_id,source_sha256,linked_ids,choice)
    VALUES(7,$1,101,$2,'{}',$3)`, [PROGRAM, 'a'.repeat(64), choice]);
}

async function walkPages() {
  const first = await review();
  expect(first.error).toBeUndefined();
  expect(first.complete).toBe(true);
  expect(first.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
  const pages = [first];
  const items = [...(first.items ?? [])];
  let next = first.pagination?.nextOffset;
  while (next !== null && next !== undefined && pages.length < 600) {
    const page = await review({ offset: next, expected_snapshot: first.snapshotSha256 });
    expect(page.error).toBeUndefined();
    expect(page.snapshotSha256).toBe(first.snapshotSha256);
    expect(page.documentScore).toBe(first.documentScore);
    expect(page.coverage).toEqual(first.coverage);
    expect(page.pagination?.offset).toBe(next);
    expect(page.pagination?.shown).toBe(page.items?.length);
    expect(page.pagination?.total).toBe(first.pagination?.total);
    items.push(...(page.items ?? []));
    pages.push(page);
    next = page.pagination?.nextOffset;
  }
  expect(next).toBeNull();
  expect(items).toHaveLength(first.pagination?.total ?? -1);
  return { first, pages, items };
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,deleted_at timestamptz);
    CREATE TABLE projects(id int PRIMARY KEY,organization_id int,client_workspace_id int,
      regulatory_program_id uuid,owner_id int,created_by_id int,settings jsonb);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE users(id int PRIMARY KEY,status text,email text);
    CREATE TABLE organizations(id int PRIMARY KEY,status text);
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_review_assignments(reviewer_id int,organization_id int,artifact_id uuid,status text);
    CREATE TABLE concept2cure_artifacts(id uuid PRIMARY KEY,project_id int,organization_id int);
    CREATE TABLE authoring_documents(id uuid PRIMARY KEY,tenant_id int,client_program_id uuid,
      title text,module text,product_code text,status text,created_by text,updated_at timestamptz);
    CREATE TABLE authoring_sections(id uuid PRIMARY KEY,doc_id uuid,tenant_id int,code text,title text,
      order_index int,created_at timestamptz,updated_at timestamptz,content text);
    CREATE TABLE doc_permissions(id uuid DEFAULT gen_random_uuid(),doc_id uuid,section_id uuid,tenant_id int,
      principal_id text,email text,role text,valid_from timestamptz DEFAULT now(),valid_until timestamptz,revoked_at timestamptz);
    CREATE TABLE cre_evidence_sources(id int PRIMARY KEY,organization_id int,client_program_id uuid,title text,
      sponsor text,source_type text,document_date date,source_record_identifier text,trial_registry_identifier text,
      application_number text,checksum text,provenance jsonb,is_current boolean,deleted_at timestamptz);
    CREATE TABLE authoring_citations(id uuid DEFAULT gen_random_uuid(),section_id uuid,tenant_id int,source text,reference_id text);
    CREATE TABLE document_data_dispositions(organization_id int,program_id uuid,captured_source_id int,
      source_sha256 text,linked_ids jsonb,choice text);
    CREATE TABLE file_uploads(id text PRIMARY KEY,organization_id int,checksum_sha256 text,storage_path text);
  `);
  // Keep the audit fixture writable by the canonical chained-audit writer,
  // even though saved-document review itself is a read-only operation.
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
}, 90_000);

beforeEach(async () => {
  await pg.exec(`
    TRUNCATE regulatory_programs,projects,organization_users,users,organizations,project_visibility_settings,
      project_members,concept2cure_review_assignments,concept2cure_artifacts,authoring_documents,authoring_sections,doc_permissions,
      cre_evidence_sources,authoring_citations,document_data_dispositions,file_uploads,audit_logs;
    INSERT INTO organizations VALUES(7,'active'),(8,'active');
    INSERT INTO users VALUES(6,'active','owner@example.test'),(7,'active','reviewer@example.test'),(8,'active','outsider@example.test');
    INSERT INTO organization_users VALUES(7,6,'member'),(7,7,'readonly'),(7,8,'member');
    INSERT INTO regulatory_programs VALUES('${PROGRAM}',7,NULL),('${OTHER_PROGRAM}',7,NULL),('${FOREIGN_PROGRAM}',8,NULL);
    INSERT INTO projects VALUES(11,7,71,'${PROGRAM}',6,6,'{}'),(12,7,71,'${OTHER_PROGRAM}',6,6,'{}'),
      (21,8,81,'${FOREIGN_PROGRAM}',6,6,'{}');
    INSERT INTO project_visibility_settings VALUES(11,7,'private'),(12,7,'private'),(21,8,'private');
    INSERT INTO project_members VALUES(11,7,7,'use','active'),(12,7,7,'use','active');
    INSERT INTO authoring_documents VALUES('${DOCUMENT}',7,'${PROGRAM}','Saved study report','5','DRUG','DRAFT','6','2026-10-02'),
      ('${OTHER_DOCUMENT}',7,'${OTHER_PROGRAM}','Other private report','5','DRUG','DRAFT','6','2026-10-02'),
      ('${FOREIGN_DOCUMENT}',8,'${FOREIGN_PROGRAM}','Foreign private report','5','DRUG','DRAFT','6','2026-10-02');
    INSERT INTO doc_permissions(doc_id,tenant_id,principal_id,role) VALUES('${DOCUMENT}',7,'7','VIEWER');
  `);
  await replaceSections(2);
  await pg.query('UPDATE authoring_sections SET title=$1,content=$2 WHERE id=$3', ['Methods', METHODS, sectionId(1)]);
  await pg.query('UPDATE authoring_sections SET title=$1,content=$2 WHERE id=$3', ['Results', RESULTS, sectionId(2)]);
  statements.length = 0;
  connections.length = 0;
});
afterAll(async () => { await pg?.close(); });

describe('the exact authorized saved document is the complete deterministic input', () => {
  it('finds conflicting subject counts across actual saved sections in one pinned transaction', async () => {
    const { first, items } = await walkPages();
    expect(first.documentId).toBe(DOCUMENT);
    expect(first.coverage).toMatchObject({ sectionCount: 2, textChars: METHODS.length + RESULTS.length });
    expect(first.precisionVerdict).toBe('revise');
    expect(items.some(item => item.kind === 'cross-section-finding' && item.finding?.category === 'consistency')).toBe(true);
    expect(items.filter(item => item.kind === 'section').map(item => item.sectionId)).toEqual([sectionId(1), sectionId(2)]);
    expect(connections).toEqual([expect.objectContaining({ tenantId: 7, caller: 'ana-saved-document-critique' })]);
    expect(statements[0]).toMatch(/^BEGIN.*REPEATABLE READ/i);
    expect(statements.at(-1)).toBe('COMMIT');
    expect(statements.some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
  });

  it('keeps frozen saved documents readable for oversight without edit permission or writes', async () => {
    await pg.query("UPDATE authoring_documents SET status='FROZEN' WHERE id=$1", [DOCUMENT]);
    expect((await review()).complete).toBe(true);
    expect(statements.some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
  });

  it('excludes unaccepted insertion text while retaining the proposed deletion in the accepted record', async () => {
    const accepted = 'Enrolled: 186 subjects were treated according to the protocol.';
    await pg.query('UPDATE authoring_sections SET content=$1 WHERE id=$2', [
      `<p><del data-author-name="Reviewer">${accepted}</del><ins data-author-name="AnA">Enrolled: 184 subjects.</ins></p>`, sectionId(1),
    ]);
    await pg.query('UPDATE authoring_sections SET content=$1 WHERE id=$2', [accepted, sectionId(2)]);
    const { first, items } = await walkPages();
    expect(first.coverage).toMatchObject({ textChars: accepted.length * 2, pendingInsertions: 1, pendingDeletions: 1 });
    expect(items.some(item => item.kind === 'cross-section-finding' && item.finding?.category === 'consistency')).toBe(false);
    expect(first.verdict).toBe('revise');
  });

  it('does not hide a cross-section conflict merely because the conflicting saved prose is marked for deletion', async () => {
    await pg.query('UPDATE authoring_sections SET content=$1 WHERE id=$2', [`<p><del>${METHODS}</del></p>`, sectionId(1)]);
    const { items } = await walkPages();
    expect(items.some(item => item.kind === 'cross-section-finding' && item.finding?.category === 'consistency')).toBe(true);
  });
});

describe('saved-review authorization is read again on every actual connection', () => {
  it('the executed actor-email query reads only membership in the current organization', async () => {
    expect((await review()).complete).toBe(true);
    const actorQuery = statements.find(sql => /SELECT\s+u\.email\s+FROM\s+users\s+u/i.test(sql));
    expect(actorQuery).toBeDefined();
    expect((await pg.query(actorQuery!, [7, 'active', 7])).rows).toEqual([{ email: 'reviewer@example.test' }]);
    await pg.query("INSERT INTO users VALUES(9,'active','foreign-only@example.test')");
    await pg.query("INSERT INTO organization_users VALUES(8,9,'member')");
    expect((await pg.query(actorQuery!, [9, 'active', 7])).rows).toEqual([]);
    // The user exists and can be resolved in their own organization, so the
    // empty current-organization result proves isolation rather than absence.
    expect((await pg.query(actorQuery!, [9, 'active', 8])).rows).toEqual([{ email: 'foreign-only@example.test' }]);
    statements.length = 0;
    await denied({}, { ...context, userId: 9 });
    expect(statements.some(sql => /FROM authoring_sections\b/.test(sql))).toBe(false);
  });

  it('refuses current project revocation after a successful review', async () => {
    expect((await review()).complete).toBe(true);
    await pg.query("UPDATE project_members SET status='revoked' WHERE project_id=11 AND user_id=7");
    statements.length = 0;
    await denied();
    expect(statements.at(-1)).toBe('ROLLBACK');
    expect(statements.some(sql => /FROM authoring_sections\b/.test(sql))).toBe(false);
  });

  it('refuses a revoked document grant even while current project access remains', async () => {
    expect((await review()).complete).toBe(true);
    await pg.query("UPDATE doc_permissions SET revoked_at=now() WHERE principal_id='7'");
    await denied();
  });

  it('resolves email-only document grants from the current user record', async () => {
    await pg.query("UPDATE doc_permissions SET principal_id='other-person',email='REVIEWER@example.test'");
    expect((await review()).complete).toBe(true);
    await pg.query("UPDATE users SET email='changed@example.test' WHERE id=7");
    await denied();
  });

  it('does not allow a section-only grant to authorize a whole-document read', async () => {
    await pg.query('UPDATE doc_permissions SET section_id=$1', [sectionId(1)]);
    await denied();
  });

  it.each([OTHER_DOCUMENT, FOREIGN_DOCUMENT])('refuses a saved document outside the selected program: %s', async documentId => {
    await denied({ document_id: documentId });
    expect(statements.some(sql => /FROM authoring_sections\b/.test(sql))).toBe(false);
  });

  it.each([{ ...context, projectRef: null }, { ...context, userId: null }, { ...context, organizationId: null }])(
    'refuses incomplete trusted conversation scope without checking out a database: %j', async ctx => {
      await denied({}, ctx);
      expect(connections).toHaveLength(0);
    },
  );

  it('refuses a foreign program even if the prompt requests a document in this organization', async () => {
    await denied({}, { ...context, projectRef: FOREIGN_PROGRAM });
  });
});

describe('complete versioned review pages do not omit or mix sections', () => {
  it('walks every section and finding through bounded pages including escaped saved titles', async () => {
    await replaceSections(48);
    await pg.query('UPDATE authoring_sections SET title=$1 || order_index::text', ['"Quoted" \\ saved heading '.repeat(20)]);
    const { first, pages, items } = await walkPages();
    expect(pages.length).toBeGreaterThan(1);
    expect(first.coverage?.sectionCount).toBe(48);
    const ids = items.filter(item => item.kind === 'section').map(item => item.sectionId);
    expect(ids).toEqual(Array.from({ length: 48 }, (_, i) => sectionId(i + 1)));
    expect(new Set(ids).size).toBe(48);
  });

  it.each(['content', 'document title'] as const)('refuses continuation after the saved %s changes, even without a new timestamp', async changed => {
    const first = await review();
    if (changed === 'content') await pg.query('UPDATE authoring_sections SET content=$1 WHERE id=$2', ['The accepted record changed.', sectionId(1)]);
    else await pg.query('UPDATE authoring_documents SET title=$1 WHERE id=$2', ['Changed saved title', DOCUMENT]);
    await denied({ offset: 1, expected_snapshot: first.snapshotSha256 });
  });

  it('rechecks document permission before returning a continuation', async () => {
    const first = await review();
    await pg.query("UPDATE doc_permissions SET revoked_at=now() WHERE principal_id='7'");
    await denied({ offset: 1, expected_snapshot: first.snapshotSha256 });
  });

  it.each([{ offset: 1 }, { offset: -1 }, { offset: '1' }, { offset: 0.5 }, { offset: 1, expected_snapshot: 'unverified' }])(
    'rejects invalid or unversioned cursor %j before a database checkout', async input => {
      await denied(input);
      expect(connections).toHaveLength(0);
    },
  );
});

describe('saved-review pre-enable workload measurement', () => {
  it('records a realistic multi-section calculation without imposing a timing threshold', async () => {
    const paragraph = 'The protocol describes study procedures, safety monitoring, participant follow-up and responsibilities. ' +
      'The sponsor reviews the record for consistency with the clinical development plan. ' +
      'Deviations are documented with their rationale and assessed before the report is finalized. ';
    const accepted = paragraph.repeat(7).trim();
    await replaceSections(96, accepted);
    const started = globalThis.performance.now();
    const raw = await critiqueSavedDocument({ document_id: DOCUMENT }, context, connection);
    const elapsedMs = globalThis.performance.now() - started;
    const result = JSON.parse(raw) as ReviewPage;
    expect(result.complete).toBe(true);
    expect(result.coverage).toMatchObject({ sectionCount: 96, textChars: accepted.length * 96 });
    expect(raw.length).toBeLessThanOrEqual(5000);
    console.info('saved-document-critique-benchmark', {
      sectionCount: result.coverage?.sectionCount, textChars: result.coverage?.textChars,
      elapsedMs: Math.round(elapsedMs * 100) / 100, serializedChars: raw.length,
      paginationTotal: result.pagination?.total,
    });
  });
});

describe('saved citations resolve only through the current exact-section association and data policy', () => {
  it('resolves the registered eligible source in the current section', async () => {
    await seedCitation();
    const { first, items } = await walkPages();
    expect(first.coverage?.citationGaps).toBe(0);
    expect(items.some(item => item.kind === 'record-finding')).toBe(false);
    expect(first.verdict).toBe('pass');
  });

  it('does not lend a sibling section association to an unregistered pasted marker', async () => {
    await seedCitation(sectionId(2));
    const { first, items } = await walkPages();
    expect(first.coverage?.citationGaps).toBe(1);
    expect(first.verdict).toBe('revise');
    expect(items).toContainEqual(expect.objectContaining({ kind: 'record-finding', sectionId: sectionId(1), severity: 'high', sourceCount: 1 }));
  });

  it.each(['remove_data', 'supersede'] as const)('reports an actual %s withdrawal as a high record finding', async choice => {
    await seedCitation();
    await withdrawCitation(choice);
    const { first, items } = await walkPages();
    expect(first.coverage?.citationGaps).toBe(1);
    expect(first.verdict).toBe('revise');
    expect(items).toContainEqual(expect.objectContaining({ kind: 'record-finding', severity: 'high', sourceCount: 1 }));
  });

  it.each(['source deleted', 'association removed'] as const)('does not silently resolve a citation after %s', async revoked => {
    await seedCitation();
    if (revoked === 'source deleted') await pg.query('UPDATE cre_evidence_sources SET deleted_at=now() WHERE id=101');
    else await pg.query('DELETE FROM authoring_citations WHERE reference_id=$1', ['101']);
    const first = await review();
    expect(first.coverage?.citationGaps).toBe(1);
    expect(first.verdict).toBe('revise');
  });

  it('refuses continuation of a formerly eligible source snapshot after data withdrawal', async () => {
    await seedCitation();
    const first = await review();
    expect(first.coverage?.citationGaps).toBe(0);
    await withdrawCitation();
    await denied({ offset: 1, expected_snapshot: first.snapshotSha256 });
    expect((await review()).coverage?.citationGaps).toBe(1);
  });

  it('retains an eligible historical source already registered to this section', async () => {
    await seedCitation();
    await pg.query('UPDATE cre_evidence_sources SET is_current=false WHERE id=101');
    const first = await review();
    expect(first.coverage?.citationGaps).toBe(0);
    expect(first.verdict).toBe('pass');
  });

  it('does not resolve a source that now belongs to another program', async () => {
    await seedCitation();
    await pg.query('UPDATE cre_evidence_sources SET client_program_id=$1 WHERE id=101', [OTHER_PROGRAM]);
    expect((await review()).coverage?.citationGaps).toBe(1);
  });

  it('reports a registered source without printable metadata as unresolved', async () => {
    await seedCitation();
    await pg.query('UPDATE cre_evidence_sources SET title=NULL,source_type=NULL WHERE id=101');
    const first = await review();
    expect(first.coverage?.citationGaps).toBe(1);
    expect(first.verdict).toBe('revise');
  });
});

describe('incomplete or oversized saved records cannot produce a document verdict', () => {
  it('refuses a saved document with no sections', async () => {
    await replaceSections(0);
    await denied();
  });

  it.each(['title', 'updated_at'] as const)('refuses malformed saved section %s rather than reviewing the remaining valid section', async column => {
    await pg.query(`UPDATE authoring_sections SET ${column}=NULL WHERE id=$1`, [sectionId(2)]);
    await denied();
  });

  it('refuses more than 512 saved sections before selecting their content', async () => {
    await replaceSections(513);
    await denied();
    expect(statements.some(sql => /SELECT id::text, code, title, content/.test(sql))).toBe(false);
  });

  it('uses the eight MiB byte limit, including non-ASCII content, before selecting the body', async () => {
    await replaceSections(1, 'é'.repeat(4 * 1024 * 1024 + 1));
    await denied();
    expect(statements.some(sql => /SELECT id::text, code, title, content/.test(sql))).toBe(false);
  });

  it('rejects mixing a saved document with caller-supplied replacement sections', async () => {
    await denied({ sections: [{ title: 'Fabricated subset', text: COHERENT }] });
    expect(connections).toHaveLength(0);
  });
});
