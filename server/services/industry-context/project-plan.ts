/**
 * The contextual regulatory plan for one project — MDX-PM-01.
 *
 * Assembles what the EXISTING Projects cockpit needs to specialize itself: the
 * resolved industry context, the sections that context calls for, and the work
 * packages — registry entries merged with whatever this programme has actually
 * persisted, each carrying the state of the tasks linked to it.
 *
 * Kept out of the route so it can be tested without a server, and so the merge
 * rules below are readable in one place. Three of them matter:
 *
 *   1. OUTSIDE MDX IT RETURNS AN EMPTY PLAN. Not a biopharma plan, not a generic
 *      one. That is MDX-PM-01's acceptance criterion — a biopharma project's
 *      cockpit renders exactly what it renders today — and it is enforced here
 *      rather than trusted to the client.
 *
 *   2. A PERSISTED PACKAGE IS NEVER DROPPED. If a programme recorded analytical
 *      performance work and its specialization later changed to one the registry
 *      does not give that package to, the work still exists and still appears —
 *      flagged `offPlan`, so the mismatch is visible rather than the work being
 *      silently hidden from the plan that is supposed to account for all of it.
 *
 *   3. PROGRESS IS COUNTED, NEVER ESTIMATED. A package reports how many linked
 *      tasks are complete and how many are blocked. It does not report a percent
 *      complete derived from a phase, a date, or the number of deliverables
 *      named in the registry — those would be a number nobody measured.
 *
 * @module server/services/industry-context/project-plan
 */

import {
  resolveEffectiveProjectContext, type Exec, type EffectiveIndustryContext,
} from './resolve-effective-context';
import {
  plannedWorkPackages, getWorkPackage, projectSectionsForContext, packageFilingsInScope,
  unsettledDependencies, REGISTRY_LIMITS, WORK_PACKAGE_REGISTRY_VERSION,
  type PlannedWorkPackage, type ProjectSection, type WorkPackageId,
} from '../../../shared/regulatory/mdx-work-packages';

/** What a programme has persisted about one work package. */
export interface PersistedWorkPackage {
  id: string;
  archetypeId: string | null;
  label: string;
  lifecyclePhase: string | null;
  applicability: string;
  applicabilityBasis: string | null;
  status: string;
  statusReason: string | null;
  ownerUserId: number | null;
  targetDate: string | null;
  completedAt: string | null;
  clientVisibility: string;
  filingsInScope: string[];
  marketsInScope: string[];
}

/** Linked-task counts for one package. Counted, never estimated. */
export interface TaskRollup {
  total: number;
  complete: number;
  blocked: number;
}

const EMPTY_ROLLUP: TaskRollup = { total: 0, complete: 0, blocked: 0 };

export interface PlanItem {
  /** The registry id, or null for a package this programme added itself. */
  archetypeId: string | null;
  label: string;
  lifecyclePhase: string | null;
  purpose: string | null;
  /** 'required' | 'conditional' — from the persisted row when there is one. */
  applicability: string;
  /** The condition, for a conditional package. Null means it always applies. */
  appliesWhen: string | null;
  applicabilityBasis: string | null;
  studyArchetypes: string[];
  deliverables: string[];
  decisions: string[];
  references: string[];
  /** Filings this package feeds, narrowed to the ones this project is pursuing. */
  filings: string[];
  /** Declared inputs that this programme has not settled yet. Reported, not enforced. */
  unsettledInputs: WorkPackageId[];
  /** Null until the programme instantiates the package. */
  persisted: PersistedWorkPackage | null;
  tasks: TaskRollup;
  /**
   * True when this programme persisted the package but the registry does not
   * give it to the project's current specialization. Real work that no longer
   * matches the declared context — surfaced, not hidden.
   */
  offPlan: boolean;
}

export interface ProjectPlan {
  context: EffectiveIndustryContext;
  /** Empty outside MDX, which is what keeps the cockpit unchanged there. */
  sections: ProjectSection[];
  packages: PlanItem[];
  /** What the registry does not model for this specialization. Render it. */
  registryLimit: string | null;
  registryVersion: string;
  /**
   * True when the plan is empty because nobody declared a specialization, as
   * distinct from empty because the project is not an MDX project. The cockpit
   * asks in the first case and shows nothing in the second.
   */
  awaitingDeclaration: boolean;
}

// ── Reads ────────────────────────────────────────────────────────────────────

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/**
 * Persisted packages for a programme.
 *
 * A missing table degrades to "none persisted" rather than failing the cockpit:
 * a database from before 20260801 carries programmes but no work packages, and
 * that project should still render its context and its registry plan.
 */
async function readPersisted(
  exec: Exec, organizationId: number, programId: string,
): Promise<PersistedWorkPackage[]> {
  try {
    const { rows } = await exec.query(
      `SELECT id::text, archetype_id, label, lifecycle_phase, applicability,
              applicability_basis, status, status_reason, owner_user_id,
              target_date, completed_at, client_visibility,
              filings_in_scope, markets_in_scope
         FROM regulatory_work_packages
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
      [organizationId, programId],
    );
    return rows.map(r => ({
      id: r.id,
      archetypeId: r.archetype_id ?? null,
      label: r.label,
      lifecyclePhase: r.lifecycle_phase ?? null,
      applicability: r.applicability ?? 'required',
      applicabilityBasis: r.applicability_basis ?? null,
      status: r.status ?? 'not_started',
      statusReason: r.status_reason ?? null,
      ownerUserId: r.owner_user_id ?? null,
      targetDate: r.target_date ? String(r.target_date) : null,
      completedAt: r.completed_at ? String(r.completed_at) : null,
      clientVisibility: r.client_visibility ?? 'internal',
      filingsInScope: asStringArray(r.filings_in_scope),
      marketsInScope: asStringArray(r.markets_in_scope),
    }));
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') return [];
    throw err;
  }
}

/**
 * Linked-task counts, keyed by work-package id.
 *
 * Goes through task_regulatory_links rather than a column on unified_tasks,
 * because a task can support several packages and the link already carries that
 * shape. Scoped to the organization on BOTH sides of the join: the link table and
 * the task table are separately tenant-scoped, and joining on task_id alone would
 * match another tenant's task that happens to share a business key.
 */
async function readTaskRollups(
  exec: Exec, organizationId: number, packageIds: string[],
): Promise<Map<string, TaskRollup>> {
  const out = new Map<string, TaskRollup>();
  if (packageIds.length === 0) return out;
  try {
    const { rows } = await exec.query(
      // 'cancelled' tasks are excluded from the total rather than counted as
      // incomplete: a cancelled task is work that will not happen, and leaving it
      // in the denominator would make a finished package read as permanently
      // behind. Blocked mirrors the task board's own definition — the status, or
      // a non-empty blocked_by.
      `SELECT l.entity_id                                        AS package_id,
              COUNT(*)::int                                      AS total,
              COUNT(*) FILTER (WHERE t.status = 'completed')::int AS complete,
              COUNT(*) FILTER (
                WHERE t.status = 'blocked'
                   OR COALESCE(array_length(t.blocked_by, 1), 0) > 0
              )::int                                             AS blocked
         FROM task_regulatory_links l
         JOIN unified_tasks t
           ON t.task_id = l.task_id AND t.organization_id = l.organization_id
        WHERE l.organization_id = $1
          AND l.entity_type = 'work_package'
          AND l.entity_id = ANY($2::text[])
          AND t.status <> 'cancelled'
        GROUP BY l.entity_id`,
      [organizationId, packageIds],
    );
    for (const r of rows) {
      out.set(String(r.package_id), {
        total: Number(r.total) || 0,
        complete: Number(r.complete) || 0,
        blocked: Number(r.blocked) || 0,
      });
    }
    return out;
  } catch (err) {
    // A database without either table reports no linked tasks. Zero counts read
    // as "nothing linked yet", which is true, and is a far better failure than a
    // cockpit that will not load because a link table is absent.
    const code = (err as { code?: string })?.code;
    if (code === '42P01' || code === '42703') return out;
    throw err;
  }
}

// ── Assembly ─────────────────────────────────────────────────────────────────

function fromRegistry(
  pkg: PlannedWorkPackage,
  persisted: PersistedWorkPackage | null,
  tasks: TaskRollup,
  projectFilings: string[],
  settled: string[],
): PlanItem {
  return {
    archetypeId: pkg.id,
    label: persisted?.label ?? pkg.label,
    lifecyclePhase: pkg.lifecyclePhase,
    purpose: pkg.purpose,
    // The persisted answer wins: a conditional package this programme decided to
    // include is required FOR THIS PROGRAMME, and that decision has to survive a
    // registry revision that moves the package between lists.
    applicability: persisted?.applicability ?? pkg.applicability,
    appliesWhen: pkg.appliesWhen,
    applicabilityBasis: persisted?.applicabilityBasis ?? null,
    studyArchetypes: [...pkg.studyArchetypes],
    deliverables: [...pkg.deliverables],
    decisions: [...pkg.decisions],
    references: [...pkg.references],
    filings: packageFilingsInScope(pkg, persisted?.filingsInScope?.length
      ? persisted.filingsInScope
      : projectFilings),
    unsettledInputs: unsettledDependencies(pkg, settled),
    persisted,
    tasks,
    offPlan: false,
  };
}

/**
 * A persisted package the registry does not account for.
 *
 * Either a custom package this programme added, or a registry package whose
 * specialization no longer matches. Both are real work and both appear; the
 * registry fields are filled in where the archetype is still recognizable, and
 * left empty where it is genuinely unknown rather than invented.
 */
function fromPersisted(row: PersistedWorkPackage, tasks: TaskRollup): PlanItem {
  const known = row.archetypeId ? getWorkPackage(row.archetypeId) : null;
  return {
    archetypeId: row.archetypeId,
    label: row.label,
    lifecyclePhase: row.lifecyclePhase ?? known?.lifecyclePhase ?? null,
    purpose: known?.purpose ?? null,
    applicability: row.applicability,
    appliesWhen: known?.appliesWhen ?? null,
    applicabilityBasis: row.applicabilityBasis,
    studyArchetypes: known ? [...known.studyArchetypes] : [],
    deliverables: known ? [...known.deliverables] : [],
    decisions: known ? [...known.decisions] : [],
    references: known ? [...known.references] : [],
    filings: row.filingsInScope,
    unsettledInputs: [],
    persisted: row,
    tasks,
    offPlan: true,
  };
}

/**
 * Read the contextual plan for one programme.
 *
 * `programId` is a regulatory_programs uuid — the identity the Projects detail
 * cockpit holds. The caller is responsible for having established that the
 * programme belongs to `organizationId`; every query here is org-scoped, but an
 * unowned id would still return an empty plan rather than a 404, and a cockpit
 * showing an empty plan for someone else's project is the wrong answer.
 */
export async function readProjectPlan(
  exec: Exec,
  input: { organizationId: number; programId: string; userId?: number | null },
): Promise<ProjectPlan> {
  const context = await resolveEffectiveProjectContext(exec, {
    organizationId: input.organizationId,
    programId: input.programId,
    userId: input.userId ?? null,
  });

  const sections = projectSectionsForContext({
    vertical: context.vertical,
    specialization: context.specialization,
    primaryIndustry: context.primaryIndustry,
  });

  // Empty because nobody declared a specialization is a different state from
  // empty because this is not an MDX project. The cockpit asks in the first case
  // and shows its existing content in the second.
  const awaitingDeclaration =
    context.vertical === 'mdx' && context.specialization === 'unspecified';

  // Outside MDX there is nothing to persist against and nothing to read: the
  // cockpit falls back to the content it already renders. Reading the tables
  // anyway would spend two queries to produce an empty list.
  if (context.vertical !== 'mdx') {
    return {
      context, sections: [], packages: [],
      registryLimit: null,
      registryVersion: WORK_PACKAGE_REGISTRY_VERSION,
      awaitingDeclaration: false,
    };
  }

  const persisted = await readPersisted(exec, input.organizationId, input.programId);
  const rollups = await readTaskRollups(
    exec, input.organizationId, persisted.map(p => p.id),
  );

  const byArchetype = new Map<string, PersistedWorkPackage>();
  for (const row of persisted) {
    if (row.archetypeId) byArchetype.set(row.archetypeId, row);
  }

  // A package counts as settled for dependency reporting only when the programme
  // has recorded it complete. An in-progress package is not an input anything
  // downstream can rely on.
  const settled = persisted.filter(p => p.status === 'complete')
    .map(p => p.archetypeId)
    .filter((id): id is string => id !== null);

  const planned = plannedWorkPackages({
    vertical: context.vertical,
    specialization: context.specialization,
  });

  const items: PlanItem[] = planned.map(pkg => {
    const row = byArchetype.get(pkg.id) ?? null;
    return fromRegistry(
      pkg, row, row ? rollups.get(row.id) ?? EMPTY_ROLLUP : EMPTY_ROLLUP,
      context.pathways, settled,
    );
  });

  const onPlan = new Set(planned.map(p => p.id));
  for (const row of persisted) {
    if (row.archetypeId && onPlan.has(row.archetypeId as WorkPackageId)) continue;
    items.push(fromPersisted(row, rollups.get(row.id) ?? EMPTY_ROLLUP));
  }

  return {
    context,
    sections,
    packages: items,
    registryLimit: REGISTRY_LIMITS[context.specialization] ?? null,
    registryVersion: WORK_PACKAGE_REGISTRY_VERSION,
    awaitingDeclaration,
  };
}

export default { readProjectPlan };
