/**
 * The review domain moved out of routes/concept2cure.ts into routes/c2c/reviews.ts
 * (ledger L53, first domain). Both routers mount at /api/concept2cure, so the
 * split is only safe if every review path is answered by exactly one of them:
 * a path left behind in the main router would shadow or double-register, and a
 * path lost in the move would 404 where a client expects a review.
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
