/**
 * Record the screen while a CSR build writes its first headings, then open one saved heading to show the result.
 *
 *   node record-drafting.cjs <base-url> <data-dir> [out-dir]
 *
 * Run it in a Codespace with a working model key to record Claude drafting, or against the stand-in provider
 * (../2026-11-10-build-provider-refusals/csr-stand-in.mjs with FAKE_STREAM_MS set) to rehearse. It uses the
 * 2026-11-05 CSR walk's sign-in and state (<data-dir>/csr-demo-state.json), so the project, the approved study files
 * and the frozen study data are the ones post-start.sh prepared. It starts a NEW build each time it runs.
 *
 * The video shows the study's text and tables. Keep it out of the repository: CDISC's terms forbid committing
 * extracts of the pilot data. RECORD_SECONDS sets how long the writing is filmed (default 60).
 */
const path = require('node:path');
const fs = require('node:fs');

const OUT = path.resolve(process.argv[4] || path.join(process.argv[3] || '.', 'csr-drafting-video'));
process.argv[4] = 'prepare';
const { chromium, PEOPLE, loadState, signIn, openCsr, sleep } = require('../../DEMO/2026-11-05-csr-lifecycle/walk-common.cjs');

const SECONDS = Number(process.env.RECORD_SECONDS || 60);

/** Press "Build CSR draft" and film the live view while the build writes. */
async function filmWriting(page, panel) {
  const button = panel.getByRole('button', { name: /Build CSR draft · / });
  await button.scrollIntoViewIfNeeded();
  await sleep(1500);
  await button.click();
  const live = panel.getByText(/^Writing §/).first();
  await live.waitFor({ timeout: 120_000 });
  await live.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.mouse.wheel(0, -60);
  await sleep(SECONDS * 1000);
}

/** The result: a heading that is written and saved, opened in place while the build goes on. */
async function filmResult(panel) {
  const read = panel.getByRole('button', { name: 'Read saved section text' }).first();
  await read.scrollIntoViewIfNeeded();
  await read.click();
  const saved = panel.getByLabel(/^Saved text for §/).first();
  await saved.waitFor({ timeout: 30_000 });
  await saved.scrollIntoViewIfNeeded();
  await sleep(9000);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  loadState();
  const browser = await chromium.launch();
  const filmed = { newContext: (options) => browser.newContext({ ...options, recordVideo: { dir: OUT, size: { width: 1440, height: 900 } } }) };
  try {
    await signIn(filmed, 'author');
    const page = PEOPLE.author.page;
    const panel = await openCsr(page);
    await filmWriting(page, panel);
    await filmResult(panel);
    const video = page.video();
    await page.context().close();
    const file = path.join(OUT, 'csr-drafting.webm');
    fs.renameSync(await video.path(), file);
    console.info(`Recorded ${file} (${Math.round(fs.statSync(file).size / 1024)} KB).`);
  } finally {
    await browser.close();
  }
})();
