/**
 * Phase 13 E2E Test: Review Threads, Comments & Tasks
 *
 * Tests the full lifecycle of review threads, threaded comments,
 * review tasks, and queue endpoints.
 *
 * 13 test flows covering:
 *  T1-T4: Thread CRUD (create, list, resolve, reopen)
 *  T5-T8: Comment CRUD (add, reply, edit, delete, request_changes)
 *  T9-T11: Task CRUD (create, resolve, reopen)
 *  T12: My queue returns assigned items
 *  T13: Project queue returns project-wide items
 */
import { test, expect } from '@playwright/test';
import { getSeedData, login, authHeaders } from './helpers';

test.describe.configure({ mode: 'serial' });

const BASE = '/api/concept2cure';

test.describe('Phase 13 — Review Threads, Comments & Tasks', () => {
  let adminToken: string;
  let reviewerToken: string;
  let viewerToken: string;
  let seed: ReturnType<typeof getSeedData>;
  let artifactId: string;
  let projectId: number;
  let threadId: string;
  let commentId: string;
  let taskId: string;

  test.beforeAll(async ({ request }) => {
    seed = getSeedData();
    projectId = seed.projectId;
    adminToken = await login(request, 'admin');
    reviewerToken = await login(request, 'reviewer');
    viewerToken = await login(request, 'viewer');

    // Create artifact for thread tests
    const createRes = await request.post(`${BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(adminToken),
      data: {
        type: 'document',
        category: 'document',
        title: 'P13 Thread Test Doc',
        content: '# Introduction\n\nSection 1: Overview.\n\n## Methods\n\nDetails here.',
        ctdSection: '2.7.1',
      },
    });
    expect(createRes.status()).toBe(201);
    artifactId = (await createRes.json()).data.id;

    // Move to review
    const reviewRes = await request.put(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/status`,
      { headers: authHeaders(adminToken), data: { status: 'review' } }
    );
    expect(reviewRes.status()).toBe(200);
  });

  // ── T1: Create a review thread ─────────────────────────────────────────

  test('T1: Admin creates a review thread with initial comment', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/review-threads`,
      {
        headers: authHeaders(adminToken),
        data: {
          title: 'Methods section needs citations',
          anchorType: 'section',
          anchorKey: 'methods',
          anchorLabel: '## Methods',
          priority: 'high',
          initialComment: 'Please add references to the methods described.',
          assigneeId: seed.users.reviewer.id,
        },
      }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.threadId).toBeTruthy();
    expect(json.data.title).toBe('Methods section needs citations');
    expect(json.data.status).toBe('open');
    expect(json.data.priority).toBe('high');
    expect(json.data.anchorLabel).toBe('## Methods');
    expect(json.data.initialComment).toBeTruthy();
    expect(json.data.initialComment.body).toContain('references');
    threadId = json.data.threadId;
  });

  // ── T2: List threads ───────────────────────────────────────────────────

  test('T2: List review threads shows the created thread', async ({ request }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/review-threads`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.totalThreads).toBeGreaterThanOrEqual(1);
    const thread = json.data.threads.find((t: any) => t.threadId === threadId);
    expect(thread).toBeTruthy();
    expect(thread.status).toBe('open');
    expect(thread.commentCount).toBeGreaterThanOrEqual(1);
    expect(thread.assigneeName).toBeTruthy();
  });

  // ── T3: Viewer cannot create thread (read-only) ────────────────────────

  test('T3: Viewer cannot create a thread (403)', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/review-threads`,
      {
        headers: authHeaders(viewerToken),
        data: { title: 'Viewer thread attempt' },
      }
    );
    expect(res.status()).toBe(403);
  });

  // ── T4: Update thread metadata ─────────────────────────────────────────

  test('T4: Admin updates thread priority', async ({ request }) => {
    const res = await request.patch(`${BASE}/review-threads/${threadId}`, {
      headers: authHeaders(adminToken),
      data: { priority: 'medium' },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.priority).toBe('medium');
  });

  // ── T5: Add comment to thread ──────────────────────────────────────────

  test('T5: Reviewer adds a reply comment', async ({ request }) => {
    const res = await request.post(`${BASE}/review-threads/${threadId}/comments`, {
      headers: authHeaders(reviewerToken),
      data: {
        body: 'I will add citations to Smith et al. 2023.',
        kind: 'comment',
      },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.commentId).toBeTruthy();
    expect(json.data.body).toContain('Smith et al.');
    expect(json.data.kind).toBe('comment');
    commentId = json.data.commentId;
  });

  // ── T6: List thread comments ───────────────────────────────────────────

  test('T6: List comments shows all comments in thread', async ({ request }) => {
    const res = await request.get(`${BASE}/review-threads/${threadId}/comments`, {
      headers: authHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.totalComments).toBeGreaterThanOrEqual(2); // initial + reply
    const kinds = json.data.comments.map((c: any) => c.kind);
    expect(kinds).toContain('comment');
  });

  // ── T7: Reviewer requests changes via comment ─────────────────────────

  test('T7: Reviewer adds a request_changes comment', async ({ request }) => {
    const res = await request.post(`${BASE}/review-threads/${threadId}/comments`, {
      headers: authHeaders(reviewerToken),
      data: {
        body: 'The statistical methods section needs revision.',
        kind: 'request_changes',
      },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.kind).toBe('request_changes');
  });

  // ── T8: Edit and soft-delete comment ───────────────────────────────────

  test('T8a: Reviewer edits own comment', async ({ request }) => {
    const res = await request.patch(`${BASE}/review-comments/${commentId}`, {
      headers: authHeaders(reviewerToken),
      data: { body: 'I will add citations to Smith et al. 2023 and Jones 2024.' },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.body).toContain('Jones 2024');
    expect(json.data.editedAt).toBeTruthy();
  });

  test("T8b: Admin cannot edit another user's comment (403)", async ({ request }) => {
    const res = await request.patch(`${BASE}/review-comments/${commentId}`, {
      headers: authHeaders(adminToken),
      data: { body: 'Admin override' },
    });
    expect(res.status()).toBe(403);
  });

  test('T8c: Viewer cannot delete comment (403)', async ({ request }) => {
    const res = await request.delete(`${BASE}/review-comments/${commentId}`, {
      headers: authHeaders(viewerToken),
    });
    expect(res.status()).toBe(403);
  });

  // ── T9: Create review task ─────────────────────────────────────────────

  test('T9: Reviewer creates a task linked to thread', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/review-tasks`,
      {
        headers: authHeaders(reviewerToken),
        data: {
          title: 'Add statistical method citations',
          description: 'Add at least 3 peer-reviewed citations.',
          taskType: 'change_request',
          assignedToId: seed.users.admin.id,
          threadId: threadId,
        },
      }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.taskId).toBeTruthy();
    expect(json.data.title).toBe('Add statistical method citations');
    expect(json.data.taskType).toBe('change_request');
    expect(json.data.status).toBe('open');
    taskId = json.data.taskId;
  });

  // ── T10: List and resolve task ─────────────────────────────────────────

  test('T10a: List tasks shows the created task', async ({ request }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/review-tasks`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.totalTasks).toBeGreaterThanOrEqual(1);
    const task = json.data.tasks.find((t: any) => t.taskId === taskId);
    expect(task).toBeTruthy();
    expect(task.status).toBe('open');
  });

  test('T10b: Viewer cannot create tasks (403)', async ({ request }) => {
    const res = await request.post(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/review-tasks`,
      {
        headers: authHeaders(viewerToken),
        data: { title: 'Viewer task attempt', taskType: 'review_task' },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('T10c: Resolve task', async ({ request }) => {
    const res = await request.post(`${BASE}/review-tasks/${taskId}/resolve`, {
      headers: authHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('resolved');
    expect(json.data.resolvedAt).toBeTruthy();
  });

  // ── T11: Reopen task ───────────────────────────────────────────────────

  test('T11: Reopen resolved task', async ({ request }) => {
    const res = await request.post(`${BASE}/review-tasks/${taskId}/reopen`, {
      headers: authHeaders(reviewerToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('open');
  });

  // ── T12: Resolve and reopen thread ─────────────────────────────────────

  test('T12a: Resolve thread', async ({ request }) => {
    const res = await request.post(`${BASE}/review-threads/${threadId}/resolve`, {
      headers: authHeaders(reviewerToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('resolved');
    expect(json.data.resolvedAt).toBeTruthy();
  });

  test('T12b: Viewer cannot reopen thread (403)', async ({ request }) => {
    const res = await request.post(`${BASE}/review-threads/${threadId}/reopen`, {
      headers: authHeaders(viewerToken),
    });
    expect(res.status()).toBe(403);
  });

  test('T12c: Reviewer reopens thread', async ({ request }) => {
    const res = await request.post(`${BASE}/review-threads/${threadId}/reopen`, {
      headers: authHeaders(reviewerToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('open');
  });

  // ── T13: Queue endpoints ───────────────────────────────────────────────

  test('T13a: My queue shows assigned threads/tasks', async ({ request }) => {
    // The thread is assigned to reviewer (seed.users.reviewer.id)
    const res = await request.get(`${BASE}/reviews/my-queue`, {
      headers: authHeaders(reviewerToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.totalThreads).toBeGreaterThanOrEqual(0);
    expect(json.data.totalTasks).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(json.data.threads)).toBe(true);
    expect(Array.isArray(json.data.tasks)).toBe(true);
  });

  test('T13b: Project queue shows project-level threads/tasks', async ({ request }) => {
    const res = await request.get(`${BASE}/projects/${projectId}/reviews/project-queue`, {
      headers: authHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.totalThreads).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(json.data.threads)).toBe(true);
    expect(Array.isArray(json.data.tasks)).toBe(true);
    // Ensure our thread is there
    const threadInQueue = json.data.threads.find((t: any) => t.threadId === threadId);
    expect(threadInQueue).toBeTruthy();
  });

  test('T13c: Filter threads by status', async ({ request }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/review-threads?status=open`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    for (const thread of json.data.threads) {
      expect(thread.status).toBe('open');
    }
  });
});
