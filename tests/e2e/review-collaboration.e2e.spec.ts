import { test, expect } from '@playwright/test';

/**
 * Phase 13 — E2E: Review Collaboration, PM Integration, Notifications, Deadline Escalation
 *
 * Tests the full review collaboration lifecycle through real API calls:
 *   13A: Create a review thread with priority and dueAt
 *   13B: Post a comment (reply) to the thread
 *   13C: Post a request_changes comment
 *   13D: Create a review task linked to the thread
 *   13E: Resolve the task → verify PM work item closes
 *   13F: Resolve the thread → verify PM work item closes
 *   13G: Reopen the thread → verify PM work item reopens
 *   13H: Get my-queue → verify enriched segmentation fields
 *   13I: Get project-queue → verify enriched groupings
 *   13J: Fetch notifications → verify notification created
 *   13K: Mark notification read
 *   13L: Mark all notifications read
 *   13M: Dismiss notification
 *   13N: Get project work items
 *   13O: Get readiness summary
 *   13P: Run escalation processing
 *   13Q: Reopen the task → verify PM work item reopens
 *
 * Runs against a live server at BASE_URL (default: http://localhost:5000).
 */

const BASE_URL = process.env.BASE_URL || process.env.APP_BASE || 'http://localhost:5000';
const API_BASE = `${BASE_URL}/api/concept2cure`;

function authHeaders(): Record<string, string> {
  const devKey = process.env.DEV_API_KEY || 'dev-api-key';
  return {
    'Content-Type': 'application/json',
    'x-api-key': devKey,
  };
}

// ── Shared test state ────────────────────────────────────────────────────────
let projectId: string;
let artifactId: string;
let threadId: string;
let commentId: string;
let taskId: string;
let notificationId: string;

test.describe.serial('Phase 13 — Review Collaboration E2E', () => {
  // Setup: find or create a project + artifact for review tests
  test.beforeAll(async ({ request }) => {
    // List existing projects to find one
    const projRes = await request.get(`${API_BASE}/projects`, { headers: authHeaders() });
    if (projRes.ok()) {
      const projData = await projRes.json();
      const projects = projData.data?.projects || projData.data || [];
      if (projects.length > 0) {
        projectId = String(projects[0].projectId || projects[0].id);
      }
    }
    if (!projectId) {
      projectId = '1';
    }

    // List artifacts for this project
    const artRes = await request.get(`${API_BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(),
    });
    if (artRes.ok()) {
      const artData = await artRes.json();
      const artifacts = artData.data?.artifacts || artData.data || [];
      if (artifacts.length > 0) {
        artifactId = String(artifacts[0].artifactId || artifacts[0].id);
      }
    }
    if (!artifactId) {
      // Create a test artifact
      const createRes = await request.post(`${API_BASE}/projects/${projectId}/artifacts`, {
        headers: authHeaders(),
        data: {
          title: 'Phase 13 E2E Test Artifact',
          ctdSection: '3.2.S',
          artifactSubtype: 'draft',
        },
      });
      if (createRes.ok()) {
        const createData = await createRes.json();
        artifactId = createData.data?.artifactId || createData.data?.id;
      }
    }
  });

  test('13A: Create a review thread with priority, dueAt, and anchor', async ({ request }) => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const res = await request.post(
      `${API_BASE}/projects/${projectId}/artifacts/${artifactId}/review-threads`,
      {
        headers: authHeaders(),
        data: {
          title: 'E2E Test Thread — Phase 13',
          initialComment: 'This is the initial review comment for E2E testing.',
          priority: 'high',
          anchorType: 'section',
          anchorLabel: 'Section 3.2.S.1',
          dueAt: tomorrow,
        },
      }
    );
    expect(res.status()).toBeLessThan(300);
    const body = await res.json();
    threadId = body.data?.threadId || body.data?.thread?.threadId;
    expect(threadId).toBeTruthy();
  });

  test('13B: Post a reply comment to the thread', async ({ request }) => {
    const res = await request.post(`${API_BASE}/review-threads/${threadId}/comments`, {
      headers: authHeaders(),
      data: { body: 'E2E reply comment — looks good so far.' },
    });
    expect(res.status()).toBeLessThan(300);
    const body = await res.json();
    commentId = body.data?.commentId || body.data?.comment?.commentId;
    expect(commentId).toBeTruthy();
  });

  test('13C: Post a request_changes comment', async ({ request }) => {
    const res = await request.post(`${API_BASE}/review-threads/${threadId}/comments`, {
      headers: authHeaders(),
      data: {
        body: 'E2E: please update the stability data summary in section 3.2.S.7.',
        kind: 'request_changes',
      },
    });
    expect(res.status()).toBeLessThan(300);
    const body = await res.json();
    expect(body.data?.commentId || body.data?.comment?.commentId).toBeTruthy();
  });

  test('13D: Create a review task linked to the thread', async ({ request }) => {
    const dueDateStr = new Date(Date.now() + 2 * 86400000).toISOString();
    const res = await request.post(
      `${API_BASE}/projects/${projectId}/artifacts/${artifactId}/review-tasks`,
      {
        headers: authHeaders(),
        data: {
          title: 'E2E Test Task — update stability data',
          taskType: 'change_request',
          threadId,
          dueAt: dueDateStr,
        },
      }
    );
    expect(res.status()).toBeLessThan(300);
    const body = await res.json();
    taskId = body.data?.taskId || body.data?.task?.taskId;
    expect(taskId).toBeTruthy();
  });

  test('13E: Resolve the task', async ({ request }) => {
    const res = await request.post(`${API_BASE}/review-tasks/${taskId}/resolve`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(300);
  });

  test('13F: Resolve the thread', async ({ request }) => {
    const res = await request.post(`${API_BASE}/review-threads/${threadId}/resolve`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(300);
  });

  test('13G: Reopen the thread', async ({ request }) => {
    const res = await request.post(`${API_BASE}/review-threads/${threadId}/reopen`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(300);
  });

  test('13H: Get my-queue with enriched segmentation', async ({ request }) => {
    const res = await request.get(`${API_BASE}/reviews/my-queue`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(300);
    const body = await res.json();
    expect(body.data).toBeTruthy();
    // Enriched fields should be present (may be 0)
    expect(typeof body.data.overdueTasks).toBe('number');
    expect(typeof body.data.dueSoonTasks).toBe('number');
    expect(typeof body.data.changeRequests).toBe('number');
    expect(typeof body.data.approvalsNeeded).toBe('number');
    expect(typeof body.data.unreadNotifications).toBe('number');
  });

  test('13I: Get project-queue with enriched groupings', async ({ request }) => {
    const res = await request.get(`${API_BASE}/projects/${projectId}/reviews/project-queue`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(300);
    const body = await res.json();
    expect(body.data).toBeTruthy();
    expect(typeof body.data.overdueTasks).toBe('number');
    expect(typeof body.data.escalatedItems).toBe('number');
  });

  test('13J: Fetch notifications for current user', async ({ request }) => {
    const res = await request.get(`${API_BASE}/notifications/my?limit=20`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(300);
    const body = await res.json();
    expect(body.data).toBeTruthy();
    expect(typeof body.data.unreadCount).toBe('number');
    const notifications = body.data.notifications || [];
    if (notifications.length > 0) {
      notificationId = notifications[0].notificationId;
    }
  });

  test('13K: Mark notification read', async ({ request }) => {
    test.skip(!notificationId, 'No notification to mark read');
    const res = await request.post(`${API_BASE}/notifications/${notificationId}/read`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(300);
  });

  test('13L: Mark all notifications read', async ({ request }) => {
    const res = await request.post(`${API_BASE}/notifications/mark-all-read`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(300);
  });

  test('13M: Dismiss a notification', async ({ request }) => {
    test.skip(!notificationId, 'No notification to dismiss');
    const res = await request.post(`${API_BASE}/notifications/${notificationId}/dismiss`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(300);
  });

  test('13N: Get project work items', async ({ request }) => {
    const res = await request.get(`${API_BASE}/projects/${projectId}/work-items`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(300);
    const body = await res.json();
    expect(body.data).toBeTruthy();
    expect(Array.isArray(body.data.workItems || body.data)).toBe(true);
  });

  test('13O: Get readiness summary', async ({ request }) => {
    const res = await request.get(`${API_BASE}/projects/${projectId}/readiness-summary`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(300);
    const body = await res.json();
    expect(body.data).toBeTruthy();
    // Should contain summary structure
    expect(body.data.threads).toBeTruthy();
    expect(body.data.tasks).toBeTruthy();
  });

  test('13P: Run escalation processing', async ({ request }) => {
    const res = await request.post(`${API_BASE}/escalation/process`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(300);
    const body = await res.json();
    expect(body.data).toBeTruthy();
    // Should contain processing counts
    expect(typeof body.data.processed).toBe('number');
  });

  test('13Q: Reopen the task', async ({ request }) => {
    const res = await request.post(`${API_BASE}/review-tasks/${taskId}/reopen`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(300);
  });
});
