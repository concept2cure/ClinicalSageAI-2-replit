import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ access: vi.fn(), q: { query: vi.fn() } }));
vi.mock('../../ana/source-context-admission.js', () => ({ assertAnaUploadAccess: h.access }));
import { AnaProjectScopeError } from '../../ana/project-scope-admission.js';
import { listChatUploadsInReadScope } from '../document-catalog-actor-captures.js';
const program = '10000000-0000-4000-8000-000000000001';
const scope = () => ({ organizationId: 42, userId: 7, role: 'viewer', projectId: null, programId: null, accessibleProgramIds: [program], actorFiltered: true as const });
const bound = (id = 11, fileId = 'file_1') => ({ id, organization_id: 42, client_program_id: program, client_workspace_id: 101,
  created_by: 8, source_origin: 'chat_upload', file_id: fileId, upload_organization_id: 42, upload_user_id: 8,
  source_project_id: 101, resolved_program_id: program, program_organization_id: 42, program_deleted_at: null, anchor_count: 1,
  title: 'Source title', metadata: { originalName: 'allowed-study.pdf' }, version: null, extraction_status: 'pending', created_at: '2026-10-14T00:00:00Z',
  checksum: 'a'.repeat(64), upload_checksum: 'a'.repeat(64), is_current: true, disposition: null, original_file_available: true, scope_total: 5 });
const unbound = () => ({ ...bound(), client_program_id: null, client_workspace_id: null, created_by: 7, upload_user_id: 7,
  source_project_id: null, resolved_program_id: null, program_organization_id: null, program_deleted_at: null, anchor_count: 0 });
beforeEach(() => { h.q.query.mockReset(); h.access.mockReset(); h.access.mockResolvedValue(undefined); });
function rows(candidates: any[], page: any[]) { h.q.query.mockResolvedValueOnce({ rows: candidates }).mockResolvedValueOnce({ rows: page }); }
describe('actor-scoped chat capture discovery', () => {
  it('checks metadata-free candidate identities before SQL count and LIMIT', async () => {
    rows([bound()], [bound()]);
    expect(await listChatUploadsInReadScope(h.q, scope(), { limit: 1 })).toMatchObject({ actorFiltered: true, total: 5, withheld: 4, hasMore: true, uploads: [{ fileName: 'allowed-study.pdf' }] });
    const [identitySql] = h.q.query.mock.calls[0];
    const [pageSql, params] = h.q.query.mock.calls[1];
    expect(identitySql).not.toContain('s.title');
    expect(identitySql).not.toContain('s.metadata');
    expect(identitySql).not.toContain('LIMIT');
    expect(pageSql).toContain('f.id=ANY($5::text[])');
    expect(pageSql).toContain('source_project.regulatory_program_id=ANY($2::uuid[])');
    expect(pageSql).toContain('COUNT(*) OVER ()');
    expect(params).toEqual([42, [program], 7, true, ['file_1'], 1]);
    expect(h.access).toHaveBeenCalledTimes(2);
  });
  it('additional private upload parents cannot displace the authorized page or counts', async () => {
    rows([bound(11, 'private_extra_parent'), bound(12, 'authorized')], [{ ...bound(12, 'authorized'), scope_total: 1 }]);
    h.access.mockImplementation(async (_q, input) => {
      if (input.fileIds[0] === 'private_extra_parent') throw new AnaProjectScopeError(403, 'ANA_SOURCE_ACCESS_DENIED', 'Denied');
    });
    const page = await listChatUploadsInReadScope(h.q, scope(), { limit: 1 });
    expect(page).toMatchObject({ total: 1, withheld: 0, hasMore: false });
    expect(h.q.query.mock.calls[1][1][4]).toEqual(['authorized']);
  });
  it('creator-owned unbound chat capture is available only without an open project', async () => {
    rows([unbound()], [{ ...unbound(), scope_total: 1 }]);
    expect(await listChatUploadsInReadScope(h.q, scope(), { limit: 1 })).toMatchObject({ total: 1, uploads: [{ programId: null }] });
    h.q.query.mockReset(); rows([unbound()], [unbound()]);
    await expect(listChatUploadsInReadScope(h.q, { ...scope(), projectId: 101, programId: program })).rejects.toMatchObject({ code: 'ANA_UPLOAD_IDENTITY_UNAVAILABLE' });
  });
  it.each(['foreign_creator', 'foreign_capture_creator', 'not_chat', 'workspace_mismatch', 'duplicate_anchor', 'foreign_org', 'dead_parent'])('refuses invalid capture identity before exposing headers: %s', async kind => {
    const row: any = kind.startsWith('foreign_') || kind === 'not_chat' ? unbound() : bound();
    if (kind === 'foreign_creator') row.upload_user_id = 8;
    if (kind === 'foreign_capture_creator') row.created_by = 8;
    if (kind === 'not_chat') row.source_origin = 'authoring_image_upload';
    if (kind === 'workspace_mismatch') row.client_workspace_id = 202;
    if (kind === 'duplicate_anchor') row.anchor_count = 2;
    if (kind === 'foreign_org') row.organization_id = 99;
    if (kind === 'dead_parent') row.program_deleted_at = '2026-10-14';
    rows([row], [row]);
    await expect(listChatUploadsInReadScope(h.q, scope())).rejects.toMatchObject({ code: 'ANA_UPLOAD_IDENTITY_UNAVAILABLE' });
    expect(h.q.query).toHaveBeenCalledTimes(1);
  });
  it.each(['invalid_hash', 'changed_upload_hash', 'no_longer_current', 'withdrawn'])('rejects page/source drift before return: %s', async kind => {
    const row: any = bound();
    if (kind === 'invalid_hash') row.checksum = 'unknown';
    if (kind === 'changed_upload_hash') row.upload_checksum = 'b'.repeat(64);
    if (kind === 'no_longer_current') row.is_current = false;
    if (kind === 'withdrawn') row.disposition = 'remove_data';
    rows([bound()], [row]);
    await expect(listChatUploadsInReadScope(h.q, scope())).rejects.toMatchObject({ code: 'ANA_UPLOAD_IDENTITY_UNAVAILABLE' });
  });
  it('unknown access/SQL state is unavailable instead of an empty authorized list', async () => {
    rows([bound()], []); h.access.mockRejectedValue(new AnaProjectScopeError(503, 'ANA_SOURCE_ACCESS_UNAVAILABLE', 'Unavailable'));
    await expect(listChatUploadsInReadScope(h.q, scope())).rejects.toMatchObject({ code: 'ANA_SOURCE_ACCESS_UNAVAILABLE' });
    expect(h.q.query).toHaveBeenCalledTimes(1);
  });
  it('final upload parent revocation refuses already loaded headers', async () => {
    rows([bound()], [bound()]); h.access.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new AnaProjectScopeError(403, 'ANA_SOURCE_ACCESS_DENIED', 'Revoked'));
    await expect(listChatUploadsInReadScope(h.q, scope())).rejects.toMatchObject({ code: 'ANA_SOURCE_ACCESS_DENIED' });
  });
  it('revocation of an upload outside the returned page cannot leave a stale authorized count', async () => {
    rows([bound(11, 'on_page'), bound(12, 'outside_page')], [{ ...bound(11, 'on_page'), scope_total: 2 }]);
    let outsideChecks = 0;
    h.access.mockImplementation(async (_q, input) => {
      if (input.fileIds[0] === 'outside_page' && ++outsideChecks === 2) throw new AnaProjectScopeError(403, 'ANA_SOURCE_ACCESS_DENIED', 'Revoked');
    });
    await expect(listChatUploadsInReadScope(h.q, scope(), { limit: 1 })).rejects.toMatchObject({ code: 'ANA_SOURCE_ACCESS_DENIED' });
  });
  it('unknown extraction ledger remains unknown in an authorized result', async () => {
    rows([bound()], [{ ...bound(), extraction_status: null, scope_total: 1 }]);
    expect((await listChatUploadsInReadScope(h.q, scope())).uploads[0].extractionStatus).toBe('unknown');
  });
  it('keep_data discloses original unavailable and preserves eligible retained text discovery', async () => {
    rows([bound()], [{ ...bound(), disposition: 'keep_data', original_file_available: false, scope_total: 1 }]);
    expect((await listChatUploadsInReadScope(h.q, scope())).uploads[0]).toMatchObject({ originalFileAvailable: false, sourceAccessNotice: expect.stringContaining('original file unavailable') });
  });
  it('true authorized emptiness remains zero and does not scan a private top-N sample', async () => {
    rows([], []);
    expect(await listChatUploadsInReadScope(h.q, scope())).toMatchObject({ total: 0, withheld: 0, hasMore: false, uploads: [] });
    expect(h.q.query.mock.calls[1][1][4]).toEqual([]);
  });
});
