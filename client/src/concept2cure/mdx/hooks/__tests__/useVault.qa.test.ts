// Uses describe/it/expect globals (Jest and Vitest both provide them — this file
// is globbed by the client Jest project AND Vitest, so it must not import 'vitest').
import {
  selectVaultFiles,
  selectVaultVersions,
  deriveVaultFolders,
  deriveVaultKpis,
  type VaultApiArtifact,
} from '../useVault';

const row = (over: Partial<VaultApiArtifact> = {}): VaultApiArtifact => ({
  id: 7,
  artifactId: 'artifact_abc',
  title: 'Pull-out force report',
  type: 'PDF',
  category: 'report',
  family: 'Module 4',
  ctdSection: '4.2.1',
  status: 'approved',
  version: 3,
  contentHash: 'a91e4f02',
  createdById: 12,
  createdAt: '2026-06-01T10:00:00Z',
  updatedAt: '2026-06-30T10:00:00Z',
  lockedAt: null,
  eSig: true,
  ...over,
});

describe('selectVaultFiles (envelope null-safety + row mapping)', () => {
  it('returns null for undefined payload', () => {
    expect(selectVaultFiles(undefined)).toBeNull();
  });

  it('does not throw and returns null when data is null', () => {
    expect(() => selectVaultFiles({ data: null })).not.toThrow();
    expect(selectVaultFiles({ data: null })).toBeNull();
  });

  it('returns null for an empty envelope object', () => {
    expect(selectVaultFiles({} as never)).toBeNull();
  });

  it('maps an artifact row into the VaultFile view shape', () => {
    const files = selectVaultFiles({ data: [row()] })!;
    expect(files).toHaveLength(1);
    const f = files[0];
    expect(f.id).toBe('artifact_abc');
    expect(f.name).toBe('Pull-out force report');
    expect(f.kind).toBe('report');
    expect(f.type).toBe('pdf');
    expect(f.prog).toBe('CTD 4.2.1');
    expect(f.folder).toBe('module-4');
    expect(f.ver).toBe('v3');
    expect(f.status).toBe('final'); // approved → final
    expect(f.esig).toBe(true);
    expect(f.hash).toBe('a91e4f02');
  });

  it('maps status: lockedAt wins, review passes through, unknown → draft', () => {
    const files = selectVaultFiles({
      data: [
        row({ status: 'approved', lockedAt: '2026-06-30T10:00:00Z' }),
        row({ status: 'review' }),
        row({ status: 'something-new' }),
      ],
    })!;
    expect(files.map(f => f.status)).toEqual(['locked', 'review', 'draft']);
  });

  it('falls back to family and system author when fields are null', () => {
    const f = selectVaultFiles({
      data: [row({ ctdSection: null, createdById: null, contentHash: null })],
    })![0];
    expect(f.prog).toBe('Module 4');
    expect(f.author).toBe('system');
    expect(f.hash).toBe('—');
  });
});

describe('deriveVaultFolders / deriveVaultKpis', () => {
  const files = selectVaultFiles({
    data: [
      row({ id: 1, artifactId: 'a1', family: 'Module 4' }),
      row({ id: 2, artifactId: 'a2', family: 'Module 4', status: 'review' }),
      row({ id: 3, artifactId: 'a3', family: 'Working files', status: 'draft', eSig: false }),
    ],
  })!;

  it('builds a root folder plus one folder per family bucket, sentence case', () => {
    const folders = deriveVaultFolders(files);
    expect(folders[0]).toMatchObject({ id: 'root', count: 3, parent: null });
    expect(folders).toContainEqual(
      expect.objectContaining({ id: 'module-4', label: 'Module 4', count: 2, parent: 'root' }),
    );
    expect(folders).toContainEqual(
      expect.objectContaining({ id: 'working-files', label: 'Working files', count: 1 }),
    );
  });

  it('derives honest KPI counts from the mapped rows', () => {
    const kpis = deriveVaultKpis(files);
    expect(kpis[0]).toMatchObject({ metric: '3' });      // total
    expect(kpis[1]).toMatchObject({ metric: '1' });      // locked + final
    expect(kpis[2]).toMatchObject({ metric: '1' });      // in review
    expect(kpis[3]).toMatchObject({ metric: '1' });      // drafts
  });
});

describe('selectVaultVersions', () => {
  it('returns null on missing data', () => {
    expect(selectVaultVersions(undefined)).toBeNull();
    expect(selectVaultVersions({ data: null })).toBeNull();
  });

  it('maps version rows newest-first: first is final, rest superseded', () => {
    const versions = selectVaultVersions({
      data: [
        { id: 2, version_number: 2, change_summary: 'Reviewer fixes', content_hash: 'beef', created_at: '2026-06-30T10:00:00Z', created_by_id: 12 },
        { id: 1, version_number: 1, change_summary: null, content_hash: 'cafe1234', created_at: '2026-06-01T10:00:00Z', created_by_id: null },
      ],
    })!;
    expect(versions[0]).toMatchObject({ v: 'v2', note: 'Reviewer fixes', status: 'final', author: 'User #12' });
    expect(versions[1]).toMatchObject({ v: 'v1', status: 'superseded', author: 'system' });
    expect(versions[1].note).toContain('cafe1234');
  });
});
