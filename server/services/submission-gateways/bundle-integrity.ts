/**
 * Bundle integrity gate.
 *
 * The transmit signer attests to a specific `bundle.sha256`. Between assembly
 * and transmit the package sits on disk, so before any irreversible send we
 * re-read the bytes and confirm they still hash to the signed descriptor.
 * A drifted, truncated, corrupt, or missing bundle is refused — never
 * transmitted under a stale signature.
 *
 * Throws `ValidationError` (mapped to HTTP 422 by the transmit route, and
 * recorded as a rejected transmittal by each gateway's catch) on any mismatch.
 */
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { ValidationError, type SubmissionBundle } from './types';

export async function readVerifiedBundle(
  bundle: Pick<SubmissionBundle, 'path' | 'sha256' | 'sizeBytes'>,
): Promise<Buffer> {
  let buf: Buffer;
  try {
    buf = await fs.readFile(bundle.path);
  } catch (err) {
    throw new ValidationError(
      `Assembled bundle is missing or unreadable at ${bundle.path}; re-assemble before transmitting.`,
      [{ check: 'bundle-present', path: bundle.path, error: err instanceof Error ? err.message : String(err) }],
    );
  }

  const actualSha256 = createHash('sha256').update(buf).digest('hex');
  if (actualSha256 !== bundle.sha256 || buf.length !== bundle.sizeBytes) {
    throw new ValidationError(
      'Assembled bundle on disk does not match the signed descriptor (sha256/size mismatch); re-assemble before transmitting.',
      [{
        check: 'bundle-integrity',
        expectedSha256: bundle.sha256,
        actualSha256,
        expectedSizeBytes: bundle.sizeBytes,
        actualSizeBytes: buf.length,
      }],
    );
  }

  return buf;
}
