/**
 * The seal's record and verdict (VR-19). The database half, with the real
 * ceremony and the append-only table, is tests/db/vault-data-room-seal.dbtest.ts;
 * here the verdicts a database fixture cannot reach without defeating the
 * record guard: a changed hash, a removed document, a tampered manifest.
 */
import { describe, expect, it } from 'vitest';
import {
  listSeals, recordSeal, sealManifest, sealManifestSha256, SEAL_MANIFEST_SCHEMA, verifySeal, VaultSealError, type SealManifest,
} from '../vault-seal.service';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const SEAL = '22222222-2222-4222-8222-222222222222';
const hash = (c: string) => c.repeat(64);
const row = (id: string, h: string, extra: Record<string, unknown> = {}) => ({
  id, document_code: `CODE-${id}`, document_title: `Title ${id}`, version: '1.0', content_hash: h, folder_id: 'module-3',
  ctd_section: null, placement_status: 'confirmed', lifecycle_stage: null, ...extra,
});

function manifestOf(ids: string[]): SealManifest {
  return sealManifest(PROGRAM, ids.map((id, i) => row(id, hash(String(i)))), () => null);
}

/** A client answering the seal read and the current-documents read. */
function client(stored: SealManifest, storedHash: string, current: Array<Record<string, unknown>>) {
  return {
    async query(sql: string) {
      if (/FROM public\.vault_data_room_seals/.test(sql)) {
        return { rows: [{ id: SEAL, program_id: PROGRAM, reason: 'Close', manifest: stored, manifest_sha256: storedHash,
          document_count: stored.documents.length, sealed_by: 7, sealed_at: '2026-10-29T10:00:00Z', sealed_by_name: 'Sol' }] };
      }
      if (/FROM vault\.documents/.test(sql)) return { rows: current };
      return { rows: [] };
    },
  };
}

describe('the seal manifest', () => {
  it('is the same record, and the same hash, whatever order the rows are read in', () => {
    const a = sealManifest(PROGRAM, [row('b', hash('1')), row('a', hash('2'))], () => null);
    const b = sealManifest(PROGRAM, [row('a', hash('2')), row('b', hash('1'))], () => null);
    expect(a).toEqual(b);
    expect(sealManifestSha256(a)).toBe(sealManifestSha256(b));
    expect(a.documents.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('records the hash in lower case and the index number the tree gives', () => {
    const m = sealManifest(PROGRAM, [row('a', hash('A'))], (id) => (id === 'a' ? '3.2.P.8' : null));
    expect(m.documents[0]).toMatchObject({ contentHash: hash('a'), indexNumber: '3.2.P.8' });
  });

  it('a seal needs a reason, and nothing is written without one', async () => {
    const writes: string[] = [];
    const q = { async query(sql: string) { writes.push(sql); return { rows: [] }; } };
    await expect(recordSeal(q, { id: SEAL, organizationId: 7, programId: PROGRAM, userId: 7, reason: '   ', manifest: manifestOf(['a']) }))
      .rejects.toBeInstanceOf(VaultSealError);
    expect(writes).toEqual([]);
  });
});

describe('the verdict', () => {
  const sealed = manifestOf(['a', 'b']);
  const sealedHash = sealManifestSha256(sealed);
  const now = sealed.documents.map((d) => ({ id: d.id, content_hash: d.contentHash }));

  it('intact when every sealed document is recorded with its sealed hash', async () => {
    const { verification } = await verifySeal(client(sealed, sealedHash, now), { organizationId: 7, programId: PROGRAM, sealId: SEAL });
    expect(verification).toMatchObject({ verdict: 'intact', changed: [], unreadable: [], manifestIntact: true });
  });

  it('changed, naming the document, when its recorded hash differs', async () => {
    const drifted = [now[0], { ...now[1], content_hash: hash('f') }];
    const { verification } = await verifySeal(client(sealed, sealedHash, drifted), { organizationId: 7, programId: PROGRAM, sealId: SEAL });
    expect(verification.verdict).toBe('changed');
    expect(verification.changed).toEqual([{ id: 'b', title: 'Title b', why: 'content_changed' }]);
  });

  it('changed when a sealed document is no longer recorded', async () => {
    const { verification } = await verifySeal(client(sealed, sealedHash, [now[0]]), { organizationId: 7, programId: PROGRAM, sealId: SEAL });
    expect(verification).toMatchObject({ verdict: 'changed', changed: [{ id: 'b', why: 'removed' }] });
  });

  it('could not verify, never intact, when the stored manifest no longer hashes to its record', async () => {
    const tampered = { ...sealed, documents: [sealed.documents[0]] };
    const { verification } = await verifySeal(client(tampered, sealedHash, now), { organizationId: 7, programId: PROGRAM, sealId: SEAL });
    expect(verification).toMatchObject({ verdict: 'could_not_verify', manifestIntact: false });
  });

  it('could not verify when a stored file cannot be read, whatever else matches', async () => {
    const { verification } = await verifySeal(client(sealed, sealedHash, now), {
      organizationId: 7, programId: PROGRAM, sealId: SEAL,
      checkBytes: async (doc) => (doc.id === 'a' ? 'The stored file could not be read.' : null),
    });
    expect(verification).toMatchObject({ verdict: 'could_not_verify', bytesChecked: true,
      unreadable: [{ id: 'a', why: 'The stored file could not be read.' }] });
  });

  it('a seal of another project is not found', async () => {
    const empty = { async query() { return { rows: [] }; } };
    await expect(verifySeal(empty, { organizationId: 7, programId: PROGRAM, sealId: SEAL })).rejects.toMatchObject({ code: 'SEAL_NOT_FOUND' });
  });
});

describe('the seal list: what each seal holds (S6, binders as a view)', () => {
  const sealRow = (id: string, manifest: unknown, manifestSha256: string, documentCount: number) => ({
    id, program_id: PROGRAM, reason: 'Close', manifest, manifest_sha256: manifestSha256, document_count: documentCount,
    sealed_by: 7, sealed_at: '2026-10-29T10:00:00Z', sealed_by_name: 'Sol',
  });
  /** A client answering the seals read and the version chain's read (`now`), keeping every statement it was sent. */
  function lister(rows: Array<Record<string, unknown>>, now: Array<Record<string, unknown>> = []) {
    const sent: Array<{ sql: string; params: unknown[] }> = [];
    return {
      sent,
      async query(sql: string, params: unknown[] = []) {
        sent.push({ sql, params });
        return /FROM public\.vault_data_room_seals/.test(sql) ? { rows } : { rows: now };
      },
    };
  }

  const A = '0a000000-0000-4000-8000-00000000000a';
  const B = '0b000000-0000-4000-8000-00000000000b';
  const C = '0c000000-0000-4000-8000-00000000000c';

  it("lists each seal's documents from its stored manifest: what was sealed is never read again", async () => {
    const sealed = sealManifest(PROGRAM, [
      row(A, hash('A'), { version: '2.0', lifecycle_stage: 'approved' }),
      row(B, hash('b'), { document_title: null, file_name: 'b.pdf', content_hash: null }),
    ], (id) => (id === A ? '3.2.P.8' : null));
    // The live rows have other titles, versions and hashes now; the list shows the seal's record of them.
    const q = lister([sealRow(SEAL, sealed, sealManifestSha256(sealed), 2)], [
      { id: A, document_title: 'Renamed since', version: '9.9', content_hash: 'f'.repeat(64), superseded: false, by_version: null, superseded_at: null },
      { id: B, document_title: 'Renamed since', version: '9.9', content_hash: 'f'.repeat(64), superseded: false, by_version: null, superseded_at: null },
    ]);
    const [listed] = await listSeals(q, 7, PROGRAM);
    expect(listed).toMatchObject({ id: SEAL, documentCount: 2, manifestSha256: sealManifestSha256(sealed), sealedByName: 'Sol' });
    expect(listed.documents).toEqual([
      { id: A, title: `Title ${A}`, version: '2.0', indexNumber: '3.2.P.8', shortHash: 'aaaaaaaaaaaa', lifecycleStage: 'approved', standing: { state: 'current' } },
      { id: B, title: 'b.pdf', version: '1.0', indexNumber: null, shortHash: null, lifecycleStage: null, standing: { state: 'current' } },
    ]);
  });

  /* P-107 item 3 (2026-11-08): "A seal says when its version has been superseded ('superseded by version n on
     date'), read from the version chain. What was sealed, and whether it is intact, is unchanged." */
  it('says which sealed versions have since been superseded, by which version and when, from the version chain as it is now', async () => {
    const sealed = sealManifest(PROGRAM, [row(A, hash('a')), row(B, hash('b')), row(C, hash('c'))], () => null);
    const q = lister([sealRow(SEAL, sealed, sealManifestSha256(sealed), 3)], [
      { id: A, superseded: true, by_version: '2.0', superseded_at: new Date('2026-11-03T09:30:00Z') },
      { id: B, superseded: false, by_version: null, superseded_at: null },
      // C is not a live version of this project now: nothing is said of it.
    ]);
    const [listed] = await listSeals(q, 7, PROGRAM);
    expect(listed.documents?.map((d) => [d.id, d.standing])).toEqual([
      [A, { state: 'superseded', byVersion: '2.0', at: '2026-11-03T09:30:00.000Z' }],
      [B, { state: 'current' }],
      [C, { state: 'unknown' }],
    ]);
    // What was sealed is unchanged: the same record, the same hash, the same versions.
    expect(listed.manifestSha256).toBe(sealManifestSha256(sealed));
    expect(listed.documents?.map((d) => d.version)).toEqual(['1.0', '1.0', '1.0']);
    // One read of the chain, for this organisation's project and the sealed versions only.
    const chain = q.sent.filter((s) => /vault\.documents/.test(s.sql));
    expect(chain).toHaveLength(1);
    expect(chain[0].params).toEqual([7, PROGRAM, [A, B, C]]);
    expect(chain[0].sql).toMatch(/succ\.supersedes_id = d\.id/);
  });

  it('a successor whose version or date is not recorded is still said to have superseded it', async () => {
    const sealed = sealManifest(PROGRAM, [row(A, hash('a'))], () => null);
    const [listed] = await listSeals(lister([sealRow(SEAL, sealed, sealManifestSha256(sealed), 1)],
      [{ id: A, superseded: true, by_version: null, superseded_at: null }]), 7, PROGRAM);
    expect(listed.documents?.[0].standing).toEqual({ state: 'superseded', byVersion: null, at: null });
  });

  it('reads no version chain for seals that hold nothing readable, and an id that is not a document id is not asked about', async () => {
    const empty = sealManifest(PROGRAM, [], () => null);
    const odd = sealManifest(PROGRAM, [row('not-a-uuid', hash('a'))], () => null);
    const q = lister([sealRow(SEAL, empty, sealManifestSha256(empty), 0), sealRow('s-odd', odd, sealManifestSha256(odd), 1)]);
    const listed = await listSeals(q, 7, PROGRAM);
    expect(listed[1].documents?.[0].standing).toEqual({ state: 'unknown' });
    expect(q.sent.filter((s) => /vault\.documents/.test(s.sql))).toHaveLength(0);
  });

  it('lists a seal of a Vault with no current documents as holding none', async () => {
    const empty = sealManifest(PROGRAM, [], () => null);
    const [listed] = await listSeals(lister([sealRow(SEAL, empty, sealManifestSha256(empty), 0)]), 7, PROGRAM);
    expect(listed.documents).toEqual([]);
  });

  it('says a manifest it cannot read, or one that no longer hashes to its record, was not read, and never that it holds nothing', async () => {
    const good = manifestOf(['a']);
    // Hashes to its record, but is a recipe this reader does not know.
    const otherSchema = { ...good, schema: 'vault-data-room-seal/0' } as unknown as SealManifest;
    const listed = await listSeals(lister([
      sealRow('s-missing', null, 'f'.repeat(64), 1),
      sealRow('s-schema', otherSchema, sealManifestSha256(otherSchema), 1),
      sealRow('s-shape', { schema: SEAL_MANIFEST_SCHEMA, programId: PROGRAM, documents: 'a' }, 'f'.repeat(64), 1),
      sealRow('s-entry', { schema: SEAL_MANIFEST_SCHEMA, programId: PROGRAM, documents: [{ title: 'No id' }] }, 'f'.repeat(64), 1),
      sealRow('s-altered', { ...good, documents: [] }, sealManifestSha256(good), 1),
      sealRow('s-good', good, sealManifestSha256(good), 1),
    ]), 7, PROGRAM);
    expect(listed.map((s) => [s.id, s.documents])).toEqual([
      ['s-missing', null], ['s-schema', null], ['s-shape', null], ['s-entry', null], ['s-altered', null],
      ['s-good', [expect.objectContaining({ id: 'a', title: 'Title a', shortHash: '000000000000' })]],
    ]);
  });
});
