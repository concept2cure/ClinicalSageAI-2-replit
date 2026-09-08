/**
 * A governed export record must identify the ARTIFACT, not its filename.
 *
 * ── The defect this exists for ───────────────────────────────────────────────
 * `registerExportGovernanceQuick` took `exportHash?: string` and, when a caller
 * omitted it, computed
 *
 *     sha256(`${title}:${filename}:${size}`)
 *
 * and stored that in the field the Part 11 export record keeps in order to say
 * which file was exported. It is a well-formed sha256 that proves nothing: two
 * different packages of the same byte-length under the same name produce it
 * identically, and the delivered bytes are never covered at all.
 *
 * Three of the four call sites were on that fallback, including the eCTD
 * package route — the artifact that goes to the agency. The DOCX route had been
 * fixed to pass a digest, but as `sha256Header ?? undefined`, so a shadow
 * service that returned no header dropped straight back onto the fallback.
 *
 * The fallback is gone and `exportHash` is required. The type stops a caller
 * omitting it; this stops the fallback being reintroduced, which is the failure
 * the type cannot see — a future edit that "helpfully" restores a default would
 * compile.
 *
 * @compliance 21 CFR Part 11 §11.10(e)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* `registerGovernedExport` is called from inside this same module, so mocking
   the module's own export does not intercept it. Mock the pool it reaches for
   instead, and read the recorded hash off the INSERT it issues — which is the
   value that actually lands in the Part 11 record, and therefore the thing
   worth asserting. */
const { query } = vi.hoisted(() => ({
  query: vi.fn(async () => ({ rows: [{ id: 1 }], rowCount: 1 })),
}));
vi.mock('../../../db', () => ({
  getPool: () => ({ connect: async () => ({ query, release: () => {} }) }),
}));
vi.mock('../../generation-guard.js', () => ({
  emitTraceEvent: vi.fn(async () => {}),
  createTraceId: () => 'trace-1',
}));

import { registerExportGovernanceQuick } from '../exportGovernance';

/** Every parameter value the mocked pool saw, flattened. */
const paramsSeen = () => query.mock.calls.flatMap((c) => (c as unknown[])[1] as unknown[] ?? []);

/** A caller's arguments minus the hash, so each case varies only that. */
const base = {
  organizationId: 7,
  projectId: 42,
  userId: 3,
  userName: 'Avery Author',
  title: 'eCTD Package: seq-0001.zip',
  exportFormat: 'zip' as const,
  exportFilename: 'seq-0001.zip',
  exportFileSize: 1024,
  docType: 'ectd_package',
  backendRoute: '/api/ectd/export/1',
};

const REAL = 'a'.repeat(64);

beforeEach(() => vi.clearAllMocks());

describe('registerExportGovernanceQuick — the integrity hash', () => {
  it('refuses an export with no digest rather than synthesizing one', async () => {
    await expect(
      // @ts-expect-error — omitting it is now a type error too; this proves the
      // runtime refuses as well, for callers that reach it untyped.
      registerExportGovernanceQuick({ ...base }),
    ).rejects.toThrow(/requires exportHash/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a value that is not a sha256 — a filename is not a digest', async () => {
    for (const bad of ['', 'seq-0001.zip', 'not-a-hash', 'a'.repeat(63), 'z'.repeat(64)]) {
      await expect(
        registerExportGovernanceQuick({ ...base, exportHash: bad }),
      ).rejects.toThrow(/requires exportHash/i);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('records the caller digest verbatim, and not one derived from metadata', async () => {
    await registerExportGovernanceQuick({ ...base, exportHash: REAL });
    const params = paramsSeen();
    expect(params).toContain(REAL);

    /* The old fallback's inputs. If the recorded hash still moves with any of
       them, a metadata digest is back in some form. */
    const metadataDigest = (t: string, f: string, z: number) =>
      require('node:crypto').createHash('sha256').update(`${t}:${f}:${z}`).digest('hex');
    expect(params).not.toContain(metadataDigest(base.title, base.exportFilename, base.exportFileSize));
  });
});
