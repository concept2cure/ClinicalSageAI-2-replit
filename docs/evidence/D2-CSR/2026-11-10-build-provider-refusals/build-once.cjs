/**
 * Start one CSR build from the CSR document's "Build from the study's data" panel, wait for it to end, and record
 * what the build card says. Run against an app whose provider is the strict stand-in (csr-stand-in.mjs), once per
 * provider behaviour (FAKE_FAIL=credit|auth|model, FAKE_RPM=n, or none).
 *
 *   node build-once.cjs <base-url> <data-dir> <label>
 *
 * It reuses the 2026-11-05 CSR walk's sign-in and editor helpers and its state file (<data-dir>/csr-demo-state.json),
 * so the project, the approved study files and the frozen study data are the ones that walk prepared.
 * The screenshot is of the build card only: no study table or narrative is in it.
 */
const path = require('node:path');
const fs = require('node:fs');
const label = process.argv[4] || 'build';
process.argv[4] = 'prepare';
const common = require('../../DEMO/2026-11-05-csr-lifecycle/walk-common.cjs');
const { chromium, PEOPLE, state, loadState, signIn, api, openCsr, waitFor } = common;

(async () => {
  loadState();
  const browser = await chromium.launch();
  const out = { label, startedAt: new Date().toISOString() };
  try {
    await signIn(browser, 'author');
    const page = PEOPLE.author.page;
    const builds = async () => (await api(page, 'GET', `/api/csr/jobs?programId=${state.data.programId}&runId=${state.data.studyDataId}`)).body.jobs;
    const before = (await builds())[0]?.jobId ?? 0;
    const panel = await openCsr(page);
    const button = panel.getByRole('button', { name: /Build CSR draft · / });
    await button.waitFor({ timeout: 60_000 });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await panel.getByText(/CSR build \d+ is queued/).waitFor({ timeout: 60_000 });
    const t0 = Date.now();
    const job = await waitFor(async () => {
      const newest = (await builds())[0];
      return newest && newest.jobId !== before && ['complete', 'completed', 'failed', 'cancelled'].includes(newest.status) ? newest : null;
    }, Number(process.env.BUILD_WAIT_MS || 30 * 60_000), 5_000);
    Object.assign(out, { jobId: job?.jobId, status: job?.status, progress: job?.progress, failure: job?.failure ?? null, waitedMs: Date.now() - t0 });
    // The selected build's own line: its picker row and, for a failed build, the sentence under it (role="alert").
    const again = await openCsr(page);
    const picker = again.getByText('CSR builds from this study data').first();
    await picker.scrollIntoViewIfNeeded().catch(() => {});
    const alert = again.getByRole('alert').filter({ hasText: /build|drafted|saved|provider|model|rate limit/i }).first();
    out.onScreen = job?.status === 'failed' ? (await alert.innerText({ timeout: 20_000 }).catch(() => null)) : null;
    const shot = path.join(__dirname, 'screens', `${label}.png`);
    const top = await picker.boundingBox();
    const bottom = out.onScreen ? await alert.boundingBox() : top;
    if (top && bottom) {
      await page.screenshot({ path: shot, clip: { x: Math.max(0, Math.min(top.x, bottom.x) - 12), y: Math.max(0, top.y - 12),
        width: 980, height: Math.min(400, bottom.y + bottom.height - top.y + 24) } });
    }
    out.screenshot = fs.existsSync(shot) ? `screens/${label}.png` : null;
  } catch (err) {
    out.error = String(err.message).split('\n')[0];
  } finally {
    out.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(__dirname, `build-${label}.json`), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    await browser.close();
  }
})();
