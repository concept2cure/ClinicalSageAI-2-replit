import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { importSourceDocument, parseSourceImportInput, type SourceImportDeps } from '../authoring-source-import';
import { parseProvenance } from '../authoring-from-draft';
import type { CreateContext } from '../authoring-documents';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const FOREIGN = '22222222-2222-4222-8222-222222222222';
const SOURCE = '33333333-3333-4333-8333-333333333333';
const DOC = '44444444-4444-4444-8444-444444444444';
const bytes = Buffer.from('The source states 12 patients. <script>alert(1)</script>');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const principal = { id: '7', email: 'author@example.test', roles: ['MEMBER'] };
const reason = 'Review the source in the project editor';
const body = { programId: PROGRAM, source: { kind: 'vault', documentId: SOURCE }, reason };

function fixture() {
  let removed = false;
  let changedAtSave = false;
  let existing: Record<string, unknown> | null = null;
  let role: string | null = 'member';
  let visibility = 'org_public';
  let anchors = [{ id: 42, clientWorkspaceId: null }];
  let accessUnavailable = false;
  let revokeAtSave = false;
  const record = { id: SOURCE, title: 'Drug substance study', file_name: 'source.pdf', mime_type: 'application/pdf',
    content_hash: sha256, document_type: 'any-custom-registry-type', ctd_section: '3.2.S.4',
    storage_version_id: 'version', storage_provider: 'local', s3_key: null, file_upload_id: null as string | null };
  const statements: string[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    statements.push(sql);
    if (/FROM regulatory_programs/i.test(sql)) return { rows: params[0] === PROGRAM && params[1] === 1 ? [{ id: PROGRAM }] : [] };
    if (/FROM organization_users ou/i.test(sql)) return { rows: role == null ? [] : [{ role }] };
    if (/FROM projects\s+WHERE/i.test(sql)) return { rows: anchors };
    if (/FROM projects p/i.test(sql)) {
      if (accessUnavailable) throw new Error('Injected project policy read failure');
      return { rows: [{ id: 42, owner_id: 99, created_by_id: 99, settings: {}, visibility, members: [], review_assigned: false }] };
    }
    if (/FROM vault.documents d/i.test(sql) || /FROM cre_evidence_sources s/i.test(sql)) {
      expect(sql).toContain('document_data_dispositions');
      expect(params[1]).toBe(PROGRAM);
      expect(params[2]).toBe(1);
      return { rows: removed ? [] : [{ ...record, ...(changedAtSave && statements.some(s => s.includes('pg_advisory_xact_lock')) ? { title: 'Changed source' } : {}) }] };
    }
    if (/FROM authoring_documents d/i.test(sql)) return { rows: existing ? [existing] : [] };
    if (/FROM doc_permissions p/i.test(sql)) return { rows: [{ role: 'AUTHOR' }] };
    if (/FROM authoring_sections/i.test(sql)) return { rows: [{ id: 'section', content: '<p>Existing edits retained.</p>' }] };
    return { rows: [] };
  });
  const pool = { query } as unknown as Pool;
  const ctx: CreateContext = { pool, tenantId: 1, actor: { id: principal.id, email: principal.email },
    audit: { pool, tenantId: 1, actorId: principal.id, actorEmail: principal.email, actorRole: 'MEMBER', ipAddress: '', userAgent: '' } };
  const create = vi.fn<SourceImportDeps['create']>(async (_ctx, input, options) => {
    if (revokeAtSave) visibility = 'private';
    await options?.verifiedImport?.reserve(pool);
    return { kind: 'created', document: { id: DOC, title: input.title }, sections: input.sections.map(section => ({ ...section })),
      provenance: { source: 'import', recordedAt: 'now', importSource: { ...options!.verifiedImport!.origin, reason, warnings: options!.verifiedImport!.warnings } }, binding: { documentId: null } };
  });
  const deps: SourceImportDeps = { readVaultBytes: vi.fn(async () => bytes), readUpload: vi.fn(async () => ({ buffer: bytes, fileName: 'source.pdf', mimeType: 'application/pdf' })),
    classify: vi.fn(() => 'pdf' as const), importDocx: vi.fn(), extractText: vi.fn(async () => ({ text: bytes.toString(), method: 'pdf-text' as const })), create };
  return { ctx, deps, record, statements, remove: () => { removed = true; }, change: () => { changedAtSave = true; },
    setRole: (value: string | null) => { role = value; }, private: () => { visibility = 'private'; },
    unanchored: () => { anchors = []; }, ambiguous: () => { anchors = [...anchors, { id: 43, clientWorkspaceId: null }]; },
    unavailable: () => { accessUnavailable = true; }, revoke: () => { revokeAtSave = true; },
    reuse: () => { existing = { id: DOC, title: 'Working copy with edits', status: 'draft', created_by: principal.id,
      provenance: { importSource: { kind: 'vault', id: SOURCE, programId: PROGRAM, sha256, warnings: ['Saved conversion warning'] } } }; } };
}

describe('source → one authoring working copy', () => {
  it('refuses private project access before source metadata, bytes, conversion or creation', async () => {
    const f = fixture(); f.private();
    expect(await importSourceDocument(f.ctx, principal, body, f.deps)).toMatchObject({ ok: false, status: 403, code: 'PROJECT_PERMISSION_DENIED' });
    expect(f.statements.some(sql => /FROM vault.documents|FROM cre_evidence_sources/.test(sql))).toBe(false);
    expect(f.deps.readVaultBytes).not.toHaveBeenCalled();
    expect(f.deps.extractText).not.toHaveBeenCalled();
    expect(f.deps.create).not.toHaveBeenCalled();
  });

  it.each(['viewer', null])('requires a current writable membership (%s)', async role => {
    const f = fixture(); f.setRole(role);
    expect(await importSourceDocument(f.ctx, principal, body, f.deps)).toMatchObject({ ok: false, status: 403, code: 'IMPORT_WRITE_PERMISSION_DENIED' });
    expect(f.deps.readVaultBytes).not.toHaveBeenCalled();
    expect(f.deps.create).not.toHaveBeenCalled();
  });

  it.each(['7tail', '0', '9007199254740992', '2147483648'])('refuses a noncanonical numeric actor %s before any lookup', async id => {
    const f = fixture(); f.ctx.actor.id = id;
    expect(await importSourceDocument(f.ctx, { ...principal, id }, body, f.deps)).toMatchObject({ ok: false, status: 403, code: 'IMPORT_ACTOR_REQUIRED' });
    expect(f.ctx.pool.query).not.toHaveBeenCalled();
    expect(f.deps.readVaultBytes).not.toHaveBeenCalled();
  });

  it('refuses mismatched principal and audit actor identities before any lookup', async () => {
    const f = fixture();
    expect(await importSourceDocument(f.ctx, { ...principal, id: '8' }, body, f.deps)).toMatchObject({ ok: false, status: 403, code: 'IMPORT_ACTOR_REQUIRED' });
    expect(f.ctx.pool.query).not.toHaveBeenCalled();
  });

  it.each(['unanchored', 'ambiguous'] as const)('requires one actual project relationship (%s)', async mode => {
    const f = fixture(); f[mode]();
    expect(await importSourceDocument(f.ctx, principal, body, f.deps)).toMatchObject({ ok: false, status: 409, code: 'PROJECT_ANCHOR_UNRESOLVED' });
    expect(f.deps.readVaultBytes).not.toHaveBeenCalled();
  });

  it('fails closed when current sharing cannot be read', async () => {
    const f = fixture(); f.unavailable();
    expect(await importSourceDocument(f.ctx, principal, body, f.deps)).toMatchObject({ ok: false, status: 503, code: 'PROJECT_ACCESS_UNAVAILABLE' });
    expect(f.deps.readVaultBytes).not.toHaveBeenCalled();
    expect(f.deps.create).not.toHaveBeenCalled();
  });

  it('rechecks sharing on the creation transaction after conversion', async () => {
    const f = fixture(); f.revoke();
    expect(await importSourceDocument(f.ctx, principal, body, f.deps)).toMatchObject({ ok: false, status: 403, code: 'PROJECT_PERMISSION_DENIED' });
    expect(f.deps.extractText).toHaveBeenCalledOnce();
    expect(f.statements.some(sql => /FROM authoring_documents d/.test(sql))).toBe(false);
  });

  it('refuses foreign projects before reading source bytes or writing', async () => {
    const f = fixture();
    const result = await importSourceDocument(f.ctx, principal, { ...body, programId: FOREIGN }, f.deps);
    expect(result).toMatchObject({ ok: false, status: 404, code: 'PROJECT_NOT_FOUND' });
    expect(f.deps.readVaultBytes).not.toHaveBeenCalled();
    expect(f.deps.create).not.toHaveBeenCalled();
  });

  it('refuses unavailable source identities before reading bytes', async () => {
    const f = fixture(); f.remove();
    expect(await importSourceDocument(f.ctx, principal, body, f.deps)).toMatchObject({ ok: false, status: 404, code: 'SOURCE_NOT_FOUND' });
    expect(f.deps.readVaultBytes).not.toHaveBeenCalled();
  });

  it('refuses altered original bytes and records no authoring document', async () => {
    const f = fixture(); f.deps.readVaultBytes = vi.fn(async () => Buffer.from('different bytes'));
    expect(await importSourceDocument(f.ctx, principal, body, f.deps)).toMatchObject({ ok: false, status: 409, code: 'SOURCE_HASH_MISMATCH' });
    expect(f.deps.create).not.toHaveBeenCalled();
  });

  it('escapes extracted text, keeps custom types and verified origin, and states conversion loss', async () => {
    const f = fixture();
    const result = await importSourceDocument(f.ctx, principal, { ...body, title: 'Forged title', origin: { sha256: 'forged' } }, f.deps);
    expect(result).toMatchObject({ ok: true, data: { doc: { id: DOC, title: 'Drug substance study' }, reused: false,
      origin: { kind: 'vault', id: SOURCE, sha256, documentType: 'any-custom-registry-type', conversion: 'extracted-text' } } });
    expect(f.deps.create).toHaveBeenCalledWith(f.ctx, expect.objectContaining({ module: 'M3', documentType: 'any-custom-registry-type',
      sections: [expect.objectContaining({ code: '3.2.S.4', content: expect.stringContaining('&lt;script&gt;') })] }), expect.objectContaining({ verifiedImport: expect.objectContaining({ reason }) }));
    if (result.ok) expect(result.data.warnings.join(' ')).toContain('table structure');
  });

  it('retains Word tables/headings and makes missing codes and embedded figures visible', async () => {
    const f = fixture(); f.deps.classify = vi.fn(() => 'docx' as const);
    f.deps.importDocx = vi.fn(async () => ({ sections: [{ code: '3.2.S.4.1', title: 'Specification', level: 1,
      html: '<table><tr><td>Assay</td><td>99.2%</td></tr></table>' }, { code: null, title: 'Chromatogram', level: 2,
      html: '<img src="data:image/emf;base64,a" alt="Recorded trace"><img src="data:image/png;base64,abc=" alt="Supported figure">' }], warnings: ['Unsupported style from Word'],
      counts: { sections: 2, tables: 1, images: 1, lists: 0 } }));
    const result = await importSourceDocument(f.ctx, principal, body, f.deps);
    expect(result.ok).toBe(true);
    const sent = vi.mocked(f.deps.create).mock.calls[0][1];
    expect(sent.sections[0].content).toContain('<table>');
    expect(sent.sections[1]).toMatchObject({ code: 'import.2', content: expect.stringContaining('Recorded trace') });
    expect(sent.sections[1].content).toContain('data:image/png;base64,abc=');
    if (result.ok) expect(result.data.warnings.join(' ')).toContain('not CTD filing locations');
    expect(f.deps.extractText).not.toHaveBeenCalled();
  });

  it('refuses a changed source inside the canonical transaction', async () => {
    const f = fixture(); f.change();
    expect(await importSourceDocument(f.ctx, principal, body, f.deps)).toMatchObject({ ok: false, status: 409, code: 'SOURCE_CHANGED' });
  });

  it('reopens the exact saved draft and keeps its edits and warnings', async () => {
    const f = fixture(); f.reuse();
    const result = await importSourceDocument(f.ctx, principal, body, f.deps);
    expect(result).toMatchObject({ ok: true, data: { reused: true, doc: { id: DOC, title: 'Working copy with edits' },
      sections: [{ content: '<p>Existing edits retained.</p>' }], warnings: ['Saved conversion warning'] } });
    expect(f.statements.some(sql => sql.includes('pg_advisory_xact_lock'))).toBe(true);
  });

  it('uses the captured upload with the same source hash rather than guessed Vault identities', async () => {
    const f = fixture(); f.record.id = '12'; f.record.file_upload_id = 'upload-12';
    const result = await importSourceDocument(f.ctx, principal, { ...body, source: { kind: 'data-room', sourceId: 12 } }, f.deps);
    expect(result).toMatchObject({ ok: true, data: { origin: { kind: 'data-room', id: '12', sha256 } } });
    expect(f.deps.readUpload).toHaveBeenCalledWith('upload-12', 1);
    expect(f.deps.readVaultBytes).not.toHaveBeenCalled();
  });

  it.each([['', 'REASON_REQUIRED'], ['short', 'REASON_REQUIRED']])('requires the stated change reason %j', (value, code) => {
    expect(parseSourceImportInput({ ...body, reason: value })).toMatchObject({ ok: false, status: 400, code });
  });

  it('drops caller supplied import-source provenance at the public draft door', () => {
    expect(parseProvenance({ source: 'import', importSource: { id: SOURCE, sha256 } })).toEqual({ ok: true, value: { source: 'import' } });
  });

  it('rejects source/program SQL-shaped inputs before any SQL or byte read', async () => {
    for (const invalid of [{ ...body, programId: `${PROGRAM}'; DROP TABLE authoring_documents;--` },
      { ...body, source: { kind: 'vault', documentId: `${SOURCE}'; SELECT set_config('app.current_org_id','2',false);--` } },
      { ...body, source: { kind: 'data-room', sourceId: '12; DROP TABLE cre_evidence_sources' } }]) {
      const f = fixture();
      expect(await importSourceDocument(f.ctx, principal, invalid, f.deps)).toMatchObject({ ok: false, status: 400 });
      expect(f.ctx.pool.query).not.toHaveBeenCalled();
      expect(f.deps.readVaultBytes).not.toHaveBeenCalled();
    }
  });
});
