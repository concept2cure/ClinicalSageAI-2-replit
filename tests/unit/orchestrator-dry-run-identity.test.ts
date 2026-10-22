/**
 * The orchestrator's validation assembly names only recorded identity, or it is
 * a dry run that is never signed (P-27 follow-up, 2026-10-08).
 *
 * assembleRealPackage built every orchestrator package with
 *   sponsorName 'UNASSIGNED (applicant)', sponsorId 'UNASSIGNED-APPLICANT'
 * in the regional backbone. That backbone's MD5 is a leaf of index.xml, and
 * index.xml is bound into the §11.70 release-signature payload and persisted in
 * the signed snapshot that the signed-package export hands back. So the
 * "validation assembly" was not a dry run: its placeholder identity reached a
 * stored, signed package record.
 *
 * Now the run reads the identity from the record (package-identity.ts, the
 * reader export / compile / transmit use): the organisation's name as the
 * applicant, and the project's recorded application number, which must equal
 * the run's. With it, the backbone names the recorded applicant. Without it,
 * the assembly says it is a dry run (assembly.dryRun + the step's outputRef),
 * still validates, and package.sign refuses it: no signature payload, no
 * signed snapshot, the run does not reach awaiting-signature.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  poolQuery: vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>>(),
  validateEctdPackageHardened: vi.fn(),
  packagerInputs: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../server/db.js', () => {
  const pool = { query: (...a: unknown[]) => hoisted.poolQuery(...(a as [string, unknown[]?])) };
  return { pool, getPool: () => pool, getDb: () => null, db: null };
});
vi.mock('../../server/db', () => {
  const pool = { query: (...a: unknown[]) => hoisted.poolQuery(...(a as [string, unknown[]?])) };
  return { pool, getPool: () => pool, getDb: () => null, db: null };
});
vi.mock('../../server/services/ectd/ectd-validator-hardening.js', () => ({
  validateEctdPackageHardened: (...a: unknown[]) => hoisted.validateEctdPackageHardened(...a),
}));
vi.mock('../../server/services/ectd/ectd-validator-hardening', () => ({
  validateEctdPackageHardened: (...a: unknown[]) => hoisted.validateEctdPackageHardened(...a),
}));
// The real packager, observed: what identity did the backbone get?
vi.mock('../../server/services/submission-gateways/regional-packager', async (orig) => {
  const real = await orig<typeof import('../../server/services/submission-gateways/regional-packager')>();
  return {
    ...real,
    packageEctdSubmission: async (input: Parameters<typeof real.packageEctdSubmission>[0]) => {
      hoisted.packagerInputs.push(input as unknown as Record<string, unknown>);
      return real.packageEctdSubmission(input);
    },
  };
});

import { runOrchestrator, type OrchestratorInputs } from '../../server/services/submission-package-orchestrator';

const PROGRAM = '7d1c2f0e-5b7a-4c1e-9a43-0f2b6d1e8c55';

function inputs(over: Partial<OrchestratorInputs> = {}): OrchestratorInputs {
  return {
    organizationId: 1,
    submissionId: '55',
    submissionFk: 55,
    applicationNumber: '123456',
    region: 'US',
    submissionType: 'IND',
    cmcSources: [
      {
        id: 'src-1',
        sourceType: 'manufacturing',
        sourcePayload: { drugSubstance: 'X', api: 'Y', spec: 'Z' },
        organizationId: 1,
        projectId: 42,
      } as unknown as OrchestratorInputs['cmcSources'][number],
    ],
    nonclinicalStudies: [],
    clinicalStudyData: [],
    csrInputs: [],
    drugProductName: 'Compound-X',
    projectId: 42,
    userId: 7,
    ...over,
  };
}

/** The record: submission 55 → project PROGRAM (application_number), organisation 1 (name). */
function record(opts: { applicationNumber: string | null; orgName: string | null; duns?: string | null; contactEmail?: string | null }) {
  hoisted.poolQuery.mockImplementation(async (sql: string) => {
    if (/FROM submissions/i.test(sql) && /program_id/i.test(sql)) return { rows: [{ program_id: PROGRAM }], rowCount: 1 };
    if (/JOIN ind_sponsors/i.test(sql)) return { rows: [{ organization_name: opts.orgName,
      application_number: opts.applicationNumber, applicant_sponsor_id: '22222222-2222-4222-8222-222222222222',
      sponsor_id: '22222222-2222-4222-8222-222222222222', sponsor_name: opts.orgName,
      duns: opts.duns === undefined ? '123456789' : opts.duns, contact_name: 'Regulatory Contact',
      contact_phone: '+1 212 555 0100', contact_email: opts.contactEmail === undefined ? 'ra@example.test' : opts.contactEmail,
    }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
}

beforeEach(() => {
  hoisted.poolQuery.mockReset();
  hoisted.packagerInputs.length = 0;
  hoisted.validateEctdPackageHardened.mockReset();
  hoisted.validateEctdPackageHardened.mockResolvedValue({
    valid: true, score: 100, findings: [],
    summary: { errors: 0, warnings: 0, infos: 0, sectionsPresent: 1, sectionsRequired: 1, sectionsMissing: [] },
    timestamp: new Date().toISOString(), regional: [], sequence: [], dtd: [], hardenedScore: 100, gatewayReady: true,
  });
});

describe('orchestrator validation assembly — recorded identity or a dry run (P-27)', () => {
  it('builds the backbone with the recorded applicant and application number, and proceeds to signature', async () => {
    record({ applicationNumber: '123456', orgName: 'Concept2Cure Therapeutics' });
    const { run, outputs } = await runOrchestrator(inputs());

    expect(hoisted.packagerInputs).toHaveLength(1);
    expect(hoisted.packagerInputs[0].sponsorName).toBe('Concept2Cure Therapeutics');
    expect(hoisted.packagerInputs[0].applicationId).toBe('123456');
    expect(hoisted.packagerInputs[0].sponsorId).toBe('123456789');
    expect(hoisted.packagerInputs[0].fda).toMatchObject({ contacts: [{ type: 'regulatory', name: 'Regulatory Contact', phone: '+1 212 555 0100', email: 'ra@example.test' }] });
    expect(String(hoisted.packagerInputs[0].sponsorName)).not.toMatch(/UNASSIGNED/);
    expect(outputs.assembly?.dryRun).toBe(false);
    expect(run.steps.find((s) => s.key === 'package.sign')!.status).toBe('awaiting-signature');
  });

  it('says it is a dry run, and package.sign refuses it, when the project records no application number', async () => {
    record({ applicationNumber: null, orgName: 'Concept2Cure Therapeutics' });
    const { run, outputs } = await runOrchestrator(inputs());

    expect(outputs.assembly?.dryRun).toBe(true);
    expect(outputs.assembly?.dryRunReason).toMatch(/application number/);
    const assemble = run.steps.find((s) => s.key === 'package.assemble')!;
    expect(assemble.status).toBe('complete');
    expect(assemble.outputRef).toMatch(/dry run/i);

    const sign = run.steps.find((s) => s.key === 'package.sign')!;
    expect(sign.status).not.toBe('awaiting-signature');
    expect(sign.status).not.toBe('complete');
    expect(sign.outputRef ?? '').toMatch(/dry run/i);
    // Nothing signable was frozen: no payload digest, no signed snapshot.
    expect(sign.outputRef ?? '').not.toMatch(/payloadDigest|signedSnapshot/);
    expect(run.status).not.toBe('awaiting-signature');
    expect(run.status).not.toBe('complete');
  });

  it('is a dry run when the run names an application number the record does not', async () => {
    record({ applicationNumber: '999999', orgName: 'Concept2Cure Therapeutics' });
    const { run, outputs } = await runOrchestrator(inputs());
    expect(outputs.assembly?.dryRun).toBe(true);
    expect(outputs.assembly?.dryRunReason).toMatch(/999999/);
    expect(run.steps.find((s) => s.key === 'package.sign')!.status).not.toBe('awaiting-signature');
  });

  it('is a dry run when the run names no submission on record', async () => {
    record({ applicationNumber: '123456', orgName: 'Concept2Cure Therapeutics' });
    const { run, outputs } = await runOrchestrator(inputs({ submissionFk: undefined, submissionId: 'SUB-not-a-row' }));
    expect(outputs.assembly?.dryRun).toBe(true);
    expect(run.steps.find((s) => s.key === 'package.sign')!.status).not.toBe('awaiting-signature');
  });
});


describe('FDA recorded runs require the complete existing sponsor identity', () => {
  it.each([{ duns: null }, { duns: '12-345-6789' }, { contactEmail: null }])('keeps incomplete or malformed sponsor facts unsigned: %j', async (gap) => {
    record({ applicationNumber: '123456', orgName: 'Concept2Cure Therapeutics', ...gap });
    const { run, outputs } = await runOrchestrator(inputs());
    expect(outputs.assembly?.dryRun).toBe(true);
    expect(run.steps.find((s) => s.key === 'package.sign')!.status).not.toBe('awaiting-signature');
    expect(hoisted.packagerInputs[0].sponsorId).toMatch(/^UNASSIGNED-ORG-/);
  });
});
