/**
 * Phase 11 E2E Test 2: Rollback Flow
 *
 * Tests: create → edit multiple versions → rollback by permitted role → verify new version with old content
 */
import { test, expect } from '@playwright/test';
import { getSeedData, login, authHeaders } from './helpers';

const BASE = '/api/concept2cure';

test.describe('Governed Workflow — Rollback', () => {
  let adminToken: string;
  let reviewerToken: string;
  let seed: ReturnType<typeof getSeedData>;
  let artifactId: string;
  let projectId: number;
  const v1Content = 'Version 1 content for rollback test.';
  const v2Content = 'Version 2 — updated content with additional detail.';

  test.beforeAll(async ({ request }) => {
    seed = getSeedData();
    projectId = seed.projectId;
    adminToken = await login(request, 'admin');
    reviewerToken = await login(request, 'reviewer');
  });

  test('1. Create artifact (v1)', async ({ request }) => {
    const res = await request.post(`${BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(adminToken),
      data: {
        type: 'document',
        category: 'document',
        title: 'E2E Rollback Test Doc',
        content: v1Content,
      },
    });
    expect(res.status()).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    artifactId = json.data.id;
    expect(json.data.version).toBe(1);
  });

  test('2. Edit to create v2', async ({ request }) => {
    const res = await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}`, {
      headers: authHeaders(adminToken),
      data: { content: v2Content },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.version).toBeGreaterThanOrEqual(2);
  });

  test('3. Rollback to v1 (reviewer can rollback)', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/rollback`,
      {
        headers: authHeaders(reviewerToken),
        data: { targetVersion: 1 },
      }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.newVersion).toBeGreaterThanOrEqual(3);
  });

  test('4. Verify current content matches v1 after rollback', async ({ request }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/versions`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    const versions = json.data.versions;
    // Versions are sorted desc by version number; first is latest
    const latest = versions[0];
    expect(latest.content).toContain('Version 1');
  });

  test('5. Version history preserved (no versions deleted)', async ({ request }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/versions`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    const versions = json.data.versions;
    // Must have at least 3: original v1, v2 edit, v3 rollback
    expect(versions.length).toBeGreaterThanOrEqual(3);
  });
});
