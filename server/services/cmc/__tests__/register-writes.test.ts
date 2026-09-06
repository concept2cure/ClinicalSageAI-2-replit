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
vi.mock('../../../db', () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          inserted(v);
          return [{ id: 11, ...v }];
        },
      }),
    }),
    select: () => ({ from: () => ({ where: async () => selected() }) }),
  },
  getPool: () => {
    throw new Error('no pool in this test');
  },
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
  PROCESS_VOCAB,
} from '../register-writes';

const ORG = 101;

beforeEach(() => {
  inserted.mockReset();
  selected.mockReset();
  selected.mockResolvedValue([]);
  writeThrough.mockClear();
});

const closure = { scope: 'drug_product', componentType: 'primary', systemName: 'Blister', containerDescription: 'PVC/Al', closureDescription: 'Al foil', projectId: 'prog-1' };

describe('createContainerClosure', () => {
  it('refuses a self-declared qualification with the governed path named, and inserts nothing', async () => {
    await expect(createContainerClosure(ORG, { ...closure, status: 'qualified' })).rejects.toBeInstanceOf(RegisterWriteRefusal);
    await expect(createContainerClosure(ORG, { ...closure, status: 'qualified' })).rejects.toThrow(/POST \/api\/cmc\/container-closures\/:id\/qualify/);
    expect(inserted).not.toHaveBeenCalled();
    expect(writeThrough).not.toHaveBeenCalled();
  });

  it('strips the signature columns and the tenant key, inserts under the caller tenant, and links the row', async () => {
    const created = await createContainerClosure(ORG, { ...closure, status: 'draft', qualifiedBy: 5, organizationId: 999 });
    expect(inserted).toHaveBeenCalledTimes(1);
    const v = inserted.mock.calls[0][0] as Record<string, unknown>;
    expect(v.organizationId).toBe(ORG);
    expect(v).not.toHaveProperty('qualifiedBy');
    expect(v).not.toHaveProperty('qualificationDate');
    expect(created.row.id).toBe(11);
    expect(created.module3Linked).toBe(true);
    // Linked under the row's own project, as the string id the mapper keys on.
    expect(writeThrough).toHaveBeenCalledWith(ORG, 'prog-1', '11', expect.objectContaining({ systemName: 'Blister' }));
  });
});

describe('createManufacturingProcess', () => {
  it('refuses a self-declared validation under the process vocabulary', async () => {
    await expect(
      createManufacturingProcess(ORG, { processName: 'Granulation', validationStatus: 'validated' }),
    ).rejects.toThrow(/Process validation is a governed action.*\/validate/);
    expect(inserted).not.toHaveBeenCalled();
  });

  it('rejects a body the register schema does not accept, before any write', async () => {
    await expect(createManufacturingProcess(ORG, { processType: 'wet' })).rejects.toBeInstanceOf(z.ZodError);
    expect(inserted).not.toHaveBeenCalled();
  });
});

describe('createFormulationRecord', () => {
  it('refuses a second current formulation for the same project', async () => {
    selected.mockResolvedValueOnce([{ id: 3, name: 'BX-701 tablet', version: 'F-v1' }]);
    await expect(
      createFormulationRecord(ORG, { formulationName: 'BX-701 tablet', version: 'F-v2', status: 'current', projectId: 'prog-1' }),
    ).rejects.toThrow(/BX-701 tablet \(F-v1\) is already the current formulation/);
    expect(inserted).not.toHaveBeenCalled();
  });

  it('inserts when no other version is current', async () => {
    const created = await createFormulationRecord(ORG, { formulationName: 'BX-701 tablet', version: 'F-v2', status: 'current', projectId: 'prog-1' });
    expect(created.row.id).toBe(11);
    expect(created.module3Linked).toBe(true);
  });
});

describe('createDrugSubstance — a table with no project column', () => {
  it('links under the project the caller names, and says so when none is named', async () => {
    const linked = await createDrugSubstance(ORG, { substanceName: 'BX-701' }, { projectId: 'prog-7' });
    expect(linked.module3Linked).toBe(true);
    expect(writeThrough).toHaveBeenCalledWith(ORG, 'prog-7', '11', expect.objectContaining({ substanceName: 'BX-701' }));

    writeThrough.mockClear();
    const unlinked = await createDrugSubstance(ORG, { substanceName: 'BX-701' });
    expect(unlinked.module3Linked).toBe(false);
    expect(unlinked.module3Warning).toMatch(/No project is set/);
    expect(writeThrough).not.toHaveBeenCalled();
  });
});

describe('ungovernedQualificationRefusal — the one rule, two vocabularies', () => {
  it('refuses the transition into the signed state, allows a round-trip, refuses an unsigned reversal, allows retiring', () => {
    expect(ungovernedQualificationRefusal('qualified', 'reference-standards')).toMatch(/\/qualify/);
    expect(ungovernedQualificationRefusal('qualified', 'reference-standards', 'qualified')).toBeNull();
    expect(ungovernedQualificationRefusal('draft', 'reference-standards', 'qualified')).toMatch(/cannot be returned to "draft"/);
    expect(ungovernedQualificationRefusal('retired', 'reference-standards', 'qualified')).toBeNull();
    expect(ungovernedQualificationRefusal('validated', 'manufacturing-processes', undefined, PROCESS_VOCAB)).toMatch(/\/validate/);
    expect(ungovernedQualificationRefusal('draft', 'manufacturing-processes')).toBeNull();
  });
});
