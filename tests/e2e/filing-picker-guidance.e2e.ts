import { expect, test } from '@playwright/test';

test('the filing picker shows recorded build facts and hands its question to AnA without sending', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `filing-note-${stamp}@walk.example`;
  const password = `N7!${Math.random().toString(36).slice(2)}#qLm4-Rt`;
  const signup = await page.request.post('/api/auth/signup', {
    data: { email, password, companyName: `Filing note ${stamp}`, industryMode: 'biotech', firstName: 'Filing', lastName: 'Tester' },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  await page.goto('/concept2cure/login');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  const token = await page.evaluate(() => localStorage.getItem('trialsage_access_token'));
  expect(token).toBeTruthy();
  const support = await page.request.get('/api/submissions/market-support?applicationType=ind&market=FDA', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(support.status()).toBe(200);
  const supportBody = await support.json();
  const market = (supportBody.data ?? supportBody).markets[0];
  expect(market.outline.pack.label).toBeTruthy();
  const writes: string[] = [];
  const modelRequests: string[] = [];
  page.on('request', request => {
    if (request.method() !== 'POST') return;
    const path = new URL(request.url()).pathname;
    if (path === '/api/c2c/projects') writes.push(path);
    if (/^\/api\/(ana-ri\/stream|ana\/chat)/.test(path)) modelRequests.push(path);
  });
  const projects = page.locator('section', { has: page.getByRole('heading', { name: 'Your projects' }) });
  await projects.getByRole('button', { name: /^(Create your first project|New project)$/ }).click();
  await page.getByLabel('Search filing types').fill('Application to begin clinical trials');
  await page.getByRole('button', { name: /^Investigational New Drug Application/ }).first().click();
  const note = page.getByTestId('rpk-chosen-offer');
  await expect(note).toContainText('Catalog reference.');
  await expect(note).toContainText('Application to begin clinical trials');
  await expect(note).toContainText('How you’ll build it.');
  await expect(note).toContainText(market.outline.pack.label);
  await expect(note).toContainText(market.outline.pack.version);
  await expect(note).toContainText(market.module1.detail);
  await expect(note).toContainText(market.channel.detail);
  await testInfo.attach('chosen-filing.png', { body: await page.screenshot(), contentType: 'image/png' });
  await note.getByRole('button', { name: 'Ask AnA', exact: true }).click();
  await expect(page).toHaveURL(/conversation-thread/);
  const question = "Tell me about the Investigational New Drug Application — when it's required, what it contains, and what evidence I need.";
  await expect(page.getByRole('textbox', { name: 'Reply to AnA', exact: true })).toHaveValue(question);
  await expect(page.getByRole('button', { name: 'Back to Projects', exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
  expect(modelRequests).toHaveLength(0);
  await testInfo.attach('filing-question-prefill.png', { body: await page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('filing-guidance-result.json', { body: JSON.stringify({ supportStatus: support.status(),
    outlinePack: market.outline.pack, module1State: market.module1.state, channelState: market.channel.state,
    questionPrefilled: true, projectWrites: writes.length, modelRequests: modelRequests.length }, null, 2), contentType: 'application/json' });
});
