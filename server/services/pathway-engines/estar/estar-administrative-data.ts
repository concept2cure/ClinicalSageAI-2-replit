/**
 * eSTAR administrative data (WO-8 Phase 2) — where the official form's values
 * come from, and the proof of it.
 *
 * `POST /api/510k/estar/official` fills the real FDA eSTAR, but nothing upstream
 * supplied the canonical values: the one caller sent `data: {}` and the user
 * downloaded a blank official form. This module is the ONE place that decides
 * which governed record supplies each mapped field, projects those records onto
 * the canonical keys with per-field provenance, and merges a caller's request
 * data underneath them.
 *
 * HONEST-BY-CONSTRUCTION:
 *   - `ESTAR_ADMINISTRATIVE_SOURCES` is the reviewable table of the ONLY places
 *     a value may come from. Every key of the 510(k) device field map must
 *     appear, so a new mapped key cannot ship without a declared source (a
 *     test pins this). Since WO-8 Phase 3 every mapped key HAS a governed home:
 *     device-level facts on `regulatory_programs` (the device profile writes
 *     them), org-level correspondent / Declaration of Conformity facts on the
 *     org's `estar_registrations` row. A key with `null` would be user-supplied
 *     only; a test asserts none remain for the 510(k) device and IVD maps.
 *     The Declaration of Conformity is a signed statement by ONE legal entity,
 *     so its company NAME and company ADDRESS are read from that one
 *     registration row. The name keeps the applicant's workspace name, then the
 *     organization name, behind it as fallbacks — the value it resolved to
 *     before the column existed — so an organization that has not filled it in
 *     is unchanged, and one that has gets a declaration whose name and address
 *     name the same entity. The PAIR is resolved as a UNIT: the registration's
 *     address is used only when the NAME came off that same row. When the name
 *     falls back to the workspace or the organization the address is BLANK —
 *     the platform holds no address for either of those entities, and a blank
 *     field (its `declaredSource` still naming the registration column) is a
 *     gap the operator closes, where a mismatched one is filed as fact.
 *   - The projection never invents: an empty / whitespace / null column is an
 *     ABSENT key, never ''. No session user, no portal e-mail, no address.
 *   - Governed wins. A request value fills only a key the governed records do
 *     not hold; a colliding or unknown request key is dropped AND REPORTED, so
 *     the surface can say exactly what was and was not written.
 *   - Every resolved field carries its `declaredSource` — the PRIMARY governed
 *     store.column for the key — even when the value is blank, so a surface
 *     can say "not set; set it in the device profile" instead of offering a
 *     value it does not hold.
 *   - The loader is org-scoped on every query and reaches `client_workspaces`
 *     only through the program's PM-spine anchor (never a request header). A
 *     database without `projects.regulatory_program_id` (42703) answers "no
 *     anchor" — the same posture as program-project-anchor — never a throw.
 *
 * Sourced values are the organization's data: nothing in this module logs them.
 *
 * @module server/services/pathway-engines/estar/estar-administrative-data
 */

import { and, asc, eq } from 'drizzle-orm';
import { clientWorkspaces, fda510kProjects, organizations, projects } from '../../../../shared/schema';
import { regulatoryPrograms, type PredicateDevice } from '../../../../shared/schema/programs';
import { estarRegistrations } from '../../../../shared/schema/estar-registration';
import type { RequestDb } from '../../../db/requestDb';
import { isMissingAnchorColumn } from '../../c2c/program-project-anchor';
import type { OfficialPdfFieldMap } from '../../forms/fill-official-pdf';

// ── The governed-sources table ────────────────────────────────────────────────

/** The stores an administrative value may be read from. Nothing else. */
export type GovernedStore =
  | 'regulatory_programs'
  | 'organizations'
  | 'client_workspaces'
  | 'fda_510k_projects'
  | 'estar_registrations';

export interface GovernedSourceRef {
  store: GovernedStore;
  /** Column, or a JSON path into one (`predicate_devices[0].kNumber`). */
  column: string;
}

export interface GovernedSource extends GovernedSourceRef {
  /**
   * Consulted only while no earlier source holds a value. A list is read in
   * order, so a key whose old home must survive the arrival of a new primary
   * one (declarationCompanyName) can name the whole chain instead of dropping
   * a link.
   */
  fallback?: GovernedSourceRef | GovernedSourceRef[];
  note?: string;
}

/** The fallbacks of a source, in the order they are consulted. */
function fallbackChain(source: GovernedSource): GovernedSourceRef[] {
  if (!source.fallback) return [];
  return Array.isArray(source.fallback) ? source.fallback : [source.fallback];
}

/**
 * Canonical key → governed source. `null` would mean USER-SUPPLIED ONLY (the
 * platform holds no such fact; only the request body may carry it); since
 * WO-8 Phase 3 no key of the 510(k) device or IVD map is null.
 */
export const ESTAR_ADMINISTRATIVE_SOURCES: Record<string, GovernedSource | null> = {
  deviceTradeName: {
    store: 'regulatory_programs',
    column: 'product_name',
    fallback: { store: 'fda_510k_projects', column: 'device_name' },
    note: 'fallback: fda_510k_projects.device_name when the program row has none',
  },
  deviceCommonName: { store: 'regulatory_programs', column: 'common_name' },
  deviceClassificationName: { store: 'regulatory_programs', column: 'classification_name' },
  regulationNumber: {
    store: 'regulatory_programs',
    column: 'regulation_number',
    fallback: { store: 'fda_510k_projects', column: 'regulation_number' },
    note: 'fallback: the GA row’s regulation_number, only when the anchor row exists',
  },
  productCodes: {
    store: 'regulatory_programs',
    column: 'product_code',
    fallback: { store: 'fda_510k_projects', column: 'product_code' },
  },
  associatedProductCodes: { store: 'regulatory_programs', column: 'associated_product_codes' },
  applicantCompanyName: {
    store: 'client_workspaces',
    column: 'name',
    fallback: { store: 'organizations', column: 'name' },
    note:
      'the workspace the program’s anchor project belongs to (projects.client_workspace_id); ' +
      'organizations.name when the program has no anchor project',
  },
  applicantContactEmail: {
    store: 'client_workspaces',
    column: 'contact_email',
    note: 'the anchor project’s workspace contact; absent when no anchor/workspace/contact',
  },
  applicantContactTelephone: { store: 'client_workspaces', column: 'contact_phone' },
  applicantSummaryEmail: {
    store: 'client_workspaces',
    column: 'contact_email',
    note: 'same fact as applicantContactEmail',
  },
  correspondentCompanyName: { store: 'estar_registrations', column: 'correspondent_company_name' },
  correspondentContactEmail: { store: 'estar_registrations', column: 'correspondent_contact_email' },
  correspondentTelephone: { store: 'estar_registrations', column: 'correspondent_telephone' },
  correspondentSummaryEmail: {
    store: 'estar_registrations',
    column: 'correspondent_contact_email',
    note: 'same fact as correspondentContactEmail',
  },
  predicateSubmissionNumber: {
    store: 'regulatory_programs',
    column: 'predicate_devices[0].kNumber',
    note: 'first predicate only; absent when the list is empty or kNumber missing',
  },
  predicateDeviceTradeName: { store: 'regulatory_programs', column: 'predicate_devices[0].name' },
  declarationCompanyName: {
    store: 'estar_registrations',
    column: 'declaration_company_name',
    fallback: [
      { store: 'client_workspaces', column: 'name' },
      { store: 'organizations', column: 'name' },
    ],
    note:
      'the Declaration of Conformity is signed by ONE legal entity, so the name pairs with ' +
      'declaration_company_address on the SAME registration row — client_workspaces holds no ' +
      'address, so reading the name from there put one entity’s name beside another’s address ' +
      'for an org that files for several clients; the workspace then organization name stay as ' +
      'fallbacks so a registration that carries neither half resolves exactly what it did ' +
      'before, but they are SUPPRESSED once the registration holds an address, so the pair can ' +
      'never name two entities',
  },
  declarationCompanyAddress: {
    store: 'estar_registrations',
    column: 'declaration_company_address',
    note:
      'the other half of the Declaration of Conformity’s ONE legal entity. Saving it suppresses ' +
      'the name’s workspace/organization fallbacks, so the name reports blank until the operator ' +
      'sets it here too — the address they entered is never discarded, and the two halves can ' +
      'never name two entities',
  },
  declarationDeviceTradeName: {
    store: 'regulatory_programs',
    column: 'product_name',
    fallback: { store: 'fda_510k_projects', column: 'device_name' },
    note:
      'same fact as deviceTradeName, so the same resolution rule applies — including the ' +
      'fda_510k_projects.device_name fallback the contract lists only against deviceTradeName; ' +
      'the two keys can never resolve to different values',
  },
  indicationsForUseCitation: { store: 'regulatory_programs', column: 'indications_for_use_citation' },
};

// ── Pure projection ───────────────────────────────────────────────────────────

/** The governed records the projection reads. Absent/null ⇒ no values from that store. */
export interface EstarAdministrativeInputs {
  program?: {
    productName?: string | null;
    productCode?: string | null;
    predicateDevices?: unknown;
    commonName?: string | null;
    classificationName?: string | null;
    regulationNumber?: string | null;
    associatedProductCodes?: string | null;
    indicationsForUseCitation?: string | null;
  } | null;
  organization?: { name?: string | null } | null;
  /** The org's single eSTAR registration row — org-level, independent of the anchor. */
  registration?: {
    correspondentCompanyName?: string | null;
    correspondentContactEmail?: string | null;
    correspondentTelephone?: string | null;
    declarationCompanyName?: string | null;
    declarationCompanyAddress?: string | null;
  } | null;
  /** The anchor project's client workspace — reached only through the anchor. */
  workspace?: {
    name?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
  } | null;
  fda510kProject?: {
    deviceName?: string | null;
    regulationNumber?: string | null;
    productCode?: string | null;
  } | null;
}

export interface GovernedAdministrativeData {
  values: Record<string, string>;
  /** `store.column` for every key in `values`. */
  provenance: Record<string, string>;
  /**
   * Things the values cannot say for themselves — governed data the template
   * has no box for, so the fill is correct as far as it goes and the user must
   * finish the rest on the form. Carried to the field report verbatim.
   */
  advisories?: string[];
}

/** A value is a non-empty string after trimming; anything else is no value. */
function text(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

/** The first predicate device, when the JSON column actually holds a list. */
function firstPredicate(raw: unknown): Partial<PredicateDevice> | null {
  let list = raw;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list) || list.length === 0) return null;
  const first = list[0];
  return first && typeof first === 'object' ? (first as Partial<PredicateDevice>) : null;
}

/** Every predicate on file, or [] — the counterpart to firstPredicate. */
function predicateList(raw: unknown): Array<Partial<PredicateDevice>> {
  let list = raw;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { return []; }
  }
  return Array.isArray(list) ? list.filter((p): p is Partial<PredicateDevice> => !!p && typeof p === 'object') : [];
}

/**
 * One reader per `store.column` the table names. Keyed by the same string the
 * provenance carries, so a source declared in the table without a reader here
 * fails loudly (a thrown error in the test suite), never silently blank.
 */
const READERS: Record<string, (input: EstarAdministrativeInputs) => string | null> = {
  'regulatory_programs.product_name': (i) => text(i.program?.productName),
  'regulatory_programs.product_code': (i) => text(i.program?.productCode),
  'regulatory_programs.common_name': (i) => text(i.program?.commonName),
  'regulatory_programs.classification_name': (i) => text(i.program?.classificationName),
  'regulatory_programs.regulation_number': (i) => text(i.program?.regulationNumber),
  'regulatory_programs.associated_product_codes': (i) => text(i.program?.associatedProductCodes),
  'regulatory_programs.indications_for_use_citation': (i) => text(i.program?.indicationsForUseCitation),
  'estar_registrations.correspondent_company_name': (i) => text(i.registration?.correspondentCompanyName),
  'estar_registrations.correspondent_contact_email': (i) => text(i.registration?.correspondentContactEmail),
  'estar_registrations.correspondent_telephone': (i) => text(i.registration?.correspondentTelephone),
  'estar_registrations.declaration_company_name': (i) => text(i.registration?.declarationCompanyName),
  'estar_registrations.declaration_company_address': (i) => text(i.registration?.declarationCompanyAddress),
  'regulatory_programs.predicate_devices[0].kNumber': (i) =>
    text(firstPredicate(i.program?.predicateDevices)?.kNumber),
  'regulatory_programs.predicate_devices[0].name': (i) =>
    text(firstPredicate(i.program?.predicateDevices)?.name),
  'organizations.name': (i) => text(i.organization?.name),
  'client_workspaces.name': (i) => text(i.workspace?.name),
  'client_workspaces.contact_email': (i) => text(i.workspace?.contactEmail),
  'client_workspaces.contact_phone': (i) => text(i.workspace?.contactPhone),
  'fda_510k_projects.device_name': (i) => text(i.fda510kProject?.deviceName),
  'fda_510k_projects.regulation_number': (i) => text(i.fda510kProject?.regulationNumber),
  'fda_510k_projects.product_code': (i) => text(i.fda510kProject?.productCode),
};

function readSource(ref: GovernedSourceRef, input: EstarAdministrativeInputs): string | null {
  const key = `${ref.store}.${ref.column}`;
  const reader = READERS[key];
  if (!reader) throw new Error(`ESTAR_ADMINISTRATIVE_SOURCES names "${key}" but no reader exists for it`);
  return reader(input);
}

/**
 * Pure: project the governed records onto the canonical keys. A key appears in
 * `values` only when its declared source (or fallback) holds a real value, and
 * `provenance[key]` names exactly which one did. No DB.
 */
export function projectEstarAdministrativeData(
  input: EstarAdministrativeInputs,
): GovernedAdministrativeData {
  const values: Record<string, string> = {};
  const provenance: Record<string, string> = {};
  for (const [key, source] of Object.entries(ESTAR_ADMINISTRATIVE_SOURCES)) {
    if (!source) continue;
    const primary = readSource(source, input);
    if (primary !== null) {
      values[key] = primary;
      provenance[key] = `${source.store}.${source.column}`;
      continue;
    }
    for (const ref of fallbackChain(source)) {
      const secondary = readSource(ref, input);
      if (secondary === null) continue;
      values[key] = secondary;
      provenance[key] = `${ref.store}.${ref.column}`;
      break;
    }
  }

  /*
   * The Declaration of Conformity is ONE legal entity's signed statement, so its
   * name and address resolve AS A UNIT: the two halves may never come from
   * different entities. `client_workspaces` and `organizations` hold no address,
   * so the pair can only ever be whole on the registration row.
   *
   * When the operator has saved a declaration ADDRESS but not yet the NAME, the
   * name's fallback chain is SUPPRESSED and the name reports blank — it does not
   * fall back to the workspace or the organization. The address they entered is
   * kept, and the blank name still carries its declaredSource, so the surface
   * asks them for exactly the missing half.
   *
   * The opposite rule — keeping the fallback name and dropping the address —
   * was considered and rejected: it discards a value the operator deliberately
   * typed into a field labelled for this purpose, and the preview would then
   * tell them to set an address that is already stored. Withholding a value
   * nobody supplied is a gap; discarding one they did supply, and then denying
   * it exists, is a lie about their own data.
   */
  if (
    values.declarationCompanyAddress !== undefined &&
    provenance.declarationCompanyName !== 'estar_registrations.declaration_company_name'
  ) {
    delete values.declarationCompanyName;
    delete provenance.declarationCompanyName;
  }

  // The eSTAR's mapped predicate fields hold ONE device, and the program's
  // predicate list is a plain array in insertion order with no primary
  // designation. Writing the first and saying nothing about the rest left a
  // sponsor with two predicates — or with a reference device entered first —
  // reading a filled form that named one and dropped the others silently.
  const advisories: string[] = [];
  const predicates = predicateList(input.program?.predicateDevices);
  if (predicates.length > 1) {
    const first = predicates[0];
    const named = text(first.kNumber) ?? text(first.name) ?? 'the first entry';
    advisories.push(
      `${predicates.length} predicate devices are on file for this program; the eSTAR predicate fields ` +
        `carry only the first (${named}). Add the others on the form itself, and check that the first ` +
        `entered is the primary predicate.`,
    );
  }

  return { values, provenance, ...(advisories.length ? { advisories } : {}) };
}

// ── Governed ∪ request → what the fill writes ─────────────────────────────────

export interface ResolvedOfficialField {
  key: string;
  caption: string;
  xfaSomPath: string | null;
  value: string | null;
  /** `store.column` for a governed value, `'request'` for a caller-supplied one, null when blank. */
  source: string | null;
  /**
   * The PRIMARY governed `store.column` declared for this key — set even when
   * `value` is blank, so the surface can name where the durable home is. Null
   * only when the key has no declared source.
   */
  declaredSource: string | null;
}

/** The primary `store.column` the sources table declares for a key, or null. */
export function declaredSourceFor(key: string): string | null {
  const source = ESTAR_ADMINISTRATIVE_SOURCES[key];
  return source ? `${source.store}.${source.column}` : null;
}

export interface ResolveOfficialEstarFieldsInput {
  fieldMap: OfficialPdfFieldMap;
  governed: GovernedAdministrativeData;
  requestData?: Record<string, unknown>;
  /**
   * The only permitted value. Typed as the literal so the precedence rule is
   * visible at every call site and cannot be flipped by a stray boolean.
   */
  honourRequestOverGoverned?: false;
}

export interface ResolvedOfficialEstarFields {
  /** Exactly the canonical values handed to the fill — nothing else. */
  data: Record<string, unknown>;
  /** One entry per mapped key, in field-map order. */
  fields: ResolvedOfficialField[];
  /** Request keys that were NOT written: unknown to the map, colliding with a governed value, or unusable. */
  ignoredRequestKeys: string[];
  /** Governed facts the template has no box for (see GovernedAdministrativeData.advisories). */
  advisories: string[];
}

/**
 * Merge the governed values with a caller's request data for one field map.
 * Governed wins; a request value fills only a key with no governed value; every
 * request key that did not end up written is listed in `ignoredRequestKeys`.
 */
export function resolveOfficialEstarFields(
  input: ResolveOfficialEstarFieldsInput,
): ResolvedOfficialEstarFields {
  const request = input.requestData ?? {};
  const data: Record<string, unknown> = {};
  const fields: ResolvedOfficialField[] = [];
  const written = new Set<string>();

  for (const [key, spec] of Object.entries(input.fieldMap)) {
    const governed = input.governed.values[key];
    let value: string | null = null;
    let source: string | null = null;
    if (governed !== undefined) {
      value = governed;
      source = input.governed.provenance[key] ?? null;
    } else {
      const fromRequest = text(request[key]);
      if (fromRequest !== null) {
        value = fromRequest;
        source = 'request';
        written.add(key);
      }
    }
    if (value !== null) data[key] = value;
    fields.push({
      key,
      caption: spec.caption ?? key,
      xfaSomPath: spec.xfaSomPath ?? null,
      value,
      source,
      declaredSource: declaredSourceFor(key),
    });
  }

  const ignoredRequestKeys = Object.keys(request).filter((k) => !written.has(k));
  return { data, fields, ignoredRequestKeys, advisories: [...(input.governed.advisories ?? [])] };
}

export interface OfficialEstarFieldReport {
  mappedCount: number;
  filledCount: number;
  blankCount: number;
  blankKeys: string[];
  fields: Array<{
    key: string;
    caption: string;
    filled: boolean;
    source: string | null;
    /** The key's declared governed home, blank or not (see ResolvedOfficialField). */
    declaredSource: string | null;
  }>;
  ignoredRequestKeys: string[];
  /** Governed facts the fill could not express; the user finishes these on the form. */
  advisories: string[];
}

/**
 * Pure: what the fill ACTUALLY wrote, per mapped field. `filled` is read off
 * the fill result's own `filledFields`, not off whether a value existed — a
 * value the template skipped is still reported blank. `fieldSources` is the
 * provenance of the written fields only, shaped for the artifact metadata.
 *
 * `ignoredRequestKeys` is completed here, not only at resolution time: a
 * request value that resolution accepted (source 'request') but the template
 * then skipped — no SOM path, not in the datasets skeleton — was dropped just
 * as surely as a colliding one, and the caller is told so. Resolution's list
 * comes first, then the skipped request keys in field-map order; a key is
 * listed once.
 */
export function reportOfficialEstarFill(
  resolved: ResolvedOfficialEstarFields,
  filledFields: ReadonlyArray<string>,
): { fieldReport: OfficialEstarFieldReport; fieldSources: Record<string, string> } {
  const filledSet = new Set(filledFields);
  const fields = resolved.fields.map((f) => ({
    key: f.key,
    caption: f.caption,
    filled: filledSet.has(f.key),
    source: filledSet.has(f.key) ? f.source : null,
    declaredSource: f.declaredSource,
  }));
  const blank = fields.filter((f) => !f.filled);
  const fieldSources: Record<string, string> = {};
  for (const f of fields) if (f.filled && f.source) fieldSources[f.key] = f.source;
  const ignoredRequestKeys = [...resolved.ignoredRequestKeys];
  for (const f of resolved.fields) {
    if (f.source === 'request' && !filledSet.has(f.key) && !ignoredRequestKeys.includes(f.key)) {
      ignoredRequestKeys.push(f.key);
    }
  }
  return {
    fieldReport: {
      mappedCount: fields.length,
      filledCount: fields.length - blank.length,
      blankCount: blank.length,
      blankKeys: blank.map((f) => f.key),
      fields,
      ignoredRequestKeys,
      advisories: [...resolved.advisories],
    },
    fieldSources,
  };
}

// ── DB loader ─────────────────────────────────────────────────────────────────

export interface LoadEstarAdministrativeInputsParams {
  organizationId: number;
  /** regulatory_programs.id when the export ident named a program. */
  programUuid: string | null;
  /** fda_510k_projects.id when the export ident was the numeric GA project id. */
  fda510kProjectId: number | null;
}

interface AnchorProjectRow {
  id: number;
  clientWorkspaceId: number | null;
}

/**
 * The PM-spine project anchored to a program, org-scoped. Null when there is no
 * anchor — including when `projects.regulatory_program_id` is not present in
 * this database (42703), which is "no anchor", not a failure.
 *
 * ORDER BY id: `projects.regulatory_program_id` is not unique, so `LIMIT 1`
 * alone would let Postgres hand back whichever row it reached first. The
 * intake writer (ensureProgramProjectAnchor) links to the lowest id
 * (`ORDER BY id LIMIT 1`), so this loader reads the workspace of the same row
 * that intake considers THE anchor, and the same row on every call — the
 * governed values on the form cannot flip between two exports of one program.
 */
async function findAnchorProjectByProgram(
  db: RequestDb,
  programUuid: string,
  organizationId: number,
): Promise<AnchorProjectRow | null> {
  try {
    const [row] = await db
      .select({ id: projects.id, clientWorkspaceId: projects.clientWorkspaceId })
      .from(projects)
      .where(and(eq(projects.regulatoryProgramId, programUuid), eq(projects.organizationId, organizationId)))
      .orderBy(asc(projects.id))
      .limit(1);
    return row ?? null;
  } catch (err) {
    if (isMissingAnchorColumn(err)) return null;
    throw err;
  }
}

/** The program a PM-spine project anchors, org-scoped; null without the anchor column. */
async function readProjectProgramId(
  db: RequestDb,
  projectId: number,
  organizationId: number,
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ regulatoryProgramId: projects.regulatoryProgramId })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
      .limit(1);
    return row?.regulatoryProgramId ?? null;
  } catch (err) {
    if (isMissingAnchorColumn(err)) return null;
    throw err;
  }
}

interface Fda510kRow {
  deviceName: string | null;
  regulationNumber: string | null;
  productCode: string | null;
  projectId: number;
}

const FDA_COLUMNS = {
  deviceName: fda510kProjects.deviceName,
  regulationNumber: fda510kProjects.regulationNumber,
  productCode: fda510kProjects.productCode,
  projectId: fda510kProjects.projectId,
};

/**
 * The three records an export ident reaches, org-scoped:
 *
 *   numeric ident → fda_510k_projects → its projects row (workspace) → that
 *                   project's regulatory_program_id → the program;
 *   uuid ident    → the program → projects.regulatory_program_id (workspace)
 *                   → the fda_510k_projects row on that project.
 */
async function resolveAnchorRecords(
  db: RequestDb,
  { organizationId, programUuid, fda510kProjectId }: LoadEstarAdministrativeInputsParams,
): Promise<{ programId: string | null; fda: Fda510kRow | null; anchor: AnchorProjectRow | null }> {
  if (fda510kProjectId !== null) {
    const [fda] = await db
      .select(FDA_COLUMNS)
      .from(fda510kProjects)
      .where(and(eq(fda510kProjects.id, fda510kProjectId), eq(fda510kProjects.organizationId, organizationId)))
      .limit(1);
    if (!fda) return { programId: programUuid, fda: null, anchor: null };
    const [anchor] = await db
      .select({ id: projects.id, clientWorkspaceId: projects.clientWorkspaceId })
      .from(projects)
      .where(and(eq(projects.id, fda.projectId), eq(projects.organizationId, organizationId)))
      .limit(1);
    const programId =
      programUuid ?? (anchor ? await readProjectProgramId(db, anchor.id, organizationId) : null);
    return { programId, fda, anchor: anchor ?? null };
  }
  if (!programUuid) return { programId: null, fda: null, anchor: null };
  const anchor = await findAnchorProjectByProgram(db, programUuid, organizationId);
  if (!anchor) return { programId: programUuid, fda: null, anchor: null };
  const [fda] = await db
    .select(FDA_COLUMNS)
    .from(fda510kProjects)
    .where(and(eq(fda510kProjects.projectId, anchor.id), eq(fda510kProjects.organizationId, organizationId)))
    .limit(1);
  return { programId: programUuid, fda: fda ?? null, anchor };
}

/**
 * Load the governed records for one export anchor. Takes the request-scoped
 * Drizzle client (`requestDb(req)`) so RLS applies on top of the explicit
 * organization predicates every query carries. Returns the projection's input;
 * a store the anchor does not reach is null, never guessed.
 */
export async function loadEstarAdministrativeInputs(
  db: RequestDb,
  params: LoadEstarAdministrativeInputsParams,
): Promise<EstarAdministrativeInputs> {
  const { organizationId } = params;
  const { programId, fda, anchor } = await resolveAnchorRecords(db, params);

  let program: EstarAdministrativeInputs['program'] = null;
  if (programId) {
    const [row] = await db
      .select({
        productName: regulatoryPrograms.productName,
        productCode: regulatoryPrograms.productCode,
        predicateDevices: regulatoryPrograms.predicateDevices,
        commonName: regulatoryPrograms.commonName,
        classificationName: regulatoryPrograms.classificationName,
        regulationNumber: regulatoryPrograms.regulationNumber,
        associatedProductCodes: regulatoryPrograms.associatedProductCodes,
        indicationsForUseCitation: regulatoryPrograms.indicationsForUseCitation,
      })
      .from(regulatoryPrograms)
      .where(and(eq(regulatoryPrograms.id, programId), eq(regulatoryPrograms.organizationId, organizationId)))
      .limit(1);
    program = row ?? null;
  }

  const [organization] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  /*
   * The org's single eSTAR registration row (unique organization_id) — an
   * org-level fact, read regardless of which anchor the ident named. No row ⇒
   * the correspondent / declaration keys are blank and say so.
   *
   * A database that does not yet HAVE these columns is treated the same way,
   * for the same reason the anchor read treats a missing
   * `projects.regulatory_program_id` as "no anchor" (42703 / 42P01 above). The
   * columns arrived with 20260903/20260904; between a deploy that ships this
   * code and the migration that adds them — or after a rollback — an
   * unconditional select throws, and this loader sits under BOTH
   * GET /official-fields and POST /official, so the client could neither
   * preview nor produce the official eSTAR at all, for a 500 whose body says
   * only that the problem has been logged.
   *
   * Reporting the facts blank is not a guess and loses nothing: a column that
   * does not exist holds no data, so blank is exactly what the org has. The
   * surface still names each field's governed home, so the operator is told
   * where to set it rather than being blocked. Any OTHER database error still
   * propagates and 500s — an unreadable registration is not an empty one.
   */
  const registration = await (async () => {
    try {
      const [row] = await db
        .select({
          correspondentCompanyName: estarRegistrations.correspondentCompanyName,
          correspondentContactEmail: estarRegistrations.correspondentContactEmail,
          correspondentTelephone: estarRegistrations.correspondentTelephone,
          declarationCompanyName: estarRegistrations.declarationCompanyName,
          declarationCompanyAddress: estarRegistrations.declarationCompanyAddress,
        })
        .from(estarRegistrations)
        .where(eq(estarRegistrations.organizationId, organizationId))
        .limit(1);
      return row ?? null;
    } catch (err) {
      if (isMissingAnchorColumn(err)) return null;
      throw err;
    }
  })();

  let workspace: EstarAdministrativeInputs['workspace'] = null;
  if (anchor?.clientWorkspaceId) {
    const [row] = await db
      .select({
        name: clientWorkspaces.name,
        contactEmail: clientWorkspaces.contactEmail,
        contactPhone: clientWorkspaces.contactPhone,
      })
      .from(clientWorkspaces)
      .where(
        and(eq(clientWorkspaces.id, anchor.clientWorkspaceId), eq(clientWorkspaces.organizationId, organizationId)),
      )
      .limit(1);
    workspace = row ?? null;
  }

  return {
    program,
    organization: organization ?? null,
    registration,
    workspace,
    fda510kProject: fda
      ? { deviceName: fda.deviceName, regulationNumber: fda.regulationNumber, productCode: fda.productCode }
      : null,
  };
}

export default {
  ESTAR_ADMINISTRATIVE_SOURCES,
  declaredSourceFor,
  projectEstarAdministrativeData,
  resolveOfficialEstarFields,
  reportOfficialEstarFill,
  loadEstarAdministrativeInputs,
};
