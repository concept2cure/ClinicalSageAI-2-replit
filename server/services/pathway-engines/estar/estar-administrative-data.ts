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
 *     a value may come from. A key with `null` is user-supplied only. Every key
 *     of the 510(k) device field map must appear, so a new mapped key cannot
 *     ship without a declared source-or-none (a test pins this).
 *   - The projection never invents: an empty / whitespace / null column is an
 *     ABSENT key, never ''. No session user, no portal e-mail, no address.
 *   - Governed wins. A request value fills only a key the governed records do
 *     not hold; a colliding or unknown request key is dropped AND REPORTED, so
 *     the surface can say exactly what was and was not written.
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
import type { RequestDb } from '../../../db/requestDb';
import { isMissingAnchorColumn } from '../../c2c/program-project-anchor';
import type { OfficialPdfFieldMap } from '../../forms/fill-official-pdf';

// ── The governed-sources table ────────────────────────────────────────────────

/** The stores an administrative value may be read from. Nothing else. */
export type GovernedStore =
  | 'regulatory_programs'
  | 'organizations'
  | 'client_workspaces'
  | 'fda_510k_projects';

export interface GovernedSourceRef {
  store: GovernedStore;
  /** Column, or a JSON path into one (`predicate_devices[0].kNumber`). */
  column: string;
}

export interface GovernedSource extends GovernedSourceRef {
  /** Consulted only when the primary source holds no value. */
  fallback?: GovernedSourceRef;
  note?: string;
}

/**
 * Canonical key → governed source, or `null` for USER-SUPPLIED ONLY keys (the
 * platform holds no such fact; the request body may carry it).
 */
export const ESTAR_ADMINISTRATIVE_SOURCES: Record<string, GovernedSource | null> = {
  deviceTradeName: {
    store: 'regulatory_programs',
    column: 'product_name',
    fallback: { store: 'fda_510k_projects', column: 'device_name' },
    note: 'fallback: fda_510k_projects.device_name when the program row has none',
  },
  deviceCommonName: null,
  deviceClassificationName: null,
  regulationNumber: {
    store: 'fda_510k_projects',
    column: 'regulation_number',
    note: 'only when the anchor row exists',
  },
  productCodes: {
    store: 'regulatory_programs',
    column: 'product_code',
    fallback: { store: 'fda_510k_projects', column: 'product_code' },
  },
  associatedProductCodes: null,
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
  correspondentCompanyName: null,
  correspondentContactEmail: null,
  correspondentTelephone: null,
  correspondentSummaryEmail: null,
  predicateSubmissionNumber: {
    store: 'regulatory_programs',
    column: 'predicate_devices[0].kNumber',
    note: 'first predicate only; absent when the list is empty or kNumber missing',
  },
  predicateDeviceTradeName: { store: 'regulatory_programs', column: 'predicate_devices[0].name' },
  declarationCompanyName: {
    store: 'client_workspaces',
    column: 'name',
    fallback: { store: 'organizations', column: 'name' },
    note: 'same rule as applicantCompanyName',
  },
  declarationCompanyAddress: null,
  declarationDeviceTradeName: {
    store: 'regulatory_programs',
    column: 'product_name',
    fallback: { store: 'fda_510k_projects', column: 'device_name' },
    note:
      'same fact as deviceTradeName, so the same resolution rule applies — including the ' +
      'fda_510k_projects.device_name fallback the contract lists only against deviceTradeName; ' +
      'the two keys can never resolve to different values',
  },
  indicationsForUseCitation: null,
};

// ── Pure projection ───────────────────────────────────────────────────────────

/** The governed records the projection reads. Absent/null ⇒ no values from that store. */
export interface EstarAdministrativeInputs {
  program?: {
    productName?: string | null;
    productCode?: string | null;
    predicateDevices?: unknown;
  } | null;
  organization?: { name?: string | null } | null;
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

/**
 * One reader per `store.column` the table names. Keyed by the same string the
 * provenance carries, so a source declared in the table without a reader here
 * fails loudly (a thrown error in the test suite), never silently blank.
 */
const READERS: Record<string, (input: EstarAdministrativeInputs) => string | null> = {
  'regulatory_programs.product_name': (i) => text(i.program?.productName),
  'regulatory_programs.product_code': (i) => text(i.program?.productCode),
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
    if (!source.fallback) continue;
    const secondary = readSource(source.fallback, input);
    if (secondary !== null) {
      values[key] = secondary;
      provenance[key] = `${source.fallback.store}.${source.fallback.column}`;
    }
  }
  return { values, provenance };
}

// ── Governed ∪ request → what the fill writes ─────────────────────────────────

export interface ResolvedOfficialField {
  key: string;
  caption: string;
  xfaSomPath: string | null;
  value: string | null;
  /** `store.column` for a governed value, `'request'` for a caller-supplied one, null when blank. */
  source: string | null;
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
    fields.push({ key, caption: spec.caption ?? key, xfaSomPath: spec.xfaSomPath ?? null, value, source });
  }

  const ignoredRequestKeys = Object.keys(request).filter((k) => !written.has(k));
  return { data, fields, ignoredRequestKeys };
}

export interface OfficialEstarFieldReport {
  mappedCount: number;
  filledCount: number;
  blankCount: number;
  blankKeys: string[];
  fields: Array<{ key: string; caption: string; filled: boolean; source: string | null }>;
  ignoredRequestKeys: string[];
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
    workspace,
    fda510kProject: fda
      ? { deviceName: fda.deviceName, regulationNumber: fda.regulationNumber, productCode: fda.productCode }
      : null,
  };
}

export default {
  ESTAR_ADMINISTRATIVE_SOURCES,
  projectEstarAdministrativeData,
  resolveOfficialEstarFields,
  reportOfficialEstarFill,
  loadEstarAdministrativeInputs,
};
