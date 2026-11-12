/**
 * R1 batch 1, S12 (2026-11-09, founder-approved): `/api/biopharma/ctd` is retired.
 *
 * `server/routes/biopharma/ctd.ts` served `GET /structure` and `GET /build-state/:projectId`. No screen ever called
 * either: across the full history, the only client request was `BiopharmaProject.tsx` asking for the mount root,
 * which never had a handler, and that screen was retired on 2026-07-31. Production refused both routes.
 * The build-state helpers in `ctd-module-structure.ts` (`annotateModuleBuildState` and its types) had no other
 * caller.
 *
 * What does the job instead:
 * - the CTD Module 1 and 2 structure: AnA `get_ctd_module_home` (`server/services/ana/AnaToolExecutor.ts`), over
 *   `getCtdModuleHome`, which stays;
 * - a filing's sections and their state: `GET /api/c2c/documents/:id/outline` (`server/routes/c2c/documents.ts`),
 *   read by the editor's filing outline (`client/src/concept2cure/v2/useFilingOutline.ts`), and AnA
 *   `list_authoring_outline`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as ctdStructure from '../../services/regulatory/ctd-module-structure';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('S12: /api/biopharma/ctd is retired', () => {
  it('the route file is gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'server/routes/biopharma/ctd.ts'))).toBe(false);
  });

  it('nothing mounts it', () => {
    expect(read('server/bootstrap/register-inline-routes.ts')).not.toMatch(/['"]\/api\/biopharma\/ctd['"]|routes\/biopharma\/ctd['"]/);
  });

  it('the build-state helpers only it used are gone; the structure stays', () => {
    expect(ctdStructure).not.toHaveProperty('annotateModuleBuildState');
    expect(typeof ctdStructure.getCtdModuleHome).toBe('function');
    expect(ctdStructure.getCtdModuleHome('FDA').module2.map((s) => s.code)).toContain('2.5');
  });

  it('no AnA tool description sends the model to the retired route', () => {
    expect(read('server/services/ana/bla-biologics-tool-defs.ts')).not.toContain('/api/biopharma/ctd');
  });

  it('the replacements are reached: the AnA structure tool and the editor\'s filing outline', () => {
    expect(read('server/services/ana/AnaToolExecutor.ts')).toMatch(/registerToolHandler\('get_ctd_module_home'/);
    expect(read('server/routes/c2c/documents.ts')).toMatch(/router\.get\('\/:id\/outline'/);
    expect(read('client/src/concept2cure/v2/useFilingOutline.ts')).toMatch(/\/outline/);
  });
});
