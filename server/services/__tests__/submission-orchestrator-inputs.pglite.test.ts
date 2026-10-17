import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ pg: undefined as PGlite | undefined }));
vi.mock('../../db.js', () => ({ pool: { query: async (sql: string, args: unknown[]) => { const r = await state.pg!.query(sql, args); return { ...r, rowCount: r.affectedRows }; } } }));
import { captureOrchestratorInputs, captureOrchestratorSuspendedOutputs, verifyOrchestratorReceipt } from '../submission-orchestrator-inputs';
const RUN = '22e4f86d-4b76-48ac-87e3-8bce8804c324', PROGRAM = '672d578b-8f27-4b15-8b40-5484a4996ace';
beforeAll(async () => {
  state.pg = new PGlite(); vi.stubEnv('AUDIT_HMAC_KEY', 'test-only-inputs-receipt');
  await state.pg.exec(`CREATE TABLE organizations(id integer PRIMARY KEY); CREATE TABLE regulatory_programs(id uuid PRIMARY KEY);
    CREATE TABLE submission_orchestrator_runs(run_id uuid PRIMARY KEY); INSERT INTO organizations VALUES(42);
    INSERT INTO regulatory_programs VALUES('${PROGRAM}'); INSERT INTO submission_orchestrator_runs VALUES('${RUN}');`);
  await state.pg.exec(fs.readFileSync('db/migrations/20261014_orchestrator_continuation_inputs.sql', 'utf8'));
});
afterAll(async () => { vi.unstubAllEnvs(); await state.pg?.close(); });
describe('immutable original input/pause-output receipts', () => {
  it('roundtrips original input through JSONB ordering and verifies its seal', async () => {
    const inputs = { organizationId: 42, programId: PROGRAM, submissionId: '91', applicationNumber: 'IND-123', region: 'US', submissionType: 'IND', cmcSources: [], csrInputs: [], clinicalStudyData: [], nonclinicalStudies: [] } as any;
    await captureOrchestratorInputs(RUN, inputs);
    const row = (await state.pg!.query<any>('SELECT * FROM submission_orchestrator_inputs')).rows[0];
    expect(row.program_id).toBe(PROGRAM); expect(verifyOrchestratorReceipt(row.input_snapshot, row.input_digest, row.input_seal, 42)).toBe(true);
    expect(verifyOrchestratorReceipt(row.input_snapshot, row.input_digest, row.input_seal, 99)).toBe(false);
    await captureOrchestratorInputs(RUN, { ...inputs, applicationNumber: 'replacement' });
    expect((await state.pg!.query<any>('SELECT input_snapshot FROM submission_orchestrator_inputs')).rows[0].input_snapshot.applicationNumber).toBe('IND-123');
  });
  it('refuses updating or deleting the original source inputs at the database boundary', async () => {
    await expect(state.pg!.exec("UPDATE submission_orchestrator_inputs SET input_snapshot = '{}'::jsonb")).rejects.toThrow('immutable');
    await expect(state.pg!.exec('DELETE FROM submission_orchestrator_inputs')).rejects.toThrow('immutable');
  });
  it('allows exact pause outputs to be captured once, and refuses a second capture', async () => {
    const outputs = { module3Sections: [{ sectionKey: '3.2.S', narrativeDraft: 'original AI-approved text' }], csrTables: [] } as any;
    await captureOrchestratorSuspendedOutputs(RUN, 42, outputs);
    const row = (await state.pg!.query<any>('SELECT * FROM submission_orchestrator_inputs')).rows[0];
    expect(verifyOrchestratorReceipt(row.suspended_outputs, row.outputs_digest, row.outputs_seal, 42)).toBe(true);
    await expect(captureOrchestratorSuspendedOutputs(RUN, 42, { ...outputs, module3Sections: [] })).rejects.toThrow('reserved');
    await expect(state.pg!.exec("UPDATE submission_orchestrator_inputs SET suspended_outputs = '{}'::jsonb")).rejects.toThrow('immutable');
  });
});
