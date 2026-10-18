import { describe, expect, it } from 'vitest';
import { withCaughtErrors } from '../document-tools-shared';
import { ProgramReadAccessError } from '../../c2c/current-program-access';
describe('catalogue tools preserve canonical access refusals', () => {
  it.each([
    [403, 'PROJECT_PERMISSION_DENIED'], [409, 'VAULT_TENANT_RECONCILIATION_REQUIRED'], [503, 'PROJECT_ACCESS_UNAVAILABLE'],
  ] as const)('returns named %s access refusal without source data', async (status, code) => {
    const run = withCaughtErrors('read_project_document', async () => { throw new ProgramReadAccessError(status, code, 'Current document access could not be verified.'); });
    expect(JSON.parse(await run({}))).toEqual({ ok: false, status, code, error: 'Current document access could not be verified.' });
  });
});
