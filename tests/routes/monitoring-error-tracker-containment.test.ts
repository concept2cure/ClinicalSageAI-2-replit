/**
 * The error-tracking middleware in server/utils/monitoring.js answers a 500
 * without the error's text or stack in any environment (security audit
 * 2026-09-24, IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * It branched on `config.isProduction`: production got a static sentence and
 * an errorId, every other environment got `message: err.message` and
 * `stack: err.stack`. An error handler is reachable by whoever can make a
 * request fail — signed in or not — and a staging, demo or preview deployment
 * that is not `NODE_ENV=production` is still one people sign into. It is not
 * an operator-only diagnostic, so it may not disclose either. The full message
 * and stack still go to the log (and Sentry) under the errorId the body
 * carries.
 *
 * (No module imports this middleware today; the test pins the behaviour so a
 * future mount cannot bring the disclosure back.)
 */
import { describe, expect, it, vi } from 'vitest';
import { errorTrackerMiddleware } from '../../server/utils/monitoring.js';

const SENTINEL = 'SENTINEL-DB-DETAIL: relation "monitoring_set_b_secret" does not exist';

function fakeRes() {
  const state: { status?: number; body?: any } = {};
  const res: any = {
    status(code: number) {
      state.status = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
  };
  return { res, state };
}

describe('errorTrackerMiddleware: the 500 body is contained', () => {
  it('answers with the static sentence and the errorId, never the message or the stack', () => {
    const logger = { error: vi.fn() };
    const { res, state } = fakeRes();
    const err = new Error(SENTINEL);
    errorTrackerMiddleware(logger)(err, { requestId: 'req-1', path: '/api/x', method: 'GET' }, res, () => {});

    expect(state.status).toBe(500);
    const body = JSON.stringify(state.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-DB-DETAIL');
    expect(body).not.toContain('monitoring_set_b_secret');
    expect(state.body.stack).toBeUndefined();
    expect(state.body).toMatchObject({ status: 'error', message: 'An unexpected error occurred' });
    expect(state.body.errorId).toMatch(/^err-/);

    // The operator still has it, under the same errorId.
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [line, context] = logger.error.mock.calls[0];
    expect(line).toContain(SENTINEL);
    expect(context).toMatchObject({ errorId: state.body.errorId, stack: err.stack });
  });
});
