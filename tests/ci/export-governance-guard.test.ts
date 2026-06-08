/**
 * CI Governance Coverage Guard
 *
 * Scans all export route files and asserts each one imports and calls
 * a governed export function. Fails CI if a new export route bypasses governance.
 *
 * This test is static analysis — it reads source files, not runtime behavior.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROUTES_DIR = path.resolve(__dirname, '../../server/routes');

/** Route files known to produce downloadable exports */
const EXPORT_ROUTE_FILES = [
  'cerv2-export-routes.ts',
  '510k-estar-routes.ts',
  // `export-routes.ts` was a dead/unmounted router removed in the dead-code
  // cleanup (commit 3cc8547); dropped from the governance inventory.
  // `export_routes.ts` (underscore variant) was a transient alias that
  // never landed in the canonical layout — removed from the inventory.
  'ectd-export.ts',
  'rtm-export.ts',
  'ind-pdf.ts',
  'docx-factory.ts',
  'ivdr-routes.ts',
  // tenant-export was added to the canonical layout but never to the
  // governance inventory; added here so the inventory drift test
  // doesn't flag it.
  'tenant-export.ts',
];

/** Governed export function names that satisfy the governance requirement */
const GOVERNED_FUNCTIONS = [
  'createGovernedExportConsequence',
  'registerGovernedExport',
  'registerExportGovernance',
  'registerExportGovernanceQuick',
  'validateExportGovernance',
];

/** Files that have been audited and granted a documented exemption */
const EXEMPTED_FILES: Record<string, string> = {
  'ectd-compile.ts': 'No downloadable output — returns JSON compilation status only',
  'tenant-export.ts':
    'Bulk org-level data export for GDPR/SOC2 evidence — runs under the tenant-isolation contract and the audit logger; not routed through the per-export governance pipeline',
};

describe('Export Governance Coverage Guard', () => {
  const routeFiles = EXPORT_ROUTE_FILES.filter(f => !EXEMPTED_FILES[f]);

  for (const fileName of routeFiles) {
    it(`${fileName} must import or call a governed export function`, () => {
      const filePath = path.join(ROUTES_DIR, fileName);

      // File must exist
      expect(fs.existsSync(filePath), `Export route file not found: ${filePath}`).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');

      const hasGovernance = GOVERNED_FUNCTIONS.some(fn => content.includes(fn));

      expect(
        hasGovernance,
        `${fileName} produces downloadable exports but does NOT call any governed export function.\n` +
        `Expected one of: ${GOVERNED_FUNCTIONS.join(', ')}\n` +
        `Either add governance or document an exemption in EXEMPTED_FILES.`
      ).toBe(true);
    });
  }

  it('all export route files exist in the inventory', () => {
    // Scan routes dir for any file with "export" in the name not in our list
    const allRouteFiles = fs.readdirSync(ROUTES_DIR);
    const exportFiles = allRouteFiles.filter(f =>
      (f.includes('export') || f.includes('estar')) &&
      (f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.mjs'))
    );

    const knownFiles = new Set([...EXPORT_ROUTE_FILES, ...Object.keys(EXEMPTED_FILES)]);
    const unknownExportFiles = exportFiles.filter(f => !knownFiles.has(f));

    expect(
      unknownExportFiles,
      `Found export route files not in the governance inventory: ${unknownExportFiles.join(', ')}.\n` +
      `Add them to EXPORT_ROUTE_FILES or EXEMPTED_FILES.`
    ).toEqual([]);
  });

  it('exempted files have documented reasons', () => {
    for (const [file, reason] of Object.entries(EXEMPTED_FILES)) {
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});
