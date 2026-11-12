/**
 * R1 batch 1, S13 (2026-11-09, founder-approved): the five request-body builders in the submission orchestrator
 * are retired.
 *
 * `POST /m2/nonclinical`, `/m2/clinical`, `/m2/clinical-overview`, `/csr/tabulate` and `/validate/hardened`
 * (`server/routes/submission-orchestrator.ts`) each built regulated content, or a go/no-go validation, from
 * whatever the request body carried. No record backed it and nobody approved it. That is the defect `/m2/qos` was
 * retired for on 2026-10-05 (CLAUDE.md RULE 2). No screen ever called any of the five: the full history has none.
 * Production refused them.
 *
 * What does the job instead:
 * - a run built from the program's own records: `POST /api/submission-orchestrator/runs/for-program`, sent by
 *   eCTD Compile's run controls (`client/src/concept2cure/v2/surfaces/OrchestratorRunControls.tsx`). Its m2.4,
 *   m2.5, m2.7, CSR and gateway steps (`server/services/submission-package-orchestrator.ts`) call the same
 *   builders over stored inputs;
 * - AnA's Module 2 tools, over the project's records;
 * - the hardened validator at sign and release (`server/routes/submission-sign-release.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ROUTES = 'server/routes/submission-orchestrator.ts';
const RETIRED = ['/m2/nonclinical', '/m2/clinical', '/m2/clinical-overview', '/csr/tabulate', '/validate/hardened'];

describe('S13: the orchestrator\'s request-body builders are retired', () => {
  it.each(RETIRED)('POST %s is no longer registered', (route) => {
    const escaped = route.replace(/[/]/g, '\\/');
    expect(read(ROUTES)).not.toMatch(new RegExp(`router\\.post\\(\\s*'${escaped}'`));
  });

  it('the audit helper written only for them is gone', () => {
    expect(read(ROUTES)).not.toMatch(/auditOrchestratorAccess|orchestrator_validated_hardened/);
  });

  it('the replacement is reached: a run from the program\'s records, sent by the run controls', () => {
    expect(read(ROUTES)).toMatch(/router\.post\(\s*'\/runs\/for-program'/);
    expect(read('client/src/concept2cure/v2/surfaces/OrchestratorRunControls.tsx')).toMatch(/\/runs\/for-program/);
  });

  it('the run still composes with the same builders, over stored inputs', () => {
    const orchestrator = read('server/services/submission-package-orchestrator.ts');
    for (const builder of ['buildM24NonclinicalOverview', 'buildM25ClinicalOverview', 'buildM27ClinicalSummary', 'buildCSRTables']) {
      expect(orchestrator).toContain(builder);
    }
    expect(read('server/routes/submission-sign-release.ts')).toContain('validateEctdPackageHardened');
  });
});
