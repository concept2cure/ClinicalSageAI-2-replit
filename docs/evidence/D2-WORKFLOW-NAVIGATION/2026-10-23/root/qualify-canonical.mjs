// Re-run the selected discovery contracts plus newly merged editor entry/session contracts.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = 'docs/evidence/D2-WORKFLOW-NAVIGATION/2026-10-23/root';
const client = 'client/src/concept2cure/v2/__tests__/';
const shared = 'shared/navigation/__tests__/';
const tests = [
  ...['workflowDiscovery.test.tsx','appsLive.test.tsx','appsCatalogEntitlement.test.tsx','appsLicenceLimitNotRecorded.test.tsx','capabilityBrowser.test.tsx','shellNav.test.tsx','railLicenseGating.test.tsx','cmdkLicenseGating.test.tsx','unlockJourney.test.tsx','anaOperatesAuditTrail.test.tsx','appMentions.test.tsx','launchScopeLock.test.tsx','accessRequests.test.tsx','accessRequestsHonestEmpty.test.tsx','railPiecesRehomed.test.tsx','auditTrailHeadersAndCopy.test.ts','moduleCatalogReconciliation.test.ts','navigationReachability.test.ts','projectHomeLaunchScope.test.tsx','authoringSourceDocumentStart.test.tsx','taskDrawerCreationGuard.test.tsx'].map(file => client + file),
  ...['navigation.test.ts','surface-actions.test.ts','callable-apps.test.ts','demo-scripts.test.ts','demo-scripts-name-no-seeded-record.test.ts'].map(file => shared + file),
  'tests/ui/one-shell.test.ts',
  'client/src/concept2cure/mdx/hooks/__tests__/useEstarExport.refreshOwner.test.ts',
  ...['sourceAssemblyEntry.test.tsx','sourceDocumentStartChannel.test.tsx','sourceDocumentStartFlow.test.tsx'].map(file => 'client/src/concept2cure/v2/editor/__tests__/' + file),
];
const initial = JSON.parse(readFileSync(`${root}/final-inputs.json`, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const verify = () => {
  const mismatches = Object.entries(initial.files).filter(([path, expected]) => !existsSync(path) || hash(path) !== expected).map(([path]) => path);
  if (mismatches.length) throw new Error(`Qualification inputs changed: ${mismatches.join(', ')}`);
};
verify();
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts', ...tests], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
writeFileSync(`${root}/canonical-tests.txt`, `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
verify();
writeFileSync(`${root}/canonical-test-result.json`, JSON.stringify({ exitCode: result.status, tests, selectedInputsUnchanged: true }, null, 2) + '\n');
process.stdout.write((result.stdout ?? '').slice(-2200));
if (result.status !== 0) process.stderr.write((result.stderr ?? '').slice(-3000));
process.exit(result.status ?? 1);
