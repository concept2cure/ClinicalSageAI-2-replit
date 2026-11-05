/**
 * The CSR lifecycle demo on CDISCPILOT01, prepared and walked in the running app the way a person does it
 * (runbook: docs/evidence/D2-CSR/2026-11-02-phase2-demo-walk/README.md, "Demo runbook").
 *
 *   node docs/evidence/DEMO/2026-11-05-csr-lifecycle/walk.cjs <base-url> <data-dir> [prepare|live|all]
 *
 * <data-dir> is OUTSIDE the repository. It holds the ten pilot files fetched by
 * scripts/cre/fetch-cdisc-pilot-adam.mjs and, optionally, cdiscpilot01-efficacy-results.json, the efficacy file the
 * operator transcribes from the published CSR (Tables 14-3.01 and 14-3.02; concept2cure.csr-efficacy-results.v1).
 * The script writes cdiscpilot01-adam-bundle.json (the manifest) and csr-demo-state.json (the ids it created) there.
 * No pilot row or result value is in this file: the manifest below carries the study's title-page metadata and its
 * define.xml declarations, and the datasets are named by the Vault ids and SHA-256 the uploads return.
 *
 * Three people (separation of duties). Environment:
 *   DEMO_AUTHOR_EMAIL    (default jm.smith@concept2cure.pro)   uploads, sends, builds, imports
 *   DEMO_REVIEWER_EMAIL  (default rhea.reviewer@concept2cure.pro) signs reviews
 *   DEMO_APPROVER_EMAIL  (default ava.approver@concept2cure.pro)  approves, approves CSR headings
 *   DEMO_SIGNER_PASSWORD the reviewer's and approver's password (or DEMO_REVIEWER_PASSWORD / DEMO_APPROVER_PASSWORD)
 * Each account signs in once per run with POST /api/auth/dev-login (a local server with dev auth).
 *
 * Re-runnable: each step reads what is already done and skips it. Log: ./walk.json. Screenshots: ./screenshots.
 * DEMO_TAG=<name> writes a separate log (walk-<name>.json) and prefixes its screenshots. DEMO_REBUILD=1 starts a new
 * build when the newest one failed. The steps are in walk-prepare.cjs and walk-live.cjs; shared helpers in walk-common.cjs.
 */
const { chromium, fs, path, DATA, MODE, HERE, TAG, SHOTS, PEOPLE, log, expect, loadState, signIn } = require('./walk-common.cjs');
const { prepare } = require('./walk-prepare.cjs');
const { live } = require('./walk-live.cjs');

(async () => {
  expect(DATA && fs.existsSync(path.join(DATA, 'adsl.xpt')), 'a data directory holding the pilot files (argument 2)');
  fs.mkdirSync(SHOTS, { recursive: true });
  loadState();
  const browser = await chromium.launch();
  try {
    for (const who of Object.keys(PEOPLE)) await signIn(browser, who);
    if (MODE !== 'live') await prepare();
    if (MODE !== 'prepare') await live();
    log.outcome = log.steps.some((s) => s.outcome === 'fail') ? 'failed' : 'passed';
  } catch (err) {
    log.outcome = 'failed';
    log.error = err.message.split('\n')[0];
    console.error(`FAILED: ${log.error}`);
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, TAG ? `walk-${TAG}.json` : 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
    process.exit(log.outcome === 'passed' ? 0 : 1);
  }
})();
