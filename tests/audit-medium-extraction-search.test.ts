/**
 * Forensic audit MEDIUM block 2 — fabricated extraction / search results
 *
 * Both guards in this file have now been RETIRED WITH THEIR SUBJECTS:
 *
 *  - semantic-search-service was removed in favour of the canonical RAG router;
 *    its fabrication guard was retired at that time.
 *  - foresight-knowledge-graph was removed by the CRE Phase 8 cleanup
 *    ("delete the orphaned foresight subtree", 13 files). This file kept reading
 *    it with fs.readFileSync at describe-time, so the deletion failed the entire
 *    suite with ENOENT rather than failing one assertion.
 *
 * The original assertions were source-integrity checks: that
 * extractBiomarkers/extractEndpoints no longer fabricate indication- and
 * phase-based defaults (HbA1c, PD-L1, "Primary Efficacy", "Quality of Life") and
 * present them as extracted from CSR data. Deleting the service satisfies that
 * invariant more completely than the assertions did — there is no longer any code
 * that could fabricate those values.
 *
 * What replaces it is a REGRESSION check rather than a content check. If either
 * service returns, this fails, and whoever brings it back has to re-establish the
 * fabrication guarantee deliberately — instead of inheriting a test file that had
 * quietly stopped testing anything.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SERVER = path.resolve(__dirname, '../server');

describe('MEDIUM · the fabricating extraction services stay retired', () => {
  it('foresight-knowledge-graph has not returned without a fabrication guard', () => {
    expect(fs.existsSync(path.join(SERVER, 'services/foresight-knowledge-graph.ts'))).toBe(false);
  });

  it('semantic-search-service has not returned without a fabrication guard', () => {
    expect(fs.existsSync(path.join(SERVER, 'services/semantic-search-service.ts'))).toBe(false);
  });
});
