/**
 * The delivery ceiling — one contract, two paths.
 *
 * `createGovernedExportConsequence` has refused a buffer over
 * `GOVERNED_EXPORT_MAX_BYTES` (25 MiB default) since it was written.
 * `createAuditedUnplacedExport` — the path a program-spine program with no
 * PM-spine `projects` anchor takes, which is most of them — checked only that
 * the buffer was NON-EMPTY.
 *
 * That difference was invisible while every export through here was a fixed
 * ~5.3 MB official eSTAR or a small draft ZIP. The eSTAR attachment slice
 * (2026-09-08) removed the ceiling on the input: a filer maps documents into
 * the form's 113/145 slots, and a 60 MiB export becomes ~80 MiB of base64 in a
 * single JSON response body, on a route any editor can call. Measured before
 * this file existed: 60 MiB in, 83,886,080 base64 characters out, delivered.
 *
 * A program without a registry anchor is not a program without limits.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) },
}));

import {
  createAuditedUnplacedExport,
  getMaxGovernedExportBytes,
} from '../governedExportConsequence';

function unplaced(buffer: Buffer) {
  return createAuditedUnplacedExport({
    organizationId: 2,
    userId: 9,
    sourceType: 'export_estar_pdf',
    backendRoute: 'POST /api/510k/estar/official',
    resourceType: 'estar_official_pdf',
    resourceId: 'program-1',
    programUuid: 'program-1',
    filename: 'k123_eSTAR.pdf',
    mimeType: 'application/pdf',
    buffer,
  });
}

describe('the audited-unplaced delivery path', () => {
  afterEach(() => {
    delete process.env.GOVERNED_EXPORT_MAX_BYTES;
  });

  it('refuses a buffer over the same ceiling the registry path enforces', async () => {
    process.env.GOVERNED_EXPORT_MAX_BYTES = String(1024 * 1024);
    await expect(unplaced(Buffer.alloc(2 * 1024 * 1024, 0x41))).rejects.toThrow(
      /exceeds max size \(1048576 bytes\)/,
    );
  });

  it('still delivers what fits', async () => {
    process.env.GOVERNED_EXPORT_MAX_BYTES = String(1024 * 1024);
    const out = await unplaced(Buffer.from('%PDF-1.7 small'));
    expect(out.audited).toBe(true);
    expect(out.downloadable_output_ref.data.length).toBeGreaterThan(0);
  });

  it('reads the ceiling from the ONE function, so the two paths cannot drift', () => {
    // Exported precisely so a producer can refuse before doing the work; if this
    // stops being the same number the deliverer uses, an export is refused in
    // one place and accepted in the other.
    process.env.GOVERNED_EXPORT_MAX_BYTES = String(7 * 1024 * 1024);
    expect(getMaxGovernedExportBytes()).toBe(7 * 1024 * 1024);
    delete process.env.GOVERNED_EXPORT_MAX_BYTES;
    expect(getMaxGovernedExportBytes()).toBe(25 * 1024 * 1024);
  });
});
