import { assert, capture, fillCreation, finishCase, startPage } from './browser-checks.mjs';

async function assertPending(fixture, dialog, out) {
  const { page, state, kind } = fixture;
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.getAttribute('aria-busy') === 'true');
  assert(await dialog.getByRole('button', { name: `Create ${kind}`, exact: true }).isDisabled(), 'Pending Submit is enabled');
  assert(await page.getByRole('button', { name: 'New document', exact: true }).isDisabled(), 'A pending create permits another document');
  assert(await page.getByRole('button', { name: 'New section', exact: true }).isDisabled(), 'A pending create permits another section');
  assert(state.mutations.length === 1, 'Synchronous duplicate clicks issued overlapping POSTs');
  await capture(fixture, out, 'pending');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert(await page.getByRole('dialog').count() === 0, 'Cancel did not close the pending drawer');
  assert(state.mutations.length === 1, 'Cancel repeated the POST');
  await page.waitForFunction(() => document.querySelector('button') !== null);
  assert(state.release, 'Synthetic POST did not reach its explicit release gate');
  state.release();
}

async function assertRecovery(fixture, out) {
  const { page, state, kind } = fixture;
  const label = kind === 'document' ? 'Check working documents' : 'Check document sections';
  const check = page.getByRole('button', { name: label, exact: true });
  await check.waitFor();
  assert(await page.getByRole('button', { name: `New ${kind}`, exact: true }).isDisabled(), 'Unknown outcome permits another POST');
  assert(state.recoveryReads === 0, 'Unknown outcome automatically performed recovery read');
  await capture(fixture, out, 'unconfirmed');
  await check.click();
  await page.getByText(new RegExp(`Could not check ${kind === 'document' ? 'working documents' : 'document sections'}`)).waitFor();
  assert(state.recoveryReads === 1, 'Failed recovery was not one explicit scoped read');
  assert(await page.getByRole('button', { name: `New ${kind}`, exact: true }).isDisabled(), 'Failed read released unknown-outcome guard');
  assert((await page.evaluate(() => window.creationChecks)).length === 0, 'Failed read invoked host refresh');
  await capture(fixture, out, 'failed-scoped-read');
  state.allowRecovery = true;
  await check.click();
  await page.getByText(/Check the refreshed/).waitFor();
  assert(state.recoveryReads === 2, 'Successful recovery was not the second explicit scoped read');
  assert(await page.getByRole('button', { name: `New ${kind}`, exact: true }).isEnabled(), 'Successful scoped read did not release the guard');
  assert(JSON.stringify(await page.evaluate(() => window.creationChecks)) === JSON.stringify([kind]), 'Scoped read did not invoke exact host refresh callback');
  assert(state.mutations.length === 1, 'Recovery automatically repeated the creation');
  assert((await page.evaluate(() => window.creationReceipts)).length === 0, 'Mismatched receipt was adopted');
  await capture(fixture, out, 'successful-scoped-read');
}

export async function runUnknown(browser, config, records, out, kind) {
  const fixture = await startPage(browser, config, records, `${config.label}-unknown`, { kind, mode: 'unknown' });
  return finishCase(fixture, async () => {
    const dialog = await fillCreation(fixture.page, kind, records);
    await dialog.getByRole('button', { name: `Create ${kind}`, exact: true }).evaluate(button => { button.click(); button.click(); });
    await assertPending(fixture, dialog, out);
    await assertRecovery(fixture, out);
  });
}

export async function runHeld(browser, config, records, out) {
  const fixture = await startPage(browser, config, records, `${config.label}-held`, { kind: 'document', mode: 'held' });
  return finishCase(fixture, async () => {
    const { page, state } = fixture;
    assert(await page.getByRole('button', { name: 'New document', exact: true }).isDisabled(), 'Held project permits document creation');
    assert(await page.getByRole('button', { name: 'New section', exact: true }).isDisabled(), 'Held project permits section creation');
    await page.getByText('Finish the project switch before creating a document or section.', { exact: true }).waitFor();
    assert(state.mutations.length === 0, 'Held project caused a mutation');
    await capture(fixture, out, 'held-project');
  });
}
