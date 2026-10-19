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
import type { AuditRowOutcome } from '../../audit/audit-write-outcome';
import {
  PROFILE_WRITE_REFUSALS,
  ProgrammeProfileWriteRefused,
  isRealCalendarDay,
  type ProfileWriteDb,
  applyProgrammeProfilePatch,
  deviceProfilePatchSchema,
  programmePredicateDevicesColumn,
  programmeTeamMembersColumn,
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
const where = vi.fn<(predicate: unknown) => unknown>();
const logAction = vi.fn<(row: AuditRow) => Promise<AuditRowOutcome>>(async () => ({
  persisted: true,
  chained: true,
}));

/** The row as it stood, keyed by COLUMN name, as `to_jsonb(row)` returns it. */
let snapshot: Record<string, unknown> | undefined = { device_class: 'I', priority: 'medium' };
/** What the UPDATE's `.returning()` yields — empty means it matched nothing. */
let returned: Array<{ id: string }> = [{ id: PROGRAM }];

const update = vi.fn((_table: unknown) => ({
  set: (values: Record<string, unknown>) => {
    set(values);
    return { where: (predicate: unknown) => { where(predicate); return { returning: async () => returned }; } };
  },
}));
const select = vi.fn((_fields: unknown) => ({
  from: (_table: unknown) => ({
    where: async (_predicate: unknown) => (snapshot ? [{ snapshot }] : []),
  }),
}));
const deps = () => ({ db: { update, select } as unknown as ProfileWriteDb, audit: { logAction } });

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
  select.mockClear();
  snapshot = { device_class: 'I', priority: 'medium' };
  returned = [{ id: PROGRAM }];
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

describe('what the §11.10(e) row says, and whether it landed', () => {
  it('reports a lost audit row instead of answering as though it wrote one', async () => {
    /* `logAction` does not reject when persistence fails, so the outcome is
       the only way to tell a recorded change from an unrecorded one — and this
       write discarded it (2026-10-13 audit). */
    logAction.mockResolvedValueOnce({
      persisted: false,
      code: 'AUDIT_ROW_NOT_PERSISTED',
      message: 'lost',
    });
    const result = await write({ priority: 'high' });
    expect(result.audit.persisted, 'the caller is told').toBe(false);
    expect(written().priority, 'and the change itself stands').toBe('high');
  });

  it('carries the value each field held BEFORE, which the chain does not', async () => {
    /* §11.10(e): previous entries shall not be obscured, and
       `writeChainedAuditRow` stores old_values = null. The overwritten value
       was destroyed with nothing able to recover it. */
    snapshot = { device_class: 'I', priority: 'low' };
    await write({ deviceClass: 'III', priority: 'high' });
    const details = audited().details as Record<string, Record<string, unknown>>;
    expect(details.before).toEqual({ deviceClass: 'I', priority: 'low' });
    expect(details.after).toEqual({ deviceClass: 'III', priority: 'high' });
  });

  it('refuses a programme this organization does not hold, before writing', async () => {
    snapshot = undefined;
    await expect(write({ priority: 'high' })).rejects.toThrow(ProgrammeProfileWriteRefused);
    expect(set, 'nothing was written').not.toHaveBeenCalled();
    expect(logAction, 'and no audit row claims otherwise').not.toHaveBeenCalled();
  });

  it('refuses a zero-row UPDATE rather than auditing a change that did not happen', async () => {
    /* The row can go between the check and the act, or RLS can filter it. The
       UPDATE had no `.returning()`, so an audit row named fields it had not
       set. */
    returned = [];
    await expect(write({ priority: 'high' })).rejects.toThrow(/no longer in this organization/);
    expect(logAction).not.toHaveBeenCalled();
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

  it('refuses a column outside the allowlist in the WRITE, not only at the caller', async () => {
    /* The function spread every key of the patch into `.set()`, and drizzle
       writes any real column it finds. Nothing could emit `status` today,
       which is the whole reason to close it before something can. */
    await expect(
      applyProgrammeProfilePatch(deps(), {
        organizationId: ORG,
        programId: PROGRAM,
        actorId: 7,
        patch: { status: 'approved' } as never,
      }),
    ).rejects.toThrow(/Not a settable programme-profile column: status/);
    expect(set).not.toHaveBeenCalled();
  });

  it('refuses a date that is not on the calendar', () => {
    /* `new Date('2026-02-30')` is 2 March, and `2026-13-45` threw inside the
       writer after the interview session had moved to committing. */
    expect(isRealCalendarDay('2027-03-01')).toBe(true);
    expect(isRealCalendarDay('2026-02-30')).toBe(false);
    expect(isRealCalendarDay('2026-13-45')).toBe(false);
    expect(programmeProfilePatchSchema.safeParse({ targetSubmissionDate: '2026-02-30' }).success).toBe(false);
    expect(programmeProfilePatchSchema.safeParse({ targetSubmissionDate: '2027-03-01' }).success).toBe(true);
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

/**
 * The two json columns, for the writer that is not this one.
 *
 * `POST /api/c2c/projects` builds its own raw INSERT. Until 2026-10-19 it wrote
 * `team_members` as a bare string array and `predicate_devices` as
 * `[{ kNumber }]` — no id, no name — so the same column meant different things
 * depending on which path created the row, and a row the create made could not
 * round-trip through the write that owns the column. The route now shapes both
 * through these schemas, and this is the pin that the old shapes stay refused.
 */
describe('the json columns a second writer must shape alike', () => {
  it('refuses the bare string array the create route used to write', () => {
    expect(programmeTeamMembersColumn.safeParse(['Alice', 'Bob']).success).toBe(false);
    /* A name with no stated role is the canonical shape: `role` is optional, so
       the create route asserts a name and nothing more. */
    const parsed = programmeTeamMembersColumn.parse([{ name: 'Alice' }, { name: 'Bob' }]);
    expect(parsed).toEqual([{ name: 'Alice' }, { name: 'Bob' }]);
  });

  it('refuses a predicate with a number and no trade name', () => {
    /* The exact value the create route wrote. The official eSTAR fills the
       predicate submission number from `kNumber` and the TRADE NAME from
       `name`, so this row files half a claim of substantial equivalence. */
    expect(programmePredicateDevicesColumn.safeParse([{ kNumber: 'K181234' }]).success).toBe(false);
    expect(programmePredicateDevicesColumn.safeParse([{ id: 'K181234' }]).success).toBe(false);
    expect(programmePredicateDevicesColumn.safeParse([{ name: 'AeroCheck PF Meter' }]).success).toBe(false);
  });

  it('takes the complete claim, keyed by the submission number', () => {
    expect(
      programmePredicateDevicesColumn.parse([
        { id: 'K181234', name: 'AeroCheck PF Meter', kNumber: 'K181234' },
      ]),
    ).toEqual([{ id: 'K181234', name: 'AeroCheck PF Meter', kNumber: 'K181234' }]);
  });

  it('takes an empty list, because a programme with no predicate states none', () => {
    expect(programmePredicateDevicesColumn.parse([])).toEqual([]);
    expect(programmeTeamMembersColumn.parse([])).toEqual([]);
  });
});
