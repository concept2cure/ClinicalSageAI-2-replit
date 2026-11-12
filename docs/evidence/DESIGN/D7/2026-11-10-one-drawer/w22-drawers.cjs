// Walk 22: Quality's dialogs are the product's one drawer (C15). Each opens from the right on the light scrim at z 120,
// as "Raise change request" (C2CForm) does; a disabled primary is grey; at 390 the drawer is full width with 44px actions.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

async function measure(page, label) {
  const m = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].at(-1);
    if (!d) return { open: false };
    const bd = d.parentElement;
    const r = d.getBoundingClientRect();
    const cs = window.getComputedStyle(d);
    const bcs = window.getComputedStyle(bd);
    const primary = d.querySelector('.de-f .de-btn.primary');
    const footer = [...d.querySelectorAll('.de-f button')].map((b) => ({ text: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height) }));
    return {
      open: true, name: d.getAttribute('aria-label'), cls: d.className, backdrop: bd.className, z: bcs.zIndex, scrim: bcs.backgroundColor,
      left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height), bg: cs.backgroundColor,
      title: (d.querySelector('.de-h-t') || {}).textContent || null, sub: (d.querySelector('.de-h-s') || {}).textContent || null,
      footer, primaryDisabled: primary ? primary.disabled : null, primaryOpacity: primary ? window.getComputedStyle(primary).opacity : null,
      viewport: window.innerWidth,
    };
  });
  const { name: dialog, ...rest } = m;
  log.steps.push({ name: label, dialog, ...rest });
  return m;
}

async function openSop(page) {
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
}

async function moreOf(page) {
  const more = page.getByRole('button', { name: /^More actions for / }).first();
  if (await more.getAttribute('aria-expanded') !== 'true') await more.click();
}

async function closeDrawer(page) {
  await page.getByRole('dialog').last().getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForTimeout(400);
}

async function wide(browser) {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  // The reference: Change control's "Raise change request" is C2CForm's drawer.
  await openSop(page);
  await page.getByRole('tab', { name: 'Change control' }).click();
  await page.getByRole('button', { name: /Raise change request/ }).first().click();
  await measure(page, 'reference-raise-change-1440');
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'SOP register' }).click();
  await page.waitForTimeout(800);

  await page.getByRole('region', { name: 'Controlled documents' }).getByRole('button', { name: 'New controlled document' }).click();
  await page.waitForTimeout(1200);
  await measure(page, 'new-document-1440');
  await shot(page, 'w22-new-document-1440', false);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Job roles' }).click();
  await page.waitForTimeout(1200);
  await measure(page, 'job-roles-1440');
  const create = page.getByRole('dialog').getByRole('button', { name: /New job role/ });
  if (await create.count()) {
    await create.click();
    await measure(page, 'job-roles-new-1440');
    await shot(page, 'w22-job-roles-new-1440', false);
  } else {
    await shot(page, 'w22-job-roles-1440', false);
  }
  await closeDrawer(page);

  await moreOf(page);
  await page.getByRole('button', { name: /^Training/ }).first().click();
  await page.waitForTimeout(1200);
  await measure(page, 'training-1440');
  await shot(page, 'w22-training-1440', false);
  await closeDrawer(page);

  await moreOf(page);
  await page.getByRole('button', { name: /^View version history of / }).first().click();
  await page.waitForTimeout(1200);
  await measure(page, 'history-1440');
  await closeDrawer(page);

  const review = page.getByRole('button', { name: /^Record review: / });
  log.steps.push({ name: 'record-review-offered', count: await review.count() });
  if (await review.count()) {
    await review.first().click();
    await measure(page, 'record-review-1440');
    await shot(page, 'w22-record-review-1440', false);
  }
  await ctx.close();
}

async function phone(browser) {
  const { ctx, page } = await signIn(browser, 'approver', 390);
  await openSop(page);
  await page.getByRole('region', { name: 'Controlled documents' }).getByRole('button', { name: 'New controlled document' }).click();
  await page.waitForTimeout(1200);
  await measure(page, 'new-document-390');
  await shot(page, 'w22-new-document-390', false);
  await ctx.close();
}

run('w22-drawers', async (browser) => {
  await wide(browser);
  await phone(browser);
});
