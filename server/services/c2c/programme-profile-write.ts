/**
 * The one governed write for a regulatory programme's profile columns.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `regulatory_programs` had exactly two writers: the create inside
 * `POST /api/c2c/projects`, and the device-profile `PUT /api/510k/device/profile`
 * — whose patch schema, governed-field discipline and field-named audit row
 * were written for the eSTAR's device facts and lived inside the route file.
 * Nothing else could set a programme column. A status change goes through
 * `transitionProgram`; arbitrary metadata through `mergeProgramMetadata`; and
 * everything in between — the target agencies, the priority, the submission
 * date — through nothing at all.
 *
 * So AnA's `project_setup` interview, whose entire purpose is to configure a
 * programme, had no write to configure one with (2026-10-12 review, task #15).
 * This is that write, extracted from the route rather than written beside it:
 * the route now calls it, so there is still ONE path and the interview cannot
 * acquire a quieter one.
 *
 * ── What it will not set, and why ────────────────────────────────────────────
 * The allowlist is the schema below. Every refusal is a decision, not an
 * omission, and `PROFILE_WRITE_REFUSALS` carries the reason so a caller can
 * report it to the person instead of dropping their answer:
 *
 *   status            `transitionProgram` owns the lifecycle, with its own
 *                     guard and audit. A status set from a side door would
 *                     bypass both.
 *   phase             the WORKFLOW phase ('planning' … 'post_market'). The
 *                     interview's `development_phase` is the DEVELOPMENT phase
 *                     ('preclinical', 'phase_1' …) — a different vocabulary
 *                     with overlapping words, and conflating the two is how a
 *                     programme in phase 1 would be recorded as still planning.
 *   programType       it decides the document scaffold, the rule pack and the
 *                     submission spine, all written in the create's
 *                     transaction. Changing it afterwards leaves those three
 *                     describing a filing the programme no longer is.
 *   productType       decides the client type and the product class, and the
 *                     create refuses a device filing recorded as medicinal
 *                     (`productTypeForIntake`). The same rules cannot be
 *                     re-run from here without re-running the scaffold.
 *   primaryAgency     keys the Module 1 backbone, the validation profile and
 *                     the gateway. Same consistency problem as programType.
 *                     `targetAgencies` IS settable: it is additive, and the
 *                     create writes only `[primaryAgency]` into it.
 *   name / code       a rename is its own governed action in
 *                     `POST /api/c2c/projects`' sibling handlers, and `code`
 *                     is unique per organization with its own disambiguation.
 *   leadUserId        the lead is permanently authorized to mutate the
 *                     programme's evidence (the create says so). An
 *                     authorization fact is not a profile field.
 *   metadata          `mergeProgramMetadata` already merges it, with delete
 *                     semantics this patch has no way to express.
 *
 * `teamMembers` is settable and deliberately NARROWER than the column: a name
 * and a role, never a `userId`. The column's type carries one, and a userId
 * arriving from an interview answer or a tool argument is the authorization
 * leak that `leadUserId` is refused for.
 *
 * ── The two European classifications ────────────────────────────────────────
 * `deviceClass` stays the US 21 CFR 860 class. The column is read by the eSTAR
 * administrative-data projection and the 510(k) surfaces, which print it on a
 * US form, so widening it to the MDR's seven declared classes would put 'IIa'
 * where FDA expects I, II or III.
 *
 * `euMdrClass` and `euIvdrClass` are therefore separate columns, for separate
 * regulations with separate vocabularies — the MDR's seven DECLARED classes
 * and the IVDR's four
 * (migrations/20261012b_regulatory_programs_eu_device_classes.sql). Both are
 * withdrawable by null, because 'Not applicable / No EU filing planned' is an
 * answer the interview offers and it must leave the column blank rather than
 * stand as a class.
 *
 * `regulatoryPath` IS widened — to `REGULATORY_PATHS`, the governed six, from
 * the route's hand-written three. `devicePathFor` can already return `hde`,
 * `ide` and `exempt`, so the narrower enum refused paths the platform's own
 * mapping produces.
 *
 * @module server/services/c2c/programme-profile-write
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { regulatoryPrograms, type PredicateDevice } from '../../../shared/schema/programs.js';
import type { AuditRowOutcome } from '../audit/audit-write-outcome.js';
import type { RequestDb } from '../../db/requestDb.js';
import { REGULATORY_PATHS } from '../../../shared/constants/domain/device-classification.js';
import { isRealCalendarDay } from '../../../shared/calendar-day.js';
export { isRealCalendarDay } from '../../../shared/calendar-day.js';
import {
  DEVICE_CLASSES,
  IVDR_CLASSES,
  MDR_DECLARED_CLASSES,
} from '../../../shared/regulatory/device-class.js';

/** A text fact that may be CLEARED: '' or null ⇒ null; absent ⇒ untouched. */
const clearableText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform(v => {
      if (v === undefined) return undefined;
      const t = v === null ? '' : v.trim();
      return t.length > 0 ? t : null;
    });

/** An optional predicate fact: blank/whitespace/null ⇒ absent (key dropped). */
const optionalPredicateText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform(v => {
      const t = (v ?? '').trim();
      return t.length > 0 ? t : undefined;
    });

const MAX_PREDICATE_DEVICES = 10;

/**
 * The PREDICATE OF RECORD — `regulatory_programs.predicate_devices`.
 *
 * The official eSTAR's predicate submission number and trade name are filled
 * from `predicate_devices[0]`, so an entry here is a claim of substantial
 * equivalence the sponsor makes TO FDA — not a UI comparison selection.
 * id and name are required; a blank optional fact is dropped rather than
 * stored as '' (the eSTAR must print a blank, not an empty string); ids are
 * distinct, so "which one is predicate [0]" has one answer; and the list is
 * clearable, because a withdrawn predicate must leave the form blank rather
 * than stand as a stale claim.
 */
const predicateDeviceSchema = z
  .object({
    id: z.string().min(1).max(100).transform(v => v.trim()),
    name: z.string().min(1).max(500).transform(v => v.trim()),
    kNumber: optionalPredicateText(50),
    manufacturer: optionalPredicateText(500),
    clearanceDate: optionalPredicateText(50),
    productCode: optionalPredicateText(50),
  })
  .refine(p => p.id.length > 0 && p.name.length > 0, {
    message: 'A predicate device needs an id and a name',
  })
  .transform((p): PredicateDevice => {
    const device: PredicateDevice = { id: p.id, name: p.name };
    if (p.kNumber) device.kNumber = p.kNumber;
    if (p.manufacturer) device.manufacturer = p.manufacturer;
    if (p.clearanceDate) device.clearanceDate = p.clearanceDate;
    if (p.productCode) device.productCode = p.productCode;
    return device;
  });

const predicateDevicesPatch = z
  .array(predicateDeviceSchema)
  .max(MAX_PREDICATE_DEVICES)
  .nullable()
  .optional()
  .transform(v => (v === undefined ? undefined : (v ?? [])))
  .refine(v => v === undefined || new Set(v.map(p => p.id.toUpperCase())).size === v.length, {
    message: 'Each predicate device must be listed once',
  });

/** A team member as this write records one: a name, and the role they hold. */
const teamMemberSchema = z.object({
  name: z.string().min(1).max(200).transform(v => v.trim()),
  role: z.string().min(1).max(100).optional().transform(v => (v ? v.trim() : undefined)),
});

/**
 * The columns a programme-profile write may set. Everything else is refused.
 *
 * One SHAPE, two entry points. The device-profile endpoint carries the
 * `device_assembly_readiness` entitlement and was written for the eSTAR's
 * device facts, so it keeps exactly the fields it had: widening an entitled
 * endpoint's reach as a side effect of giving the interview a write would be a
 * second defect, not a refactor. The interview's commit takes the whole shape.
 */
const PROFILE_SHAPE = {
  productName: z.string().min(1).max(500).optional(),
  /* The US 21 CFR 860 class. The two European ones are separate columns, for
     separate regulations — see the module note. */
  deviceClass: z.enum(DEVICE_CLASSES).optional(),
  /* The MDR class AS DECLARED — seven, not the four the rules yield, because
     Is, Im and Ir are what a sponsor declares and the notified body's
     involvement for that one aspect follows from them (Art 52(7)).
     Withdrawable by null: 'no EU filing planned' is an answer the interview
     offers, and it must leave the column blank rather than stand as a class. */
  euMdrClass: z.enum(MDR_DECLARED_CLASSES).nullable().optional(),
  euIvdrClass: z.enum(IVDR_CLASSES).nullable().optional(),
  regulatoryPath: z.enum(REGULATORY_PATHS).optional(),
  productCode: z.string().min(1).max(50).optional(),
  intendedUse: z.string().max(10_000).optional(),
  indication: z.string().max(10_000).optional(),
  description: clearableText(4_000),
  /* The device-level eSTAR administrative facts. Each may be cleared,
     because a fact the platform does not hold must be BLANK on the official
     form, never a stale value. */
  commonName: clearableText(500),
  classificationName: clearableText(500),
  regulationNumber: clearableText(50),
  associatedProductCodes: clearableText(500),
  indicationsForUseCitation: clearableText(1000),
  predicateDevices: predicateDevicesPatch,
  /* Additive: the create writes `[primaryAgency]`, and the agencies beyond
     the primary one are asked nowhere else. */
  targetAgencies: z.array(z.string().min(1).max(100)).max(20).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  /* 'YYYY-MM-DD', as the wizard's date input and the interview both give it;
     cleared by null, because a date that is no longer planned must not stand. */
  targetSubmissionDate: z
    .union([
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine(isRealCalendarDay, { message: 'not a day on the calendar' }),
      z.null(),
    ])
    .optional(),
  teamMembers: z.array(teamMemberSchema).max(50).optional(),
} as const;

const atLeastOne = { message: 'At least one field is required' } as const;
const someField = (p: Record<string, unknown>) => Object.values(p).some(v => v !== undefined);

/** Every settable column — what AnA's interview commit projects onto. */
export const programmeProfilePatchSchema = z.object(PROFILE_SHAPE).refine(someField, atLeastOne);

/**
 * The two json columns of a programme row, for a writer that is not this one.
 *
 * `POST /api/c2c/projects` builds its own raw INSERT and wrote both by hand:
 * `team_members` as a bare string array and `predicate_devices` as
 * `[{ kNumber }]` with no id and no name — shapes this write refuses, so a row
 * it created could not round-trip through the write that owns the column
 * (2026-10-19). Exported rather than restated: one definition per column.
 */
export const programmeTeamMembersColumn = PROFILE_SHAPE.teamMembers;
export const programmePredicateDevicesColumn = PROFILE_SHAPE.predicateDevices;

/** The device-profile endpoint's own fields, unchanged from before this module. */
export const deviceProfilePatchSchema = z
  .object({
    productName: PROFILE_SHAPE.productName,
    deviceClass: PROFILE_SHAPE.deviceClass,
    regulatoryPath: PROFILE_SHAPE.regulatoryPath,
    productCode: PROFILE_SHAPE.productCode,
    intendedUse: PROFILE_SHAPE.intendedUse,
    indication: PROFILE_SHAPE.indication,
    commonName: PROFILE_SHAPE.commonName,
    classificationName: PROFILE_SHAPE.classificationName,
    regulationNumber: PROFILE_SHAPE.regulationNumber,
    associatedProductCodes: PROFILE_SHAPE.associatedProductCodes,
    indicationsForUseCitation: PROFILE_SHAPE.indicationsForUseCitation,
    predicateDevices: PROFILE_SHAPE.predicateDevices,
  })
  .refine(someField, atLeastOne);

export type ProgrammeProfilePatch = Partial<z.infer<typeof programmeProfilePatchSchema>>;

/** The column names this write can set, for the gate that holds the two agree. */
export function programmeProfileFields(): string[] {
  return Object.keys(PROFILE_SHAPE);
}

/**
 * The columns this write refuses, each with the reason and the path that owns
 * it. A caller holding one of these facts reports it rather than dropping it.
 */
export const PROFILE_WRITE_REFUSALS: Readonly<Record<string, string>> = {
  status: 'The programme lifecycle is transitionProgram’s, with its own guard and audit row.',
  phase:
    'The workflow phase (planning … post_market) is not the development phase (preclinical, phase 1 …). They share words and mean different things, so this write sets neither.',
  programType:
    'The filing type decides the document scaffold, the rule pack and the submission spine, all written in the create’s transaction. Changing it here would leave those describing a filing the programme no longer is.',
  productType:
    'The product class decides the client type and is refused by the create where it contradicts the filing type. It cannot be re-decided without re-running the scaffold.',
  primaryAgency:
    'The primary agency keys the Module 1 backbone, the validation profile and the gateway. targetAgencies is settable; the primary one is not.',
  name: 'A rename is its own governed action, with its own audit of the field that changed.',
  code: 'The programme code is unique per organization and has its own disambiguation in the create.',
  leadUserId:
    'The lead is permanently authorized to mutate the programme’s evidence, so the lead is an authorization fact rather than a profile field.',
  metadata: 'mergeProgramMetadata already merges metadata, with delete semantics this patch cannot express.',
};

/**
 * The drizzle instance to write on. The device-profile route passes its
 * REQUEST-SCOPED client (`requestDb(req)`) so the write runs under RLS as well
 * as under the explicit `organization_id` predicate below; a caller with no
 * request — the interview commit — passes the shared one.
 */
export type ProfileWriteDb = Pick<RequestDb, 'update' | 'select'>;

/**
 * The audit writer — and it RETURNS its outcome.
 *
 * `auditService.logAction` does not reject when a persistence attempt fails:
 * an audit-trail outage must not break the action it records. So reading the
 * result is the ONLY way to tell a recorded change from an unrecorded one, and
 * this write discarded it — the programme changed, no §11.10(e) row was
 * written, and the route answered 200 while the interview marked its session
 * committed (2026-10-13 audit). `recordAuditRow` is the canonical wrapper that
 * turns the call into an outcome, and both callers now pass it.
 */
export interface ProfileWriteAudit {
  logAction: (row: {
    organizationId: number;
    userId: number;
    action: string;
    resourceType: string;
    resourceId: string;
    details: Record<string, unknown>;
  }) => Promise<AuditRowOutcome>;
}

export interface ProgrammeProfileWriteParams {
  organizationId: number;
  programId: string;
  /** The session's actor. Part 11 §11.10(e): no actor, no write — the caller refuses first. */
  actorId: number;
  patch: ProgrammeProfilePatch;
  /** The audit action to record. Defaults to the device profile's, which is the only one today. */
  action?: string;
}

export interface ProgrammeProfileWriteResult {
  /** The column names this write set, in the order the schema declares them. */
  fields: string[];
  /** The audit details recorded, so a caller can report what an inspector will read. */
  auditDetails: Record<string, unknown>;
  /**
   * Whether the §11.10(e) row landed. The change is already committed when
   * this is known, so a lost row is not a reason to undo something the tenant
   * can already see — it is a reason to SAY so, which both callers do.
   */
  audit: AuditRowOutcome;
}

/** This write refused to touch the programme, with the reason. */
export class ProgrammeProfileWriteRefused extends Error {
  constructor(
    readonly code: 'PROGRAMME_NOT_FOUND' | 'FIELD_NOT_SETTABLE',
    message: string,
  ) {
    super(message);
    this.name = 'ProgrammeProfileWriteRefused';
  }
}

/**
 * The row's value for a patch field. `to_jsonb(row)` is keyed by COLUMN name
 * (`device_class`), the patch by property name (`deviceClass`), so the mapping
 * comes from the table definition rather than a second naming convention.
 */
function columnValueOf(snapshot: Record<string, unknown>, field: string): unknown {
  const column = (regulatoryPrograms as unknown as Record<string, { name?: string }>)[field];
  const name = column?.name ?? field;
  return snapshot?.[name] ?? null;
}

/**
 * Apply a parsed profile patch to one programme, org-scoped, and record the
 * field names an inspector would ask about.
 *
 * Only the fields the patch NAMED reach the UPDATE: an absent clearable field
 * is `undefined` after parsing and must not be written as NULL.
 */
export async function applyProgrammeProfilePatch(
  deps: { db: ProfileWriteDb; audit: ProfileWriteAudit },
  params: ProgrammeProfileWriteParams,
): Promise<ProgrammeProfileWriteResult> {
  const named = Object.fromEntries(
    Object.entries(params.patch).filter(([, v]) => v !== undefined),
  ) as Record<string, unknown>;

  /* The allowlist, enforced HERE and not only at the callers' zod.
     `applyProgrammeProfilePatch` spread every key of the patch into `.set()`,
     and drizzle writes any real column it finds — `status`, `leadUserId`,
     `organizationId`, `metadata`. The interview's writer also passed the
     plan's body UNPARSED, so zod's stripping never applied to it. Nothing
     could emit those keys today, which is the whole reason to close it now
     rather than after something can (2026-10-13 audit). */
  const settable = new Set(programmeProfileFields());
  const forbidden = Object.keys(named).filter(key => !settable.has(key));
  if (forbidden.length > 0) {
    throw new ProgrammeProfileWriteRefused(
      'FIELD_NOT_SETTABLE',
      `Not a settable programme-profile column: ${forbidden.join(', ')}. ` +
        `${Object.keys(PROFILE_WRITE_REFUSALS).includes(forbidden[0]!) ? PROFILE_WRITE_REFUSALS[forbidden[0]!] : ''}`.trim(),
    );
  }

  const values: Record<string, unknown> = { ...named, updatedAt: new Date() };
  /* The column is a timestamp; the patch carries the day, as both callers have
     it. `null` clears a date that is no longer planned, and the schema has
     already refused a day that is not on the calendar. */
  if ('targetSubmissionDate' in named) {
    const day = named.targetSubmissionDate;
    values.targetSubmissionDate = typeof day === 'string' ? new Date(`${day}T00:00:00.000Z`) : null;
  }

  const scope = and(
    eq(regulatoryPrograms.id, params.programId),
    eq(regulatoryPrograms.organizationId, params.organizationId),
    /* A programme its organization has deleted is not theirs to reconfigure.
       The validator's `programInOrganization` filtered deleted rows, but only
       there — a check-then-act the write itself did not repeat. */
    isNull(regulatoryPrograms.deletedAt),
  );

  /* What the fields held BEFORE. §11.10(e) says previous entries shall not be
     obscured, and `writeChainedAuditRow` stores `old_values = null`, so the
     overwritten value was destroyed with nothing able to recover it. */
  const [before] = await deps.db
    .select({ snapshot: sql<Record<string, unknown>>`to_jsonb(${regulatoryPrograms})` })
    .from(regulatoryPrograms)
    .where(scope);
  if (!before) {
    throw new ProgrammeProfileWriteRefused(
      'PROGRAMME_NOT_FOUND',
      'No such programme in this organization, or it has been deleted.',
    );
  }

  /* `.returning()` so a zero-row UPDATE cannot pass for a change. Without it
     an update that matched nothing — a row removed between the check and the
     act, or filtered by RLS — wrote an audit row naming fields it had not
     set. */
  const updated = await deps.db.update(regulatoryPrograms).set(values).where(scope).returning({
    id: regulatoryPrograms.id,
  });
  if (updated.length === 0) {
    throw new ProgrammeProfileWriteRefused(
      'PROGRAMME_NOT_FOUND',
      'The programme was not updated: it is no longer in this organization, or it has been deleted.',
    );
  }

  /* WHICH predicate was claimed travels with the entry. The field NAME alone
     answers "someone changed the predicate"; an inspector asking "equivalent
     to WHAT, and who said so" needs the identities, and a cleared list ([]) is
     itself the answer to "when did they withdraw the claim". */
  const auditDetails: Record<string, unknown> = {
    fields: Object.keys(named),
    /* Before and after, per field the patch named — the question an inspector
       actually asks. Only those fields, because a whole-row snapshot in every
       audit row is a different decision with a storage cost. */
    before: Object.fromEntries(
      Object.keys(named).map(field => [field, columnValueOf(before.snapshot, field)]),
    ),
    after: Object.fromEntries(Object.keys(named).map(field => [field, named[field]])),
  };
  const predicates = named.predicateDevices as PredicateDevice[] | undefined;
  if (predicates) auditDetails.predicateDevices = predicates.map(p => p.kNumber ?? p.id);

  const audit = await deps.audit.logAction({
    organizationId: params.organizationId,
    userId: params.actorId,
    action: params.action ?? 'DEVICE_PROFILE_UPDATED',
    resourceType: 'regulatory_program',
    resourceId: params.programId,
    details: auditDetails,
  });

  return { fields: Object.keys(named), auditDetails, audit };
}
