/** Reuses the recorded-applicant fixture's actual-Chromium probe and pins. */
import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../../../..'), out = resolve(here, 'result');
mkdirSync(out, { recursive: true });
const paths = [
  'client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx',
  'client/src/concept2cure/v2/surfaces/MarketApplicationNumber.tsx',
  'client/src/concept2cure/v2/surfaces/submissionScopedRead.ts',
  'client/src/concept2cure/v2/dataConnect.tsx', 'client/src/concept2cure/v2/C2CForm.tsx',
  'client/src/services/portal/authService.tsx', 'client/src/lib/queryClient.ts',
  'package.json', 'package-lock.json', 'design-system/colors_and_type.css',
  ...['app-v2.css', 'journey-v2.css', 'coverage-v2.css', 'misc-surfaces-v2.css', 'submission-v2.css', 'surface-text-ramp.css'].map(name => `client/src/concept2cure/v2/styles/${name}`),
  ...['probe.tsx', 'check.mjs', 'index.html', 'server.mjs'].map(name => `docs/evidence/W5/2026-10-23-nonus-release-identity/browser/${name}`),
];
const pins = () => paths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') }));
const before = pins(), checks = [], requests = [], errors = [];
const clear = { cleared: true, blockers: [] };
let mode = 'eligible', region = 'ema';
const refusal = {
  attempted: 'A transmission has already been attempted.',
  inflight: 'A transmission is in flight; release authorization cannot be renewed.',
  unknown: 'The dispatch status is unknown, so renewal is refused.',
};
function assessment() {
  return { sequenceId: 7, region, sequenceStatus: 'dispatched', validationErrors: 0,
    unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 1, shadowReviewMissing: false,
    gate: { cleared: false, blockers: ['The current recorded identity needs a release signature.'] },
    freezeGate: clear, dispatchGateOnSigning: mode === 'gate-blocked' ? { cleared: false, blockers: ['A completed Shadow Review is required.'] } : clear,
    releaseSignature: { required: true, verdict: 'unsigned', cleared: false },
    readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 4,
    ...(mode === 'withheld' || mode === 'unknown-region' ? {} : {
      dispatchAuthorization: { reauthorizing: true, eligible: !refusal[mode], refusal: refusal[mode] ?? null },
    }), signer: { state: mode === 'author' ? 'author' : 'independent' } };
}
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1180 } });
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
const send = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
await page.route('**/api/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
  requests.push({ method, path });
  if (path === '/api/v1/auth/session') return send(route, { authenticated: true, user: {
    id: '9', organizationId: '1', email: 'release@example.test', firstName: 'Synthetic', lastName: 'Reviewer',
    roles: ['author'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false,
  } });
  if (path === '/api/submissions/3/application-number') return send(route, {
    submissionId: 3, home: false, market: region === 'ema' ? 'EU' : region === 'jp' ? 'JP' : null,
    homeAgency: 'FDA', applicationNumber: region === 'ema' ? 'EMEA-H-C-005124' : 'JP-2026-0042',
    lastRecorded: { by: 'Synthetic reviewer', at: '2026-10-23T01:00:00Z', reason: 'Record the agency-assigned synthetic market number' },
  });
  if (path.endsWith('/dispatch-readiness')) {
    return mode === 'outage' ? send(route, { error: { message: 'Synthetic readiness outage' } }, 503) : send(route, { success: true, data: assessment() });
  }
  if (path.endsWith('/governed-precheck')) return send(route, { success: true, data: { step: 'transmit', cleared: false, refusal: 'No synthetic gateway is configured.' } });
  return send(route, []);
});
const renewal = () => page.getByRole('button', { name: 'Re-sign release for current recorded facts (Part 11 e-signature)', exact: true });
async function start(nextRegion, nextMode) {
  region = nextRegion; mode = nextMode;
  await page.goto(`http://127.0.0.1:5198/docs/evidence/W5/2026-10-23-nonus-release-identity/browser/?region=${region}`, { waitUntil: 'networkidle' });
}
async function capture(name) {
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true });
}
try {
  for (const [market, label, number] of [['ema', 'EU', 'EMEA-H-C-005124'], ['jp', 'JP', 'JP-2026-0042']]) {
    await start(market, 'eligible');
    await renewal().waitFor();
    assert.match(await page.getByRole('region', { name: 'Recorded synthetic market number' }).innerText(), new RegExp(number));
    await renewal().click();
    const callback = JSON.parse(await page.getByLabel('Observed dispatch callback').innerText());
    assert.deepEqual(callback, { sequenceId: 7, region: market, action: 'dispatch' });
    await capture(`${label.toLowerCase()}-renewal-reachable`);
    checks.push({ check: `${label} recorded market number and existing governed renewal callback`, passed: true, callback });
  }
  for (const [market, nextMode, expected] of [
    ['ema', 'attempted', refusal.attempted], ['jp', 'inflight', refusal.inflight],
    ['ema', 'unknown', refusal.unknown], ['unknown', 'unknown-region', 'Dispatch gate clear except'],
    ['ema', 'withheld', 'Dispatch gate clear except'], ['jp', 'outage', "Couldn't compute the dispatch gate"],
    ['ema', 'author', 'you cannot re-sign its release'], ['jp', 'gate-blocked', 'Dispatch blocked'],
  ]) {
    await start(market, nextMode);
    await page.getByText(expected, { exact: false }).first().waitFor();
    assert.equal(await renewal().count(), 0, `${market}/${nextMode} offered renewal`);
    assert.equal(await page.getByLabel('Observed dispatch callback').innerText(), '');
    if (['attempted', 'outage', 'unknown-region'].includes(nextMode)) await capture(`${market}-${nextMode}-held`);
    checks.push({ check: `${market}/${nextMode} withholds renewal and callback`, passed: true });
  }
  assert.equal(errors.length, 0, `Browser errors: ${errors.join(', ')}`);
  assert.equal(requests.some(request => /\/actions\/sign|\/transmit$|\/dispatch$/.test(request.path)), false, 'The callback-only fixture must not perform a live sign or wire act.');
  assert.deepEqual(pins(), before, 'Browser source inputs moved during execution.');
  const result = { passed: true, syntheticRecords: true, humanWitnessed: false, liveSignatureExecuted: false,
    liveTransmissionExecuted: false, sourcePins: before, checks, requests, browserErrors: errors };
  writeFileSync(resolve(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} finally { await browser.close(); }
