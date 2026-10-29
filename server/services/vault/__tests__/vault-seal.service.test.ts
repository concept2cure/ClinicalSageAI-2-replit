/**
 * The seal's record and verdict (VR-19). The database half, with the real
 * ceremony and the append-only table, is tests/db/vault-data-room-seal.dbtest.ts;
 * here the verdicts a database fixture cannot reach without defeating the
 * record guard: a changed hash, a removed document, a tampered manifest.
 */
import { describe, expect, it } from 'vitest';
import { recordSeal, sealManifest, sealManifestSha256, verifySeal, VaultSealError, type SealManifest } from '../vault-seal.service';

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
