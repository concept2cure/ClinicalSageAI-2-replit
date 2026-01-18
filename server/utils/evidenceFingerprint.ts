import crypto from 'node:crypto';

/**
 * Evidence Set Fingerprint - Cryptographic Tamper Detection
 * 
 * Computes a deterministic hash of all evidence files in an export.
 * This provides:
 * 1. Snapshot versioning (same evidence set = same fingerprint)
 * 2. Tamper detection (any change = different fingerprint)
 * 3. Regulatory audit trail (prove what was in each export)
 * 
 * Rule: fingerprint = sha256(join("\n", sort(unique(evidenceSha256List))))
 * 
 * @param evidenceSha256 Array of SHA256 hashes from evidence records
 * @returns Deterministic fingerprint hex string
 */
export function evidenceSetFingerprint(evidenceSha256: string[]): string {
  // Normalize: deduplicate, trim, lowercase, remove empties, sort
  const normalized = [...new Set(evidenceSha256)]
    .map(s => (s || '').trim().toLowerCase())
    .filter(Boolean)
    .sort();

  if (normalized.length === 0) {
    // Empty evidence set still gets a fingerprint (empty string hash)
    return crypto.createHash('sha256').update('', 'utf8').digest('hex');
  }

  // Join with newlines for deterministic input
  const payload = normalized.join('\n');
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Compute SHA256 hash of a buffer
 * 
 * Used for individual evidence file integrity.
 */
export function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Compute SHA256 hash of a string
 * 
 * Used for JSON serialization hashing (e.g., link graphs).
 */
export function sha256String(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}
