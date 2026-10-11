#!/usr/bin/env node
/** Read-only CLI used by plain-node readiness. No providers or database. */
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPROVED_MODELS } from '../../server/services/ai-governance/approved-models.js';
import { verifyPqClaim } from '../../server/eval/pq/pq-verdict.js';

const root = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const readRecord = (ref: string) => {
  if (path.isAbsolute(ref)) throw new Error('PQ references must be repository-relative');
  const file = realpathSync(path.resolve(root, ref));
  if (!file.startsWith(`${root}${path.sep}`)) throw new Error('PQ reference leaves the repository');
  return JSON.parse(readFileSync(file, 'utf8')) as unknown;
};
try {
  const claims = APPROVED_MODELS.map(entry => ({ id: entry.id, pinnedVersion: entry.pinnedVersion,
    provider: entry.provider, status: entry.pq.status, issues: verifyPqClaim(entry, readRecord) }));
  console.info(JSON.stringify({ kind: 'canonical-pq-claim-verification', claims }));
} catch {
  console.error('Canonical PQ claim verification could not complete; no passed claim is verified.');
  process.exitCode = 1;
}
