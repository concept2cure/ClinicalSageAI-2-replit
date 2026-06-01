/**
 * Forensic audit MEDIUM block 2 — fabricated extraction / search results
 *
 * Locks in two fixes from FORENSIC_CODE_AUDIT_2026-05-29.md (MEDIUM):
 *  - foresight-knowledge-graph: extractBiomarkers/extractEndpoints no longer
 *    fabricate indication/phase-based defaults (HbA1c, PD-L1, "Primary Efficacy")
 *    and present them as "extracted from CSR data"; they return [] without metadata.
 *
 * (The companion semantic-search-service fabrication guard was retired alongside
 * that service, which has been removed in favour of the canonical RAG router.)
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
