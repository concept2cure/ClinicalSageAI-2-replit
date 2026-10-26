import assert from 'node:assert/strict';
import { capture, settle } from './measure.mjs';
import { createState, intercept, sourceRows, DOC, PROGRAM, SOURCE_SELECTORS, positiveBearer } from './positive-api.mjs';
export async function runPositive(browser, viewport, out, launcherOnly = false) {
  const [name, width, height, theme] = viewport;
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 });
  const page = await context.newPage(), state = createState('deterministic'), errors = [], stages = [], headerChecks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/api/authoring/docs') headerChecks.push({ programId: url.searchParams.get('programId'),
      actorMatches: request.headers().authorization === `Bearer ${positiveBearer()}`, organization: request.headers()['x-organization-id'] });
    return intercept(route, state);
  });
  let status = 'pass', error, navigation;
  try {
    await page.goto(`http://127.0.0.1:5216/docs/evidence/D2-EDITOR-LOCAL-JOURNEYS/2026-10-26/browser/positive.html?theme=${theme}`);
    await page.getByRole('button', { name: 'Evidence', exact: true }).click();
    for (const source of sourceRows) await page.getByLabel(`Use ${source.title} as context`, { exact: true }).check();
    const launch = page.getByTestId('data-room-build-selected').getByRole('button', { name: 'Build in editor', exact: true });
    if (launcherOnly) {
      const before = state.requests.length;
      await page.evaluate(() => window.sourceAssemblyRawSwap());
      await launch.click();
      assert.equal(await page.getByTestId('source-assembly-dialog').count(), 0, 'A retained launcher must refuse an unadopted bearer before mounting another chooser');
      assert.equal(state.requests.length, before, 'The retired launcher must not read or dispatch');
      assert.deepEqual(await page.evaluate(() => window.assemblyNavigation), []);
      assert.deepEqual(errors, []); assert.deepEqual(state.unexpected, []);
      stages.push(await capture(page, out, name + '-raw-launcher-refused'));
      return { name, theme, mode: 'actual-catalogue-retired-launcher', status, errors, stages, writes: state.mutations.length };
    }
    await launch.click();
    const dialog = page.getByTestId('source-assembly-dialog');
    await dialog.getByRole('combobox', { name: 'Working document', exact: true }).selectOption(DOC);
    await settle(dialog);
    stages.push(await capture(page, out, name + '-actual-catalogue-chooser'));
    assert.equal(state.mutations.length, 0, 'Actual source selection and chooser use no write');
    await dialog.getByRole('button', { name: 'Open in editor', exact: true }).click();
    await page.locator('.tiptap').filter({ hasText: 'Existing saved stability evidence.' }).waitFor();
    assert.equal(await page.locator('.tiptap').count(), 1, 'Exactly one canonical editor opens');
    navigation = await page.evaluate(() => window.assemblyNavigation);
    assert.equal(navigation.length, 1); assert.equal(navigation[0].target.docId, DOC); assert.equal(navigation[0].target.programId, PROGRAM);
    assert.deepEqual(navigation[0].target.assemblySources.sources, SOURCE_SELECTORS);
    assert.equal(state.mutations.filter(row => row.path.startsWith('/api/authoring/')).length, 0, 'Opening the editor does not build or draft');
    assert.ok(headerChecks.length >= 2 && headerChecks.every(row => row.programId === PROGRAM && row.actorMatches && row.organization === '18'));
    assert.deepEqual(state.unexpected, []); assert.deepEqual(errors, []);
    stages.push(await capture(page, out, name + '-one-editor-opened'));
  } catch (failure) { status = 'fail'; error = failure.message; await page.screenshot({ path: `${out}/${name}-positive-failure.png` }).catch(() => {}); }
  finally { await context.close(); }
  return { name, theme, mode: launcherOnly ? 'actual-catalogue-retired-launcher' : 'actual-catalogue-to-one-editor', status, error, navigation, headerChecks, errors,
    requests: state.requests.map(({ method, path, query }) => ({ method, path, query })), unexpected: state.unexpected,
    authoringWrites: state.mutations.filter(row => row.path.startsWith('/api/authoring/')).length, stages };
}
