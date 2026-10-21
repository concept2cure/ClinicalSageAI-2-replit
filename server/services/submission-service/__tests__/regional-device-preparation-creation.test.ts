import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REGIONAL_DEVICE_APPLICATION_CLASSES } from '../../../../shared/regulatory/filing-catalog';

const insert = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => vi.fn());
const audit = vi.hoisted(() => vi.fn());
vi.mock('../../../db', () => ({ db: { insert }, pool: { query } }));
vi.mock('../../audit/audit-write-outcome', () => ({ recordAuditRow: audit }));
import { createSubmission, createSubmissionTx, SUBMISSION_ERROR_STATUS } from '../submission-service';

beforeEach(() => {
  insert.mockReset(); query.mockReset(); audit.mockReset();
  insert.mockReturnValue({ values: () => ({ returning: async () => [{ id: 7 }] }) });
  query.mockResolvedValue({ rows: [], rowCount: 0 });
  audit.mockResolvedValue({ persisted: true });
});
const ctx = { organizationId: 7, userId: 3 };
const input = (applicationType: string) => ({ applicationType, title: 'Regional preparation', clientType: 'mdx', primaryRegion: 'jp' });

describe('preparation-only regional applications cannot create a canonical submission', () => {
  it.each(REGIONAL_DEVICE_APPLICATION_CLASSES)('$docType refuses standalone and transactional creation before insert or audit', async regional => {
    const expected = { code: 'DEVICE_PREPARATION_ONLY', message: expect.stringMatching(/authoring project/i) };
    await expect(createSubmission(input(regional.docType), ctx)).rejects.toMatchObject(expected);
    await expect(createSubmissionTx({ query } as never, input(regional.docType), ctx)).rejects.toMatchObject(expected);
    expect(insert).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  const filingSelections = [
    ...REGIONAL_DEVICE_APPLICATION_CLASSES.flatMap(({ registryId }) => [registryId, registryId.toLowerCase()]),
    'fda_hde', 'hc_mdl', 'hc_ivd', 'pmda_shonin', 'pmda_nintei', 'pmda_ivd', 'cdx_pmda',
    ' US_HDE ', ' FDA_HDE ',
  ];
  it.each(filingSelections.flatMap(applicationType => [
    { applicationType, mode: 'standalone' },
    { applicationType, mode: 'transactional' },
  ]))('$applicationType refuses $mode creation before insert or audit', async ({ applicationType, mode }) => {
    const creation = mode === 'standalone'
      ? createSubmission(input(applicationType), ctx)
      : createSubmissionTx({ query } as never, input(applicationType), ctx);
    await expect(creation).rejects.toMatchObject({ code: 'DEVICE_PREPARATION_ONLY' });
    expect(insert).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('reports the preparation refusal as 422 to existing callers', () => {
    expect(SUBMISSION_ERROR_STATUS).toHaveProperty('DEVICE_PREPARATION_ONLY', 422);
  });

  it.each(['ind', 'nda', '510k', 'pma'])('preserves existing %s creation', async applicationType => {
    await expect(createSubmission(input(applicationType), ctx)).resolves.toMatchObject({ id: 7 });
    expect(insert).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledOnce();
  });
});
