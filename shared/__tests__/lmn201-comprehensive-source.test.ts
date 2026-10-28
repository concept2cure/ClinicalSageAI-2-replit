import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CsrSourceEnvelopeSchema } from '../csr-source-input';

describe('500-subject LMN-201-like synthetic CSR source', () => {
  it('validates the generated JSON with the real governed source contract', () => {
    const dir = mkdtempSync(join(tmpdir(), 'c2c-csr-500-'));
    try {
      const script = resolve('data/seeds/lumen-demo/scripts/generate_lmn201_comprehensive.mjs');
      const result = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      const source = JSON.parse(readFileSync(join(dir, 'csr_source_v1_500_synthetic.json'), 'utf8'));
      const parsed = CsrSourceEnvelopeSchema.safeParse(source);
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
      expect(source.participants).toHaveLength(500);
      expect(source.studyData.treatmentArms.map((arm: { randomized: number }) => arm.randomized)).toEqual([250, 250]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
