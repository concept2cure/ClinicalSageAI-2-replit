import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ readActor: vi.fn() }));
vi.mock('../../csr/project-scope', () => ({ readCsrProjectActor: h.readActor }));
import { requireGovernedProgramWriteTx } from '../governed-program-write';

const PROGRAM = '11111111-2222-4333-8444-000000093590';
let owned: boolean; let lead: number;
const client = { query: vi.fn(async (sql: string) => ({ rows: /lead_user_id/.test(sql)
  ? [{ lead_user_id: lead }] : owned ? [{ id: PROGRAM }] : [] })) };
beforeEach(() => {
  vi.clearAllMocks(); owned = true; lead = 42;
  h.readActor.mockResolvedValue({ userId: 42, role: 'member' });
});
describe('fresh governed programme authority', () => {
  it.each([undefined, null, '', 'viewer'])('does not preserve lead write authority for role %s', async role => {
    h.readActor.mockResolvedValue({ userId: 42, role });
    await expect(requireGovernedProgramWriteTx(client, 7, 42, PROGRAM)).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect(h.readActor).toHaveBeenCalledWith(client, 7, 42);
    expect(client.query.mock.calls.some(([sql]) => /lead_user_id/.test(sql))).toBe(false);
  });
  it('retains a member lead grant after validating the current persisted role', async () => {
    await expect(requireGovernedProgramWriteTx(client, 7, 42, PROGRAM)).resolves.toBeUndefined();
  });
  it('still refuses a member who is not the programme lead', async () => {
    lead = 99;
    await expect(requireGovernedProgramWriteTx(client, 7, 42, PROGRAM)).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
  it('refuses a foreign programme before consulting actor authority', async () => {
    owned = false;
    await expect(requireGovernedProgramWriteTx(client, 7, 42, PROGRAM)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(h.readActor).not.toHaveBeenCalled();
  });
});
