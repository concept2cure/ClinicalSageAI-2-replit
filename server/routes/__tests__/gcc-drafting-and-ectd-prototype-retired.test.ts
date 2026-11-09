/**
 * R1 batch 1, S19 (2026-11-09, founder-approved): GCC drafting and the GCC eCTD prototype are retired.
 *
 * `server/api/drafting/routes.ts` (mounted at `/api/gcc/drafting`) and `server/api/gcc/ectd/routes.js` (at
 * `/api/gcc/ectd`). No screen ever called any route either file serves today: the full history has none.
 * Production refused them. The drafting routes read `vault.*` tables that no applier provisions. The eCTD module
 * answered `/modules` with the same five strings for every caller.
 *
 * What does the job instead:
 * - cited drafting: AnA `batch_draft_sections` (`server/services/ana/AnaToolExecutor.ts`), blueprint-grounded;
 * - entity extraction from a submission document: AnA `extract_submission_document`;
 * - the CTD module list: `MODULE_NAMES` and the ICH M4 headings of the record.
 *
 * The rest of the GCC platform (signing, site intelligence, labeling) is untouched. Each still answers 501 with
 * its declared state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GCC_MODULES } from '../../api/gcc/modules';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('S19: GCC drafting and the GCC eCTD prototype are retired', () => {
  it('both route files are gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'server/api/drafting/routes.ts'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'server/api/gcc/ectd/routes.js'))).toBe(false);
  });

  it('the GCC router no longer mounts them', () => {
    const index = read('server/api/gcc/index.ts');
    expect(index).not.toMatch(/router\.use\('\/(drafting|ectd)'/);
    expect(index).not.toMatch(/from '(\.\.\/drafting|\.\/ectd)\/routes/);
  });

  it('the module declaration no longer lists them; the other three keep their honest state', () => {
    expect(GCC_MODULES.map((m) => m.key)).toEqual(['signing', 'site-intel', 'labeling']);
    expect(GCC_MODULES.every((m) => m.state === 'not_implemented')).toBe(true);
  });

  it('no CI baseline still excuses the deleted drafting routes', () => {
    for (const baseline of [
      'scripts/ci/tables-live-schema-baseline.json',
      'scripts/ci/unbacked-tables-baseline.json',
      'scripts/ci/unapproved-model-pins-baseline.json',
      'scripts/ci/check-embedding-runtime-canonicality.mjs',
    ]) {
      expect(read(baseline)).not.toContain('server/api/drafting/routes.ts');
    }
  });

  it('the replacements are reached: AnA drafts and extracts', () => {
    const executor = read('server/services/ana/AnaToolExecutor.ts');
    expect(executor).toMatch(/registerToolHandler\('batch_draft_sections'/);
    expect(executor).toMatch(/registerToolHandler\('extract_submission_document'/);
  });
});
