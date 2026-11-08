#!/usr/bin/env node
/** Offline canonical qualification checks and the production asset allowlist. */
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPROVED_MODELS, type ApprovedModel } from '../../server/services/ai-governance/approved-models.js';
import { hasConcreteQualifiedPin } from '../../server/services/ai-gateway/model-governance.js';
import { verifyPqClaim } from '../../server/eval/pq/pq-verdict.js';
import { qualificationEvidenceRoot, readQualificationAsset, type CanonicalPqEvidence } from '../../server/eval/pq/verify-pq-record.js';

export const QUALIFICATION_CANONICAL_ASSETS = [
  'server/eval/pq/pq-protocol.json',
  'server/eval/doc-quality/gold-tasks.json',
  'server/eval/rag/gold-dataset.json',
  'server/eval/rag/guidance-corpus-manifest.json',
] as const;
export interface QualificationRuntimeAsset { reference: string; sha256: string; bytes: Buffer }
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Registry-owned relative regular files only; no traversal, aliases or escape. */
function controlledAsset(root: string, reference: string): QualificationRuntimeAsset {
  if (!reference || path.isAbsolute(reference) || reference.includes('\\') || reference.includes('\0') ||
      path.posix.normalize(reference) !== reference || reference.startsWith('../')) throw new Error('Invalid controlled PQ asset reference');
  const packageRoot = realpathSync(root);
  const file = realpathSync(path.resolve(packageRoot, reference));
  if (!file.startsWith(`${packageRoot}${path.sep}`) || !statSync(file).isFile()) throw new Error('PQ asset is not a contained regular file');
  const bytes = readFileSync(file);
  return { reference, sha256: sha(bytes), bytes };
}

function canonicalEvidence(assets: QualificationRuntimeAsset[]): CanonicalPqEvidence {
  const [protocolText, docBankText, ragGoldText, corpusManifestText] = assets.map(asset => asset.bytes.toString('utf8'));
  return { protocolText, docBankText, ragGoldText, corpusManifestText };
}

/** Only the exact controlled PASS record bytes may accompany a qualified pin. */
function qualifiedRecord(entry: ApprovedModel, readAsset: (reference: string) => QualificationRuntimeAsset, canonical: CanonicalPqEvidence): QualificationRuntimeAsset {
  if (!hasConcreteQualifiedPin(entry) || !entry.pq.reference || !/^[a-f0-9]{64}$/.test(entry.pq.recordSha256 ?? '') ||
      !entry.pq.intendedUses?.length) throw new Error('Passed PQ entry lacks immutable reviewed qualification metadata');
  const asset = readAsset(entry.pq.reference);
  if (asset.sha256 !== entry.pq.recordSha256) throw new Error('Registered PQ record content hash mismatch');
  const issues = verifyPqClaim(entry, () => JSON.parse(asset.bytes.toString('utf8')), canonical);
  if (issues.length) throw new Error('Registered PQ record failed canonical qualification verification');
  return asset;
}

/** Fixed synthetic/public banks plus verified registry PASS records; never a directory copy. */
export function collectQualificationRuntimeAssets(entries: readonly ApprovedModel[] = APPROVED_MODELS,
  root = qualificationEvidenceRoot()): QualificationRuntimeAsset[] {
  const assets = QUALIFICATION_CANONICAL_ASSETS.map(reference => controlledAsset(root, reference));
  const canonical = canonicalEvidence(assets);
  for (const entry of entries) {
    if (entry.pq.status !== 'passed') continue;
    const asset = qualifiedRecord(entry, reference => controlledAsset(root, reference), canonical);
    const existing = assets.find(row => row.reference === asset.reference);
    if (existing && existing.sha256 !== asset.sha256) throw new Error('Conflicting controlled PQ references');
    if (!existing) assets.push(asset);
  }
  return assets;
}

export function canonicalQualificationClaims(entries: readonly ApprovedModel[] = APPROVED_MODELS,
  root?: string) {
  const readAsset = (reference: string): QualificationRuntimeAsset => {
    if (root) return controlledAsset(root, reference);
    const bytes = Buffer.from(readQualificationAsset(reference), 'utf8');
    return { reference, bytes, sha256: sha(bytes) };
  };
  return entries.map(entry => {
    let issues: string[];
    try {
      const readRecord = (reference: string) => JSON.parse(readAsset(reference).bytes.toString('utf8')) as unknown;
      const canonical = entry.pq.status === 'passed'
        ? canonicalEvidence(QUALIFICATION_CANONICAL_ASSETS.map(readAsset)) : undefined;
      issues = verifyPqClaim(entry, readRecord, canonical);
      if (canonical) qualifiedRecord(entry, readAsset, canonical);
    } catch { issues = ['Canonical PQ evidence or exact record hash could not be verified.']; }
    return { id: entry.id, pinnedVersion: entry.pinnedVersion, provider: entry.provider, status: entry.pq.status, issues };
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { console.info(JSON.stringify({ kind: 'canonical-pq-claim-verification', claims: canonicalQualificationClaims() })); }
  catch {
    console.error('Canonical PQ claim verification could not complete; no passed claim is verified.');
    process.exitCode = 1;
  }
}
