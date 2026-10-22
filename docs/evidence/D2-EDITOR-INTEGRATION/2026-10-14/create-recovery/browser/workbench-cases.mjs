import { assert, capture, fillCreation, finishCase, startPage } from './browser-checks.mjs';

async function waitNative(page, records) {
  await page.locator('.ProseMirror').waitFor();
  await page.waitForFunction(id => window.creationBridge?.sectionId === id, records.section.id);
  assert(await page.locator('.ProseMirror').innerText() === records.section.content.replace(/<[^>]*>/g, ''), 'Native saved text mismatch');
  await page.locator('.ProseMirror').fill('Synthetic unsaved paragraph held while creation completes.');
  await page.getByTestId('change-reason').waitFor();
}

async function cancelAndRetry(fixture, out) {
  const { page, kind, state } = fixture;
  const guard = page.getByRole('alertdialog');
  await guard.waitFor();
  assert(state.mutations.length === 1, 'Exact confirmed creation issued more than one POST');
  assert((await page.evaluate(() => window.creationNavigation)).length === 0, 'Created document bypassed the dirty-work guard');
  await capture(fixture, out, 'created-leave-held');
  await guard.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert(await page.locator('.ProseMirror').innerText() === 'Synthetic unsaved paragraph held while creation completes.', 'Cancel lost unsaved text');
  await page.getByRole('button', { name: `Open created ${kind}`, exact: true }).click();
  await guard.waitFor();
  await guard.getByRole('button', { name: 'Leave without saving', exact: true }).click();
  assert(state.mutations.length === 1, 'Open created receipt repeated a POST or saved without permission');
}

async function assertOpened(fixture, records, out) {
  const { page, kind } = fixture;
  if (kind === 'document') {
    await page.waitForFunction(() => window.creationNavigation.length === 1);
    const navigation = await page.evaluate(() => window.creationNavigation[0]);
    assert(navigation.route === 'document-authoring' && navigation.target?.docId === records.createdDocument.id
      && navigation.target?.programId === records.program.id, 'Created document handoff lost the exact returned ID/project');
    await capture(fixture, out, 'exact-document-handoff', { nativeEditor: true });
  } else {
    await page.waitForFunction(id => window.creationBridge?.sectionId === id, records.createdSection.id);
    await page.waitForFunction(() => document.querySelector('.ProseMirror')?.textContent === '');
    assert(await page.locator('.ProseMirror').textContent() === '', 'Created section did not open with its empty recorded content');
    await capture(fixture, out, 'exact-created-section', { nativeEditor: true });
  }
}

export async function runWorkbench(browser, config, records, out, kind) {
  const fixture = await startPage(browser, config, records, `${config.label}-native`, { kind, mode: 'workbench' });
  return finishCase(fixture, async () => {
    const { page, state } = fixture;
    await waitNative(page, records);
    const dialog = await fillCreation(page, kind, records);
    await dialog.getByRole('button', { name: `Create ${kind}`, exact: true }).click();
    await cancelAndRetry(fixture, out);
    await assertOpened(fixture, records, out);
    assert(state.mutations.length === 1, 'The native handoff performed an extra write');
  });
}
