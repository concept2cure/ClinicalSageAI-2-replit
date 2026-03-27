import { describe, expect, it } from 'vitest';
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
