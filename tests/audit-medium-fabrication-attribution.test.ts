/**
 * Forensic audit MEDIUM block — fabrication / attribution hardening
 *
 * Locks in three MEDIUM fixes from FORENSIC_CODE_AUDIT_2026-05-29.md:
 *  - digital-twin CQA: synthetic Math.random() predictions can no longer auto-approve
 *    a real-time release (forced to manual review) and are disclosed as synthetic.
 *  - degraded-by-default RAG: the embedding path routes through the governed
 *    getEmbeddingProvider() seam (a real OpenAI/self-hosted embedder) with no silent
 *    TF-IDF fallback. The two services the finding named — biotechRagService.js and the
 *    in-memory semantic-search-service — were purged as dead code in #1265; the live
 *    seam (enhancedEmbeddingService) now carries the invariant.
 *  - Part 11 attribution: no hardcoded userRole 'regulatory_specialist', no fabricated
 *    127.0.0.1 IP; real username resolved, role/IP honest (null when unknown).
 *
 * Source-integrity guards (these services load DB/heavy deps at import).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SERVER = path.resolve(__dirname, '../server');
const read = (rel: string) => fs.readFileSync(path.join(SERVER, rel), 'utf8');

describe('MEDIUM · digital-twin CQA cannot auto-release on synthetic values', () => {
  const src = read('services/cognitive-ecosystem/digital-twin-runtime.service.ts');

  it('forces manual review when synthetic predictions would auto-approve', () => {
    expect(src).toContain('cqaPredictionsAreSynthetic');
    expect(src).toContain('ReleaseDecision.MANUAL_REVIEW');
    // The guard must reference the auto-approve decision it overrides.
    expect(src).toMatch(/RTRT_APPROVED\)\s*\{\s*\n\s*releaseDecision = ReleaseDecision\.MANUAL_REVIEW/);
  });

  it('discloses that CQA predictions are synthetic', () => {
    expect(src).toContain('CQA predictions are synthetic');
  });
});

describe('MEDIUM · embeddings route through the governed provider, never silent TF-IDF', () => {
  // The FORENSIC_CODE_AUDIT_2026-05-29.md "degraded-by-default RAG" finding named
  // biotechRagService.js (empty OpenAI-init try{} → always TF-IDF) and the in-memory
  // semantic-search-service. Both were purged as dead code in #1265. The live embedding
  // path now runs through enhancedEmbeddingService, which calls the governed
  // getEmbeddingProvider() seam directly and has NO lexical/TF-IDF fallback to degrade
  // into — a stronger resolution than the original ALLOW_FALLBACK_EMBEDDINGS gate.
  const src = read('services/enhancedEmbeddingService.ts');

  it('routes embeddings through the governed provider seam', () => {
    // Embeddings go through the governed provider (a real OpenAI/self-hosted
    // embedder), not a direct, bypassable client.
    expect(src).toContain('getEmbeddingProvider');
    expect(src).toMatch(/getEmbeddingProvider\(\)\.embed\(/);
  });

  it('has no silent degraded fallback (no empty try-catch, no TF-IDF path)', () => {
    // The tell-tale empty try block is gone, and there is no lexical/TF-IDF
    // fallback for the seam to silently degrade into.
    expect(src).not.toMatch(/try\s*\{\s*\}\s*catch/);
    expect(src).not.toMatch(/tf-?idf/i);
  });
});

describe('MEDIUM · Part 11 attribution is honest', () => {
  it('medicalDeviceService resolves a real username and does not hardcode a role', () => {
    const src = read('services/medicalDeviceService.ts');
    expect(src).not.toContain("userRole: 'regulatory_specialist'");
    expect(src).not.toContain('userName: `User ${userId}`,'); // the inlined fabrication
    expect(src).toContain('resolvedUserName');
    expect(src).toContain('userRole: null');
  });

  it('part11ComplianceService does not fabricate a 127.0.0.1 IP', () => {
    const src = read('services/part11ComplianceService.ts');
    expect(src).not.toContain("ipAddress: '127.0.0.1'");
    expect(src).toContain('ipAddress: ipAddress ?? null');
  });
});
