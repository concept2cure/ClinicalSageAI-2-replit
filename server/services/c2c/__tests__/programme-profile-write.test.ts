/**
 * The one governed write for a regulatory programme's profile columns.
 *
 * `regulatory_programs` had two writers: the create inside
 * `POST /api/c2c/projects`, and `PUT /api/510k/device/profile`, whose patch
 * schema and field-named audit row lived inside the route file and covered the
 * eSTAR's device facts. A status change went through `transitionProgram` and
 * arbitrary metadata through `mergeProgramMetadata`; everything in between —
 * the target agencies, the priority, the submission date — through nothing.
 *
 * So AnA's `project_setup` interview, whose purpose IS to configure a
 * programme, had no write to configure one with. This module is that write,
 * extracted from the route so there is still one path, and these tests hold
 * both halves: what it sets, and what it refuses to set.
 *
 * The device subset is proven end-to-end through the route by
 * `routes/__tests__/510k-device-profile-estar-fields.test.ts`, which still
 * passes unchanged — that is what makes the extraction an extraction.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { regulatoryPrograms } from '@shared/schema/programs';
import {
  PROFILE_WRITE_REFUSALS,
  type ProfileWriteDb,
  applyProgrammeProfilePatch,
  deviceProfilePatchSchema,
  programmeProfileFields,
  programmeProfilePatchSchema,
} from '../programme-profile-write';

const ORG = 9;
const PROGRAM = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';

interface AuditRow {
  organizationId: number;
  userId: number;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
}

const set = vi.fn<(values: Record<string, unknown>) => void>();
const where = vi.fn<(predicate: unknown) => Promise<undefined>>(async () => undefined);
const logAction = vi.fn<(row: AuditRow) => Promise<unknown>>(async () => ({ persisted: true }));

const update = vi.fn((_table: unknown) => ({
  set: (values: Record<string, unknown>) => {
    set(values);
    return { where };
  },
}));
const deps = () => ({ db: { update } as unknown as ProfileWriteDb, audit: { logAction } });

const write = (patch: Record<string, unknown>, action?: string) => {
  const parsed = programmeProfilePatchSchema.safeParse(patch);
  if (!parsed.success) throw new Error(`refused: ${JSON.stringify(parsed.error.flatten())}`);
  return applyProgrammeProfilePatch(deps(), {
    organizationId: ORG,
    programId: PROGRAM,
    actorId: 7,
    patch: parsed.data,
    action,
  });
};

const written = () => set.mock.calls.at(-1)![0];
const audited = () => logAction.mock.calls[0]![0];

beforeEach(() => {
  set.mockClear();
  where.mockClear();
  logAction.mockClear();
  update.mockClear();
});

describe('what it sets', () => {
  it('writes only the fields the patch named', async () => {
    await write({ priority: 'high' });
    expect(Object.keys(written()).sort()).toEqual(['priority', 'updatedAt']);
  });

  it('leaves a clearable field absent rather than writing NULL', async () => {
    /* The eSTAR projection reports an absent fact blank. A patch that does not
       mention `commonName` must not clear it. */
    await write({ priority: 'high' });
    expect('commonName' in written()).toBe(false);
  });

  it('drops a key a CALLER passed as undefined, not only one zod omitted', async () => {
    /* zod leaves an unmentioned key out of its output altogether, so the
       filter looks redundant against a parsed patch. It is not: a caller that
       builds a patch itself — the interview commit assembles one from answers,
       most of which are unanswered — reaches here with explicit `undefined`s,
       and an `undefined` in a drizzle `set` is what writes a NULL over a fact
       the person never touched. */
    await applyProgrammeProfilePatch(deps(), {
      organizationId: ORG,
      programId: PROGRAM,
      actorId: 7,
      patch: { priority: 'high', commonName: undefined, productCode: undefined },
    });
    expect(Object.keys(written()).sort()).toEqual(['priority', 'updatedAt']);
    expect(audited().details.fields, 'and the audit names only what changed').toEqual(['priority']);
  });

  it('clears one that was explicitly cleared', async () => {
    await write({ commonName: '' });
    expect(written().commonName).toBeNull();
    await write({ classificationName: null });
    expect(written().classificationName).toBeNull();
  });

  it('records the submission date as a date, and clears it when it is no longer planned', async () => {
    await write({ targetSubmissionDate: '2027-03-01' });
    expect((written().targetSubmissionDate as Date).toISOString()).toBe('2027-03-01T00:00:00.000Z');
    await write({ targetSubmissionDate: null });
    expect(written().targetSubmissionDate).toBeNull();
  });

  it('takes the agencies beyond the primary one, which the create never writes', async () => {
    await write({ targetAgencies: ['FDA', 'EMA'] });
    expect(written().targetAgencies).toEqual(['FDA', 'EMA']);
  });

  it('records a team member’s name and role and NOT a user id', async () => {
    /* The lead is permanently authorized to mutate the programme's evidence, so
       a userId arriving from an interview answer or a tool argument is an
       authorization leak. The column's type carries one; this write does not. */
    const parsed = programmeProfilePatchSchema.parse({
      teamMembers: [{ name: 'R. Okafor', role: 'Regulatory lead', userId: 4 } as never],
    });
    expect(parsed.teamMembers).toEqual([{ name: 'R. Okafor', role: 'Regulatory lead' }]);
  });

  it('is org-scoped and program-scoped on the UPDATE itself', async () => {
    await write({ priority: 'low' });
    expect(update).toHaveBeenCalledWith(regulatoryPrograms);
    expect(where).toHaveBeenCalledTimes(1);
    expect(where.mock.calls[0]![0], 'the predicate, not a bare id').toBeDefined();
  });
});

describe('what the record says about it afterwards', () => {
  it('names the fields an inspector would ask about', async () => {
    const result = await write({ productCode: 'QAS', deviceClass: 'II' });
    expect(result.fields.sort()).toEqual(['deviceClass', 'productCode']);
    expect(logAction).toHaveBeenCalledTimes(1);
    const row = audited();
    expect(row.organizationId).toBe(ORG);
    expect(row.userId, 'the session’s actor, never an invented one').toBe(7);
    expect(row.resourceType).toBe('regulatory_program');
    expect(row.resourceId).toBe(PROGRAM);
    /* The order is the parsed patch's, which is the schema's declaration
       order — the field NAMES are what an inspector reads, not their order. */
    expect((row.details.fields as string[]).slice().sort()).toEqual([
      'deviceClass',
      'productCode',
    ]);
  });

  it('names WHICH predicate was claimed, and that a claim was withdrawn', async () => {
    await write({ predicateDevices: [{ id: 'K123456', name: 'Acme CGM', kNumber: 'K123456' }] });
    const claimed = audited().details;
    expect(claimed.predicateDevices).toEqual(['K123456']);
    logAction.mockClear();
    await write({ predicateDevices: null });
    const withdrawn = audited().details;
    expect(written().predicateDevices, 'cleared, so the form prints blank').toEqual([]);
    expect(withdrawn.predicateDevices, 'and the record says the claim was withdrawn').toEqual([]);
  });

  it('records the action the caller names, so two callers are told apart', async () => {
    await write({ priority: 'high' }, 'PROGRAMME_CONFIGURED_BY_INTERVIEW');
    expect(audited().action).toBe('PROGRAMME_CONFIGURED_BY_INTERVIEW');
  });
});

describe('what it refuses', () => {
  it('refuses a patch that names nothing', () => {
    expect(programmeProfilePatchSchema.safeParse({}).success).toBe(false);
  });

  it('refuses every column on the refusal list, each of which is a real column', () => {
    const settable = new Set(programmeProfileFields());
    const columns = new Set(Object.keys(regulatoryPrograms));
    for (const [field, reason] of Object.entries(PROFILE_WRITE_REFUSALS)) {
      /* A typo'd refusal protects nothing and reads as protection. */
      expect(columns.has(field), `${field} is not a column of regulatory_programs`).toBe(true);
      expect(settable.has(field), `${field} is on the refusal list AND settable`).toBe(false);
      expect(programmeProfilePatchSchema.safeParse({ [field]: 'anything' }).success, field).toBe(false);
      expect(reason.length, `${field} is refused without a reason`).toBeGreaterThan(40);
    }
    expect(Object.keys(PROFILE_WRITE_REFUSALS).length, 'the refusals are stated, not assumed').toBeGreaterThan(5);
  });

  it('keeps the lifecycle and the two phases out of a profile write', () => {
    /* The workflow phase (planning … post_market) is not the development
       phase (preclinical, phase 1 …). They share words. */
    for (const field of ['status', 'phase', 'programType', 'productType', 'primaryAgency']) {
      expect(PROFILE_WRITE_REFUSALS[field], field).toBeTruthy();
    }
    expect(PROFILE_WRITE_REFUSALS.phase).toMatch(/development phase/);
  });

  it('every settable field is a real column too', () => {
    const columns = new Set(Object.keys(regulatoryPrograms));
    const unknown = programmeProfileFields().filter(f => !columns.has(f));
    expect(unknown, 'a settable field no column holds').toEqual([]);
  });

  it('keeps the US class US, because the form it is printed on is US', () => {
    expect(programmeProfilePatchSchema.safeParse({ deviceClass: 'III' }).success).toBe(true);
    expect(
      programmeProfilePatchSchema.safeParse({ deviceClass: 'IIa' }).success,
      'the MDR class has its own column, and must not be coerced into the US one',
    ).toBe(false);
  });

  it('takes each European class on its own column, for its own regulation', () => {
    /* The MDR's SEVEN declared classes, not the four the rules yield: Is, Im
       and Ir are what a sponsor declares, and the notified body's involvement
       for that one aspect follows from them (Art 52(7)). */
    for (const cls of ['I', 'Is', 'Im', 'Ir', 'IIa', 'IIb', 'III']) {
      expect(programmeProfilePatchSchema.safeParse({ euMdrClass: cls }).success, cls).toBe(true);
    }
    for (const cls of ['A', 'B', 'C', 'D']) {
      expect(programmeProfilePatchSchema.safeParse({ euIvdrClass: cls }).success, cls).toBe(true);
    }
    expect(
      programmeProfilePatchSchema.safeParse({ euMdrClass: 'C' }).success,
      'an IVDR class is not an MDR class',
    ).toBe(false);
    expect(
      programmeProfilePatchSchema.safeParse({ euIvdrClass: 'IIb' }).success,
      'nor the other way about',
    ).toBe(false);
  });

  it('lets a European class be withdrawn, because "no EU filing planned" is an answer', async () => {
    await write({ euMdrClass: null });
    expect(written().euMdrClass, 'blank, not a stale class').toBeNull();
    await write({ euIvdrClass: null });
    expect(written().euIvdrClass).toBeNull();
  });

  it('accepts the regulatory paths the platform’s own mapping produces', () => {
    /* The route's hand-written enum held three; `devicePathFor` can return
       `hde`, `ide` and `exempt` as well, so it refused paths the platform
       itself derives. */
    for (const path of ['510k', 'de_novo', 'pma', 'hde', 'ide', 'exempt']) {
      expect(programmeProfilePatchSchema.safeParse({ regulatoryPath: path }).success, path).toBe(true);
    }
  });
});

describe('the device-profile endpoint’s reach', () => {
  it('is exactly what it was, and not the whole shape', () => {
    /* Giving the interview a write must not widen an endpoint that carries the
       device_assembly_readiness entitlement. */
    expect(deviceProfilePatchSchema.safeParse({ priority: 'high' }).success).toBe(false);
    expect(deviceProfilePatchSchema.safeParse({ targetAgencies: ['EMA'] }).success).toBe(false);
    expect(deviceProfilePatchSchema.safeParse({ productCode: 'QAS' }).success).toBe(true);
    expect(deviceProfilePatchSchema.safeParse({ commonName: '' }).success).toBe(true);
  });
});
