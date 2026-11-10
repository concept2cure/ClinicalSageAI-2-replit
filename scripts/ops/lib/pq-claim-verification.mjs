/** Launch the canonical verifier through the checkout loader or shipped Node bundle. */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export function canonicalPqClaims(repoRoot, execute = execFileSync) {
  try {
    const loader = path.join(repoRoot, 'node_modules/tsx/dist/loader.mjs');
    const source = path.join(repoRoot, 'scripts/ops/verify-pq-claims.ts');
    const args = existsSync(loader) && existsSync(source)
      ? ['--import', loader, source]
      : [path.join(repoRoot, 'dist/ops/verify-pq-claims.mjs')];
    const stdout = execute(process.execPath, args, {
      cwd: repoRoot, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = JSON.parse(stdout);
    if (result?.kind !== 'canonical-pq-claim-verification' || !Array.isArray(result.claims) ||
        result.claims.some(claim => !claim || typeof claim.id !== 'string' || typeof claim.pinnedVersion !== 'string' ||
          typeof claim.provider !== 'string' || !['pending', 'passed', 'failed'].includes(claim.status) ||
          !Array.isArray(claim.issues) || claim.issues.some(issue => typeof issue !== 'string')) ||
        new Set(result.claims.map(claim => claim.id)).size !== result.claims.length) return null;
    return result.claims;
  } catch { return null; }
}

export function supportsPassedPq(claims, entry) {
  if (!Array.isArray(claims)) return false;
  const claim = claims.find(row => row.id === entry.id);
  return Boolean(claim && claim.status === 'passed' && claim.pinnedVersion === entry.pinnedVersion &&
    claim.provider === entry.provider && claim.issues.length === 0);
}
