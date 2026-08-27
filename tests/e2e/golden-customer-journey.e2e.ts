import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const JOURNEY = {
  email: process.env.GOLDEN_JOURNEY_EMAIL ?? 'e2e-author@trialsage.test',
  password: process.env.GOLDEN_JOURNEY_PASSWORD ?? 'Author123!test',
  reviewerEmail: process.env.GOLDEN_JOURNEY_REVIEWER_EMAIL ?? 'e2e-reviewer@trialsage.test',
  reviewerPassword: process.env.GOLDEN_JOURNEY_REVIEWER_PASSWORD ?? 'Reviewer123!test',
  projectName: 'Synthetic demo — governed evidence draft',
  artifactTitle: 'Synthetic evidence assessment — DRAFT',
  sourceRef: 'synthetic://golden-journey/source-001',
} as const;

async function login(page: Page, email: string, password: string) {
  await page.goto('/concept2cure/login');
  await page.locator('input[type="email"], input#email').fill(email);
  await page.getByRole('button', { name: /continue/i }).click();
  await page.locator('input[type="password"], input#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
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
  test.setTimeout(120_000);
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
      type: 'document',
      category: 'regulatory',
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
      category: 'regulatory',
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
      category: 'regulatory',
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

  const assignment = await browserApi<any>(
    page,
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

  const artifactsNavigation = page.getByText('Artifacts Center', { exact: true }).first();
  await expect(artifactsNavigation).toBeVisible();
  await artifactsNavigation.click();
  await expect(page.getByText(JOURNEY.artifactTitle, { exact: true })).toBeVisible();
  await expect(page.getByTestId(`artifact-governance-${artifact.id}`)).toHaveText(
    '1 cited source · Human review recorded'
  );
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
