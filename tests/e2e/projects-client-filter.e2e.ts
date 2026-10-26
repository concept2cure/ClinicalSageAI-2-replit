import { expect, test } from '@playwright/test';

/** A2.2: real canonical creators + native runtime-role SQL + rendered filter. */
test('the portfolio filters the owning client and the project names that client', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `clients-${stamp}@walk.example`;
  const password = `N7!${Math.random().toString(36).slice(2)}#qLm4-Rt`;
  const signup = await page.request.post('/api/auth/signup', {
    data: { email, password, companyName: `CRO ${stamp}`, industryMode: 'cro', firstName: 'Client', lastName: 'Tester' },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  await page.goto('/concept2cure/login');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  const token = await page.evaluate(() => localStorage.getItem('trialsage_access_token'));
  expect(token).toBeTruthy();
  const headers = { Authorization: `Bearer ${token}` };
  const options = await page.request.get('/api/clients?purpose=project-intake', { headers });
  expect(options.status()).toBe(200);
  const first = (await options.json()).clients[0] as { id: string; name: string };
  expect(first).toBeTruthy();
  const secondResponse = await page.request.post('/api/clients', {
    headers, data: { name: `Client Beta ${stamp}`, slug: `beta-${stamp}` },
  });
  expect(secondResponse.status(), await secondResponse.text()).toBe(200);
  const second = (await secondResponse.json()).client as { id: string; name: string };

  const ids: string[] = [];
  for (const [index, client] of [first, second].entries()) {
    const created = await page.request.post('/api/c2c/projects', {
      headers: { ...headers, 'x-client-id': client.id },
      data: { name: `Client project ${index + 1} ${stamp}`, productName: `CF-${index + 1}-${stamp}`,
        programType: 'ind', productType: 'drug', primaryAgency: 'FDA', indication: 'Synthetic test indication',
        clientWorkspaceId: Number(client.id), targetSubmissionDate: '2027-03-31' },
    });
    expect(created.status(), await created.text()).toBe(201);
    const receipt = await created.json();
    expect(receipt.data.client_workspace_id).toBe(Number(client.id));
    expect(receipt.data.client_name).toBe(client.name);
    ids.push(receipt.data.id);
  }

  await page.goto('/concept2cure/projects');
  const select = page.getByRole('combobox', { name: 'Client', exact: true });
  await expect(select).toBeVisible();
  await expect(page.locator('.pj-card')).toHaveCount(2);
  await select.selectOption(second.id);
  await expect(page.locator('.pj-card')).toHaveCount(1);
  const card = page.locator('.pj-card').first();
  await expect(card).toContainText(`Client project 2 ${stamp}`);
  await testInfo.attach('filtered-portfolio.png', { body: await page.screenshot(), contentType: 'image/png' });
  await card.click();
  await expect(page).toHaveURL(/project-home/);
  await expect(page.locator('dl.pj-fact').filter({ has: page.locator('dt', { hasText: /^Client$/ }) }))
    .toHaveText(`Client${second.name}`);
  await testInfo.attach('project-client.png', { body: await page.screenshot(), contentType: 'image/png' });

  const filtered = await page.request.get(`/api/c2c/projects?clientWorkspaceId=${second.id}&limit=1`, { headers });
  expect(filtered.status()).toBe(200);
  const result = await filtered.json();
  expect(result.data.map((row: { id: string }) => row.id)).toEqual([ids[1]]);
  expect(result.meta.clients.map((client: { id: number }) => client.id).sort((a: number, b: number) => a - b))
    .toEqual([Number(first.id), Number(second.id)].sort((a, b) => a - b));
  await testInfo.attach('client-filter-result.json', {
    body: JSON.stringify({ status: filtered.status(), clientCount: result.meta.clients.length,
      pageCount: result.meta.count, returnedClient: result.data[0].client_name }, null, 2), contentType: 'application/json',
  });
});
