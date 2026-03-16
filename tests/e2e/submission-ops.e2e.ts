/**
 * Phase 15 E2E Test: Submission Operations Command Center
 *
 * Tests all endpoints under /api/submission-ops/...
 *
 * 21 test flows covering:
 *   SO-1  – SO-3:  Package CRUD (create, list, get detail)
 *   SO-4  – SO-5:  Artifact-section mapping
 *   SO-6  – SO-7:  Milestones (create, list)
 *   SO-8  – SO-10: Policy CRUD (create, resolve, update/delete)
 *   SO-11 – SO-12: Readiness (compute, history)
 *   SO-13 – SO-14: Blockers (list, resolve)
 *   SO-15 – SO-17: Approval bottlenecks, workload, hotspots
 *   SO-18 – SO-19: Automation (trigger sweep, list runs/actions)
 *   SO-20:         Due-soon items
 *   SO-21:         Command center aggregate
 */
import { test, expect } from '@playwright/test';
import { getSeedData, login, authHeaders } from './helpers';

test.describe.configure({ mode: 'serial' });

const BASE = '/api/submission-ops';

test.describe('Phase 15 — Submission Operations Command Center', () => {
  let adminToken: string;
  let seed: ReturnType<typeof getSeedData>;
  let projectId: number;
  let artifactId: number;

  // Shared state across tests
  let packageId: string; // external package UUID (pkg_...)
  let packageDbId: number; // numeric DB id
  let sectionDbId: number; // numeric section DB id
  let sectionId: string; // external section UUID
  let milestoneId: string;
  let policyId: string;
  let blockerId: string | undefined;
  let automationRunId: string | undefined;
  let digestId: string | undefined;

  test.beforeAll(async ({ request }) => {
    seed = getSeedData();
    projectId = seed.projectId;
    artifactId = seed.numericArtifactId;
    adminToken = await login(request, 'admin');
  });

  // ── SO-1: Create a submission package with sections ──────────────────

  test('SO-1: Create a submission package with sections', async ({ request }) => {
    const res = await request.post(`${BASE}/packages`, {
      headers: authHeaders(adminToken),
      data: {
        projectId,
        packageFamily: 'NDA',
        title: 'Phase 15 E2E Test Package',
        description: 'Created by E2E test for submission-ops',
        targetDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        sections: [
          { key: 'm1', label: 'Module 1 — Administrative' },
          { key: 'm2', label: 'Module 2 — Summaries' },
          { key: 'm3', label: 'Module 3 — Quality' },
        ],
      },
    });

    expect(res.status()).toBe(201);
    const json = await res.json();
    expect(json.data).toBeTruthy();
    expect(json.data.packageId).toBeTruthy();
    expect(json.data.packageFamily).toBe('NDA');
    expect(json.data.title).toBe('Phase 15 E2E Test Package');

    packageId = json.data.packageId;
    packageDbId = json.data.id;
  });

  // ── SO-2: List packages for project ──────────────────────────────────

  test('SO-2: List packages for project', async ({ request }) => {
    const res = await request.get(`${BASE}/packages?projectId=${projectId}`, {
      headers: authHeaders(adminToken),
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);

    const found = json.data.find((p: any) => p.packageId === packageId);
    expect(found).toBeTruthy();
    expect(found.title).toBe('Phase 15 E2E Test Package');
  });

  // ── SO-3: Get package detail with sections ───────────────────────────

  test('SO-3: Get package detail with sections', async ({ request }) => {
    const res = await request.get(`${BASE}/packages/${packageId}`, {
      headers: authHeaders(adminToken),
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.packageId).toBe(packageId);
    expect(Array.isArray(json.data.sections)).toBe(true);
    expect(json.data.sections.length).toBe(3);

    // Capture sectionDbId for later tests
    const firstSection = json.data.sections[0];
    sectionDbId = firstSection.id;
    sectionId = firstSection.sectionId;
    expect(firstSection.sectionKey).toBe('m1');
    expect(firstSection.sectionLabel).toBe('Module 1 — Administrative');
  });

  // ── SO-4: Map artifact to section ────────────────────────────────────

  test('SO-4: Map artifact to section', async ({ request }) => {
    const res = await request.post(`${BASE}/artifact-section-map`, {
      headers: authHeaders(adminToken),
      data: {
        artifactId,
        sectionDbId,
        documentFamily: 'regulatory',
        ownerRole: 'author',
        ownerFunction: 'regulatory_affairs',
        ownershipType: 'primary',
      },
    });

    expect(res.status()).toBe(201);
    const json = await res.json();
    expect(json.data).toBeTruthy();
    expect(json.data.artifactId).toBe(artifactId);
    expect(json.data.sectionDbId).toBe(sectionDbId);
  });

  // ── SO-5: List artifacts in section ──────────────────────────────────

  test('SO-5: List artifacts in section', async ({ request }) => {
    const res = await request.get(`${BASE}/sections/${sectionDbId}/artifacts`, {
      headers: authHeaders(adminToken),
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);

    const mapped = json.data.find((m: any) => m.artifactId === artifactId);
    expect(mapped).toBeTruthy();
    expect(mapped.artifact).toBeTruthy();
    expect(mapped.artifact.title).toBeTruthy();
  });

  // ── SO-6: Create milestone with linked sections ──────────────────────

  test('SO-6: Create milestone with linked sections', async ({ request }) => {
    const res = await request.post(`${BASE}/packages/${packageId}/milestones`, {
      headers: authHeaders(adminToken),
      data: {
        title: 'Gate 1 — Module 1 Ready',
        description: 'Module 1 administrative docs complete',
        targetDate: new Date(Date.now() + 14 * 86400000).toISOString(),
        sectionIds: [sectionDbId],
      },
    });

    expect(res.status()).toBe(201);
    const json = await res.json();
    expect(json.data).toBeTruthy();
    expect(json.data.milestoneId).toBeTruthy();
    expect(json.data.title).toBe('Gate 1 — Module 1 Ready');

    milestoneId = json.data.milestoneId;
  });

  // ── SO-7: List milestones ────────────────────────────────────────────

  test('SO-7: List milestones', async ({ request }) => {
    const res = await request.get(`${BASE}/packages/${packageId}/milestones`, {
      headers: authHeaders(adminToken),
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);

    const ms = json.data.find((m: any) => m.milestoneId === milestoneId);
    expect(ms).toBeTruthy();
    expect(ms.title).toBe('Gate 1 — Module 1 Ready');
    // Milestone should have linked sections
    expect(Array.isArray(ms.sections)).toBe(true);
    expect(ms.sections.length).toBeGreaterThanOrEqual(1);
    expect(ms.sections[0].sectionDbId).toBe(sectionDbId);
  });

  // ── SO-8: Create SLA policy ──────────────────────────────────────────

  test('SO-8: Create SLA policy', async ({ request }) => {
    const res = await request.post(`${BASE}/policies`, {
      headers: authHeaders(adminToken),
      data: {
        packageFamily: 'NDA',
        sectionKey: 'm1',
        reviewDueHours: 72,
        dueSoonThresholdHours: 24,
        overdueThresholdHours: 96,
        escalationThresholdHours: 120,
        requiredApprovals: 2,
        blockOnOpenCritical: true,
        requireSectionReadyForGate: true,
        ruleDescription: 'NDA Module 1 review SLA',
        priority: 10,
      },
    });

    expect(res.status()).toBe(201);
    const json = await res.json();
    expect(json.data).toBeTruthy();
    expect(json.data.policyId).toBeTruthy();
    expect(json.data.packageFamily).toBe('NDA');
    expect(json.data.reviewDueHours).toBe(72);
    expect(json.data.requiredApprovals).toBe(2);

    policyId = json.data.policyId;
  });

  // ── SO-9: Resolve effective policy ───────────────────────────────────

  test('SO-9: Resolve effective policy', async ({ request }) => {
    const res = await request.post(`${BASE}/policies/resolve`, {
      headers: authHeaders(adminToken),
      data: {
        packageFamily: 'NDA',
        sectionKey: 'm1',
      },
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data).toBeTruthy();
    // resolved should be the highest-priority matching policy
    expect(json.data.resolved).toBeTruthy();
    // allMatching should be an array
    expect(Array.isArray(json.data.allMatching)).toBe(true);
  });

  // ── SO-10: Update and delete policy ──────────────────────────────────

  test('SO-10: Update and delete policy', async ({ request }) => {
    // Update
    const updateRes = await request.put(`${BASE}/policies/${policyId}`, {
      headers: authHeaders(adminToken),
      data: {
        reviewDueHours: 48,
        ruleDescription: 'Updated NDA Module 1 SLA',
      },
    });

    expect(updateRes.status()).toBe(200);
    const updateJson = await updateRes.json();
    expect(updateJson.data.reviewDueHours).toBe(48);
    expect(updateJson.data.ruleDescription).toBe('Updated NDA Module 1 SLA');

    // Delete
    const deleteRes = await request.delete(`${BASE}/policies/${policyId}`, {
      headers: authHeaders(adminToken),
    });

    expect(deleteRes.status()).toBe(200);
    const deleteJson = await deleteRes.json();
    expect(deleteJson.data.deleted).toBe(true);
  });

  // ── SO-11: Compute package readiness ─────────────────────────────────

  test('SO-11: Compute package readiness', async ({ request }) => {
    const res = await request.get(`${BASE}/packages/${packageId}/readiness`, {
      headers: authHeaders(adminToken),
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data).toBeTruthy();
    // readiness data should have at minimum these structural fields
    expect(typeof json.data).toBe('object');
  });

  // ── SO-12: Get readiness history ─────────────────────────────────────

  test('SO-12: Get readiness history', async ({ request }) => {
    const res = await request.get(`${BASE}/packages/${packageId}/readiness-history?limit=5`, {
      headers: authHeaders(adminToken),
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    // May be empty if no snapshots yet — that's valid
  });

  // ── SO-13: List blockers with filters ────────────────────────────────

  test('SO-13: List blockers with filters', async ({ request }) => {
    // List all open blockers for the project
    const res = await request.get(`${BASE}/blockers?projectId=${projectId}`, {
      headers: authHeaders(adminToken),
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);

    // Also test with status filter
    const resolvedRes = await request.get(
      `${BASE}/blockers?projectId=${projectId}&status=resolved`,
      { headers: authHeaders(adminToken) }
    );
    expect(resolvedRes.status()).toBe(200);

    // Also test with severity filter
    const criticalRes = await request.get(
      `${BASE}/blockers?projectId=${projectId}&severity=critical`,
      { headers: authHeaders(adminToken) }
    );
    expect(criticalRes.status()).toBe(200);

    // Capture a blocker id if any exist for SO-14
    if (json.data.length > 0) {
      blockerId = json.data[0].blockerId;
    }
  });

  // ── SO-14: Resolve a blocker ─────────────────────────────────────────

  test('SO-14: Resolve a blocker', async ({ request }) => {
    if (!blockerId) {
      // No blocker to resolve — still passes (no open blockers is valid state)
      test.skip();
      return;
    }

    const res = await request.patch(`${BASE}/blockers/${blockerId}`, {
      headers: authHeaders(adminToken),
      data: {
        status: 'resolved',
        nextAction: 'No further action required',
      },
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('resolved');
    expect(json.data.resolvedAt).toBeTruthy();
  });

  // ── SO-15: Get approval bottlenecks ──────────────────────────────────

  test('SO-15: Get approval bottlenecks', async ({ request }) => {
    const res = await request.get(`${BASE}/approval-bottlenecks`, {
      headers: authHeaders(adminToken),
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    // Each bottleneck should have key fields if any are present
    if (json.data.length > 0) {
      const b = json.data[0];
      expect(b).toHaveProperty('assignmentId');
      expect(b).toHaveProperty('artifactTitle');
      expect(b).toHaveProperty('waitingHours');
    }
  });

  // ── SO-16: Get team workload ─────────────────────────────────────────

  test('SO-16: Get team workload', async ({ request }) => {
    const res = await request.get(`${BASE}/workload?projectId=${projectId}`, {
      headers: authHeaders(adminToken),
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    // Each entry should have workload fields if any team members have tasks
    if (json.data.length > 0) {
      const w = json.data[0];
      expect(w).toHaveProperty('userId');
      expect(w).toHaveProperty('openTasks');
      expect(w).toHaveProperty('overdueTasks');
      expect(w).toHaveProperty('pendingReviews');
    }
  });

  // ── SO-17: Get section hotspots ──────────────────────────────────────

  test('SO-17: Get section hotspots', async ({ request }) => {
    const res = await request.get(`${BASE}/hotspots?packageId=${packageId}`, {
      headers: authHeaders(adminToken),
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    // Should have one entry per section (we created 3 sections)
    expect(json.data.length).toBe(3);

    const hotspot = json.data[0];
    expect(hotspot).toHaveProperty('sectionId');
    expect(hotspot).toHaveProperty('sectionKey');
    expect(hotspot).toHaveProperty('sectionLabel');
    expect(hotspot).toHaveProperty('totalBlockers');
    expect(hotspot).toHaveProperty('criticalBlockers');
    expect(hotspot).toHaveProperty('heatLevel');
  });

  // ── SO-18: Trigger automation sweep (idempotency) ────────────────────

  test('SO-18: Trigger automation sweep (idempotency)', async ({ request }) => {
    const res = await request.post(`${BASE}/automation/run`, {
      headers: authHeaders(adminToken),
      data: {
        projectId,
        packageDbId,
      },
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data).toBeTruthy();

    // Capture runId if returned
    if (json.data.runId) {
      automationRunId = json.data.runId;
    }

    // Run again to test idempotency — should succeed without error
    const res2 = await request.post(`${BASE}/automation/run`, {
      headers: authHeaders(adminToken),
      data: {
        projectId,
        packageDbId,
      },
    });

    expect(res2.status()).toBe(200);
  });

  // ── SO-19: List automation runs and actions ──────────────────────────

  test('SO-19: List automation runs and actions', async ({ request }) => {
    const runsRes = await request.get(`${BASE}/automation/runs?projectId=${projectId}`, {
      headers: authHeaders(adminToken),
    });

    expect(runsRes.status()).toBe(200);
    const runsJson = await runsRes.json();
    expect(Array.isArray(runsJson.data)).toBe(true);

    // If we have a run from SO-18, fetch its actions
    const runId = automationRunId || (runsJson.data.length > 0 ? runsJson.data[0].runId : null);
    if (runId) {
      const actionsRes = await request.get(`${BASE}/automation/runs/${runId}/actions`, {
        headers: authHeaders(adminToken),
      });

      expect(actionsRes.status()).toBe(200);
      const actionsJson = await actionsRes.json();
      expect(Array.isArray(actionsJson.data)).toBe(true);
    }
  });

  // ── SO-20: Get due-soon items ────────────────────────────────────────

  test('SO-20: Get due-soon items', async ({ request }) => {
    const res = await request.get(`${BASE}/due-soon?projectId=${projectId}`, {
      headers: authHeaders(adminToken),
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data).toBeTruthy();
    expect(json.data).toHaveProperty('threads');
    expect(json.data).toHaveProperty('tasks');
    expect(json.data).toHaveProperty('reviews');
    expect(Array.isArray(json.data.threads)).toBe(true);
    expect(Array.isArray(json.data.tasks)).toBe(true);
    expect(Array.isArray(json.data.reviews)).toBe(true);
  });

  // ── SO-21: Get command center aggregate ──────────────────────────────

  test('SO-21: Get command center aggregate', async ({ request }) => {
    const res = await request.get(`${BASE}/command-center?projectId=${projectId}`, {
      headers: authHeaders(adminToken),
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data).toBeTruthy();
    expect(json.data.projectId).toBe(projectId);
    expect(Array.isArray(json.data.packages)).toBe(true);
    expect(json.data).toHaveProperty('totalOpenBlockers');
    expect(json.data).toHaveProperty('totalOverdue');

    // Our created package should appear in the list
    const found = json.data.packages.find((p: any) => p.packageId === packageId);
    expect(found).toBeTruthy();
    expect(found.title).toBe('Phase 15 E2E Test Package');
  });
});
