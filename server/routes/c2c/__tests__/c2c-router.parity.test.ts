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
    // The submission-package export went with the export domain (slice 7), not here.
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
    // The project reads that shared the old banner went to the program-twin router (slice 11), not here.
    for (const p of ['GET /projects/:projectId/cmc', 'GET /projects/:projectId/context', 'GET /projects/:projectId/transform-context']) {
      expect(inTasks.has(p)).toBe(false);
    }
  });
});

const CONVERSATION_PATHS = [
  'POST /projects/:projectId/conversations',
  'POST /projects/:projectId/conversations/:conversationId/messages',
  'PATCH /projects/:projectId/conversations/:conversationId',
  'DELETE /projects/:projectId/conversations/:conversationId',
];

describe('conversation mutations live in one router', () => {
  it('the conversations router answers every one of them, and the main router none', async () => {
    const conversations = (await import('../conversations')).default as unknown as { stack: Layer[] };
    const main = (await import('../../concept2cure')).default as unknown as { stack: Layer[] };
    const inConv = new Set(registered(conversations));
    const inMain = new Set(registered(main));
    for (const p of CONVERSATION_PATHS) {
      expect(inConv.has(p), `${p} should be on the conversations router`).toBe(true);
      expect(inMain.has(p), `${p} should no longer be on the main router`).toBe(false);
    }
  });
});

const EXPORT_PATHS = [
  'POST /artifacts/export-docx',
  'POST /artifacts/export-pdf',
  'POST /artifacts/export-pptx',
  'GET /documents/download/:filename',
  'POST /projects/:projectId/submission-package',
];

describe('the export family lives in one router', () => {
  it('the exports router answers every export path, and the main router none', async () => {
    const exports_ = (await import('../exports')).default as unknown as { stack: Layer[] };
    const main = (await import('../../concept2cure')).default as unknown as { stack: Layer[] };
    const inExports = new Set(registered(exports_));
    const inMain = new Set(registered(main));
    for (const p of EXPORT_PATHS) {
      expect(inExports.has(p), `${p} should be on the exports router`).toBe(true);
      expect(inMain.has(p), `${p} should no longer be on the main router`).toBe(false);
    }
  });
});

const ARTIFACT_PATHS = [
  'GET /artifacts',
  'GET /projects/all/artifacts-summary',
  'GET /projects/:projectId/artifacts',
  'POST /projects/:projectId/artifacts',
  'PUT /projects/:projectId/artifacts/:artifactId',
  'POST /vault/register-artifact',
  'PUT /projects/:projectId/artifacts/:artifactId/placement',
  'GET /projects/:projectId/dossier-metrics',
  'POST /projects/:projectId/artifacts/:artifactId/signatures',
  'GET /projects/:projectId/artifacts/:artifactId/signatures',
  'GET /projects/:projectId/artifacts/:artifactId/snapshots',
  'GET /projects/:projectId/artifacts/:artifactId/provenance',
  'GET /projects/:projectId/artifacts/:artifactId/versions',
  'GET /projects/:projectId/artifacts/:artifactId/audit-report',
  'POST /projects/:projectId/artifacts/:artifactId/audit-report/export',
  'GET /user/permissions',
  'PUT /projects/:projectId/artifacts/:artifactId/status',
  'PUT /projects/:projectId/artifacts/:artifactId/ctd-section',
  'GET /projects/:projectId/artifacts/:artifactId/verify-integrity',
  'POST /projects/:projectId/artifacts/:artifactId/rollback',
  'POST /projects/:projectId/artifacts/:artifactId/comments',
  'GET /projects/:projectId/artifacts/:artifactId/comments',
  'PUT /projects/:projectId/artifacts/:artifactId/comments/:commentId/resolve',
  'POST /projects/:projectId/artifacts/:artifactId/reviewers',
  'GET /projects/:projectId/artifacts/:artifactId/reviewers',
  'DELETE /projects/:projectId/artifacts/:artifactId/reviewers/:assignmentId',
  'GET /projects/:projectId/team',
  'POST /projects/:projectId/artifacts/:artifactId/reviewers/:assignmentId/remind',
  'POST /projects/:projectId/artifacts/:artifactId/reviews/submit',
  'GET /projects/:projectId/artifacts/:artifactId/reviews/status',
];

describe('the artifact domain lives in one router', () => {
  it('the artifacts router answers every artifact path, and the main router none', async () => {
    const artifacts = (await import('../artifacts')).default as unknown as { stack: Layer[] };
    const main = (await import('../../concept2cure')).default as unknown as { stack: Layer[] };
    const inArtifacts = new Set(registered(artifacts));
    const inMain = new Set(registered(main));
    for (const p of ARTIFACT_PATHS) {
      expect(inArtifacts.has(p), `${p} should be on the artifacts router`).toBe(true);
      expect(inMain.has(p), `${p} should no longer be on the main router`).toBe(false);
    }
  });
});

const AI_EDITING_PATHS = [
  'POST /ai/edit-section',
  'GET /ai/templates',
  'POST /ai/templates/:templateId/generate',
  'POST /ai/autocomplete',
  'POST /ai/compliance-scan',
  'POST /ai/citation-search',
  'POST /ai/batch-edit',
  'POST /ai/validate-references',
  'POST /ai/check-inconsistency',
  'POST /ai/extract-metadata',
];

describe('AI editing lives in one router', () => {
  it('the ai-editing router answers every /ai path, and the main router none', async () => {
    const ai = (await import('../ai-editing')).default as unknown as { stack: Layer[] };
    const main = (await import('../../concept2cure')).default as unknown as { stack: Layer[] };
    const inAi = new Set(registered(ai));
    const inMain = new Set(registered(main));
    for (const p of AI_EDITING_PATHS) {
      expect(inAi.has(p), `${p} should be on the ai-editing router`).toBe(true);
      expect(inMain.has(p), `${p} should no longer be on the main router`).toBe(false);
    }
  });
});

const HAQ_PATHS = [
  'PUT /projects/:projectId/haq-session',
  'GET /projects/:projectId/haq-session',
  'GET /reviews/pending',
];

describe('HAQ session persistence lives in one router', () => {
  it('the haq-sessions router answers every HAQ path, and the main router none', async () => {
    const haq = (await import('../haq-sessions')).default as unknown as { stack: Layer[] };
    const main = (await import('../../concept2cure')).default as unknown as { stack: Layer[] };
    const inHaq = new Set(registered(haq));
    const inMain = new Set(registered(main));
    for (const p of HAQ_PATHS) {
      expect(inHaq.has(p), `${p} should be on the haq-sessions router`).toBe(true);
      expect(inMain.has(p), `${p} should no longer be on the main router`).toBe(false);
    }
  });
});

const PROGRAM_TWIN_PATHS = [
  'GET /projects/:projectId/program-twin',
  'GET /projects/:projectId/artifacts/:artifactId/verification',
  'GET /projects/:projectId/change-impact',
  'GET /projects/:projectId/cmc',
  'PUT /projects/:projectId/cmc',
  'GET /projects/:projectId/context',
  'GET /projects/:projectId/transform-context',
];

describe('the program twin and project-context reads live in one router', () => {
  it('the program-twin router answers every one of them, and the main router none', async () => {
    const twin = (await import('../program-twin')).default as unknown as { stack: Layer[] };
    const main = (await import('../../concept2cure')).default as unknown as { stack: Layer[] };
    const inTwin = new Set(registered(twin));
    const inMain = new Set(registered(main));
    for (const p of PROGRAM_TWIN_PATHS) {
      expect(inTwin.has(p), `${p} should be on the program-twin router`).toBe(true);
      expect(inMain.has(p), `${p} should no longer be on the main router`).toBe(false);
    }
  });
});
