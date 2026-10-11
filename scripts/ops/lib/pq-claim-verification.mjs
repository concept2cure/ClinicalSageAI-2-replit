/** Launch the repository's canonical TS verifier through its existing loader. */
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function canonicalPqClaims(repoRoot, execute = execFileSync) {
  try {
    const stdout = execute(process.execPath, ['--import', path.join(repoRoot, 'node_modules/tsx/dist/loader.mjs'),
      path.join(repoRoot, 'scripts/ops/verify-pq-claims.ts')], {
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
