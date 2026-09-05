/**
 * Domains move out of routes/concept2cure.ts into routes/c2c/*.ts one at a time
 * (ledger L53). Every router mounts at /api/concept2cure, so a split is only
 * safe if each moved path is answered by exactly one of them: a path left
 * behind in the main router would shadow or double-register, and a path lost
 * in the move would 404 where a client expects it.
 *
 * Read from the routers' own layer stacks — the registration is the fact.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../db', () => ({ db: {}, pool: {} }));
vi.mock('../../../middleware/redisRateLimiter', () => ({ createRedisRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next() }));


type Layer = { route?: { path: string; methods: Record<string, boolean> } };
const registered = (router: { stack: Layer[] }) =>
  router.stack
    .filter((l) => l.route)
    .flatMap((l) => Object.keys(l.route!.methods).map((m) => `${m.toUpperCase()} ${l.route!.path}`));

const REVIEW_PATHS = [
  'PATCH /review-threads/:threadId',
  'POST /review-threads/:threadId/resolve',
  'POST /review-threads/:threadId/reopen',
  'GET /review-threads/:threadId/comments',
  'POST /review-threads/:threadId/comments',
  'PATCH /review-comments/:commentId',
  'DELETE /review-comments/:commentId',
  'PATCH /review-tasks/:taskId',
  'POST /review-tasks/:taskId/resolve',
  'POST /review-tasks/:taskId/reopen',
  'GET /reviews/my-queue',
  'GET /projects/:projectId/reviews/project-queue',
  'GET /projects/:projectId/review-pulse',
];

describe('review routes live in one router', () => {
  it('the reviews router answers every review path, and the main router none of them', async () => {
    const reviews = (await import('../reviews')).default as unknown as { stack: Layer[] };
    const main = (await import('../../concept2cure')).default as unknown as { stack: Layer[] };
    const inReviews = new Set(registered(reviews));
    const inMain = new Set(registered(main));
    for (const p of REVIEW_PATHS) {
      expect(inReviews.has(p), `${p} should be on the reviews router`).toBe(true);
      expect(inMain.has(p), `${p} should no longer be on the main router`).toBe(false);
    }
    // Review threads and tasks are created under a project; those creators moved too.
    const projectScoped = [...inReviews].filter((p) => /\/projects\/:projectId\/artifacts\/:artifactId\/review-(threads|tasks)$/.test(p));
    expect(projectScoped.length).toBeGreaterThan(0);
    for (const p of projectScoped) expect(inMain.has(p), `${p} should no longer be on the main router`).toBe(false);
  });
});

const NOTIFICATION_PATHS = [
  'GET /notifications/my',
  'POST /notifications/:id/read',
  'POST /notifications/:id/dismiss',
  'POST /notifications/mark-all-read',
  'GET /notifications/project',
  'GET /projects/:projectId/work-items',
  'GET /projects/:projectId/readiness-summary',
  'POST /escalation/process',
];

describe('notification, work-item and escalation routes live in one router', () => {
  it('the notifications router answers every one of them, and the main router none', async () => {
    const notifications = (await import('../notifications')).default as unknown as { stack: Layer[] };
    const main = (await import('../../concept2cure')).default as unknown as { stack: Layer[] };
    const inNotifications = new Set(registered(notifications));
    const inMain = new Set(registered(main));
    for (const p of NOTIFICATION_PATHS) {
      expect(inNotifications.has(p), `${p} should be on the notifications router`).toBe(true);
      expect(inMain.has(p), `${p} should no longer be on the main router`).toBe(false);
    }
    // The submission-package export stayed with the export domain on purpose.
    expect(inMain.has('POST /projects/:projectId/submission-package')).toBe(true);
    expect(inNotifications.has('POST /projects/:projectId/submission-package')).toBe(false);
  });
});

const COMMUNICATION_CENTER_PATHS = [
  'GET /projects/:projectId/authority-profiles',
  'POST /projects/:projectId/authority-profiles',
  'GET /projects/:projectId/agency-communications',
  'POST /projects/:projectId/agency-communications',
  'PATCH /projects/:projectId/agency-communications/:eventId/advance',
  'GET /projects/:projectId/publishops/services',
  'POST /projects/:projectId/publishops/services',
  'PATCH /projects/:projectId/publishops/services/:serviceId/status',
  'GET /projects/:projectId/submission-center/items',
  'POST /projects/:projectId/submission-center/items',
  'PATCH /projects/:projectId/submission-center/items/:itemId/status',
];

describe('the Communication Center routes live in one router', () => {
  it('the communication-center router answers them, and the main router does not', async () => {
    const cc = (await import('../communication-center')).default as unknown as { stack: Layer[] };
    const main = (await import('../../concept2cure')).default as unknown as { stack: Layer[] };
    const inCc = new Set(registered(cc));
    const inMain = new Set(registered(main));
    for (const p of COMMUNICATION_CENTER_PATHS) {
      expect(inCc.has(p), `${p} should be on the communication-center router`).toBe(true);
      expect(inMain.has(p), `${p} should not be on the main router`).toBe(false);
    }
  });
});

const TASK_PATHS = [
  'GET /projects/:projectId/tasks',
  'POST /projects/:projectId/tasks',
  'PUT /projects/:projectId/tasks/:taskId',
  'DELETE /projects/:projectId/tasks/:taskId',
  'POST /projects/:projectId/tasks/bulk',
  'GET /projects/:projectId/tasks/summary',
  'GET /submission-milestones/:type',
  'GET /submission-milestones',
  'POST /projects/:projectId/tasks/assess',
];

describe('project task routes live in one router', () => {
  it('the tasks router answers every one of them, and the main router none', async () => {
    const tasks = (await import('../tasks')).default as unknown as { stack: Layer[] };
    const main = (await import('../../concept2cure')).default as unknown as { stack: Layer[] };
    const inTasks = new Set(registered(tasks));
    const inMain = new Set(registered(main));
    for (const p of TASK_PATHS) {
      expect(inTasks.has(p), `${p} should be on the tasks router`).toBe(true);
      expect(inMain.has(p), `${p} should no longer be on the main router`).toBe(false);
    }
    // The project reads that shared the old banner stayed with the project domain.
    for (const p of ['GET /projects/:projectId/cmc', 'GET /projects/:projectId/context', 'GET /projects/:projectId/transform-context']) {
      expect(inMain.has(p), `${p} should still be on the main router`).toBe(true);
      expect(inTasks.has(p)).toBe(false);
    }
  });
});
