/**
 * Persistence for the study-design spine — onto the CDISC Protocol Representation
 * Model (PRM) tables, not a new bespoke store.
 *
 * The structured `StudyDesign` object is the source of truth, so it is stored verbatim
 * in `cdisc_prm_studies.metadata` and round-trips losslessly. The CDISC columns
 * (`protocol_title`, `study_phase`, `indication`, arms, endpoints) are *projections* of
 * that object, written alongside so the design is queryable and exportable as PRM. This
 * activates the previously-unused `cdisc_prm_*` tables rather than adding bloat.
 *
 * Writes run inside a transaction the CALLER owns (the route opens it on a pooled
 * client and records the governed-action audit entry on the same client, so the design
 * write and its 21 CFR Part 11 audit row commit or roll back together). Reads use the
 * shared Drizzle handle and are tenant-scoped.
 *
 * The mapping (`studyDesignToRows`, `rowsToStudyDesign`) is pure and unit-tested; only
 * the `*Tx` / `load*` helpers touch the database.
 *
 * @module server/services/study-design/study-design-repository
 */

import { randomUUID } from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { cdiscPrmStudies, cdiscPrmStudyArms, cdiscPrmEndpoints } from 'shared/schema';
import type {
  Arm,
  Endpoint,
  EndpointRole,
  EndpointType,
  StudyDesign,
} from './study-design-types';
import { validateDesign, type DesignValidationReport } from './design-validation';
import { programInOrganization } from '../c2c/program-access';

/** Discriminator stored in `metadata` so a row is recognizably a design spine. */
export const STUDY_DESIGN_META_KIND = 'c2c.studyDesign.v1';

/** A minimal pg client the caller's transaction provides. */
export interface TxClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/**
 * Why a design was not persisted (PF-14). A design belongs to one live project
 * of its organization and stays there: another organization's project, a move to
 * a different project, and a study id another organization already holds are
 * refused before anything is written.
 */
export class StudyDesignPersistRefusal extends Error {
  constructor(
    readonly code: 'PROJECT_NOT_FOUND' | 'PROGRAM_MISMATCH' | 'STUDY_ID_TAKEN',
    message: string,
  ) {
    super(message);
    this.name = 'StudyDesignPersistRefusal';
  }
}

/** The HTTP status each refusal carries, wherever a route surfaces one. */
export const STUDY_DESIGN_REFUSAL_STATUS: Readonly<Record<StudyDesignPersistRefusal['code'], number>> = {
  PROJECT_NOT_FOUND: 404,
  PROGRAM_MISMATCH: 409,
  STUDY_ID_TAKEN: 409,
};

/** Who is persisting, for tenant scoping and authorship columns. */
export interface PersistContext {
  tenantId: number;
  userId: number | string;
}

/** The relational projection of a design, ready to write to the PRM tables. */
export interface StudyDesignRows {
  study: {
    studyId: string;
    /** Canonical project key (regulatory_programs.id), or null when the
     *  design's programId is absent or not a UUID. */
    programId: string | null;
    protocolId: string;
    protocolTitle: string;
    protocolVersion: string;
    studyPhase: string;
    studyType: string;
    therapeuticArea: string | null;
    indication: string;
    primaryObjective: string | null;
    secondaryObjectives: unknown;
    studyDesign: string;
    blindingSchema: string | null;
    randomization: unknown;
    populationDescription: string | null;
    plannedSubjects: number | null;
    protocolStatus: string;
    metadata: unknown;
  };
  arms: Array<{
    armCode: string;
    armName: string;
    armDescription: string | null;
    armType: string;
    plannedSubjects: number | null;
    treatmentDescription: string | null;
    dosing: unknown;
    sequenceNumber: number;
  }>;
  endpoints: Array<{
    endpointId: string;
    endpointType: string;
    endpointName: string;
    endpointDescription: string | null;
    measurementType: string;
    analysisMethod: string | null;
    timepoint: string | null;
    successCriteria: string | null;
  }>;
}

const ROLE_TO_PRM: Record<EndpointRole, string> = {
  primary: 'Primary',
  key_secondary: 'Secondary',
  secondary: 'Secondary',
  exploratory: 'Exploratory',
  safety: 'Safety',
};

const TYPE_TO_MEASUREMENT: Record<EndpointType, string> = {
  continuous: 'Continuous',
  binary: 'Binary',
  time_to_event: 'Time-to-event',
  ordinal: 'Ordinal',
  count: 'Count',
  composite: 'Composite',
  patient_reported: 'Patient-reported',
};

/** Classify an arm for the CDISC `arm_type` column from its interventions. */
function armType(arm: Arm): string {
  const roles = new Set((arm.interventions ?? []).map(i => i.role));
  if (roles.has('placebo')) return 'Placebo';
  if (roles.has('investigational')) return 'Treatment';
  if (roles.has('comparator') || roles.has('standard_of_care')) return 'Control';
  return 'Treatment';
}

/** One-line treatment description for an arm. */
function treatmentDescription(arm: Arm): string | null {
  const parts = (arm.interventions ?? []).map(i =>
    [i.name, i.dose, i.regimen, i.route].filter(Boolean).join(' '),
  );
  return parts.length ? parts.join('; ') : null;
}

/** Split a total sample size across arms by the randomization ratio. */
function perArmSubjects(design: StudyDesign, index: number): number | null {
  const total = design.statisticalPlan?.plannedSampleSize;
  if (!total) return null;
  const ratio = design.randomization?.ratio;
  if (!ratio || ratio.length !== design.arms.length) {
    return Math.round(total / Math.max(1, design.arms.length));
  }
  const denom = ratio.reduce((a, b) => a + b, 0) || 1;
  return Math.round((total * ratio[index]) / denom);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when a value is a canonical project id (regulatory_programs UUID). */
export function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Map a structured design to its PRM rows. Pure: the full design lives in
 * `study.metadata.design`, and the columns are projections for query/export.
 */
export function studyDesignToRows(design: StudyDesign, ctx: PersistContext): StudyDesignRows {
  const studyId = (design.id && design.id.trim()) || `sd_${randomUUID().replace(/-/g, '')}`;
  const primaryObjective = design.objectives?.find(o => o.level === 'primary')?.text ?? null;
  const secondaryObjectives = (design.objectives ?? [])
    .filter(o => o.level !== 'primary')
    .map(o => ({ level: o.level, text: o.text, endpointName: o.endpointName }));

  const study: StudyDesignRows['study'] = {
    studyId,
    // Promote programId to the canonical project column only when it is a
    // UUID; a non-UUID value stays in protocol_id and program_id is left
    // null rather than writing a bad project link into a uuid column.
    programId: isUuid(design.programId) ? String(design.programId) : null,
    protocolId: design.programId?.toString() || studyId,
    protocolTitle: design.title,
    protocolVersion: String(design.version ?? 1),
    studyPhase: design.phase,
    studyType: 'Interventional',
    therapeuticArea: null,
    indication: design.indication,
    primaryObjective,
    secondaryObjectives,
    studyDesign: design.framework?.structuralDesign ?? 'parallel_group',
    blindingSchema: design.randomization?.blinding ?? null,
    randomization: design.randomization ?? null,
    populationDescription: design.population?.targetDescription ?? null,
    plannedSubjects: design.statisticalPlan?.plannedSampleSize ?? null,
    protocolStatus: design.status ?? 'draft',
    // The canonical object — the source of truth this row round-trips from.
    metadata: { kind: STUDY_DESIGN_META_KIND, design: { ...design, id: studyId } },
  };

  const arms: StudyDesignRows['arms'] = (design.arms ?? []).map((arm, i) => ({
    armCode: `A${i + 1}`,
    armName: arm.name,
    armDescription: null,
    armType: armType(arm),
    plannedSubjects: perArmSubjects(design, i),
    treatmentDescription: treatmentDescription(arm),
    dosing: arm.interventions ?? null,
    sequenceNumber: i + 1,
  }));

  const endpoints: StudyDesignRows['endpoints'] = (design.endpoints ?? []).map((ep: Endpoint, i) => ({
    endpointId: `E${i + 1}`,
    endpointType: ROLE_TO_PRM[ep.role] ?? 'Secondary',
    endpointName: ep.name,
    endpointDescription: ep.definition ?? null,
    measurementType: TYPE_TO_MEASUREMENT[ep.type] ?? 'Continuous',
    analysisMethod:
      design.statisticalPlan?.plannedAnalyses?.find(a => a.endpointName === ep.name)?.method ?? null,
    timepoint: ep.timepoint ?? null,
    successCriteria: ep.responderDefinition ?? null,
  }));

  return { study, arms, endpoints };
}

/** Reconstruct the canonical design from a persisted study row. */
export function rowsToStudyDesign(studyRow: any): StudyDesign | null {
  const meta = studyRow?.metadata;
  if (meta && meta.kind === STUDY_DESIGN_META_KIND && meta.design) {
    return meta.design as StudyDesign;
  }
  return null;
}

/**
 * Persist a design and its arms/endpoints onto the PRM tables, inside the caller's
 * transaction. Upserts the study by `study_id` and replaces its arms/endpoints.
 * Returns the resolved `studyId`. The caller is responsible for BEGIN/COMMIT and for
 * recording the governed-action audit entry on the same client.
 */
export async function persistStudyDesignTx(
  client: TxClient,
  design: StudyDesign,
  ctx: PersistContext,
): Promise<string> {
  const rows = studyDesignToRows(design, ctx);
  const s = rows.study;
  const j = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));

  // The project must be a live project of this organization (LX-20's check).
  // It was taken from the request unchecked.
  if (s.programId && !(await programInOrganization(client, s.programId, ctx.tenantId))) {
    throw new StudyDesignPersistRefusal('PROJECT_NOT_FOUND', 'Project not found');
  }

  /* The upsert. study_id is unique across ALL organizations and comes from the
     request, so the update runs only for this organization's row (it had no
     tenant predicate, and a save naming another organization's study id
     overwrote that design). The project goes from none to a project and never
     moves: a save carrying no project keeps the one recorded (it used to write
     NULL), and a save carrying a different one is refused. */
  const upserted = await client.query(
    `INSERT INTO cdisc_prm_studies
       (tenant_id, study_id, program_id, protocol_id, protocol_title, protocol_version, study_phase,
        study_type, therapeutic_area, indication, primary_objective, secondary_objectives,
        study_design, blinding_schema, randomization, population_description,
        planned_subjects, protocol_status, metadata, created_by, last_modified_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20, now())
     ON CONFLICT (study_id) DO UPDATE SET
        program_id = COALESCE(cdisc_prm_studies.program_id, EXCLUDED.program_id),
        protocol_title = EXCLUDED.protocol_title,
        protocol_version = EXCLUDED.protocol_version,
        study_phase = EXCLUDED.study_phase,
        indication = EXCLUDED.indication,
        primary_objective = EXCLUDED.primary_objective,
        secondary_objectives = EXCLUDED.secondary_objectives,
        study_design = EXCLUDED.study_design,
        blinding_schema = EXCLUDED.blinding_schema,
        randomization = EXCLUDED.randomization,
        population_description = EXCLUDED.population_description,
        planned_subjects = EXCLUDED.planned_subjects,
        protocol_status = EXCLUDED.protocol_status,
        metadata = EXCLUDED.metadata,
        last_modified_by = EXCLUDED.last_modified_by,
        updated_at = now()
      WHERE cdisc_prm_studies.tenant_id = EXCLUDED.tenant_id
        AND (cdisc_prm_studies.program_id IS NULL OR EXCLUDED.program_id IS NULL
             OR cdisc_prm_studies.program_id = EXCLUDED.program_id)
     RETURNING study_id`,
    [
      ctx.tenantId, s.studyId, s.programId, s.protocolId, s.protocolTitle, s.protocolVersion, s.studyPhase,
      s.studyType, s.therapeuticArea, s.indication, s.primaryObjective, j(s.secondaryObjectives),
      s.studyDesign, s.blindingSchema, j(s.randomization), s.populationDescription,
      s.plannedSubjects, s.protocolStatus, j(s.metadata), String(ctx.userId),
    ],
  );
  if (upserted.rows.length === 0) {
    const { rows: held } = await client.query(`SELECT tenant_id FROM cdisc_prm_studies WHERE study_id = $1`, [s.studyId]);
    throw Number(held[0]?.tenant_id) === ctx.tenantId
      ? new StudyDesignPersistRefusal('PROGRAM_MISMATCH', 'This design belongs to another project. A design does not move between projects.')
      : new StudyDesignPersistRefusal('STUDY_ID_TAKEN', 'This study id is already in use. Save the design under a new id.');
  }

  // Replace arms and endpoints so the projection always matches the current design.
  await client.query(`DELETE FROM cdisc_prm_study_arms WHERE study_id = $1 AND tenant_id = $2`, [
    s.studyId,
    ctx.tenantId,
  ]);
  for (const a of rows.arms) {
    await client.query(
      `INSERT INTO cdisc_prm_study_arms
         (tenant_id, study_id, arm_code, arm_name, arm_description, arm_type,
          planned_subjects, treatment_description, dosing, sequence_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        ctx.tenantId, s.studyId, a.armCode, a.armName, a.armDescription, a.armType,
        a.plannedSubjects, a.treatmentDescription, j(a.dosing), a.sequenceNumber,
      ],
    );
  }

  await client.query(`DELETE FROM cdisc_prm_endpoints WHERE study_id = $1 AND tenant_id = $2`, [
    s.studyId,
    ctx.tenantId,
  ]);
  for (const e of rows.endpoints) {
    await client.query(
      `INSERT INTO cdisc_prm_endpoints
         (tenant_id, study_id, endpoint_id, endpoint_type, endpoint_name, endpoint_description,
          measurement_type, analysis_method, timepoint, success_criteria)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        ctx.tenantId, s.studyId, e.endpointId, e.endpointType, e.endpointName, e.endpointDescription,
        e.measurementType, e.analysisMethod, e.timepoint, e.successCriteria,
      ],
    );
  }

  return s.studyId;
}

/** A list-row summary of a persisted design. */
export interface StudyDesignSummary {
  studyId: string;
  /** Canonical project key, or null when this design is not linked to one. */
  programId: string | null;
  title: string;
  phase: string;
  indication: string;
  status: string;
  updatedAt: Date | null;
}

/** Load a persisted design (tenant-scoped) with its current defensibility report. */
export async function loadStudyDesign(
  studyId: string,
  tenantId: number,
): Promise<{ design: StudyDesign; validation: DesignValidationReport } | null> {
  const [row] = await db
    .select()
    .from(cdiscPrmStudies)
    .where(and(eq(cdiscPrmStudies.studyId, studyId), eq(cdiscPrmStudies.tenantId, tenantId)))
    .limit(1);
  if (!row) return null;
  const design = rowsToStudyDesign(row);
  if (!design) return null;
  return { design, validation: validateDesign(design) };
}

/** List persisted designs for a tenant, most-recently-updated first. */
export async function listStudyDesigns(
  tenantId: number,
  opts: { limit?: number; offset?: number; programId?: string } = {},
): Promise<StudyDesignSummary[]> {
  // Narrow to one project when a valid programId is given. An invalid one
  // matches nothing rather than falling back to the whole tenant, so a
  // malformed filter can never widen the result set.
  const where =
    opts.programId !== undefined
      ? and(
          eq(cdiscPrmStudies.tenantId, tenantId),
          isUuid(opts.programId)
            ? eq(cdiscPrmStudies.programId, opts.programId)
            : sql`false`,
        )
      : eq(cdiscPrmStudies.tenantId, tenantId);
  const rows = await db
    .select()
    .from(cdiscPrmStudies)
    .where(where)
    .orderBy(desc(cdiscPrmStudies.updatedAt))
    .limit(Math.min(opts.limit ?? 50, 200))
    .offset(opts.offset ?? 0);
  return rows.map(r => ({
    studyId: r.studyId,
    programId: r.programId ?? null,
    title: r.protocolTitle,
    phase: r.studyPhase ?? '',
    indication: r.indication ?? '',
    status: r.protocolStatus ?? 'draft',
    updatedAt: r.updatedAt ?? null,
  }));
}

/** Delete a persisted design (tenant-scoped). Arms/endpoints cascade via study_id. */
export async function deleteStudyDesignTx(
  client: TxClient,
  studyId: string,
  tenantId: number,
): Promise<void> {
  await client.query(`DELETE FROM cdisc_prm_endpoints WHERE study_id = $1 AND tenant_id = $2`, [studyId, tenantId]);
  await client.query(`DELETE FROM cdisc_prm_study_arms WHERE study_id = $1 AND tenant_id = $2`, [studyId, tenantId]);
  await client.query(`DELETE FROM cdisc_prm_studies WHERE study_id = $1 AND tenant_id = $2`, [studyId, tenantId]);
}
