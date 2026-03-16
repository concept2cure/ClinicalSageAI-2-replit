/**
 * Phase 11 E2E Test 3: Permission Enforcement
 *
 * Tests: viewer can't change status, author can't approve, viewer can't rollback,
 *        locked artifact can't be edited
 */
import { test, expect } from '@playwright/test';
import { getSeedData, login, authHeaders } from './helpers';

const BASE = '/api/concept2cure';

test.describe('Permission Enforcement', () => {
  let adminToken: string;
  let authorToken: string;
  let viewerToken: string;
  let seed: ReturnType<typeof getSeedData>;
  let artifactId: string;
  let projectId: number;

  test.beforeAll(async ({ request }) => {
    seed = getSeedData();
    projectId = seed.projectId;
    adminToken = await login(request, 'admin');
    authorToken = await login(request, 'author');
    viewerToken = await login(request, 'viewer');

    // Create a test artifact for permission checks
    const res = await request.post(`${BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(adminToken),
      data: {
        type: 'document',
        category: 'document',
        title: 'E2E Permission Test Doc',
        content: 'Content for permission enforcement testing.',
      },
    });
    const json = await res.json();
    artifactId = json.data.id;
  });

  test('1. Viewer cannot change artifact status (403)', async ({ request }) => {
    const res = await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}/status`, {
      headers: authHeaders(viewerToken),
      data: { status: 'review' },
    });
    expect(res.status()).toBe(403);
  });

  test('2. Author cannot approve (only draft→review allowed)', async ({ request }) => {
    // First move to review as admin
    await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}/status`, {
      headers: authHeaders(adminToken),
      data: { status: 'review' },
    });

    // Author tries to approve — should be denied
    const res = await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}/status`, {
      headers: authHeaders(authorToken),
      data: {
        status: 'approved',
        attestation: { meaning: 'Approved', attestationText: 'Test' },
      },
    });
    expect(res.status()).toBe(403);
  });

  test('3. Viewer cannot rollback (403)', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/rollback`,
      {
        headers: authHeaders(viewerToken),
        data: { targetVersion: 1 },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('4. Locked artifact rejects edits', async ({ request }) => {
    // Move: review → approved → locked
    await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}/status`, {
      headers: authHeaders(adminToken),
      data: {
        status: 'approved',
        attestation: { meaning: 'Approved', attestationText: 'Approving for lock test' },
      },
    });
    await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}/status`, {
      headers: authHeaders(adminToken),
      data: {
        status: 'locked',
        attestation: { meaning: 'Locked', attestationText: 'Locking for test' },
      },
    });

    // Author tries to edit locked doc — 423
    const editRes = await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}`, {
      headers: authHeaders(authorToken),
      data: { content: 'Attempting edit on locked doc' },
    });
    expect(editRes.status()).toBe(423);
  });

  test('5. Locked artifact rejects rollback (423)', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/rollback`,
      {
        headers: authHeaders(adminToken),
        data: { targetVersion: 1 },
      }
    );
    expect(res.status()).toBe(423);
  });
});
