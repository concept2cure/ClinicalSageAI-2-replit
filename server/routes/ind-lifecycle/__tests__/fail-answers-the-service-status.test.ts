/**
 * F1 repair C (re-plan step 24, 2026-11-08): the IND lifecycle routes answer a
 * submission-service refusal with the status the service gives it.
 *
 * Before this repair `fail` (../shared.ts) kept its own copy of the status map,
 * with four codes: NOT_FOUND, INVALID_STATE, FORBIDDEN and VALIDATION. Every
 * other code the service names (GOVERNED_REQUIRED, DISPATCH_BLOCKED,
 * AUDIT_UNCONFIRMED, ALREADY_PLACED, …) fell through to 500 INTERNAL, so a
 * refusal that tells the person what to do read as the server failing. The map
 * is now SUBMISSION_ERROR_STATUS itself, reused and never copied, so a code the
 * service adds is answered here without a second edit.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../db', () => ({ db: {} }));

import { fail } from '../shared';
import {
  SUBMISSION_ERROR_STATUS,
  SubmissionError,
  type SubmissionErrorCode,
} from '../../../services/submission-service/submission-service';

/** One route that answers whatever error it is handed, through `fail`. */
function answering(err: unknown) {
  const a = express();
  a.get('/x', (_req, res) => fail(res, err));
  return request(a).get('/x');
}

describe('the IND lifecycle routes answer the service’s own status (F1 repair C)', () => {
  it('a governed step refused for want of a signature answers 403, with its code and words', async () => {
    const res = await answering(new SubmissionError('GOVERNED_REQUIRED', 'Freeze is a governed step. Sign it first.'));
    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ code: 'GOVERNED_REQUIRED', message: 'Freeze is a governed step. Sign it first.' });
  });

  it('a step the dispatch gate blocks answers 422, with its code and words', async () => {
    const res = await answering(new SubmissionError('DISPATCH_BLOCKED', 'Dispatch gate blocks freeze: m1.1 is missing.'));
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({ code: 'DISPATCH_BLOCKED', message: 'Dispatch gate blocks freeze: m1.1 is missing.' });
  });

  it.each(Object.entries(SUBMISSION_ERROR_STATUS) as Array<[SubmissionErrorCode, number]>)(
    'every code the service names answers the status it gives: %s → %i',
    async (code, status) => {
      const res = await answering(new SubmissionError(code, `refused: ${code}`));
      expect(res.status).toBe(status);
      expect(res.body.error).toEqual({ code, message: `refused: ${code}` });
    },
  );

  it('an error with no code answers 500 and says nothing of what failed inside', async () => {
    const res = await answering(new Error('connect ECONNREFUSED 10.0.0.7:5432 (role app_service)'));
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'INTERNAL', message: 'Request failed.' });
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|10\.0\.0\.7|app_service/);
  });

  it('a code the service does not name, even one spelled like an object property, answers 500', async () => {
    for (const code of ['SOMETHING_ELSE', 'constructor', 'toString', '__proto__']) {
      const res = await answering(Object.assign(new Error('internal detail'), { code }));
      expect(res.status, code).toBe(500);
      expect(res.body.error, code).toEqual({ code: 'INTERNAL', message: 'Request failed.' });
    }
  });

  it('what fail already answered is unchanged: a CODE: refusal is 400, an unrecorded export is 503', async () => {
    const coded = await answering(new Error('IND_AMENDMENT_NO_DOCUMENTS: an amendment names at least one document.'));
    expect(coded.status).toBe(400);
    expect(coded.body.error.code).toBe('IND_AMENDMENT_NO_DOCUMENTS');
    const unrecorded = await answering(new Error('UNAUDITED_EXPORT_REFUSED: the record could not be written.'));
    expect(unrecorded.status).toBe(503);
    expect(unrecorded.body.error.code).toBe('UNAUDITED_EXPORT_REFUSED');
  });
});
