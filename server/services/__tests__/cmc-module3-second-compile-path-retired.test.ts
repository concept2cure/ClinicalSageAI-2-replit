/**
 * R1 batch 1, S29 (2026-11-09, founder-approved): the second Module 3 compile path is retired.
 *
 * `compileModule3Sections`, `markStaleSections` and their `SECTION_MAP` in
 * `server/services/cmc-module3-compiler.ts` were used only by tests. Their source-to-section map disagreed with
 * the composer the product runs. No client or shared code ever named them: the full history has none.
 *
 * What does the job instead: CMC / Module 3 → Module 3 build → "Compile Module 3"
 * (`client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx`). It sends `POST /api/cmc/module3-os/compile/:projectId`
 * (`server/api/cmc/module3OperatingSystemRoutes.ts`), whose `composeProjectModule3`
 * (`server/services/cmc/module3-compile.ts`) composes through `composeModule3FromCanonicalSources`
 * (`server/services/module3Composer.ts`). Staleness is computed by
 * `impactedSectionsForSourceType` and `server/services/cmc/section-drift.ts`.
 *
 * The file's live helpers stay: `createSourceHash`, `summarizeSectionDiff` and `canFinalizeExport`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as compiler from '../cmc-module3-compiler';
import * as composer from '../module3Composer';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('S29: the second Module 3 compile path is retired', () => {
  it('the compile and stale functions are gone from the compiler module', () => {
    expect(compiler).not.toHaveProperty('compileModule3Sections');
    expect(compiler).not.toHaveProperty('markStaleSections');
    expect(read('server/services/cmc-module3-compiler.ts')).not.toMatch(/const SECTION_MAP\b/);
  });

  it('the live helpers stay', () => {
    expect(typeof compiler.createSourceHash).toBe('function');
    expect(typeof compiler.summarizeSectionDiff).toBe('function');
    expect(typeof compiler.canFinalizeExport).toBe('function');
  });

  it('the replacement is reached: Module 3 build compiles through the composer', () => {
    expect(typeof composer.composeModule3FromCanonicalSources).toBe('function');
    expect(typeof composer.impactedSectionsForSourceType).toBe('function');
    expect(read('client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx')).toContain('/api/cmc/module3-os/compile/');
    expect(read('server/api/cmc/module3OperatingSystemRoutes.ts')).toMatch(/router\.post\('\/compile\/:projectId'/);
    expect(read('server/services/cmc/module3-compile.ts')).toMatch(/composeModule3FromCanonicalSources\(/);
  });
});
