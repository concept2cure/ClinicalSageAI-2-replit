/**
 * CAPA/MDR AnA tools — contract + live reportability triage.
 * The deterministic classifier (assess_mdr_reportability) is exercised through
 * its real handler; the DB-bound mutations/reads are covered by the registry
 * consistency test (handler wired) and the contract here.
 */

import { describe, it, expect, vi } from 'vitest';

// A confirmed write runs only for a role that may edit; stubbed as in
// direct-mutator-confirm-gate.test.ts so the confirmed path needs no database.
const { resolveSignerOrgRole } = vi.hoisted(() => ({ resolveSignerOrgRole: vi.fn(async () => 'member') }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));
// The program named is this organization's (tool-record-scope.ts checks it first).
const { programInOrganization } = vi.hoisted(() => ({ programInOrganization: vi.fn(async () => true) }));
vi.mock('../../c2c/program-access', async importOriginal => ({
  ...(await importOriginal<typeof import('../../c2c/program-access')>()),
  programInOrganization,
}));
vi.mock('../../c2c/program-access.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../c2c/program-access')>()),
  programInOrganization,
}));

import { CAPA_MDR_TOOLS } from '../capaMdrTools';
import { getToolHandler } from '../AnaToolExecutor';

async function run(name: string, input: Record<string, unknown>) {
  const handler = getToolHandler(name);
  expect(handler, `${name} handler registered`).toBeTypeOf('function');
  return JSON.parse(await handler!(input, { organizationId: 1, userId: 1 }));
}

describe('CAPA_MDR_TOOLS contract', () => {
  it('exposes the five post-market safety tools with object schemas', () => {
    expect(CAPA_MDR_TOOLS.map(t => t.name).sort()).toEqual([
      'assess_mdr_reportability',
      'create_complaint',
      'open_device_capa',
      'read_vigilance_timeline',
      'triage_capa_mdr_queue',
    ]);
    for (const t of CAPA_MDR_TOOLS) {
      expect(t.input_schema.type).toBe('object');
      expect(t.description.length).toBeGreaterThan(40);
    }
  });

  it('only assess_mdr_reportability is context-free; the DB tools require a programId', () => {
    const byName = new Map(CAPA_MDR_TOOLS.map(t => [t.name, t]));
    // The harm and every event fact the triage turns on: none is assumed false.
    expect(byName.get('assess_mdr_reportability')!.input_schema.required).toEqual([
      'patientHarm', 'isMalfunction', 'eventLocationCountry', 'anticipatesCorrection', 'trendThresholdCrossed',
    ]);
    expect(byName.get('assess_mdr_reportability')!.description).toMatch(/never assume false/);
    expect(byName.get('assess_mdr_reportability')!.description.length).toBeLessThanOrEqual(1024);
    for (const n of ['triage_capa_mdr_queue', 'read_vigilance_timeline']) {
      expect(byName.get(n)!.input_schema.required).toContain('programId');
    }
  });
});

describe('assess_mdr_reportability (live deterministic triage)', () => {
  // Every event fact is stated: an omitted one is asked for, never read as false
  // (capa-mdr/__tests__/mdr-reportability-unstated-facts-are-unknown.test.ts).
  const STATED = { isMalfunction: false, eventLocationCountry: 'US', anticipatesCorrection: false, trendThresholdCrossed: false };

  it('a death is FDA MDR reportable', async () => {
    const out = await run('assess_mdr_reportability', { patientHarm: 'death', ...STATED });
    expect(out.status).toBe('computed');
    expect(out.result.fdaReportable).toBe(true);
  });

  it('a plain malfunction with recurrence potential is FDA reportable', async () => {
    const out = await run('assess_mdr_reportability', { patientHarm: 'malfunction', ...STATED, isMalfunction: true });
    expect(out.status).toBe('computed');
    expect(out.result.fdaReportable).toBe(true);
  });

  it('a non-serious event is computed as not FDA reportable', async () => {
    // patientHarm and the event facts are stated; for a non-serious harm the
    // engine computes a non-reportable result rather than throwing.
    const out = await run('assess_mdr_reportability', { patientHarm: 'none', ...STATED });
    expect(out.status).toBe('computed');
    expect(out.result.fdaReportable).toBe(false);
    expect(out.result.determinationComplete).toBe(true);
  });

  it.each([[{}], [{ patientHarm: 'unknown' }]])(
    'refuses %j rather than determining "no MDR" for a harm nobody assessed',
    async (input) => {
      // classify's 'none' branch was also its default, so an absent or
      // unrecognised harm computed "No harm reported — no MDR".
      const out = await run('assess_mdr_reportability', input);
      expect(out.status).toBe('needs_parameters');
      expect(out.result).toBeUndefined();
    },
  );

  it('create_complaint requires the harm and severity assessments, and asks for them', async () => {
    const byName = new Map(CAPA_MDR_TOOLS.map(t => [t.name, t]));
    expect(byName.get('create_complaint')!.input_schema.required).toEqual(
      expect.arrayContaining(['patientHarm', 'severityAssessment']),
    );
    // A person confirmed the write; the handler still asks for the assessments
    // rather than recording a complaint with a harm nobody gave.
    const handler = getToolHandler('create_complaint')!;
    const out = JSON.parse(await handler(
      {
        programId: 'p-1',
        source: 'customer',
        channel: 'email',
        receivedAt: '2026-10-15T09:00:00Z',
        eventNarrative: 'Device alarmed during use',
      },
      { organizationId: 1, userId: 2, humanConfirmed: true },
    ));
    expect(out.status).toBe('needs_parameters');
    expect(out.message).toMatch(/patientHarm/);
  });

  it('the DB reads refuse to run without organization context', async () => {
    const handler = getToolHandler('triage_capa_mdr_queue')!;
    const out = JSON.parse(await handler({ programId: 'p' }, {}));
    expect(out.error).toMatch(/organization context/);
  });
});
