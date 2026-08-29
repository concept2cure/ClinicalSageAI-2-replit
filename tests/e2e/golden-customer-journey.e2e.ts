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

test('fixture-free golden journey persists evidence, review, provenance, and governed draft export', async ({
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

  const createdArtifact = await browserApi<any>(
    page,
    'POST',
    `/api/concept2cure/projects/${project.id}/artifacts`,
    {
      type: 'document',
      category: 'document',
      title: JOURNEY.artifactTitle,
      content: 'Synthetic source finding: the test compound requires qualified human assessment.',
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

  // Click the sidebar BUTTON by its accessible name: the bare text locator
  // matched a hidden label node, and a direct URL load bounces back to Home
  // (the shell restores its own state on a cold load).
  await page.getByRole('button', { name: 'Artifacts Center' }).first().click();
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
