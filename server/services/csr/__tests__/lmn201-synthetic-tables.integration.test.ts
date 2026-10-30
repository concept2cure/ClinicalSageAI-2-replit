/** Integration: synthetic clinical source -> existing governed contract -> existing CSR table builder.
 * Offline and non-clinical. No invented inferential statistics, live AnA run or tenant mutation.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CsrSourceEnvelopeSchema } from '../../../../shared/csr-source-input';
import { buildCSRTables } from '../../csr-tabulation-builders';

describe('LMN-201-like 500-subject synthetic CSR table journey', () => {
  it('generates and reconciles source-backed ICH E3 tables with no invented statistical inference', () => {
    const directory = mkdtempSync(join(tmpdir(), 'c2c-csr-tables-'));
    try {
      const generator = resolve('data/seeds/lumen-demo/scripts/generate_lmn201_comprehensive.mjs');
      const generated = spawnSync(process.execPath, [generator, directory], { encoding: 'utf8' });
      expect(generated.status, generated.stderr).toBe(0);
      const source = JSON.parse(readFileSync(join(directory, 'csr_source_v1_500_synthetic.json'), 'utf8'));
      const parsed = CsrSourceEnvelopeSchema.safeParse(source);
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
      if (!parsed.success) return;
      const tables = buildCSRTables(parsed.data.studyData);
      expect(tables.disposition.headers.join(' ')).toContain('n=250');
      expect(tables.disposition.rows.find(row => row[0] === 'Randomized')).toEqual(['Randomized', '250', '250', '500']);
      const efficacyText = JSON.stringify(tables.primaryEfficacy);
      expect(efficacyText).toContain('190/250');
      expect(efficacyText).toContain('140/250');
      expect(efficacyText).not.toMatch(/p\s*[=<]\s*0\.|credible interval|posterior probability/i);
      expect(tables.analysisPopulations.rows.length).toBeGreaterThan(0);
      expect(parsed.data.studyData.adverseEvents).toHaveLength(44);
      expect(parsed.data.studyData.adverseEvents.filter(event => event.serious)).toHaveLength(6);
      expect(tables.aeOverallSummary.rows.length).toBeGreaterThan(0);
      expect(tables.aeBySOC.rows.length).toBeGreaterThan(0);
      expect(tables.deathsSAEsDiscontinuations.rows.length).toBeGreaterThan(0);
      // Confirm the same data are represented in the actual CSR table cells.
      // A table object existing is not evidence that it reconciles to source.
      const disposition = tables.disposition.rows;
      const completed = disposition.find(row => row[0] === 'Completed treatment');
      const discontinued = disposition.find(row => row[0] === 'Discontinued (any reason)');
      expect(completed).toEqual(['Completed treatment', '240', '240', '480']);
      expect(discontinued).toEqual(['Discontinued (any reason)', '10', '10', '20']);
      const primaryRows = tables.primaryEfficacy.rows;
      expect(primaryRows).toHaveLength(2);
      expect(primaryRows.map(row => row[2])).toEqual([
        '190/250 simulated participants', '140/250 simulated participants',
      ]);
      // No SAP or verified inferential analysis was provided.
      expect(primaryRows.every(row => row[3] === '—' && row[4] === '—')).toBe(true);
      expect(tables.analysisPopulations.headers.length).toBeGreaterThan(1);
      expect(tables.aeOverallSummary.headers.length).toBeGreaterThan(1);

    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 30_000);
});
