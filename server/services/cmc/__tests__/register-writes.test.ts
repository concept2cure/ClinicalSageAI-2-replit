/**
 * The register creates as service functions — one canonical write per
 * register, called by the HTTP route and by the interview commit projector.
 *
 * These pin what a create does that a caller cannot bypass: the body is
 * parsed with the register's own schema, a self-declared qualification or a
 * second `current` formulation is refused with the route's 409, the
 * signature columns are stripped, the row is inserted under the caller's
 * tenant, and the Module 3 link is awaited and reported — under the project
 * the caller named when the table carries none.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../../../metrics.js', () => ({ metrics: { concept2cureErrors: { inc: vi.fn() } } }));

const inserted = vi.fn();
const selected = vi.fn(async (): Promise<Array<Record<string, unknown>>> => []);
/* The row and the record of who recorded it are written on ONE transaction
   (register-audit.ts), so the handle a create reaches for is `db.transaction`'s
   and not `db`'s. The transaction is a pass-through here: what it commits is
   the subject of register-create-attribution.pglite.integration.test.ts, on a
   real Postgres. `execute` is the audit writer's door (queryableFromDrizzle). */
const audited = vi.fn();
const tx = {
  insert: () => ({
    values: (v: Record<string, unknown>) => ({
      returning: async () => {
        inserted(v);
        return [{ id: 11, ...v }];
      },
    }),
  }),
  execute: async (q: unknown) => {
    audited(q);
    return { rows: [] };
  },
};
vi.mock('../../../db', () => ({
  db: {
    transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
    select: () => ({ from: () => ({ where: async () => selected() }) }),
  },
  getPool: () => {
    throw new Error('no pool in this test');
  },
}));
/* The chained audit row's own suites cover what it writes; here it must only be
   on the create's transaction, which `audited` records. */
vi.mock('../../auditService', () => ({
  writeChainedAuditRow: async (client: { query: (t: string, p?: unknown[]) => Promise<unknown> }) => {
    await client.query('SELECT 1');
  },
}));

/* Every create now asks whether the programme in the body is this
   organisation's, so the unit test has to answer — and gets a case of its own
   below for the refusal. Before 2026-10-19 five of these creates wrote the
   body's projectId with no check at all. */
const projectIsTenants = vi.fn(async () => true);
vi.mock('../project-membership', () => ({
  projectBelongsToTenant: (...a: unknown[]) => projectIsTenants(...(a as [])),
}));

const writeThrough = vi.fn(async () => ({ ok: true as const, sourceObjectId: 'so-1', sourceHash: 'h', staleSections: [], isNew: true }));
vi.mock('../../cmc-write-through', () => ({
  writeThroughDrugSubstance: (...a: unknown[]) => writeThrough(...(a as [])),
  writeThroughDrugProduct: (...a: unknown[]) => writeThrough(...(a as [])),
  writeThroughContainerClosure: (...a: unknown[]) => writeThrough(...(a as [])),
  writeThroughMaterialSpec: (...a: unknown[]) => writeThrough(...(a as [])),
  writeThroughFormulationRecord: (...a: unknown[]) => writeThrough(...(a as [])),
  writeThroughManufacturingProcess: (...a: unknown[]) => writeThrough(...(a as [])),
  writeThroughCharacterizationStudy: (...a: unknown[]) => writeThrough(...(a as [])),
}));

import {
  RegisterWriteRefusal,
  createContainerClosure,
  createDrugSubstance,
  createFormulationRecord,
  createManufacturingProcess,
  ungovernedQualificationRefusal,
  vocabFor,
} from '../register-writes';

const ORG = 101;
const ACTOR = { userId: 55 };

beforeEach(() => {
  inserted.mockReset();
  audited.mockReset();
  selected.mockReset();
  selected.mockResolvedValue([]);
  writeThrough.mockClear();
  projectIsTenants.mockClear();
  projectIsTenants.mockResolvedValue(true);
});

const closure = { scope: 'drug_product', componentType: 'primary', systemName: 'Blister', containerDescription: 'PVC/Al', closureDescription: 'Al foil', projectId: 'prog-1' };

describe('createContainerClosure', () => {
  it('refuses a self-declared qualification with the governed path named, and inserts nothing', async () => {
    await expect(createContainerClosure(ORG, { ...closure, status: 'qualified' }, ACTOR)).rejects.toBeInstanceOf(RegisterWriteRefusal);
    await expect(createContainerClosure(ORG, { ...closure, status: 'qualified' }, ACTOR)).rejects.toThrow(/POST \/api\/cmc\/container-closures\/:id\/qualify/);
    expect(inserted).not.toHaveBeenCalled();
    expect(audited).not.toHaveBeenCalled();
    expect(writeThrough).not.toHaveBeenCalled();
  });

  it('refuses a programme that is not this organisation’s, and inserts nothing', async () => {
    /* The defect this pins: the create wrote the body's projectId straight into
       the row, so a typo filed an invisible record and another organisation's
       programme id filed one under a dossier this tenant does not hold — while
       the guarded creates beside it refused the same body
       (docs/evidence/CMC-M3-GA/2026-10-19/10-unverified-programme/). */
    projectIsTenants.mockResolvedValue(false);
    await expect(createContainerClosure(ORG, { ...closure, status: 'draft' }, ACTOR)).rejects.toBeInstanceOf(RegisterWriteRefusal);
    expect(projectIsTenants).toHaveBeenCalledWith({ organizationId: ORG, projectId: 'prog-1' });
    expect(inserted).not.toHaveBeenCalled();
    expect(audited).not.toHaveBeenCalled();
    expect(writeThrough).not.toHaveBeenCalled();
  });

  it('asks nothing of the programme store when the body names no programme', async () => {
    /* An organisation-wide record is the documented case for these registers;
       a check that refused it would break the register rather than guard it. */
    const orgWide = { ...closure };
    delete (orgWide as { projectId?: unknown }).projectId;
    await createContainerClosure(ORG, { ...orgWide, status: 'draft' }, ACTOR);
    expect(projectIsTenants).not.toHaveBeenCalled();
    expect((inserted.mock.calls[0][0] as Record<string, unknown>).projectId).toBeNull();
  });

  it('strips the signature columns and the tenant key, inserts under the caller tenant, and links the row', async () => {
    const created = await createContainerClosure(ORG, { ...closure, status: 'draft', qualifiedBy: 5, organizationId: 999 }, ACTOR);
    expect(inserted).toHaveBeenCalledTimes(1);
    const v = inserted.mock.calls[0][0] as Record<string, unknown>;
    expect(v.organizationId).toBe(ORG);
    expect(v).not.toHaveProperty('qualifiedBy');
    expect(v).not.toHaveProperty('qualificationDate');
    expect(created.row.id).toBe(11);
    expect(created.module3Linked).toBe(true);
    /* And the record of WHO recorded it, on the create's own transaction. */
    expect(audited).toHaveBeenCalledTimes(1);
    // Linked under the row's own project, as the string id the mapper keys on.
    expect(writeThrough).toHaveBeenCalledWith(ORG, 'prog-1', '11', expect.objectContaining({ systemName: 'Blister' }));
  });
});

describe('createManufacturingProcess', () => {
  it('refuses a self-declared validation under the process vocabulary', async () => {
    await expect(
      createManufacturingProcess(ORG, { processName: 'Granulation', validationStatus: 'validated' }, ACTOR),
    ).rejects.toThrow(/Process validation is a governed action.*\/validate/);
    expect(inserted).not.toHaveBeenCalled();
  });

  it('rejects a body the register schema does not accept, before any write', async () => {
    await expect(createManufacturingProcess(ORG, { processType: 'wet' }, ACTOR)).rejects.toBeInstanceOf(z.ZodError);
    expect(inserted).not.toHaveBeenCalled();
  });
});

describe('createFormulationRecord', () => {
  it('refuses a second current formulation for the same project', async () => {
    selected.mockResolvedValueOnce([{ id: 3, name: 'BX-701 tablet', version: 'F-v1' }]);
    await expect(
      createFormulationRecord(ORG, { formulationName: 'BX-701 tablet', version: 'F-v2', status: 'current', projectId: 'prog-1' }, ACTOR),
    ).rejects.toThrow(/BX-701 tablet \(F-v1\) is already the current formulation/);
    expect(inserted).not.toHaveBeenCalled();
  });

  it('inserts when no other version is current', async () => {
    const created = await createFormulationRecord(ORG, { formulationName: 'BX-701 tablet', version: 'F-v2', status: 'current', projectId: 'prog-1' }, ACTOR);
    expect(created.row.id).toBe(11);
    expect(created.module3Linked).toBe(true);
  });
});

describe('createDrugSubstance — a table with no project column', () => {
  it('links under the project the caller names, and says so when none is named', async () => {
    const linked = await createDrugSubstance(ORG, { substanceName: 'BX-701' }, ACTOR, { projectId: 'prog-7' });
    expect(linked.module3Linked).toBe(true);
    expect(writeThrough).toHaveBeenCalledWith(ORG, 'prog-7', '11', expect.objectContaining({ substanceName: 'BX-701' }));

    writeThrough.mockClear();
    const unlinked = await createDrugSubstance(ORG, { substanceName: 'BX-701' }, ACTOR);
    expect(unlinked.module3Linked).toBe(false);
    expect(unlinked.module3Warning).toMatch(/No project is set/);
    expect(writeThrough).not.toHaveBeenCalled();
  });
});

describe('ungovernedQualificationRefusal — one rule, three vocabularies', () => {
  it('refuses the transition into the signed state, allows a round-trip, refuses an unsigned reversal, allows retiring', () => {
    expect(ungovernedQualificationRefusal('qualified', 'reference-standards')).toMatch(/\/qualify/);
    expect(ungovernedQualificationRefusal('qualified', 'reference-standards', 'qualified')).toBeNull();
    expect(ungovernedQualificationRefusal('draft', 'reference-standards', 'qualified')).toMatch(/cannot be returned to "draft"/);
    expect(ungovernedQualificationRefusal('retired', 'reference-standards', 'qualified')).toBeNull();
    /* The vocabulary is the register's own, read from the one descriptor table
       rather than passed in at the call site: a process is `validated` at
       /validate, a method is `validated` at /validate, and an approval is at
       /approve. A register nobody registered throws instead of defaulting to
       `qualified`, so a refusal can never name an endpoint that does not
       exist. */
    expect(ungovernedQualificationRefusal('validated', 'manufacturing-processes')).toMatch(/\/validate/);
    expect(ungovernedQualificationRefusal('draft', 'manufacturing-processes')).toBeNull();
    expect(ungovernedQualificationRefusal('validated', 'analytical-methods')).toMatch(/analytical-methods\/:id\/validate/);
    expect(ungovernedQualificationRefusal('approved', 'process-validation')).toMatch(/process-validation\/:id\/approve/);
    expect(ungovernedQualificationRefusal('approved', 'comparability-studies')).toMatch(/comparability-studies\/:id\/approve/);
    /* ...and the words themselves, so a message cannot drift from the column
       the ceremony writes. */
    expect(vocabFor('analytical-methods')).toEqual({ signedValue: 'validated', verb: 'Method validation (ICH Q2)', path: 'validate' });
    expect(() => vocabFor('qc-testing')).toThrow(/no signed register is registered/);
  });
});
