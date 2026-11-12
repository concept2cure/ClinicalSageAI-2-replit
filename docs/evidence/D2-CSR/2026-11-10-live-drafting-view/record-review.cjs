/**
 * Record what follows the drafting: a person sends three drafted headings for review, a second person reads and
 * approves them, the author imports the approved text into the CSR document, and the document shows it.
 *
 *   node record-review.cjs <base-url> <data-dir> [out-dir]
 *
 * It needs a finished build on the prepared CSR study (run record-drafting.cjs or "Build CSR draft" first, and let
 * it finish). The author's screen is filmed; the approver acts in a second, unfilmed browser, as a second person
 * would at their own desk. DEMO_HEADINGS names the headings (default 7,8,9.1). DEMO_BUILD names the build when it is
 * not the newest finished one: a CSR document takes its imported sections from one build, so a document that already
 * holds a build's sections imports from that build only. Keep the video out of the repository.
 */
const path = require('node:path');
const fs = require('node:fs');

const OUT = path.resolve(process.argv[4] || path.join(process.argv[3] || '.', 'csr-review-video'));
process.argv[4] = 'prepare';
const { chromium, PEOPLE, state, loadState, signIn, api, openCsr, sleep, waitFor } = require('../../DEMO/2026-11-05-csr-lifecycle/walk-common.cjs');

const NUMS = (process.env.DEMO_HEADINGS || '7,8,9.1').split(',').map((n) => n.trim()).filter(Boolean);
const row = (panel, num) => panel.locator(`section[aria-label="Section review"] li:has(span.mono:text-is("${num}"))`).first();

async function buildToReview(page) {
  const jobs = (await api(page, 'GET', `/api/csr/jobs?programId=${state.data.programId}&runId=${state.data.studyDataId}`)).body.jobs;
  const done = jobs.find((job) => job.status === 'complete' && (!process.env.DEMO_BUILD || String(job.jobId) === process.env.DEMO_BUILD));
  if (!done) throw new Error('No finished build to review: run a build to its end first.');
  return done.jobId;
}

/** The CSR's build panel with build `jobId` chosen (the panel opens on the newest build). */
async function openBuild(page, jobId) {
  const panel = await openCsr(page);
  const picker = panel.getByLabel('CSR build', { exact: true });
  if (await picker.count()) await picker.selectOption(String(jobId));
  await panel.getByRole('status').filter({ hasText: new RegExp(`^CSR build ${jobId} · `) }).first().waitFor({ timeout: 30_000 });
  return panel;
}
const stateOf = async (page, jobId, num) => (await api(page, 'GET', `/api/csr/jobs/${jobId}/headings`)).body.headings.find((h) => h.num === num)?.state;

/** The author sends each heading for review. */
async function send(panel) {
  for (const num of NUMS) {
    const line = row(panel, num);
    await line.scrollIntoViewIfNeeded();
    const button = line.getByRole('button', { name: /Send for review/ });
    if (await button.count()) { await button.click(); await sleep(1500); }
  }
}

/** The approver reads each heading's saved text, then approves it. */
async function approve(page, jobId) {
  const panel = await openBuild(page, jobId);
  for (const num of NUMS) {
    if (await stateOf(page, jobId, num) !== 'in_review') continue;
    const line = row(panel, num);
    await line.scrollIntoViewIfNeeded();
    await line.getByRole('button', { name: 'Read saved section text' }).click();
    await line.locator(`pre[aria-label="Saved text for §${num}"]`).waitFor({ timeout: 30_000 });
    await line.getByRole('button', { name: /Approve/ }).click();
    await waitFor(async () => (await stateOf(page, jobId, num)) === 'approved', 30_000, 1000);
  }
}

/** The author imports the approved headings into the CSR document. */
async function importApproved(panel) {
  const button = panel.getByRole('button', { name: /Import approved sections into this document/ });
  await button.scrollIntoViewIfNeeded();
  await sleep(1500);
  await button.click();
  const box = panel.locator('section[aria-label="Import into this document"]');
  await box.getByRole('list', { name: 'What the import will do' }).waitFor({ timeout: 120_000 });
  await sleep(3500);
  await box.getByLabel(/Reason for importing/).fill('Approved CSR sections imported into the CSR for medical writing and review.');
  await sleep(1200);
  await box.getByRole('button', { name: 'Import into this document' }).click();
  await box.getByText(/^Imported\. \d+ section\(s\) written into this document\./).waitFor({ timeout: 120_000 });
  await sleep(4000);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  loadState();
  const browser = await chromium.launch();
  const filmed = { newContext: (options) => browser.newContext({ ...options, recordVideo: { dir: OUT, size: { width: 1440, height: 900 } } }) };
  try {
    await signIn(filmed, 'author');
    await signIn(browser, 'approver');
    const page = PEOPLE.author.page;
    const jobId = await buildToReview(page);
    let panel = await openBuild(page, jobId);
    await panel.locator('section[aria-label="Section review"]').scrollIntoViewIfNeeded();
    await sleep(2500);
    await send(panel);
    await approve(PEOPLE.approver.page, jobId);
    panel = await openBuild(page, jobId);
    const first = row(panel, NUMS[0]);
    await first.scrollIntoViewIfNeeded();
    await sleep(2500);
    await importApproved(panel);
    // The document itself: the build panel closed, the first imported heading open in the editor.
    await panel.locator('summary').first().click();
    await sleep(1500);
    await page.locator('main').getByText(/^Introduction$/).filter({ visible: true }).first().click().catch(() => {});
    await sleep(7000);
    await page.screenshot({ path: path.join(OUT, 'frame-document.png') });
    const video = page.video();
    await page.context().close();
    const file = path.join(OUT, 'csr-review-and-import.webm');
    fs.renameSync(await video.path(), file);
    console.info(`Recorded ${file} (${Math.round(fs.statSync(file).size / 1024)} KB).`);
  } finally {
    await browser.close();
  }
})();
