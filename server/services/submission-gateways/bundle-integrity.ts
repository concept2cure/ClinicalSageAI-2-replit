/**
 * Bundle integrity gate.
 *
 * The transmit signer attests to a specific `bundle.sha256`. Between assembly
 * and transmit the package sits on disk, so before any irreversible send we
 * re-read the bytes and confirm they still hash to the signed descriptor.
 * A drifted, truncated, corrupt, or missing bundle is refused — never
 * transmitted under a stale signature.
 *
 * C2C-SUB-003: hash+size agreement alone is NOT an authorization decision. The
 * descriptor states both the path AND its expected digest, so a descriptor an
 * attacker controls is trivially self-consistent — the check passes for
 * /etc/passwd just as happily as for an assembled package. Every gateway funnels
 * its bytes through this one function, so it is also where the *namespace* is
 * enforced: the path must name a file inside the submission-bundle root before
 * a single byte is read. Confinement is the gate; hash/size is the freshness
 * check that runs after it.
 *
 * Throws `ValidationError` (mapped to HTTP 422 by the transmit route, and
 * recorded as a rejected transmittal by each gateway's catch) on any mismatch.
 */
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { ValidationError, type SubmissionBundle } from './types';
import {
  bundleTrustEnforced,
  hasUnsafePathSyntax,
  isPathWithinBundleRoot,
  submissionBundleRoot,
} from './bundle-namespace';

export async function readVerifiedBundle(
  bundle: Pick<SubmissionBundle, 'path' | 'sha256' | 'sizeBytes'>,
): Promise<Buffer> {
  // Path-syntax guard — unconditional, every environment. A `..` component, an
  // embedded NUL, or an empty path is never a legitimate assembled bundle.
  if (hasUnsafePathSyntax(bundle.path)) {
    throw new ValidationError(
      'Assembled bundle path is not a well-formed bundle location; re-assemble before transmitting.',
      [{ check: 'bundle-path-syntax', path: String(bundle.path) }],
    );
  }

  // Namespace confinement — enforced outside a declared local development/test
  // environment (fail closed on an unset or unknown NODE_ENV). Refuse BEFORE
  // the read so an out-of-namespace file is never loaded into memory, let alone
  // shipped to an agency gateway.
  if (bundleTrustEnforced() && !isPathWithinBundleRoot(bundle.path)) {
    throw new ValidationError(
      'Assembled bundle is outside the permitted submission-bundle storage namespace; re-assemble before transmitting.',
      [{ check: 'bundle-namespace', path: bundle.path, root: submissionBundleRoot() }],
    );
  }

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
