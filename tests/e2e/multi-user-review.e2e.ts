/**
 * Phase 12 E2E Test: Multi-User Review Operations (Enhanced)
 *
 * Tests: reviewer assignment, review decisions, quorum gating, pending dashboard,
 *        withdraw reviewer, self-review prevention, request_changes flow,
 *        review status with no reviewers.
 *
 * All responses are wrapped: { success, data }
 * Errors are shaped: { success: false, error: { message } }
 */
import { test, expect } from '@playwright/test';
import { getSeedData, login, authHeaders } from './helpers';

// Force serial execution to avoid rate-limiting when running alongside other test files
test.describe.configure({ mode: 'serial' });

const BASE = '/api/concept2cure';

const ATTESTATION = {
  meaning: 'Approved',
  attestationText: 'I attest this document has been reviewed and is ready for approval',
};

// ──────────────────────────────────────────────────────────────────────────────
//  T1: Core Multi-Reviewer Lifecycle
// ──────────────────────────────────────────────────────────────────────────────

test.describe('P12-A — Multi-Reviewer Lifecycle', () => {
  let adminToken: string;
  let reviewerToken: string;
  let viewerToken: string;
  let seed: ReturnType<typeof getSeedData>;
  let artifactId: string;
  let projectId: number;

  test.beforeAll(async ({ request }) => {
    seed = getSeedData();
    projectId = seed.projectId;
    adminToken = await login(request, 'admin');
    reviewerToken = await login(request, 'reviewer');
    viewerToken = await login(request, 'viewer');

    // Create artifact (author = admin, id=3) and move to review
    const createRes = await request.post(`${BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(adminToken),
      data: {
        type: 'document',
        category: 'document',
        title: 'P12-A Lifecycle Test',
        content: 'Content for lifecycle test.\n\nSection 1: Device Description.',
        ctdSection: '3.2.1',
      },
    });
    expect(createRes.status()).toBe(201);
    artifactId = (await createRes.json()).data.id;

    const reviewRes = await request.put(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/status`,
      { headers: authHeaders(adminToken), data: { status: 'review' } }
    );
    expect(reviewRes.status()).toBe(200);
  });

  test('1. Viewer cannot assign reviewers (403)', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviewers`,
      { headers: authHeaders(viewerToken), data: { reviewerIds: [seed.users.reviewer.id] } }
    );
    expect(res.status()).toBe(403);
  });

  test('2. Admin assigns reviewer (user 5)', async ({ request }) => {
    // Admin (user 3) is the author — assign only reviewer (user 5)
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviewers`,
      {
        headers: authHeaders(adminToken),
        data: { reviewerIds: [seed.users.reviewer.id], notes: 'Please review' },
      }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.assignments).toHaveLength(1);
    expect(json.data.assignments[0].reviewerId).toBe(seed.users.reviewer.id);
  });

  test('3. List reviewers shows 1 pending assignment with reviewer details', async ({
    request,
  }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviewers`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.totalAssignments).toBe(1);
    expect(json.data.assignments[0].status).toBe('pending');
    expect(json.data.assignments[0].reviewerName).toBeTruthy();
    expect(json.data.assignments[0].reviewerEmail).toBeTruthy();
    expect(json.data.assignments[0].decision).toBeNull();
  });

  test('4. Approve blocked — reviewer has not yet decided', async ({ request }) => {
    const res = await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}/status`, {
      headers: authHeaders(adminToken),
      data: { status: 'approved', attestation: ATTESTATION },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error.message).toContain('not yet submitted');
  });

  test('5. Reviewer submits approve → ready for approval', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviews/submit`,
      { headers: authHeaders(reviewerToken), data: { decision: 'approve', comment: 'LGTM' } }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.decision).toBe('approve');
    expect(json.data.roundSummary.completedCount).toBe(1);
    expect(json.data.roundSummary.readyForApproval).toBe(true);
  });

  test('6. Approve succeeds after all reviewers approved', async ({ request }) => {
    const res = await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}/status`, {
      headers: authHeaders(adminToken),
      data: { status: 'approved', attestation: ATTESTATION },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).data.status).toBe('approved');
  });

  test('7. Review status confirms all approved', async ({ request }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviews/status`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.allApproved).toBe(true);
    expect(json.data.readyForApproval).toBe(true);
    expect(json.data.reviewers).toHaveLength(1);
    expect(json.data.reviewers[0].decision).toBeTruthy();
    expect(json.data.reviewers[0].decision.decision).toBe('approve');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  T2: request_changes + Reject Flow
// ──────────────────────────────────────────────────────────────────────────────

test.describe('P12-B — Request Changes Flow', () => {
  let adminToken: string;
  let reviewerToken: string;
  let seed: ReturnType<typeof getSeedData>;
  let artifactId: string;
  let projectId: number;

  test.beforeAll(async ({ request }) => {
    seed = getSeedData();
    projectId = seed.projectId;
    adminToken = await login(request, 'admin');
    reviewerToken = await login(request, 'reviewer');

    const createRes = await request.post(`${BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(adminToken),
      data: {
        type: 'document',
        category: 'document',
        title: 'P12-B Request Changes Test',
        content: 'Needs review feedback.',
        ctdSection: '2.1',
      },
    });
    expect(createRes.status()).toBe(201);
    artifactId = (await createRes.json()).data.id;

    await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}/status`, {
      headers: authHeaders(adminToken),
      data: { status: 'review' },
    });

    // Assign reviewer
    await request.post(`${BASE}/projects/${projectId}/artifacts/${artifactId}/reviewers`, {
      headers: authHeaders(adminToken),
      data: { reviewerIds: [seed.users.reviewer.id] },
    });
  });

  test('8. Reviewer submits request_changes decision', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviews/submit`,
      {
        headers: authHeaders(reviewerToken),
        data: { decision: 'request_changes', comment: 'Section 2 needs more detail' },
      }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.decision).toBe('request_changes');
    expect(json.data.roundSummary.completedCount).toBe(1);
    expect(json.data.roundSummary.allApproved).toBe(false);
    expect(json.data.roundSummary.readyForApproval).toBe(false);
  });

  test('9. Approve blocked by request_changes decision', async ({ request }) => {
    const res = await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}/status`, {
      headers: authHeaders(adminToken),
      data: { status: 'approved', attestation: ATTESTATION },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error.message).toContain('did not approve');
    expect(json.error.message).toContain('request_changes');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  T3: Withdraw Reviewer + Quorum Adjustment
// ──────────────────────────────────────────────────────────────────────────────

test.describe('P12-C — Withdraw Reviewer', () => {
  let adminToken: string;
  let reviewerToken: string;
  let seed: ReturnType<typeof getSeedData>;
  let artifactId: string;
  let projectId: number;
  let withdrawAssignmentId: string;

  test.beforeAll(async ({ request }) => {
    seed = getSeedData();
    projectId = seed.projectId;
    adminToken = await login(request, 'admin');
    reviewerToken = await login(request, 'reviewer');

    const createRes = await request.post(`${BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(adminToken),
      data: {
        type: 'document',
        category: 'document',
        title: 'P12-C Withdraw Test',
        content: 'Content for withdraw test.',
        ctdSection: '4.1',
      },
    });
    expect(createRes.status()).toBe(201);
    artifactId = (await createRes.json()).data.id;

    await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}/status`, {
      headers: authHeaders(adminToken),
      data: { status: 'review' },
    });

    // Assign both author (id=4) and reviewer (id=5) as reviewers
    const assignRes = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviewers`,
      {
        headers: authHeaders(adminToken),
        data: { reviewerIds: [seed.users.author.id, seed.users.reviewer.id] },
      }
    );
    const assignJson = await assignRes.json();
    // Get the assignment ID for author (we'll withdraw this one)
    const authorAssignment = assignJson.data.assignments.find(
      (a: any) => a.reviewerId === seed.users.author.id
    );
    withdrawAssignmentId = authorAssignment?.assignmentId;
  });

  test('10. Viewer cannot withdraw a reviewer (403)', async ({ request }) => {
    const viewerToken = await login(request, 'viewer');
    const res = await request.delete(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviewers/${withdrawAssignmentId}`,
      { headers: authHeaders(viewerToken) }
    );
    expect(res.status()).toBe(403);
  });

  test('11. Admin withdraws author reviewer', async ({ request }) => {
    const res = await request.delete(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviewers/${withdrawAssignmentId}`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('withdrawn');
    expect(json.data.reviewerId).toBe(seed.users.author.id);
  });

  test('12. Withdrawing again returns 400', async ({ request }) => {
    const res = await request.delete(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviewers/${withdrawAssignmentId}`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(400);
  });

  test('13. After withdraw, only reviewer (user 5) is active — approve after their decision', async ({
    request,
  }) => {
    // Reviewer submits approve
    const submitRes = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviews/submit`,
      { headers: authHeaders(reviewerToken), data: { decision: 'approve', comment: 'Good' } }
    );
    expect(submitRes.status()).toBe(200);
    expect((await submitRes.json()).data.roundSummary.readyForApproval).toBe(true);

    // Approve should now succeed — withdrawn reviewer excluded from quorum
    const approveRes = await request.put(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/status`,
      { headers: authHeaders(adminToken), data: { status: 'approved', attestation: ATTESTATION } }
    );
    expect(approveRes.status()).toBe(200);
    expect((await approveRes.json()).data.status).toBe('approved');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  T4: Self-Review Prevention (GxP Separation of Duties)
// ──────────────────────────────────────────────────────────────────────────────

test.describe('P12-D — Self-Review Prevention', () => {
  let authorToken: string;
  let adminToken: string;
  let seed: ReturnType<typeof getSeedData>;
  let artifactId: string;
  let projectId: number;

  test.beforeAll(async ({ request }) => {
    seed = getSeedData();
    projectId = seed.projectId;
    authorToken = await login(request, 'author');
    adminToken = await login(request, 'admin');

    // Author creates the artifact (createdById = 4)
    const createRes = await request.post(`${BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(authorToken),
      data: {
        type: 'document',
        category: 'document',
        title: 'P12-D Self-Review Prevention Test',
        content: 'Author-created document.',
        ctdSection: '5.1',
      },
    });
    expect(createRes.status()).toBe(201);
    artifactId = (await createRes.json()).data.id;

    await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}/status`, {
      headers: authHeaders(adminToken),
      data: { status: 'review' },
    });
  });

  test('14. Cannot assign author as reviewer of their own artifact', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviewers`,
      {
        headers: authHeaders(adminToken),
        data: { reviewerIds: [seed.users.author.id] },
      }
    );
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error.message).toContain('author cannot be assigned');
  });

  test('15. Non-author reviewer can be assigned normally', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/reviewers`,
      {
        headers: authHeaders(adminToken),
        data: { reviewerIds: [seed.users.reviewer.id] },
      }
    );
    expect(res.status()).toBe(200);
    expect((await res.json()).data.assignments).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  T5: Edge Cases & Dashboard
// ──────────────────────────────────────────────────────────────────────────────

test.describe('P12-E — Edge Cases & Dashboard', () => {
  let adminToken: string;
  let reviewerToken: string;
  let seed: ReturnType<typeof getSeedData>;
  let projectId: number;

  test.beforeAll(async ({ request }) => {
    seed = getSeedData();
    projectId = seed.projectId;
    adminToken = await login(request, 'admin');
    reviewerToken = await login(request, 'reviewer');
  });

  test('16. Review status with no reviewers returns hasReviewers=false', async ({ request }) => {
    // Create artifact with no reviewers assigned
    const createRes = await request.post(`${BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(adminToken),
      data: {
        type: 'document',
        category: 'document',
        title: 'P12-E No Reviewers Test',
        content: 'No reviewers.',
        ctdSection: '6.1',
      },
    });
    const aid = (await createRes.json()).data.id;
    await request.put(`${BASE}/projects/${projectId}/artifacts/${aid}/status`, {
      headers: authHeaders(adminToken),
      data: { status: 'review' },
    });

    const res = await request.get(`${BASE}/projects/${projectId}/artifacts/${aid}/reviews/status`, {
      headers: authHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.hasReviewers).toBe(false);
    expect(json.data.currentRound).toBe(0);
    expect(json.data.readyForApproval).toBe(false);
  });

  test('17. Duplicate assignment returns already_assigned status', async ({ request }) => {
    const createRes = await request.post(`${BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(adminToken),
      data: {
        type: 'document',
        category: 'document',
        title: 'P12-E Duplicate Assign Test',
        content: 'Test dup.',
        ctdSection: '6.2',
      },
    });
    const aid = (await createRes.json()).data.id;
    await request.put(`${BASE}/projects/${projectId}/artifacts/${aid}/status`, {
      headers: authHeaders(adminToken),
      data: { status: 'review' },
    });

    // First assign
    await request.post(`${BASE}/projects/${projectId}/artifacts/${aid}/reviewers`, {
      headers: authHeaders(adminToken),
      data: { reviewerIds: [seed.users.reviewer.id] },
    });

    // Duplicate assign
    const res = await request.post(`${BASE}/projects/${projectId}/artifacts/${aid}/reviewers`, {
      headers: authHeaders(adminToken),
      data: { reviewerIds: [seed.users.reviewer.id] },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.assignments[0].status).toBe('already_assigned');
  });

  test('18. Pending dashboard returns only in-review artifacts', async ({ request }) => {
    const res = await request.get(`${BASE}/reviews/pending`, {
      headers: authHeaders(reviewerToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(typeof json.data.totalPending).toBe('number');
    // All returned assignments should be for in-review artifacts
    for (const a of json.data.assignments) {
      expect(a.artifactStatus).toBe('review');
    }
  });

  test('19. Invalid reviewer IDs rejected', async ({ request }) => {
    const createRes = await request.post(`${BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(adminToken),
      data: {
        type: 'document',
        category: 'document',
        title: 'P12-E Invalid IDs Test',
        content: 'Validation test.',
        ctdSection: '6.3',
      },
    });
    const aid = (await createRes.json()).data.id;
    await request.put(`${BASE}/projects/${projectId}/artifacts/${aid}/status`, {
      headers: authHeaders(adminToken),
      data: { status: 'review' },
    });

    // Non-existent user
    const res = await request.post(`${BASE}/projects/${projectId}/artifacts/${aid}/reviewers`, {
      headers: authHeaders(adminToken),
      data: { reviewerIds: [99999] },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.message).toContain('not in organization');
  });

  test('20. Completed assignment cannot be withdrawn', async ({ request }) => {
    const createRes = await request.post(`${BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(adminToken),
      data: {
        type: 'document',
        category: 'document',
        title: 'P12-E Cannot Withdraw Completed',
        content: 'Test completed assignment.',
        ctdSection: '6.4',
      },
    });
    const aid = (await createRes.json()).data.id;
    await request.put(`${BASE}/projects/${projectId}/artifacts/${aid}/status`, {
      headers: authHeaders(adminToken),
      data: { status: 'review' },
    });

    const assignRes = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${aid}/reviewers`,
      {
        headers: authHeaders(adminToken),
        data: { reviewerIds: [seed.users.reviewer.id] },
      }
    );
    const assignId = (await assignRes.json()).data.assignments[0].assignmentId;

    // Submit decision
    await request.post(`${BASE}/projects/${projectId}/artifacts/${aid}/reviews/submit`, {
      headers: authHeaders(reviewerToken),
      data: { decision: 'approve', comment: 'Approved' },
    });

    // Try to withdraw completed assignment
    const res = await request.delete(
      `${BASE}/projects/${projectId}/artifacts/${aid}/reviewers/${assignId}`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(400);
    expect((await res.json()).error.message).toContain('completed');
  });
});
