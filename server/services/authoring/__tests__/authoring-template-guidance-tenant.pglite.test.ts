/** Real SQL, canonical authoring DDL and the actual saved-guidance helper.
 * This proves scoped identity reads, not native PostgreSQL concurrency or RLS. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { AUTHOR, AUTHORING_ACCESS_DDL, ORG, OTHER_ORG, PREREQ, PROGRAM, TENANTLESS } from '../../../routes/__tests__/_authoring-canvas-fixture';
import { savedTemplateGuidance, TemplateGuidanceError } from '../authoring-template-guidance';
import { getBuiltinAuthoringTemplate } from '../builtin-authoring-templates';
import { computeChainHash, sha256Hex, verifyLedger, type LedgerRow } from '../revision-ledger';
import type { RequestSqlClient } from '../../../db/requestDb';
import type { AuthoringPrincipal } from '../authoring-permissions';

const DOC = 'aaaaaaaa-0000-4000-8000-000000000001';
const SECTION = 'bbbbbbbb-0000-4000-8000-000000000001';
const TEMPLATE = 'cccccccc-0000-4000-8000-000000000001';
const GUIDE = { guidance_text: 'Read the retained study source.', compliance_checklist: ['Verify the study identity.'] };
// Actual numeric10 source captured before the 2026-11-14 key repair. This is
// historical CREATE metadata, independent of the current source projection.
const OLD_510K_SOURCE = {
  id: '519dfd9a-dc91-57ea-a6b5-d45259d8b6c1', entryId: 'registry:US_510K', version: 1,
  sha256: '14f3dc252c4f830045b994b94a926329e9abe0d86b64179db948ac1108ef17b4',
  kind: 'preparation', aiDraftable: false, authoringMode: 'manual', originalFormat: 'eSTAR',
  limitations: [
    'Working scaffold, not an approval, verified evidence or a filing-readiness decision.',
    'Confirm the product, application, procedure, stage, region, language and current agency/client requirements before using this outline.',
    'Retain original forms, datasets, certificates, executed consents, signed records, technical messages and restricted master-file parts; this worksheet does not replace them.',
    'Drafting and review do not qualify CMC composition, safety-message creation, package validation, approval or transmission.',
    'The required flags describe the existing platform scaffold; they do not establish mandatory agency content.',
    'This is a project authoring scaffold, not the current regional filing schema or a completeness verdict. Confirm the applicable agency and client template before filing.',
    "Registry applicability metadata: medical_device, ivd. This does not establish this sponsor's product class or filing eligibility.",
  ],
  filingContext: { registryId: 'US_510K', region: 'US', agency: 'FDA' },
};
const OLD_510K_GUIDE = {
  guidance_text: 'Populate Performance Testing from sponsor source records. The existing scaffold supplies this heading, not a verified agency content specification.\n\nExisting scaffold expectation: marked required. This flag does not determine legal applicability or waive applicable content.',
  regulatory_references: ['Concept2Cure existing project blueprint us_510k_sections (platform convention — not a regulatory requirement)'],
  compliance_checklist: [], common_pitfalls: [], source_reference: 'project-blueprint:US_510K:us_510k_sections',
};
let db: JourneyDb;
const statements: Array<{ sql: string; params?: unknown[]; rows: Array<Record<string, unknown>> }> = [];
const q: RequestSqlClient = {
  query: async (sql, params) => {
    const result = await db.pglite.query<Record<string, unknown>>(sql, params);
    statements.push({ sql, params, rows: result.rows });
    return result;
  },
};
const member: AuthoringPrincipal = { id: AUTHOR.id, email: AUTHOR.email, roles: ['MEMBER'] };
const actorRead = () => statements.find(statement => /SELECT\s+(?:u\.)?email\s+FROM\s+users/i.test(statement.sql));

beforeAll(async () => {
  db = await createJourneyDb({ prereqSql: PREREQ + AUTHORING_ACCESS_DDL, migrations: [
    'db/migrations/20260725_authoring_document_loop_tables.sql',
    'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
    'db/migrations/20260725_authoring_audit_trail.sql',
    'db/migrations/20260730_authoring_comments_router_columns.sql',
    'db/migrations/20260727_authoring_object_permissions.sql',
    'migrations/20260727_authoring_document_program_scope.sql',
    'migrations/20260921_authoring_document_provenance.sql',
  ] });
  await db.pool.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [OTHER_ORG, Number(TENANTLESS.id), 'member']);
  await db.pool.query(`INSERT INTO authoring_documents(id,title,status,created_by,template_id,tenant_id,client_program_id)
    VALUES($1,'Saved template copy','draft',$2,$3,$4,$5)`, [DOC, AUTHOR.id, TEMPLATE, ORG, PROGRAM]);
  await db.pool.query(`INSERT INTO authoring_sections(id,doc_id,code,title,content,tenant_id)
    VALUES($1,$2,'2.5','Clinical overview','',$3)`, [SECTION, DOC, ORG]);
  await db.pool.query(`INSERT INTO authoring_audit_trail(doc_id,section_id,operation_type,actor_email,tenant_id,metadata)
    VALUES($1,$2,'CREATE',$3,$4,$5::jsonb)`, [DOC, SECTION, AUTHOR.email, ORG, JSON.stringify({
    templateSource: { id: TEMPLATE, kind: 'preparation', limitations: ['Keep the original study record.'] }, templateGuidance: GUIDE,
  })]);
}, 90_000);
beforeEach(() => { statements.length = 0; });
afterAll(async () => { await db?.close(); });

describe('saved template guidance binds actor identity to the captured tenant', () => {
  it('returns the exact saved reference for an active current member without writing', async () => {
    const guidance = await savedTemplateGuidance(q, ORG, SECTION, member);
    expect(guidance).toEqual([expect.objectContaining({ ...GUIDE, template_id: TEMPLATE,
      template_source: { id: TEMPLATE, kind: 'preparation', limitations: ['Keep the original study record.'] } })]);
    expect(actorRead()?.params).toEqual([AUTHOR.id, 'active', ORG]);
    expect(actorRead()?.rows).toEqual([{ email: AUTHOR.email }]);
    expect(statements.some(statement => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(statement.sql))).toBe(false);
  });

  it('keeps a retained numeric 510(k) body, version, provenance and CREATE guidance when the current builtin is resolved', async () => {
    const docId = 'aaaaaaaa-0000-4000-8000-000000000005';
    const sectionId = 'bbbbbbbb-0000-4000-8000-000000000005';
    const body = '<p>Retained sponsor bench report BR-017, revision3. Reviewer rationale and unresolved limits remain as recorded.</p>';
    const provenance = { source: 'template', governedWrite: 'unverified', templateSource: OLD_510K_SOURCE };
    await db.pool.query(`INSERT INTO authoring_documents
      (id,title,status,created_by,template_id,tenant_id,client_program_id,version,provenance)
      VALUES($1,'Retained numeric 510(k) working draft','draft',$2,$3,$4,$5,'0.4',$6::jsonb)`,
    [docId, AUTHOR.id, OLD_510K_SOURCE.id, ORG, PROGRAM, JSON.stringify(provenance)]);
    await db.pool.query(`INSERT INTO authoring_sections
      (id,doc_id,code,title,content,order_index,track_changes,tenant_id)
      VALUES($1,$2,'5','Performance Testing',$3,4,true,$4)`, [sectionId, docId, body, ORG]);
    const contentHash = sha256Hex(body);
    await db.pool.query(`INSERT INTO doc_revisions
      (id,section_id,content,created_by,tenant_id,content_sha256,prev_chain_sha256,chain_sha256,origin,inputs)
      VALUES($1,$2,$3,$4,$5,$6,NULL,$7,'genesis',$8::jsonb)`,
    ['dddddddd-0000-4000-8000-000000000005', sectionId, body, AUTHOR.id, ORG, contentHash,
      computeChainHash({ prevChain: null, contentSha256: contentHash, createdBy: AUTHOR.id, origin: 'genesis' }),
      JSON.stringify({ templateSource: OLD_510K_SOURCE })]);
    await db.pool.query(`INSERT INTO authoring_audit_trail
      (doc_id,section_id,operation_type,actor_email,tenant_id,after_content,content_hash_after,metadata)
      VALUES($1,$2,'CREATE',$3,$4,$5,$6,$7::jsonb)`,
    [docId, sectionId, AUTHOR.email, ORG, body, contentHash, JSON.stringify({
      templateSource: OLD_510K_SOURCE, templateGuidance: OLD_510K_GUIDE,
    })]);

    const snapshot = async () => ({
      documents: (await db.pool.query('SELECT * FROM authoring_documents ORDER BY id')).rows as Array<Record<string, unknown>>,
      sections: (await db.pool.query('SELECT * FROM authoring_sections ORDER BY id')).rows as Array<Record<string, unknown>>,
      revisions: (await db.pool.query('SELECT * FROM doc_revisions ORDER BY id')).rows,
      audit: (await db.pool.query('SELECT * FROM authoring_audit_trail ORDER BY id')).rows,
    });
    const before = await snapshot();
    const current = await getBuiltinAuthoringTemplate(OLD_510K_SOURCE.id);
    expect(current).toMatchObject({ id: OLD_510K_SOURCE.id, entryId: 'registry:US_510K' });
    const guidance = await savedTemplateGuidance(q, ORG, sectionId, member);

    expect(guidance).toEqual([expect.objectContaining({ ...OLD_510K_GUIDE,
      template_id: OLD_510K_SOURCE.id, template_source: OLD_510K_SOURCE })]);
    const after = await snapshot();
    expect(after).toEqual(before);
    expect(after.documents.find(row => row.id === docId)).toMatchObject({ version: '0.4', provenance });
    expect(after.sections.find(row => row.id === sectionId)).toMatchObject({
      code: '5', title: 'Performance Testing', content: body, order_index: 4, track_changes: true,
    });
    expect(verifyLedger(after.revisions as unknown as LedgerRow[])).toEqual({
      intact: true, chainedCount: 1, preLedgerCount: 0, breaks: [],
    });
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.every(statement => /^\s*SELECT\b/i.test(statement.sql))).toBe(true);
  });

  it('does not read another organization’s actor email before refusing guidance', async () => {
    await expect(savedTemplateGuidance(q, ORG, SECTION, {
      id: TENANTLESS.id, email: TENANTLESS.email, roles: ['ADMIN'],
    })).rejects.toMatchObject({ status: 403 });
    const read = actorRead();
    expect(read).toBeDefined();
    expect(read?.rows).toEqual([]);
    // Execute the same production query in the user’s own organization: the
    // identity exists, so the refusal is a tenant boundary, not a missing user.
    expect((await db.pglite.query(read!.sql, [TENANTLESS.id, 'active', OTHER_ORG])).rows).toEqual([{ email: TENANTLESS.email }]);
    expect(statements.some(statement => /FROM authoring_audit_trail\b/i.test(statement.sql))).toBe(false);
  });

  it('refuses an inactive member before returning saved guidance', async () => {
    await db.pool.query("UPDATE users SET status='disabled' WHERE id=$1", [Number(AUTHOR.id)]);
    try {
      await expect(savedTemplateGuidance(q, ORG, SECTION, member)).rejects.toBeInstanceOf(TemplateGuidanceError);
      expect(actorRead()?.rows).toEqual([]);
      expect(statements.some(statement => /FROM authoring_audit_trail\b/i.test(statement.sql))).toBe(false);
    } finally { await db.pool.query("UPDATE users SET status='active' WHERE id=$1", [Number(AUTHOR.id)]); }
  });
});
