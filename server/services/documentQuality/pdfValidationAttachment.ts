import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VeraPdfClient } from '../../integrations/verapdf/client';
import { DOCUMENT_STACK_FEATURE_KEYS, isDocumentStackFeatureEnabled } from '../documentIntelligence/featureFlags';

export async function appendVeraPdfValidation(params: {
  pdfBuffer: Buffer;
  organizationId?: number;
  existingValidationReport: Array<{ check: string; status: 'pass' | 'fail' | 'warning'; details: string }>;
}): Promise<Array<{ check: string; status: 'pass' | 'fail' | 'warning'; details: string }>> {
  const enabled = await isDocumentStackFeatureEnabled(
    DOCUMENT_STACK_FEATURE_KEYS.pdfValidation,
    params.organizationId
  );

  if (!enabled) {
    return params.existingValidationReport;
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'verapdf-'));
  const tempFile = join(tempDir, 'candidate.pdf');

  try {
    await writeFile(tempFile, params.pdfBuffer);
    const result = await new VeraPdfClient().validate(tempFile);

    return [
      ...params.existingValidationReport,
      {
        check: 'verapdf_pdfa',
        status: result.compliant ? 'pass' : 'warning',
        details: result.compliant
          ? 'veraPDF compliant (feature-flagged advisory mode)'
          : result.failures.map((failure) => failure.message).join('; ').slice(0, 400),
      },
    ];
  } catch (error: any) {
    return [
      ...params.existingValidationReport,
      {
        check: 'verapdf_pdfa',
        status: 'warning',
        details: `veraPDF skipped: ${error?.message || 'unknown_error'}`,
      },
    ];
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
