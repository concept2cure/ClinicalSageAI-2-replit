/**
 * Permission atoms — the source of truth, derived not connected.
 *
 * Authorization is evaluated server-side as `(role × action × resourceType ×
 * ctdModule × classification)` over a grant set. Per the governance contract:
 *   - the canonical DEFAULT policy is versioned here in code (the model);
 *   - Admin curates per-org additions/overrides as rows in
 *     `c2c_governance_grants` (Admin owns the atoms);
 *   - the engine unions both, deny-by-default, explicit-deny-wins.
 *
 * Tasking eligibility and approval authority are PROJECTIONS of this — `whoCan`
 * derives the eligible users for an action from who holds a granting role, rather
 * than storing authority on the task/step. The engine is role-string-agnostic
 * infrastructure: it evaluates whatever roles/grants exist, so it functions on
 * today's assignable org roles and is ready for the richer regulated taxonomy as
 * those roles become assignable. The exact roles/grants are correctable data.
 *
 * @module server/services/governance/permissions
 */
import { pool } from '../../db.js';

/** The canonical regulated role taxonomy (the target model). */
export const GOV_ROLES = [
  'viewer',
  'author',
  'reviewer',
  'approver',
  'quality',
  'regulatory_lead',
  'org_admin',
  'system_admin',
] as const;
export type GovRole = (typeof GOV_ROLES)[number];

export type GovAction =
  | 'view' | 'author' | 'review' | 'approve' | 'sign' | 'lock'
  | 'submit' | 'assign' | 'manage_permissions';

export type GovResourceType =
  | 'document' | 'section' | 'submission' | 'task' | 'program' | 'blocker' | 'specification';

export type GrantEffect = 'allow' | 'deny';

export interface Grant {
  role: string;
  action: GovAction | string;
  /** null = any resource type (wildcard). */
  resourceType?: string | null;
  /** null = any CTD module (wildcard). */
  ctdModule?: string | null;
  /** null = any classification (wildcard). */
  classification?: string | null;
  effect: GrantEffect;
}

export interface PermissionQuery {
  action: GovAction | string;
  resourceType?: string | null;
  ctdModule?: string | null;
  classification?: string | null;
}

const ALL: GovAction[] = [
  'view', 'author', 'review', 'approve', 'sign', 'lock', 'submit', 'assign', 'manage_permissions',
];
const allow = (role: string, actions: (GovAction | '*')[]): Grant[] =>
  actions.flatMap(a => (a === '*' ? ALL : [a]) as GovAction[]).map(action => ({
    role, action, resourceType: null, ctdModule: null, classification: null, effect: 'allow' as const,
  }));

/**
 * Canonical default policy. Keyed on BOTH the currently-assignable org roles
 * (admin/manager/member/viewer — so the engine and `whoCan` function today) AND
 * the target regulated taxonomy (so it is ready as those roles become
 * assignable). Admin extends/overrides per-org via `c2c_governance_grants`.
 */
export const DEFAULT_POLICY: Grant[] = [
  // — currently-assignable org roles (functional today) —
  ...allow('admin', ['*']),
  ...allow('manager', ['view', 'author', 'review', 'approve', 'sign', 'assign']),
  ...allow('member', ['view', 'author', 'review']),
  ...allow('viewer', ['view']),
  // — target regulated taxonomy —
  ...allow('viewer', ['view']),
  ...allow('author', ['view', 'author']),
  ...allow('reviewer', ['view', 'review']),
  ...allow('approver', ['view', 'review', 'approve', 'sign']),
  ...allow('quality', ['view', 'review', 'approve', 'sign']),
  ...allow('regulatory_lead', ['view', 'review', 'approve', 'sign', 'lock', 'submit']),
  ...allow('org_admin', ['*']),
  ...allow('system_admin', ['*']),
];

/** Does a grant match the query? A null grant dimension is a wildcard. */
function grantMatches(g: Grant, role: string, q: PermissionQuery): boolean {
  if (g.role !== role) return false;
  if (g.action !== q.action && g.action !== '*') return false;
  // A grant scoped to a dimension applies only when the query matches that
  // dimension; an unscoped (null) grant dimension is a wildcard. A scoped grant
  // therefore does NOT match a query that leaves the dimension unspecified
  // (deny-by-default: we can't confirm the scope applies).
  if (g.resourceType != null && g.resourceType !== (q.resourceType ?? null)) return false;
  if (g.ctdModule != null && g.ctdModule !== (q.ctdModule ?? null)) return false;
  if (g.classification != null && g.classification !== (q.classification ?? null)) return false;
  return true;
}

/**
 * Pure deny-by-default evaluation over a grant set. An explicit `deny` always
 * wins over any `allow`. No matching grant → denied.
 */
export function evaluate(grants: Grant[], role: string, q: PermissionQuery): boolean {
  let allowed = false;
  for (const g of grants) {
    if (!grantMatches(g, role, q)) continue;
    if (g.effect === 'deny') return false;
    allowed = true;
  }
  return allowed;
}

/** Effective grants for a role: code defaults ∪ per-org DB overrides. */
export async function resolveGrants(orgId: number, role: string): Promise<Grant[]> {
  const defaults = DEFAULT_POLICY.filter(g => g.role === role);
  let dbGrants: Grant[] = [];
  try {
    const r = await pool.query(
      `SELECT role, action, resource_type, ctd_module, classification, effect
         FROM c2c_governance_grants WHERE org_id = $1 AND role = $2`,
      [orgId, role],
    );
    dbGrants = r.rows.map((row: any) => ({
      role: row.role,
      action: row.action,
      resourceType: row.resource_type ?? null,
      ctdModule: row.ctd_module ?? null,
      classification: row.classification ?? null,
      effect: row.effect === 'deny' ? 'deny' : 'allow',
    }));
  } catch (err: any) {
    // Atom store not migrated yet → defaults only (additive, non-breaking).
    if (err?.code !== '42P01') {
      console.warn('[governance/permissions] grant load failed (defaults only):', err?.message);
    }
  }
  return [...defaults, ...dbGrants];
}

/** Can this role perform the action? Evaluated over (defaults ∪ DB), deny-by-default. */
export async function can(orgId: number, role: string, q: PermissionQuery): Promise<boolean> {
  return evaluate(await resolveGrants(orgId, role), role, q);
}

/**
 * The projection: the org user ids who hold a role that grants the action. This
 * is the answer to "who can sign/approve/be-assigned this" — derived from RBAC,
 * never stored on the task. Returns [] on any failure (fail-closed).
 */
export async function whoCan(orgId: number, q: PermissionQuery): Promise<number[]> {
  try {
    const members = await pool.query(
      `SELECT user_id, role FROM organization_users
        WHERE organization_id = $1 AND (status IS NULL OR status = 'active')`,
      [orgId],
    );
    const eligible: number[] = [];
    // Resolve grants per distinct role once.
    const roleGrants = new Map<string, Grant[]>();
    for (const row of members.rows as any[]) {
      const role = String(row.role ?? '');
      if (!roleGrants.has(role)) roleGrants.set(role, await resolveGrants(orgId, role));
      if (evaluate(roleGrants.get(role)!, role, q)) {
        const uid = typeof row.user_id === 'string' ? parseInt(row.user_id, 10) : Number(row.user_id);
        if (Number.isFinite(uid)) eligible.push(uid);
      }
    }
    return eligible;
  } catch (err: any) {
    console.warn('[governance/permissions] whoCan failed (fail-closed, []):', err?.message);
    return [];
  }
}
