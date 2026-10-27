/**
 * The extraction is retained independently of requested governed registration.
 * These doubles exercise transaction failures; they do not establish live DB
 * tenancy, scientific review, or submission readiness.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const returning = vi.fn();
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  return {
    enabled: true,
    insert, values, returning,
    extract: vi.fn(), connect: vi.fn(), bridge: vi.fn(), audit: vi.fn(),
    client: { query: vi.fn(), release: vi.fn() },
  };
});

vi.mock('../../../db', () => ({
  db: { insert: mocks.insert }, pool: { connect: mocks.connect },
}));
vi.mock('../../../../shared/schema/csr-knowledge-db', () => ({
  ctdNonclinicalStudies: { id: 'ctd-study-id' },
}));
vi.mock('../feature-flags', () => ({
  get PRECLINICAL_INGEST_ENABLED() { return mocks.enabled; },
}));
vi.mock('../preclinical-extractor', () => ({ extractFromPdf: mocks.extract }));
vi.mock('../preclinical-governed-bridge', () => ({ bridgeIngestedStudyTx: mocks.bridge }));
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction: mocks.audit }));
vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { ingestStudy, type IngestStudyInput } from '../preclinical-ingest-service';
import { PreclinicalStudySchema } from '../preclinical-extraction-schema';

const STUDY = PreclinicalStudySchema.parse({
  studyType: 'repeat_dose_tox', studyTitle: '13-week study in rat',
  species: 'rat', noael: '50 mg/kg/day', extractionConfidence: 0.91,
});
const INPUT: IngestStudyInput = {
  programId: 42, pdfBuffer: Buffer.from('mock PDF'), sourcePdfId: 'pdf-retained',
  governance: { organizationId: 7, userId: 11, submissionId: 19, iacucProtocolId: 23 },
};
const REGISTRATION_FAILURE = {
  status: 'failed', code: 'PRECLINICAL_GOVERNED_REGISTRATION_FAILED',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled = true;
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id: 1234 }]);
  mocks.extract.mockResolvedValue({ data: STUDY, model: 'test-model' });
  mocks.connect.mockResolvedValue(mocks.client);
  mocks.client.query.mockImplementation(async (sql: string) => ({ rows: [], command: sql }));
  mocks.bridge.mockResolvedValue({ governedStudyId: 77, ctdSection: '4.2.3.2', provenanceLinkIds: [6] });
  mocks.audit.mockResolvedValue(undefined);
});

describe('ingestStudy registration outcome', () => {
  it('retains program-only extraction and explicitly reports registration was not requested', async () => {
    const result = await ingestStudy({ ...INPUT, governance: undefined });
    expect(result).toMatchObject({ studyId: 1234, data: STUDY, registration: { status: 'not_requested' } });
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      programId: 42, sourcePdfId: 'pdf-retained', extractionModel: 'test-model',
    }));
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.bridge).not.toHaveBeenCalled();
  });

  it('reports unreviewed registration only after the bridge, audit and commit succeed', async () => {
    const result = await ingestStudy(INPUT);
    expect(result).toMatchObject({
      studyId: 1234, governedStudyId: 77, ctdSection: '4.2.3.2',
      registration: {
        status: 'registered', governedStudyId: 77, ctdSection: '4.2.3.2', reviewRequired: true,
      },
    });
    expect(mocks.bridge).toHaveBeenCalledWith(mocks.client, 7, 11, {
      ctdStudyId: 1234, data: STUDY, sourcePdfId: 'pdf-retained', submissionId: 19, iacucProtocolId: 23,
    });
    expect(mocks.audit).toHaveBeenCalledWith(mocks.client, expect.objectContaining({
      orgId: 7, userId: 11, command: 'create', target: 'nonclinical-study:77',
    }));
    expect(mocks.client.query.mock.calls).toEqual([['BEGIN'], ['COMMIT']]);
    expect(mocks.client.query.mock.invocationCallOrder[0]).toBeLessThan(mocks.bridge.mock.invocationCallOrder[0]);
    expect(mocks.bridge.mock.invocationCallOrder[0]).toBeLessThan(mocks.audit.mock.invocationCallOrder[0]);
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.client.query.mock.invocationCallOrder[1]);
    expect(mocks.client.release).toHaveBeenCalledTimes(1);
  });

  it.each(['connect', 'begin', 'bridge', 'audit', 'commit'] as const)(
    'keeps the extracted study ID and reports failure when %s fails', async stage => {
      const error = new Error(`SENTINEL-INTERNAL-${stage}: private database detail`);
      if (stage === 'connect') mocks.connect.mockRejectedValueOnce(error);
      if (stage === 'bridge') mocks.bridge.mockRejectedValueOnce(error);
      if (stage === 'audit') mocks.audit.mockRejectedValueOnce(error);
      if (stage === 'begin' || stage === 'commit') {
        mocks.client.query.mockImplementation(async (sql: string) => {
          if (sql === stage.toUpperCase()) throw error;
          return { rows: [] };
        });
      }

      const result = await ingestStudy(INPUT);
      expect(result).toMatchObject({ studyId: 1234, data: STUDY, registration: REGISTRATION_FAILURE });
      expect(result.governedStudyId).toBeUndefined();
      expect(result.ctdSection).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain('SENTINEL-INTERNAL');
      expect(mocks.insert).toHaveBeenCalledTimes(1);
      if (stage === 'connect') {
        expect(mocks.client.query).not.toHaveBeenCalled();
        expect(mocks.client.release).not.toHaveBeenCalled();
      } else {
        expect(mocks.client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mocks.client.release).toHaveBeenCalledTimes(1);
      }
      if (stage === 'connect' || stage === 'begin') expect(mocks.bridge).not.toHaveBeenCalled();
      if (stage === 'connect' || stage === 'begin' || stage === 'bridge') expect(mocks.audit).not.toHaveBeenCalled();
    },
  );

  it('retains the extraction and discards the client when rollback also fails', async () => {
    mocks.bridge.mockRejectedValueOnce(new Error('SENTINEL-BRIDGE'));
    const rollbackError = new Error('SENTINEL-ROLLBACK');
    mocks.client.query.mockImplementation(async (sql: string) => {
      if (sql === 'ROLLBACK') throw rollbackError;
      return { rows: [] };
    });
    const result = await ingestStudy(INPUT);
    expect(result).toMatchObject({ studyId: 1234, registration: REGISTRATION_FAILURE });
    expect(mocks.client.release).toHaveBeenCalledWith(rollbackError);
    expect(JSON.stringify(result)).not.toContain('SENTINEL');
  });

  it.each(['ROLLBACK', undefined])('does not report registration for an unconfirmed commit receipt %s', async command => {
    mocks.client.query.mockImplementation(async (sql: string) => ({
      rows: [], command: sql === 'COMMIT' ? command : sql,
    }));
    const result = await ingestStudy(INPUT);
    expect(result).toMatchObject({ studyId: 1234, registration: REGISTRATION_FAILURE });
    expect(result.governedStudyId).toBeUndefined();
    expect(result.ctdSection).toBeUndefined();
    expect(mocks.client.release).toHaveBeenCalledTimes(1);
  });

  it('does not lose the retained extraction if releasing the client throws', async () => {
    mocks.bridge.mockRejectedValueOnce(new Error('SENTINEL-BRIDGE'));
    mocks.client.release.mockImplementationOnce(() => { throw new Error('SENTINEL-RELEASE'); });
    await expect(ingestStudy(INPUT)).resolves.toMatchObject({ studyId: 1234, registration: REGISTRATION_FAILURE });
  });

  it('preserves a confirmed commit if only client release throws', async () => {
    mocks.client.release.mockImplementationOnce(() => { throw new Error('SENTINEL-RELEASE'); });
    await expect(ingestStudy(INPUT)).resolves.toMatchObject({
      studyId: 1234, registration: { status: 'registered', reviewRequired: true },
    });
  });
});

describe('ingestStudy admission', () => {
  it('refuses disabled ingestion before extraction or persistence', async () => {
    mocks.enabled = false;
    await expect(ingestStudy(INPUT)).rejects.toMatchObject({ name: 'PreclinicalIngestDisabledError' });
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'refuses invalid program ID %s before extraction', async programId => {
      await expect(ingestStudy({ ...INPUT, programId })).rejects.toMatchObject({ code: 'PRECLINICAL_INGEST_BAD_PROGRAM_ID' });
      expect(mocks.extract).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    },
  );

  it.each([
    { organizationId: undefined, userId: 11 }, { organizationId: 0, userId: 11 },
    { organizationId: -7, userId: 11 }, { organizationId: 7.5, userId: 11 },
    { organizationId: 7, userId: undefined }, { organizationId: 7, userId: 0 },
    { organizationId: 7, userId: -11 }, { organizationId: 7, userId: Number.NaN },
    { organizationId: 7, userId: Number.MAX_SAFE_INTEGER + 1 },
  ])('refuses invalid governance context %j before extraction', async governance => {
    await expect(ingestStudy({ ...INPUT, governance } as IngestStudyInput)).rejects.toMatchObject({
      code: 'PRECLINICAL_INGEST_GOVERNANCE_CONTEXT_REQUIRED',
    });
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['submissionId', 0, 'PRECLINICAL_INGEST_BAD_SUBMISSION_ID'],
    ['submissionId', -2, 'PRECLINICAL_INGEST_BAD_SUBMISSION_ID'],
    ['iacucProtocolId', 1.5, 'PRECLINICAL_INGEST_BAD_IACUC_PROTOCOL_ID'],
    ['iacucProtocolId', Number.NaN, 'PRECLINICAL_INGEST_BAD_IACUC_PROTOCOL_ID'],
  ] as const)('refuses invalid %s %s before extraction', async (key, value, code) => {
    await expect(ingestStudy({ ...INPUT, governance: { ...INPUT.governance!, [key]: value } }))
      .rejects.toMatchObject({ code });
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each(['PRECLINICAL_NO_TEXT', 'PRECLINICAL_INCOMPLETE_TEXT', 'PRECLINICAL_REPORT_TOO_LARGE'])(
    'does not persist or register a study when extraction refuses with %s', async code => {
      const refusal = Object.assign(new Error('Input refused'), { name: 'PreclinicalExtractionInputError', code });
      mocks.extract.mockRejectedValueOnce(refusal);
      await expect(ingestStudy(INPUT)).rejects.toBe(refusal);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.connect).not.toHaveBeenCalled();
    },
  );
});
