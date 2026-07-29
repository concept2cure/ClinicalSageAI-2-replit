import { describe, expect, it, vi} from 'vitest';

// vi.hoisted ensures env vars are set BEFORE any ESM imports (including
// transitive ones) are evaluated. Loading the auth/db/config chain at
// module init requires these to be present, or the chain throws.
vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

import { appendVeraPdfValidation } from '../../server/services/documentQuality/pdfValidationAttachment';

describe('appendVeraPdfValidation', () => {
  it('returns existing report when feature flag is disabled', async () => {
    const original = [{ check: 'size', status: 'pass' as const, details: 'ok' }];
    const report = await appendVeraPdfValidation({
      pdfBuffer: Buffer.from('pdf'),
      existingValidationReport: original,
      organizationId: 1,
    });

    expect(report).toEqual(original);
  });
});
