/**
 * Phase 12 E2E Test: Multi-User Review Operations
 *
 * Tests: reviewer assignment, review decisions, quorum gating, pending dashboard.
 *
 * All responses are wrapped: { success, data }
 * Errors are shaped: { success: false, error: { message } }
 */
import { test, expect } from '@playwright/test';
import { getSeedData, login, authHeaders } from './helpers';

const BASE = '/api/concept2cure';

const ATTESTATION = {
  meaning: 'Approved',
  attestationText: 'I attest this document has been reviewed and is ready for approval',
};

test.describe('P12 — Multi-User Review Operations', () => {
  let adminToken: string;
  let authorToken: string;
  let reviewerToken: string;
  let viewerToken: string;
  let seed: ReturnType<typeof getSeedData>;
  let artifactId: string;
  let projectId: number;

  test.beforeAll(async ({ request }) => {
    seed = getSeedData();
    projectId = seed.projectId;
    adminToken = await login(request, 'admin');
    authorToken = await login(request, 'author');
    reviewerToken = await login(request, 'reviewer');
    viewerToken = await login(request, 'viewer');

    // Create a fresh artifact and move it to review
    const createRes = await request.post(`${BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(adminToken),
      data: {
        type: 'document',
        category: 'document',
        title: 'P12 Multi-Review Test Document',
        content: 'Content for multi-reviewer test.\n\nSection 1: Device Description.',
        ctdSection: '3.2.1',
      },
    });
    expect(createRes.status()).toBe(201);
    const createJson = await createRes.json();
    artifactId = createJson.data.id;

    // Move to review
    const reviewRes = await request.put(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/status`,
      {
        headers: authHeaders(adminToken),
        data: { status: 'review' },
      }
    );
    expect(reviewRes.status()).toBe(200);
    const reviewJson = await reviewRes.json();
    expect(reviewJson.data.status).toBe('review');
  });

  // ────────── Assignment Tests ──────────

  test('1. Viewer cannot assign reviewers (403)', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviewers`,
      {
        headers: authHeaders(viewerToken),
        data: { reviewerIds: [seed.users.reviewer.id] },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('2. Admin assigns 2 reviewers (admin + reviewer)', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviewers`,
      {
        headers: authHeaders(adminToken),
        data: {
          reviewerIds: [seed.users.admin.id, seed.users.reviewer.id],
          notes: 'Please review 510(k) device description',
        },
      }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.assignments).toHaveLength(2);
    expect(json.data.reviewRound).toBeGreaterThanOrEqual(1);
  });

  test('3. List reviewers shows 2 pending assignments', async ({ request }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviewers`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.totalAssignments).toBe(2);
    const pending = json.data.assignments.filter((a: any) => a.status === 'pending');
    expect(pending.length).toBe(2);
  });

  // ────────── Quorum Gating Tests ──────────

  test('4. Approve blocked — 0 of 2 reviewers have decided', async ({ request }) => {
    const res = await request.put(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/status`,
      {
        headers: authHeaders(adminToken),
        data: { status: 'approved', attestation: ATTESTATION },
      }
    );
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.message).toContain('not yet submitted');
  });

  test('5. Reviewer submits approve decision', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviews/submit`,
      {
        headers: authHeaders(reviewerToken),
        data: { decision: 'approve', comment: 'Looks good' },
      }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.decision).toBe('approve');
    expect(json.data.roundSummary.completedCount).toBe(1);
    expect(json.data.roundSummary.pendingCount).toBe(1);
    expect(json.data.roundSummary.readyForApproval).toBe(false);
  });

  test('6. Approve still blocked — 1 of 2 done', async ({ request }) => {
    const res = await request.put(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/status`,
      {
        headers: authHeaders(adminToken),
        data: { status: 'approved', attestation: ATTESTATION },
      }
    );
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.message).toContain('not yet submitted');
  });

  test('7. Admin submits approve decision (2nd reviewer)', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviews/submit`,
      {
        headers: authHeaders(adminToken),
        data: { decision: 'approve', comment: 'Approved by admin reviewer' },
      }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.decision).toBe('approve');
    expect(json.data.roundSummary.completedCount).toBe(2);
    expect(json.data.roundSummary.pendingCount).toBe(0);
    expect(json.data.roundSummary.readyForApproval).toBe(true);
  });

  test('8. Approve now succeeds — all reviewers approved', async ({ request }) => {
    const res = await request.put(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/status`,
      {
        headers: authHeaders(adminToken),
        data: { status: 'approved', attestation: ATTESTATION },
      }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('approved');
  });

  // ────────── Review Status Endpoint ──────────

  test('9. Review status shows all approved', async ({ request }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviews/status`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.artifactStatus).toBe('approved');
    expect(json.data.allApproved).toBe(true);
    expect(json.data.readyForApproval).toBe(true);
    expect(json.data.reviewers).toHaveLength(2);
  });

  // ────────── Duplicate Decision ──────────

  test('10. Duplicate decision returns 403 (no pending)', async ({ request }) => {
    // Regress back to review
    const regress = await request.put(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/status`,
      {
        headers: authHeaders(adminToken),
        data: { status: 'review', reason: 'Testing duplicate decision handling' },
      }
    );
    expect(regress.status()).toBe(200);

    // Old assignment is completed; no pending assignment → 403
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviews/submit`,
      {
        headers: authHeaders(reviewerToken),
        data: { decision: 'approve', comment: 'Trying again' },
      }
    );
    expect(res.status()).toBe(403);
  });

  // ────────── Pending Dashboard ──────────

  test('11. Pending dashboard endpoint works', async ({ request }) => {
    const res = await request.get(`${BASE}/reviews/pending`, {
      headers: authHeaders(reviewerToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(typeof json.data.totalPending).toBe('number');
    expect(Array.isArray(json.data.assignments)).toBe(true);
  });
});
