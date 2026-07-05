/**
 * CAPA/MDR AnA tools — contract + live reportability triage.
 * The deterministic classifier (assess_mdr_reportability) is exercised through
 * its real handler; the DB-bound mutations/reads are covered by the registry
 * consistency test (handler wired) and the contract here.
 */

import { describe, it, expect } from 'vitest';

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
    expect(byName.get('assess_mdr_reportability')!.input_schema.required).toEqual(['patientHarm']);
    for (const n of ['triage_capa_mdr_queue', 'read_vigilance_timeline']) {
      expect(byName.get(n)!.input_schema.required).toContain('programId');
    }
  });
});

describe('assess_mdr_reportability (live deterministic triage)', () => {
  it('a death is FDA MDR reportable', async () => {
    const out = await run('assess_mdr_reportability', { patientHarm: 'death' });
    expect(out.status).toBe('computed');
    expect(out.result.fdaReportable).toBe(true);
  });

  it('a plain malfunction with recurrence potential is FDA reportable', async () => {
    const out = await run('assess_mdr_reportability', { patientHarm: 'malfunction', isMalfunction: true });
    expect(out.status).toBe('computed');
    expect(out.result.fdaReportable).toBe(true);
  });

  it('a non-serious event is computed as not FDA reportable', async () => {
    // patientHarm is schema-required; when the engine sees a non-serious harm it
    // computes a non-reportable result rather than throwing.
    const out = await run('assess_mdr_reportability', { patientHarm: 'none' });
    expect(out.status).toBe('computed');
    expect(out.result.fdaReportable).toBe(false);
  });

  it('the DB reads refuse to run without organization context', async () => {
    const handler = getToolHandler('triage_capa_mdr_queue')!;
    const out = JSON.parse(await handler({ programId: 'p' }, {}));
    expect(out.error).toMatch(/organization context/);
  });
});
