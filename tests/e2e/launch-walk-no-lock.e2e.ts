import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Slice 0's evidence walk (.design/client-journey/INFORMATION_ARCHITECTURE.md,
 * section 8, "Slice 0"): a freshly provisioned self-serve organisation, using
 * its own data and never the demo seed, reaches no lock from any rail entry,
 * ⌘K result or door on a project's steps.
 *
 * Run against a server with LAUNCH_SCOPE_ENFORCE=on, as in production; on a
 * server with launch scope off nothing is ever locked and the walk proves
 * nothing, so it refuses to start.
 *
 * Two kinds of lock, kept apart:
 *   - "not in this release" ([data-launch-scope-gate]) is a defect on any
 *     path a client reaches, and fails the walk;
 *   - a licence lock (the unlock dialog, .nav-unlock) is the organisation's
 *     plan, and is recorded, not failed: which modules a self-serve
 *     organisation holds at signup is the map's founder decision 1.
 *
 * Every place visited is attached as walk.json, so the evidence says what was
 * covered, not only that nothing failed.
 */

type Visit = { from: string; via: string; url: string; launchLock: boolean; licenceLock: string | null };

const SEARCHES = ['vault', 'submission', 'readiness', 'protocol', 'cmc', 'quality', 'report', 'task', 'audit', 'ind', 'device', 'label', 'communication'];

/** A door leaves the step and names the place it opens: "… in Vault", "… on the review board". */
const DOOR = /\b(in|on|to)\s+(the\s+)?[A-Z][\w &/().-]*$|\bin the protocol workspace$|^Open\b|^See\b|^Check what stops sending$/;
/** Buttons that change records or open a form; the walk never presses them. */
const NOT_A_DOOR = /^(Assign|Create|Add a market|Delete|Remove|Send|Save|Approve|Sign|Upload|Attach|Revoke|Invite|Start|Run|Generate|Draft|Compile|Export|Download|Work with AnA|Prepare this work with AnA|Ask AnA)/;

async function signUpFreshOrganisation(page: Page, industryMode: 'biotech' | 'medtech') {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `walk-${industryMode}-${stamp}@walk.example`;
  // Independent of the address, name and organisation: the policy refuses a password containing any of them.
  const password = `Qz7!${Math.random().toString(36).slice(2, 10)}#pLm4-Rt`;
  const res = await page.request.post('/api/auth/signup', {
    data: { email, password, companyName: `Walk ${industryMode} ${stamp}`, industryMode, firstName: 'Walk', lastName: 'Tester' },
  });
  expect(res.status(), await res.text()).toBe(201);
  await page.goto('/concept2cure/login');
  await page.locator('input[type="email"], input#email').first().fill(email);
  await page.locator('input[type="password"], input#password').first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

/** The catalog says whether this deployment enforces launch scope; it needs a signed-in organisation. */
async function launchScopeEnforced(page: Page): Promise<boolean | undefined> {
  return page.evaluate(async () => {
    const token = localStorage.getItem('trialsage_access_token');
    const res = await fetch('/api/module-subscriptions/catalog', {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.ok ? (await res.json())?.launchScope?.enforced : undefined;
  });
}

/**
 * The verdicts the rail and ⌘K lock by. With none, nothing is shown locked ("no verdict, no lock",
 * navEntitlements.tsx), so a walk on a server that cannot answer would pass having seen nothing.
 */
async function verdictsReadable(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const token = localStorage.getItem('trialsage_access_token');
    const res = await fetch('/api/module-subscriptions/navigation', {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return -res.status;
    const body = await res.json();
    // resolved=false means the server computed no verdicts: as unusable as a failed read.
    return body?.resolved === true && Array.isArray(body?.surfaces) ? body.surfaces.length : 0;
  });
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
}

async function observe(page: Page, from: string, via: string): Promise<Visit> {
  await settle(page);
  // The unlock panel explains every kind of lock; data-lock-source says which (NavUnlockPanel.tsx).
  const unlock = page.locator('.nav-unlock');
  const panelShown = await unlock.isVisible().catch(() => false);
  const panelSource = panelShown ? await unlock.getAttribute('data-lock-source') : null;
  const panelText = panelShown ? ((await unlock.textContent()) ?? '').replace(/\s+/g, ' ').trim().slice(0, 160) : null;
  if (panelShown) await page.keyboard.press('Escape');
  const licenceLock = panelShown && panelSource !== 'launch-scope' ? panelText : null;
  const launchLock =
    (panelShown && panelSource === 'launch-scope') ||
    (await page.locator('[data-launch-scope-gate]').first().isVisible().catch(() => false));
  const visit = { from, via, url: page.url().replace(/^https?:\/\/[^/]+/, ''), launchLock, licenceLock };
  // One line per place, so a run that stops part-way still says how far it got.
  console.info(`walk: ${from} → ${via} ${visit.url}${launchLock ? ' LAUNCH-LOCK' : ''}${licenceLock ? ' licence' : ''}`);
  return visit;
}

async function railLabels(page: Page): Promise<string[]> {
  return page.locator('nav[aria-label="Primary"] .nav-item').evaluateAll((els) =>
    els.map((el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()));
}

async function walkRail(page: Page, visits: Visit[]) {
  const labels = await railLabels(page);
  for (let i = 0; i < labels.length; i++) {
    await page.locator('nav[aria-label="Primary"] .nav-item').nth(i).click();
    visits.push(await observe(page, 'rail', labels[i]));
  }
}

/** The top bar's search button, as a person opens it; ⌘K is the same toggle. */
async function openPalette(page: Page) {
  if (await page.locator('.cmdk-list').isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: 'Search, jump, or run a command' }).first().click();
  await expect(page.locator('.cmdk-list')).toBeVisible({ timeout: 10_000 });
}

async function typeInPalette(page: Page, term: string) {
  await page.locator('.cmdk-in input').first().fill(term);
}

async function paletteRows(page: Page): Promise<string[]> {
  return page.locator('.cmdk-list button').evaluateAll((els) =>
    els.map((el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()));
}

async function walkPalette(page: Page, visits: Visit[], term: string) {
  await openPalette(page);
  if (term) await typeInPalette(page, term);
  const rows = await paletteRows(page);
  await page.keyboard.press('Escape');
  for (let i = 0; i < rows.length; i++) {
    await openPalette(page);
    if (term) await typeInPalette(page, term);
    const row = page.locator('.cmdk-list button').nth(i);
    if (!(await row.isVisible().catch(() => false))) { await page.keyboard.press('Escape'); continue; }
    await row.click();
    visits.push(await observe(page, term ? `⌘K "${term}"` : '⌘K Jump to', rows[i]));
    await page.keyboard.press('Escape').catch(() => undefined);
  }
}

async function stepDoors(page: Page): Promise<string[]> {
  const names = await page.locator('main button, [role="main"] button').evaluateAll((els) =>
    els.map((el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()));
  return [...new Set(names.filter((n) => n && n.length < 120 && DOOR.test(n) && !NOT_A_DOOR.test(n)))];
}

async function walkProjectSteps(page: Page, visits: Visit[], projectUrl: string) {
  const steps = ['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond'];
  for (const step of steps) {
    await page.goto(projectUrl);
    await settle(page);
    await page.getByRole('button', { name: new RegExp(`^${step}`) }).first().click();
    await settle(page);
    const doors = await stepDoors(page);
    for (const door of doors) {
      await page.goto(projectUrl);
      await settle(page);
      await page.getByRole('button', { name: new RegExp(`^${step}`) }).first().click();
      await settle(page);
      const button = page.getByRole('button', { name: door, exact: true }).first();
      if (!(await button.isVisible().catch(() => false))) continue;
      const before = page.url();
      await button.click();
      await settle(page);
      if (page.url() === before && !(await page.locator('.nav-unlock').isVisible().catch(() => false))) continue;
      visits.push(await observe(page, `project step ${step}`, door));
    }
  }
}

/** Chooses the filing by searching for it, as a person does, so the walk does not depend on which tab opens first. */
async function createFirstProject(page: Page, search: string, filing: RegExp, fill: (p: Page) => Promise<void>) {
  await page.goto('/concept2cure');
  await settle(page);
  const projects = page.locator('section', { has: page.getByRole('heading', { name: 'Your projects' }) });
  await projects.getByRole('button', { name: /^(Create your first project|New project)$/ }).click();
  await page.getByLabel('Search filing types').fill(search);
  await page.getByRole('button', { name: filing }).first().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await fill(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /Create project/ }).click();
  await expect(page).toHaveURL(/project-home/, { timeout: 30_000 });
  return page.url();
}

function report(visits: Visit[]) {
  const launchLocks = visits.filter((v) => v.launchLock);
  const licenceLocks = visits.filter((v) => v.licenceLock);
  return { visited: visits.length, launchLocks, licenceLocks, visits };
}

for (const mode of ['biotech', 'medtech'] as const) {
  test(`a fresh ${mode} organisation reaches no "not in this release" lock from the rail, ⌘K or a project's doors`, async ({ page }, testInfo) => {
    test.setTimeout(900_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signUpFreshOrganisation(page, mode);
    test.skip((await launchScopeEnforced(page)) !== true, 'needs a server with LAUNCH_SCOPE_ENFORCE=on (the walk proves nothing with launch scope off)');
    expect(await verdictsReadable(page), 'the navigation verdicts could not be read before the walk').toBeGreaterThan(0);
    const visits: Visit[] = [];

    await test.step('every rail entry', () => walkRail(page, visits));
    await test.step('⌘K: Jump to, then each search', async () => {
      await page.goto('/concept2cure');
      await settle(page);
      await walkPalette(page, visits, '');
      for (const term of SEARCHES) await walkPalette(page, visits, term);
    });
    await test.step('a first project, and every door on its six steps', async () => {
      const url = mode === 'biotech'
        ? await createFirstProject(page, 'Investigational New Drug', /^Investigational New Drug Application/, async (p) => {
            await p.getByLabel('Project name').fill(`Walk IND ${Date.now().toString(36)}`);
            await p.getByLabel('Product name').fill('WK-101');
            await p.getByLabel('Indication').fill('idiopathic pulmonary fibrosis');
            await p.getByLabel('Product type').selectOption('Drug');
            await p.getByLabel('Target submission date').fill('2027-03-31');
          })
        : await createFirstProject(page, '510(k)', /510\(k\)/, async (p) => {
            await p.getByLabel('Project name').fill(`Walk 510(k) ${Date.now().toString(36)}`);
            await p.getByLabel('Product name').fill('WK-Device');
            await p.getByLabel('Indication').fill('continuous glucose monitoring');
            const type = p.getByLabel('Product type');
            if (await type.isVisible().catch(() => false)) await type.selectOption({ index: 1 }).catch(() => undefined);
            await p.getByLabel('Target submission date').fill('2027-03-31');
          });
      await walkProjectSteps(page, visits, url);
      await test.step('the rail and ⌘K again, with the project open', async () => {
        await walkRail(page, visits);
        await walkPalette(page, visits, '');
      });
    });

    expect(await verdictsReadable(page), 'the navigation verdicts could not be read after the walk').toBeGreaterThan(0);
    const r = report(visits);
    const body = JSON.stringify(r, null, 2);
    await testInfo.attach(`walk-${mode}.json`, { body, contentType: 'application/json' });
    // WALK_EVIDENCE_DIR files the walk beside the slice's evidence (docs/evidence/…/slice0/).
    if (process.env.WALK_EVIDENCE_DIR) {
      fs.mkdirSync(process.env.WALK_EVIDENCE_DIR, { recursive: true });
      fs.writeFileSync(path.join(process.env.WALK_EVIDENCE_DIR, `walk-${mode}.json`), body + '\n');
    }
    expect(r.visited, 'the walk visited nothing: its selectors no longer match the shell').toBeGreaterThan(10);
    expect(r.launchLocks.map((v) => `${v.from} → ${v.via} (${v.url})`)).toEqual([]);
  });
}
