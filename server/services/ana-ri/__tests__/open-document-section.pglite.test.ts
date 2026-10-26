/** Actual saved references and current VIEW decisions through the existing resolver. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestSqlClient } from '../../../db/requestDb';
const h = vi.hoisted(() => ({ globalQuery: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.globalQuery }, getPool: () => ({ query: h.globalQuery }), db: {} }));
vi.mock('../../../db', () => ({ pool: { query: h.globalQuery }, getPool: () => ({ query: h.globalQuery }), db: {} }));
import { pg, PROGRAM, OTHER_PROGRAM, DOCUMENT, OTHER_DOCUMENT, sectionId } from '../../ana/__tests__/_saved-document-critique-fixture';
import { OPEN_DOCUMENT_UNREAD, renderOpenDocumentBlock, resolveOpenDocument } from '../open-document';

const PARENT = 'aaaaaaaa-1111-4111-8111-111111111111';
const CHILD = 'bbbbbbbb-2222-4222-8222-222222222222';
const GUIDE = 'Retained blank CRF field design: verify visit rules, codelists and specimen requirements.';
const CHILD_LIMIT = 'Keep completed patient CRFs as original records; this blank design does not replace them.';
const statements: string[] = [];
const source = (entryId: string, id: string, region = 'GLOBAL', registryId: string | null = null) => ({ id, entryId,
  version: 1, sha256: (id === PARENT ? 'a' : 'b').repeat(64), kind: 'narrative', aiDraftable: true,
  authoringMode: 'ai_draft', originalFormat: 'source-dependent', limitations: [id === PARENT ? 'PARENT-ONLY LIMIT' : CHILD_LIMIT],
  filingContext: { region, agency: region === 'US' ? 'FDA' : 'ICH', registryId } });
const parent = () => source('registry:US_IND', PARENT, 'US', 'US_IND');
const child = () => source('component:blank_crf', CHILD);
const q: RequestSqlClient = { query: async (sql, params) => { statements.push(sql); return pg.query(sql, params); } };
const access = () => ({ getClient: () => q, userId: 7,
  project: { programId: PROGRAM, projectId: 11, projectRef: PROGRAM } });

async function seed(section = 1, guide = GUIDE, options: { sourceReference?: string; mode?: string; receiptProgram?: string } = {}) {
  await pg.query('UPDATE authoring_documents SET template_id=$1,provenance=$2 WHERE id=$3',
    [PARENT, { templateSource: parent() }, DOCUMENT]);
  await pg.query('UPDATE authoring_sections SET code=$1,title=$2,content=$3 WHERE id=$4',
    ['mutable.renamed', 'Renamed heading must not choose its template', 'SECRET SAVED BODY', sectionId(section)]);
  await pg.query(`INSERT INTO authoring_audit_trail(doc_id,section_id,tenant_id,operation_type,actor_email,metadata)
    VALUES($1,$2,7,'CREATE','author@example.test',$3)`, [DOCUMENT, sectionId(section), {
    templateSource: child(), templateGuidance: { guidance_text: guide, regulatory_references: ['Retained sponsor specification'],
      compliance_checklist: [], common_pitfalls: [], source_reference: options.sourceReference ?? 'fixture/blank-crf',
      ...(options.mode ? { drafting_mode: options.mode } : {}) },
    assembly: { version: 1, docId: DOCUMENT, programId: options.receiptProgram ?? PROGRAM,
      templateId: CHILD, templateSnapshot: 'b'.repeat(64), fingerprint: 'c'.repeat(64) },
  }]);
}

async function opened(overrides: Record<string, unknown> = {}) {
  const params = { organizationId: 7, access: access(),
    authoringContext: { workflowStage: 'section-workspace', artifactId: DOCUMENT, sectionId: sectionId(1),
      documentType: 'US_IND', sectionCode: '1' }, ...overrides };
  const result = await resolveOpenDocument(params).catch(() => OPEN_DOCUMENT_UNREAD);
  return { result, block: renderOpenDocumentBlock(result) };
}

beforeEach(() => {
  statements.length = 0;
  h.globalQuery.mockReset().mockImplementation((sql, params) => pg.query(sql, params));
});

describe('exact retained section reference replaces parent-only conversation context', () => {
  it('uses the admitted child component and full retained guide, not parent or client classification', async () => {
    await seed();
    const { result, block } = await opened();
    expect(block).toContain(GUIDE);
    expect(block).toContain(CHILD_LIMIT);
    expect(block).toContain('component:blank_crf');
    expect(block).not.toContain('PARENT-ONLY LIMIT');
    expect(block).not.toContain('registry US_IND');
    expect(block).not.toContain('SECRET SAVED BODY');
    expect(result.document?.registryId ?? null).toBeNull();
    expect(h.globalQuery).not.toHaveBeenCalled();
    expect(statements.some(sql => /authoring_audit_trail/.test(sql))).toBe(true);
  });

  it('keeps an exact section-only VIEW grant readable even when frozen and manually prepared', async () => {
    await seed(1, GUIDE, { mode: 'manual' });
    await pg.query("UPDATE authoring_documents SET status='FROZEN' WHERE id=$1", [DOCUMENT]);
    await pg.query('UPDATE doc_permissions SET section_id=$1', [sectionId(1)]);
    const { block, result } = await opened({ authoringContext: { artifactId: DOCUMENT, sectionId: sectionId(1), artifactStatus: 'DRAFT' } });
    expect(block).toContain('"draftingMode":"manual"');
    expect(block).toContain('"documentStatus":"FROZEN"');
    expect(result.documentStatus).toBe('FROZEN');
    expect(h.globalQuery).not.toHaveBeenCalled();
  });

  it('retains historical CSR manual policy from its exact recorded E3 reference', async () => {
    await seed(1, 'Retained actual patient CRF appendix.', { sourceReference: 'server/services/ind/ctd/csr-e3-guidance.ts#16.3.1' });
    expect((await opened()).block).toContain('"draftingMode":"manual"');
  });
});

describe('saved selector context needs current exact access before references', () => {
  it.each(['no-access', 'revoked-document', 'revoked-project', 'wrong-project', 'wrong-artifact'])(
    'does not leak saved context for %s', async problem => {
      await seed();
      const overrides: Record<string, unknown> = {};
      if (problem === 'no-access') overrides.access = undefined;
      if (problem === 'revoked-document') await pg.query("UPDATE doc_permissions SET revoked_at=now() WHERE principal_id='7'");
      if (problem === 'revoked-project') await pg.query("UPDATE project_members SET status='revoked' WHERE user_id=7 AND project_id=11");
      if (problem === 'wrong-project') overrides.access = { ...access(), project: { programId: OTHER_PROGRAM, projectId: 12, projectRef: OTHER_PROGRAM } };
      if (problem === 'wrong-artifact') overrides.authoringContext = { artifactId: OTHER_DOCUMENT, sectionId: sectionId(1), documentType: 'US_IND' };
      statements.length = 0;
      const { block } = await opened(overrides);
      expect(block).toMatch(/could not|unavailable|not known/i);
      expect(block).not.toContain(GUIDE);
      expect(block).not.toContain('registry US_IND');
      expect(h.globalQuery).not.toHaveBeenCalled();
      expect(statements.some(sql => /authoring_audit_trail/.test(sql))).toBe(false);
      expect(statements.some(sql => /\b(template_id|template_source|provenance|metadata)\b/.test(sql))).toBe(false);
    },
  );

  it('does not fall back to parent classification for a foreign assembly receipt', async () => {
    await seed(1, GUIDE, { receiptProgram: OTHER_PROGRAM });
    const { block } = await opened();
    expect(block).toMatch(/could not|unavailable|not known/i);
    expect(block).not.toContain(GUIDE);
    expect(block).not.toContain('registry US_IND');
  });

  it('refuses oversized mandatory UTF8 guidance instead of clipping it or showing a parent outline', async () => {
    await seed(1, '🧪'.repeat(5000));
    const { block } = await opened();
    expect(block).toMatch(/could not|unavailable|not known/i);
    expect(block).not.toContain('🧪');
    expect(block).not.toContain('registry US_IND');
  });
});

describe('current identity, literal guidance and non-authoring surface compatibility', () => {
  it('keeps historical identity-only positive flags unverified without manufacturing a complete source', async () => {
    await pg.query('UPDATE authoring_documents SET template_id=$1,provenance=NULL WHERE id=$2', [PARENT, DOCUMENT]);
    await pg.query(`INSERT INTO authoring_audit_trail(doc_id,section_id,tenant_id,operation_type,actor_email,metadata)
      VALUES($1,$2,7,'CREATE','author@example.test',$3)`, [DOCUMENT, sectionId(1), {
      templateSource: { id: PARENT, aiDraftable: true }, templateGuidance: { guidance_text: GUIDE },
    }]);
    const { block } = await opened();
    const encoded = block.split('BEGIN_SAVED_SECTION_TEMPLATE_REFERENCE_JSON\n')[1].split('\nEND_SAVED_SECTION_TEMPLATE_REFERENCE_JSON')[0];
    const ref = JSON.parse(encoded);
    expect(ref.sourceVerification).toBe('identity-only');
    expect(ref.draftingMode).toBe('unverified');
    expect(ref.templateSource).toEqual({ id: PARENT, aiDraftable: true });
    expect(block).not.toContain('registry US_IND');
  });

  it('resolves current email-only section grants and refuses an obsolete email', async () => {
    await seed();
    await pg.query("UPDATE doc_permissions SET section_id=$1,principal_id='someone-else',email='REVIEWER@example.test'", [sectionId(1)]);
    expect((await opened()).block).toContain(GUIDE);
    await pg.query("UPDATE users SET email='changed@example.test' WHERE id=7");
    statements.length = 0;
    expect((await opened()).block).not.toContain(GUIDE);
    expect(statements.some(sql => /\b(template_id|template_source|provenance|metadata)\b/.test(sql))).toBe(false);
  });

  it('preserves all bounded Unicode guidance literally in the reference fence', async () => {
    const guide = 'Retain "original" \\ specimens 🧪 αβ\nCheck collection times. '.repeat(90);
    await seed(1, guide);
    const { block } = await opened();
    const encoded = block.split('BEGIN_SAVED_SECTION_TEMPLATE_REFERENCE_JSON\n')[1].split('\nEND_SAVED_SECTION_TEMPLATE_REFERENCE_JSON')[0];
    const ref = JSON.parse(encoded);
    expect(ref.references[0].fields.guidance_text).toBe(guide);
    expect(Buffer.byteLength(block, 'utf8')).toBeLessThanOrEqual(16 * 1024);
    expect(ref.sectionCode).toBe('mutable.renamed');
    expect(ref.receivingJurisdiction).toMatch(/unconfirmed/);
  });

  it('does not classify a whole saved UUID from a surface label when organization context is missing', async () => {
    await seed();
    const { block } = await opened({ organizationId: undefined,
      authoringContext: { artifactId: DOCUMENT, documentType: 'US_IND' } });
    expect(block).toMatch(/could not|unavailable|not known/i);
    expect(block).not.toContain('registry US_IND');
    expect(statements).toEqual([]);
    expect(h.globalQuery).not.toHaveBeenCalled();
  });

  it('retains surface-stated protocol classification for a numeric non-authoring identifier without DB reads', async () => {
    const { block } = await opened({ access: undefined,
      authoringContext: { artifactId: '41', documentType: 'ICH_PROTOCOL' } });
    expect(block).toContain('registry ICH_PROTOCOL');
    expect(block).toContain('stated by the surface');
    expect(statements).toEqual([]);
    expect(h.globalQuery).not.toHaveBeenCalled();
  });
});
