/**
 * GET /api/c2c/project-vault/:id — a 510(k)'s or De Novo's Library marks are the
 * eSTAR mapper's answer for the device (P-107 item 3).
 *
 * The rule itself is pinned in
 * services/pathway-engines/estar/__tests__/estar-outline-requirements.test.ts,
 * and the route is proven on real PostgreSQL by
 * tests/db/vault-estar-required-sections.dbtest.ts. This file pins three things
 * about the route that need neither:
 *   - it asks the rule, with the device answers it read for this project;
 *   - a read of those answers that fails fails the Vault read (an unread answer
 *     is not "never answered");
 *   - a project with no 510(k) or De Novo document is not asked for them.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/clinical-regulatory-evidence/record-source.js', async (importOriginal) => ({
  ...(await importOriginal<object>()), syncQualityProjectSources: vi.fn(async () => ({ created: 0, unchanged: 0, superseded: 0 })),
}));

const queryMock = vi.fn();
vi.mock('../../../db', () => ({
  pool: { query: (...args: unknown[]) => queryMock(...args) },
}));

/* The project's device answers, as intake stored them. The real reader
   (program-device-flags) is a Drizzle read of regulatory_programs.metadata; it
   is exercised against PostgreSQL by the dbtest named above. */
const loadFlags = vi.fn();
vi.mock('../../../services/pathway-engines/estar/program-device-flags.js', async (importOriginal) => ({
  ...(await importOriginal<object>()), loadProgramDeviceFlags: (...args: unknown[]) => loadFlags(...args),
}));

vi.mock('../../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});
import createProjectVaultRoutes from '../project-vault';
import { clearSeats, seatMember, seatProgram } from './support/current-member';

const PROJECT = '11111111-2222-3333-4444-555555555555';
const ORG = 7;
const USER = 41;

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.organizationId = ORG;
    req.userId = USER;
    req.user = { id: USER };
    req.dbClient = { query: (...args: unknown[]) => queryMock(...args) };
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

/** A cut of the 510(k) outline: one always-required section, the two the decision names, and one no slot takes. */
const K510_SECTIONS = [
  { key: 'A', parent_key: null, label: 'Administrative', mandatory: true, path_order: 1 },
  { key: 'A1', parent_key: 'A', label: 'Cover letter', mandatory: true, path_order: 2 },
  { key: 'A2', parent_key: 'A', label: 'Submitter, applicant and correspondent information', mandatory: true, path_order: 3 },
  { key: 'D', parent_key: null, label: 'Design, manufacturing and labeling', mandatory: true, path_order: 18 },
  { key: 'D4', parent_key: 'D', label: 'Sterilization', mandatory: false, path_order: 22 },
  { key: 'D5', parent_key: 'D', label: 'Shelf life and packaging', mandatory: false, path_order: 23 },
  { key: 'D6', parent_key: 'D', label: 'Benefits, risks and mitigation measures — risk management (ISO 14971), Special 510(k) design control activities', mandatory: false, path_order: 24 },
];

function seed(doc: Record<string, unknown>, productType = 'device') {
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: PROJECT, name: 'NeuroPanel', product_type: productType, program_type: '510k', primary_agency: 'FDA' }] })
    .mockResolvedValueOnce({
      rows: [{
        id: 'doc1', title: 'NeuroPanel 510(k)', status: 'draft', readiness: 0, updated_at: null, owner_name: null, filing_scope: 'home', ...doc,
      }],
    })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValue({ rows: [] });
}

function leavesByNum(body: any): Record<string, any> {
  const out: Record<string, any> = {};
  const walk = (nodes: any[]) => {
    for (const n of nodes ?? []) {
      if (Array.isArray(n.children)) walk(n.children);
      else out[n.num] = n;
    }
  };
  walk(body?.data?.tree ?? []);
  return out;
}

const NOT_STERILE = { combinationProduct: false, softwareAiMl: false, cyberDevice: false, sterile: false, implantable: false, cliaWaived: false, clinicalData: false };

beforeEach(() => {
  queryMock.mockReset();
  loadFlags.mockReset();
  clearSeats();
  seatMember(ORG, USER, 'member');
  seatProgram(ORG, PROJECT);
});

describe('GET /api/c2c/project-vault/:id — a 510(k) is marked by its device', () => {
  const K510 = { doc_type: 'k510', agency: 'fda', rule_pack_version: 'fda-estar-510k-v1.1', required_sections: K510_SECTIONS };

  // D6 read Required until 2026-11-10 (P-123): FDA's eSTAR asks for it in a Special 510(k) only, and the mapper now says so.
  it('a sterile device: D4 is required, D6 turns on the kind of 510(k), and the reasons are said', async () => {
    seed(K510);
    loadFlags.mockResolvedValueOnce({ ...NOT_STERILE, sterile: true });
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);
    expect(loadFlags).toHaveBeenCalledTimes(1);
    expect(loadFlags).toHaveBeenCalledWith(ORG, PROJECT);

    const leaves = leavesByNum(res.body);
    expect(leaves.D4).toMatchObject({
      type: 'Required: one of D4, D5', blocker: true, flag: 'Mandatory section — no content yet in D4 or D5',
      preview: 'NeuroPanel 510(k) · D4 · Sterilization · required: the project answered yes to “Sterile”',
    });
    expect(leaves.D6.type).toBe('When applicable');
    expect(leaves.D6.blocker).toBeFalsy();
    expect(leaves.D6.preview).toMatch(/ · required when the submission is a Special 510\(k\)/);
    expect(leaves.A1).toMatchObject({ type: 'Required', blocker: true });
    // No slot takes A2: the pack's flag, in the pack's words.
    expect(leaves.A2).toMatchObject({ type: 'Required', blocker: true, flag: 'Mandatory section — no content yet' });
    expect(leaves.A2.preview).toMatch(/ · mandatory section$/);
  });

  it('a device answered not sterile: D4 is not applicable and does not block', async () => {
    seed(K510);
    loadFlags.mockResolvedValueOnce(NOT_STERILE);
    const leaves = leavesByNum((await request(app()).get(`/api/c2c/project-vault/${PROJECT}`)).body);
    expect(leaves.D4.type).toBe('Not applicable');
    expect(leaves.D4.blocker).toBeUndefined();
    expect(leaves.D4.flag).toBeUndefined();
    expect(leaves.D5.type).toBe('Optional');
  });

  it('device questions never answered: D4 is not decided, not optional', async () => {
    seed(K510);
    loadFlags.mockResolvedValueOnce(undefined);
    const leaves = leavesByNum((await request(app()).get(`/api/c2c/project-vault/${PROJECT}`)).body);
    expect(leaves.D4).toMatchObject({ type: 'Not decided', blocker: true, flag: 'Not decided — the project has not answered “Sterile”' });
  });

  it('the device answers could not be read: the Vault read fails, and no mark is shown', async () => {
    seed(K510);
    loadFlags.mockRejectedValueOnce(new Error('connection terminated'));
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toBeUndefined();
  });
});

describe('GET /api/c2c/project-vault/:id — where no eSTAR applies', () => {
  it.each([
    ['pma', 'fda'],
    ['mdr', 'ema'],
    ['k510', 'ema'],
  ])('%s:%s keeps its pack\'s flags, and the device answers are not read', async (docType, agency) => {
    seed({ doc_type: docType, agency, rule_pack_version: 'v1', required_sections: K510_SECTIONS });
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);
    expect(loadFlags).not.toHaveBeenCalled();
    const leaves = leavesByNum(res.body);
    for (const spec of K510_SECTIONS.filter((s) => s.parent_key)) {
      expect(leaves[spec.key].type, spec.key).toBe(spec.mandatory ? 'Required' : 'Optional');
      expect(Boolean(leaves[spec.key].blocker), spec.key).toBe(spec.mandatory);
    }
    expect(leaves.D4.preview).toBe('NeuroPanel 510(k) · D4 · Sterilization');
    expect(leaves.A1.preview).toBe('NeuroPanel 510(k) · A1 · Cover letter · mandatory section');
  });
});
