/**
 * Forensic audit MEDIUM block 2 — fabricated extraction / search results
 *
 * Locks in two fixes from FORENSIC_CODE_AUDIT_2026-05-29.md (MEDIUM):
 *  - foresight-knowledge-graph: extractBiomarkers/extractEndpoints no longer
 *    fabricate indication/phase-based defaults (HbA1c, PD-L1, "Primary Efficacy")
 *    and present them as "extracted from CSR data"; they return [] without metadata.
 *  - semantic-search-service: no longer returns arbitrary documents at a fabricated
 *    score: 0.1 when there are no keyword matches; it returns no results.
 *
 * Source-integrity guards.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SERVER = path.resolve(__dirname, '../server');
const read = (rel: string) => fs.readFileSync(path.join(SERVER, rel), 'utf8');

describe('MEDIUM · foresight-knowledge-graph does not fabricate extractions', () => {
  const src = read('services/foresight-knowledge-graph.ts');

  it('extractBiomarkers no longer pushes hardcoded indication defaults', () => {
    expect(src).not.toContain("name: 'HbA1c'");
    expect(src).not.toContain("name: 'PD-L1'");
  });

  it('extractEndpoints no longer pushes hardcoded phase defaults', () => {
    expect(src).not.toContain("name: 'Primary Efficacy'");
    expect(src).not.toContain("name: 'Quality of Life'");
  });
});

describe('MEDIUM · semantic-search-service returns no fabricated fallback results', () => {
  const src = read('services/semantic-search-service.ts');

  it('no longer returns arbitrary documents at a hardcoded score: 0.1', () => {
    expect(src).not.toContain('score: 0.1');
    expect(src).not.toContain('return random documents');
  });
});
