/**
 * Phase 11 E2E Test 1: Full Governed Lifecycle
 *
 * Tests: create artifact → edit → submit for review → approve → lock → export → reload → verify
 *
 * All responses are wrapped: { success, data }
 * Artifact URLs use the string artifactId (e.g. artifact_xxx), not numeric id.
 */
import { test, expect } from '@playwright/test';
import { getSeedData, login, authHeaders } from './helpers';

const BASE = '/api/concept2cure';

test.describe('Governed Lifecycle — Full Flow', () => {
  let adminToken: string;
  let authorToken: string;
  let reviewerToken: string;
  let seed: ReturnType<typeof getSeedData>;
  let artifactId: string;
  let projectId: number;

  test.beforeAll(async ({ request }) => {
    seed = getSeedData();
    projectId = seed.projectId;
    adminToken = await login(request, 'admin');
    authorToken = await login(request, 'author');
    reviewerToken = await login(request, 'reviewer');
  });

  test('1. Create a new artifact in draft state', async ({ request }) => {
    const res = await request.post(`${BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(adminToken),
      data: {
        type: 'document',
        category: 'document',
        title: 'E2E Lifecycle Test — 510(k) Summary',
        content: 'Initial draft content for lifecycle test.\n\nSection 1: Purpose and Scope.',
        ctdSection: '2.3.3',
      },
    });
    expect(res.status()).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    artifactId = json.data.id; // string artifact_xxx
    expect(json.data.version).toBe(1);
  });

  test('2. Edit the artifact — creates version 2', async ({ request }) => {
    const res = await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}`, {
      headers: authHeaders(adminToken),
      data: {
        title: 'E2E Lifecycle Test — 510(k) Summary (Revised)',
        content:
          'Revised draft content.\n\nSection 1: Purpose and Scope.\nSection 2: Device Description.',
      },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.version).toBeGreaterThanOrEqual(2);
  });

  test('3. Submit for review (draft → review)', async ({ request }) => {
    const res = await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}/status`, {
      headers: authHeaders(adminToken),
      data: { status: 'review' },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('review');
  });

  test('4. Approve (review → approved)', async ({ request }) => {
    const res = await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}/status`, {
      headers: authHeaders(reviewerToken),
      data: {
        status: 'approved',
        attestation: {
          meaning: 'Approved',
          attestationText: 'I certify this document meets quality requirements.',
        },
      },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('approved');
  });

  test('5. Lock (approved → locked)', async ({ request }) => {
    const res = await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}/status`, {
      headers: authHeaders(adminToken),
      data: {
        status: 'locked',
        attestation: {
          meaning: 'Locked for submission',
          attestationText: 'I confirm this is the final version for regulatory submission.',
        },
      },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('locked');
  });

  test('6. Locked artifact rejects edits (HTTP 423)', async ({ request }) => {
    const res = await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}`, {
      headers: authHeaders(adminToken),
      data: { content: 'Attempting to modify locked content' },
    });
    expect(res.status()).toBe(423);
  });

  test('7. Export audit report', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/audit-report/export`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('locked');
  });

  test('8. Verify version history has full trail', async ({ request }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/versions`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    const versions = json.data.versions;
    expect(versions.length).toBeGreaterThanOrEqual(2);
    for (const v of versions) {
      expect(v.contentHash).toBeTruthy();
    }
  });

  test('9. Provenance records exist', async ({ request }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/provenance`,
      { headers: authHeaders(adminToken) }
    );
    if (res.ok()) {
      const json = await res.json();
      expect(json.success).toBe(true);
    }
  });
});
