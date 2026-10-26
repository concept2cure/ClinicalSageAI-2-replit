import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const JOURNEY = {
  email: process.env.GOLDEN_JOURNEY_EMAIL ?? 'e2e-author@trialsage.test',
  password: process.env.GOLDEN_JOURNEY_PASSWORD ?? 'Author123!test',
  reviewerEmail: process.env.GOLDEN_JOURNEY_REVIEWER_EMAIL ?? 'e2e-reviewer@trialsage.test',
  reviewerPassword: process.env.GOLDEN_JOURNEY_REVIEWER_PASSWORD ?? 'Reviewer123!test',
  adminEmail: process.env.GOLDEN_JOURNEY_ADMIN_EMAIL ?? 'e2e-admin@trialsage.test',
  adminPassword: process.env.GOLDEN_JOURNEY_ADMIN_PASSWORD ?? 'Admin123!test',
  projectName: 'Synthetic demo — governed evidence draft',
  artifactTitle: 'Synthetic evidence assessment — DRAFT',
  sourceRef: 'synthetic://golden-journey/source-001',
} as const;

async function login(page: Page, email: string, password: string) {
  // The live login is a single-step form (email + password + Sign in). The
  // original helper clicked a 'continue' button from an imagined two-step
  // flow, which does not exist — discovered on this journey's first real
  // browser execution.
  //
  // The retry is for the production login limiter (10 attempts / 15 min per
  // IP), which this journey shares with whatever else drove the same server.
  // Being rate-limited is the limiter working; the journey waits for its
  // window rather than the product relaxing a brute-force control for tests.
  for (let attempt = 1; ; attempt++) {
    await page.goto('/concept2cure/login');
    await page.locator('input[type="email"], input#email').first().fill(email);
    await page.locator('input[type="password"], input#password').first().fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    try {
      await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
      return;
    } catch (err) {
      const limited = await page
        .getByText(/too many login attempts/i)
        .isVisible()
        .catch(() => false);
      if (!limited || attempt >= 3) throw err;
      await page.waitForTimeout(60_000);
    }
  }
}

async function browserApi<T>(
  page: Page,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown
): Promise<{ status: number; headers: Record<string, string>; body: T }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const token = localStorage.getItem('trialsage_access_token');
      const response = await fetch(path, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const headers = Object.fromEntries(response.headers.entries());
      const contentType = response.headers.get('content-type') ?? '';
      const responseBody = contentType.includes('json')
        ? await response.json()
        : { byteLength: (await response.arrayBuffer()).byteLength };
      return { status: response.status, headers, body: responseBody };
    },
    { method, path, body }
  ) as Promise<{ status: number; headers: Record<string, string>; body: T }>;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function payload<T>(response: { body: any }): T {
  return (response.body.data ?? response.body) as T;
}

async function authenticatedPage(
  context: BrowserContext,
  email: string,
  password: string
): Promise<Page> {
  const page = await context.newPage();
  await login(page, email, password);
  return page;
}

test('fixture-free golden journey persists evidence, content edits, review, provenance, and governed draft export', async ({
  browser,
}, testInfo) => {
  // Generous, not arbitrary: this drives three authenticated browser contexts
  // through a dozen governed round-trips, and a CI runner is several times
  // slower than a developer machine. A ceiling that only a hang can reach.
  test.setTimeout(300_000);
  const reviewerContext = await browser.newContext();
  const reviewerPage = await authenticatedPage(
    reviewerContext,
    JOURNEY.reviewerEmail,
    JOURNEY.reviewerPassword
  );
  const reviewerProfile = await browserApi<any>(reviewerPage, 'GET', '/api/auth/me');
  expect(reviewerProfile.status).toBe(200);
  const reviewerId = Number(payload<any>(reviewerProfile).id);
  expect(reviewerId).toBeGreaterThan(0);

  const authorContext = await browser.newContext();
  const page = await authenticatedPage(authorContext, JOURNEY.email, JOURNEY.password);

  const createdProject = await browserApi<any>(page, 'POST', '/api/concept2cure/projects', {
    name: JOURNEY.projectName,
    submissionType: 'IND',
    description: 'Clearly labeled deterministic synthetic browser-test record.',
    product: 'Synthetic compound C2C-001',
  });
  expect(createdProject.status).toBe(201);
  const project = payload<{ id: number }>(createdProject);

  const invalidArtifact = await browserApi(
    page,
    'POST',
    `/api/concept2cure/projects/${project.id}/artifacts`,
    {
      // Valid category on purpose: the invalidity under test must be exactly
      // one thing (empty content), not a category zod rejects first.
      type: 'document',
      category: 'document',
      title: JOURNEY.artifactTitle,
      content: '',
    }
  );
  expect(invalidArtifact.status).toBe(400);

  const createdEvidence = await browserApi<any>(
    page,
    'POST',
    `/api/concept2cure/projects/${project.id}/artifacts`,
    {
      type: 'document',
      category: 'evidence',
      title: 'SYNTHETIC TEST EVIDENCE — source 001',
      content:
        'SYNTHETIC TEST DATA. This is not scientific or regulatory evidence and is for deterministic browser testing only.',
      metadata: { generationMethod: 'manual', synthetic: true, externalRef: JOURNEY.sourceRef },
    }
  );
  expect(createdEvidence.status).toBe(201);
  const evidence = payload<{ id: string }>(createdEvidence);

  const missingEvidenceDraft = await browserApi<any>(
    page,
    'POST',
    `/api/concept2cure/projects/${project.id}/artifacts`,
    {
      type: 'document',
      // 'document', not 'regulatory': the category enum has no 'regulatory',
      // and a schema 400 here would mask the SOURCE_EVIDENCE_NOT_FOUND gate
      // this case exists to prove.
      category: 'document',
      title: JOURNEY.artifactTitle,
      content: 'This write must fail because its asserted evidence does not exist.',
      metadata: {
        generationMethod: 'manual',
        synthetic: true,
        sourceArtifactIds: ['artifact_missing_synthetic_source'],
      },
    }
  );
  expect(missingEvidenceDraft.status).toBe(400);
  expect(JSON.stringify(missingEvidenceDraft.body)).toContain('SOURCE_EVIDENCE_NOT_FOUND');

  const initialContent = 'Synthetic source finding: the test compound requires qualified human assessment.';
  const revisedContent = `${initialContent} Revised synthetic finding: a qualified reviewer must assess the retained source before any regulatory use.`;
  const createdArtifact = await browserApi<any>(
    page,
    'POST',
    `/api/concept2cure/projects/${project.id}/artifacts`,
    {
      type: 'document',
      category: 'document',
      title: JOURNEY.artifactTitle,
      content: initialContent,
      metadata: {
        generationMethod: 'manual',
        synthetic: true,
        sourceArtifactIds: [evidence.id],
      },
    }
  );
  expect(createdArtifact.status).toBe(201);
  const artifact = payload<{ id: string; version: number }>(createdArtifact);
  expect(artifact.version).toBe(1);

  const provenance = await browserApi<any>(
    page,
    'GET',
    `/api/concept2cure/projects/${project.id}/artifacts/${artifact.id}/provenance`
  );
  expect(provenance.status).toBe(200);
  expect(JSON.stringify(payload(provenance))).toContain('human_create');

  // A stale edit must not replace content or leave an orphan version. Recover
  // with the current version through the same authenticated browser session.
  const editPath = `/api/concept2cure/projects/${project.id}/artifacts/${artifact.id}`;
  const rejectedEdit = await browserApi<any>(page, 'PUT', editPath, {
    content: 'REJECTED SYNTHETIC EDIT — must never persist.',
    expectedVersion: artifact.version - 1,
    reason: 'Synthetic stale-version recovery control.',
  });
  expect(rejectedEdit.status).toBe(409);
  expect(rejectedEdit.body.error.code).toBe('VERSION_CONFLICT');
  const unchangedVersions = await browserApi<any>(page, 'GET', `${editPath}/versions`);
  expect(unchangedVersions.status).toBe(200);
  expect(payload<any>(unchangedVersions).currentVersion).toBe(1);
  expect(payload<any>(unchangedVersions).versions).toHaveLength(1);
  expect(payload<any>(unchangedVersions).versions[0].content).toBe(initialContent);

  const edited = await browserApi<any>(page, 'PUT', editPath, {
    content: revisedContent,
    expectedVersion: artifact.version,
    reason: 'Synthetic source-preserving content revision before review.',
  });
  expect(edited.status).toBe(200);
  expect(payload<any>(edited)).toMatchObject({ id: artifact.id, version: 2, content: revisedContent });
  expect(payload<any>(edited).metadata.sourceArtifactIds).toEqual([evidence.id]);

  await page.reload();
  const afterEdit = await browserApi<any>(page, 'GET', `/api/concept2cure/projects/${project.id}/artifacts`);
  expect(afterEdit.status).toBe(200);
  const retainedEdit = payload<Array<{ id: string; version: number; content: string; metadata: { sourceArtifactIds: string[] } }>>(afterEdit)
    .find(row => row.id === artifact.id);
  expect(retainedEdit).toMatchObject({ version: 2, content: revisedContent });
  expect(retainedEdit?.metadata.sourceArtifactIds).toEqual([evidence.id]);

  const editVersions = await browserApi<any>(page, 'GET', `${editPath}/versions`);
  expect(editVersions.status).toBe(200);
  const retainedVersions = payload<any>(editVersions);
  expect(retainedVersions.currentVersion).toBe(2);
  expect(retainedVersions.versions).toHaveLength(2);
  const firstVersion = retainedVersions.versions.find((row: { version: number }) => row.version === 1);
  const secondVersion = retainedVersions.versions.find((row: { version: number }) => row.version === 2);
  expect(firstVersion.content).toBe(initialContent);
  expect(secondVersion.content).toBe(revisedContent);
  expect(secondVersion.contentHash).toMatch(/^[0-9a-f]{64}$/);
  expect(secondVersion.contentHash).not.toBe(firstVersion.contentHash);
  const revisedProvenance = await browserApi<any>(page, 'GET', `${editPath}/provenance`);
  expect(revisedProvenance.status).toBe(200);
  expect(payload<any>(revisedProvenance)).toMatchObject({
    identity: { artifactId: artifact.id, version: 2 },
    editHistory: { currentVersion: 2, totalVersions: 2 },
  });
  expect(payload<any>(revisedProvenance).compliance.versionChain).toEqual(expect.arrayContaining([
    expect.objectContaining({ version: 1, hash: firstVersion.contentHash }),
    expect.objectContaining({ version: 2, hash: secondVersion.contentHash }),
  ]));

  const submitted = await browserApi<any>(
    page,
    'PUT',
    `/api/concept2cure/projects/${project.id}/artifacts/${artifact.id}/status`,
    { status: 'review', reason: 'Synthetic journey: qualified human review requested.' }
  );
  expect(submitted.status).toBe(200);

  const deniedExport = await browserApi<any>(
    page,
    'GET',
    `/api/artifacts-center/${artifact.id}/export?format=docx`
  );
  expect(deniedExport.status).toBe(403);
  expect(JSON.stringify(deniedExport.body)).toContain('HUMAN_REVIEW_REQUIRED');

  // The reviewers route requires role admin/approver/reviewer AND live
  // project access. A reviewer not yet assigned has no project-access row —
  // assignment is what would grant it — so the live model needs the org
  // ADMIN to make the assignment (discovered on this journey's first real
  // execution: the reviewer session 404s exactly as verifyProjectAccess
  // says it should). The decision below still runs as the reviewer, under
  // separation-of-duties.
  const adminContext = await browser.newContext();
  const adminPage = await authenticatedPage(adminContext, JOURNEY.adminEmail, JOURNEY.adminPassword);
  const assignment = await browserApi<any>(
    adminPage,
    'POST',
    `/api/concept2cure/projects/${project.id}/artifacts/${artifact.id}/reviewers`,
    { reviewerIds: [reviewerId], notes: 'Synthetic golden-journey review assignment.' }
  );
  expect(assignment.status).toBe(200);

  const decision = await browserApi<any>(
    reviewerPage,
    'POST',
    `/api/concept2cure/projects/${project.id}/artifacts/${artifact.id}/reviews/submit`,
    { decision: 'approve', comment: 'Synthetic source and citation reviewed for draft export.' }
  );
  expect(decision.status).toBe(200);
  expect(payload<any>(decision).decision).toBe('approve');

  const reviewStatus = await browserApi<any>(
    page,
    'GET',
    `/api/concept2cure/projects/${project.id}/artifacts/${artifact.id}/reviews/status`
  );
  expect(reviewStatus.status).toBe(200);
  expect(JSON.stringify(payload(reviewStatus))).toContain('approve');

  await page.reload();
  const persisted = await browserApi<any>(
    page,
    'GET',
    `/api/concept2cure/projects/${project.id}/artifacts`
  );
  expect(persisted.status).toBe(200);
  expect(JSON.stringify(payload(persisted))).toContain(JOURNEY.artifactTitle);
  expect(JSON.stringify(payload(persisted))).toContain('review');

  // Artifacts center is not a nav place any more (docs/design/ONE_ANA_ONE_CANVAS.md §5;
  // registryModel.ts RAIL_CORE). Open it from the top bar's search, by accessible
  // names: the path client/src/concept2cure/v2/__tests__/shellNav.test.tsx pins. A
  // direct URL load bounces back to Home (the shell restores its own state on a cold load).
  await page.getByRole('button', { name: 'Search, jump, or run a command' }).click();
  await page.getByPlaceholder(/Search surfaces/).fill('Artifacts');
  await page.getByRole('button', { name: /Artifacts center/i }).first().click();
  // Anchor on the row's testid, not the exact title: the listing truncates
  // long titles in the cell text, so an exact-text locator can never match.
  // The governance label is the claim under test and is asserted verbatim.
  const governance = page.getByTestId(`artifact-governance-${artifact.id}`);
  await expect(governance).toBeVisible();
  await expect(governance).toHaveText('1 cited source · Human review recorded');
  await testInfo.attach('golden-journey-after-review.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  const exported = await browserApi<any>(
    page,
    'GET',
    `/api/artifacts-center/${artifact.id}/export?format=docx`
  );
  expect(exported.status).toBe(200);
  expect(exported.headers['x-concept2cure-draft']).toBe('true');
  expect(exported.headers['x-concept2cure-agency-validated']).toBe('false');
  expect(exported.headers['x-concept2cure-human-review-recorded']).toBe('true');
  expect(exported.headers['x-concept2cure-export-authorization']).toBe('persisted-review-decision');

  await testInfo.attach('golden-journey-browser-evidence.json', {
    body: Buffer.from(
      JSON.stringify(
        {
          projectId: project.id,
          evidenceArtifactId: evidence.id,
          artifactId: artifact.id,
          provenance: payload(provenance),
          editedProvenance: payload(revisedProvenance),
          retainedVersions,
          reviewStatus: payload(reviewStatus),
        },
        null,
        2
      )
    ),
    contentType: 'application/json',
  });
  await authorContext.close();
  await reviewerContext.close();
});

/** The New project wizard, as a person fills it: an IND for a drug. */
async function createIndProject(page: Page, projectName: string) {
  await page.getByRole('button', { name: /^Investigational New Drug Application/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Project name').fill(projectName);
  await page.getByLabel('Product name').fill('FS-101');
  await page.getByLabel('Indication').fill('idiopathic pulmonary fibrosis');
  await page.getByLabel('Product type').selectOption('Drug');
  await page.getByLabel('Target submission date').fill('2027-03-31');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /Create project/ }).click();
}

/** The editor's Send for review, to one reviewer, with a reason; returns the dialog showing its outcome. */
async function sendForReview(page: Page, reviewer: string) {
  await page.getByRole('button', { name: 'Send for review' }).click();
  const dialog = page.getByRole('dialog');
  // Offered only when the document's existing review requests were read; a
  // refused read (2026-10-25: the 20-a-minute document bucket) offers no one.
  await expect(dialog.getByLabel(reviewer)).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel(reviewer).check();
  await dialog.getByLabel(/Reason for the request/).fill('Ready for a first review of the profile.');
  await dialog.getByRole('button', { name: 'Send for review' }).click();
  await expect(dialog.getByText(/^Review requested\. The server recorded one request on this document/)).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText(new RegExp(`in ${reviewer}’s My work`))).toBeVisible();
  return dialog;
}

const SYNTHETIC_SOURCE = {
  name: 'fs-101-nonclinical-summary.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from(
    'SYNTHETIC TEST DATA. FS-101 nonclinical summary for a first-session browser test. Not scientific evidence.\n'
  ),
};

/**
 * The first session, driven through the screens a person uses (decision 13 of
 * docs/design/CLIENT_JOURNEY_2026-10-25.md). The regulatory lead of a small
 * biotech signs in, creates an IND project, adds a source, assigns a document
 * of the filing to a person with a due date, starts it from its template, asks
 * AnA to draft it, sends it for review, and sees what is left. Every step is a
 * click or a keystroke on a screen; no step is an API call. The test above
 * proves the governed records; this one proves a person can reach them.
 *
 * No model key is configured where this runs, so the AnA step asserts the
 * hand-off (the request arrives in the conversation, with the document it came
 * from, and the way back to it), not a drafted answer.
 */
test('first session: create an IND project, add a source, assign, draft with AnA, send for review, see what is left', async ({
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await authenticatedPage(context, JOURNEY.adminEmail, JOURNEY.adminPassword);
  const projectName = `FS-${Date.now().toString(36).toUpperCase()} — first session IND`;
  const deliverable = 'Target Product Profile';
  const snap = async (name: string) =>
    testInfo.attach(name, { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });

  await test.step('Home offers a way to start a project', async () => {
    const projects = page.locator('section', { has: page.getByRole('heading', { name: 'Your projects' }) });
    await projects.getByRole('button', { name: /^(Create your first project|New project)$/ }).click();
  });

  await test.step('the wizard creates an IND and the project opens on Plan', async () => {
    await createIndProject(page, projectName);
    await expect(page).toHaveURL(/project-home/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: projectName })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What this IND needs' })).toBeVisible();
    await expect(page.locator('details[data-phase]')).toHaveCount(8);
    await snap('first-session-01-plan.png');
  });

  await test.step('Evidence: a source is added and read', async () => {
    await page.getByRole('button', { name: /^Evidence/ }).first().click();
    await page.getByLabel('Attach files to this project').setInputFiles(SYNTHETIC_SOURCE);
    const dataRoom = page.locator('section', { has: page.getByRole('heading', { name: 'Data room' }) });
    await expect(dataRoom.getByText(/fs-101-nonclinical-summary\.txt.*text extracted/).first()).toBeVisible({ timeout: 30_000 });
    await snap('first-session-02-evidence.png');
  });

  const entryIn = (scope: ReturnType<Page['locator']>) =>
    scope.locator('details', { has: page.locator('> summary', { hasText: new RegExp(`^${deliverable}`) }) }).first();

  await test.step('Plan: the document is assigned to a person with a due date', async () => {
    await page.getByRole('button', { name: /^Plan/ }).first().click();
    const entry = entryIn(page.locator('details[data-phase="phase1"]'));
    await entry.locator('> summary').click();
    await entry.getByRole('button', { name: /^Assign/ }).click();
    const drawer = page.getByRole('dialog');
    await drawer.getByLabel(/Person/).selectOption({ label: 'Admin User' });
    await drawer.getByLabel(/Due date/).fill('2026-12-15');
    await drawer.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(entry.getByTestId('plan-assignment')).toHaveText('Assigned to Admin User, due Dec 15, 2026');
    await snap('first-session-03-assigned.png');
  });

  await test.step('Plan: the document starts from its template, in the editor', async () => {
    const entry = entryIn(page.locator('details[data-phase="phase1"]'));
    await entry.getByRole('button', { name: 'Create from template' }).click();
    await expect(page).toHaveURL(/document-authoring/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: deliverable })).toBeVisible();
  });

  await test.step('AnA: the draft request arrives in the conversation, and leads back', async () => {
    await page.getByRole('button', { name: 'Draft with AnA', exact: true }).first().click();
    await expect(page).toHaveURL(/conversation-thread/);
    await expect(page.locator('textarea').first()).toHaveValue(new RegExp(deliverable));
    await snap('first-session-04-ana.png');
    await page.getByRole('button', { name: /^Back to/ }).first().click();
    await expect(page).toHaveURL(/document-authoring/);
    await expect(page.getByRole('heading', { name: deliverable })).toBeVisible();
  });

  await test.step('the editor saves a revision, with its reason', async () => {
    await page.locator('[contenteditable="true"]').first().click();
    await page.keyboard.type('SYNTHETIC TEST DATA. FS-101 is an oral small molecule for idiopathic pulmonary fibrosis.');
    await page.getByPlaceholder(/Why this changed/).fill('First draft of the product profile.');
    await page.getByTestId('save-section').click();
    await expect(page.getByTestId('save-section')).toHaveText(/Saved/, { timeout: 30_000 });
  });

  await test.step('Send for review: a reviewer is asked, with a reason', async () => {
    const dialog = await sendForReview(page, 'Reviewer User');
    await snap('first-session-05-sent.png');
    await dialog.getByRole('button', { name: 'Done' }).click();
  });

  const named = (title: string) => new RegExp(`^${escapeRegExp(title)}.*${escapeRegExp(projectName)}`);

  await test.step('see what is left: Home lists the assigned document, by project', async () => {
    await page.locator('button.nav-item', { hasText: /^Home$/ }).click();
    const open = page.getByTestId('home-open-items');
    await expect(open.getByRole('button', { name: named(`Prepare: ${deliverable}`) })).toBeVisible({ timeout: 30_000 });
    await snap('first-session-06-home.png');
  });

  await test.step('see what is left: the project shows the document started, assigned and in review', async () => {
    await page.getByTestId('home-projects').getByRole('button', { name: new RegExp(escapeRegExp(projectName)) }).click();
    await expect(page).toHaveURL(/project-home/);
    await expect(page.locator('.pj-lc-stage[data-status="active"]')).toHaveText('Plan');
    const phase1 = page.locator('details[data-phase="phase1"]');
    await expect(phase1.locator('> summary')).toContainText(/\d+ documents · 1 started/);
    await expect(entryIn(phase1).getByTestId('plan-assignment')).toHaveText('Assigned to Admin User, due Dec 15, 2026');
    await page.getByRole('button', { name: /^Review/ }).first().click();
    const reviews = page.locator('section', { has: page.getByRole('heading', { name: 'Reviews' }) });
    await expect(reviews).toContainText(deliverable, { timeout: 30_000 });
    await expect(reviews).toContainText('Reviewer User');
    await snap('first-session-07-review-step.png');
  });
  await context.close();

  await test.step('the reviewer sees the review on their Home, by project', async () => {
    const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const reviewer = await authenticatedPage(reviewerContext, JOURNEY.reviewerEmail, JOURNEY.reviewerPassword);
    const open = reviewer.getByTestId('home-open-items');
    await expect(open.getByRole('button', { name: named(`Review: ${deliverable}`) })).toBeVisible({ timeout: 30_000 });
    await testInfo.attach('first-session-08-reviewer-home.png', { body: await reviewer.screenshot(), contentType: 'image/png' });
    await reviewerContext.close();
  });
});
