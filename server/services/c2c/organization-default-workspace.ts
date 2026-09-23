/**
 * The organisation's own client workspace — the PM spine's missing parent.
 *
 * ── The defect this closes ───────────────────────────────────────────────────
 * `projects.client_workspace_id` is NOT NULL and FKs to `client_workspaces`.
 * `ensureProgramProjectAnchor` (services/c2c/program-project-anchor.ts) is the
 * one writer of the program → PM-spine anchor, and it will not invent a
 * workspace: with none, it reports `NO_CLIENT_WORKSPACE` and the program is
 * created unanchored. That is the correct behaviour for that module — it must
 * never guess an access-control value — but nothing anywhere created the first
 * workspace, so on a fresh organisation the skip was not an edge case, it was
 * every program:
 *
 *   • `POST /api/clients` is the only writer of `client_workspaces` in the
 *     server, and it is mounted in no application file — only in its own
 *     tenant-isolation test. No client calls `/api/clients` either.
 *   • The three organisation creators — self-serve signup (routes/auth.ts),
 *     first-run setup (routes/setup.ts) and the boot seed
 *     (db/bootstrap/seed-default-org.ts) — write organisations, users and
 *     memberships, and `provisionLaunchModules` grants the launch catalog.
 *     None writes a workspace.
 *
 * So every self-serve tenant had programs whose governed artifacts could never
 * reach `concept2cure_artifacts` (its `project_id` is an INTEGER FK to
 * `projects.id`). Observed end to end on a fresh install: Module 3 compiled 21
 * sections and bridged 0 artifacts with `bridgeSkips: 21`, and the data room
 * served no Module 3 branch. Both cleared the moment the organisation had one
 * workspace — nothing else changed.
 *
 * ── Why a default here is honest, when the anchor's would not be ─────────────
 * The anchor module refuses to pick BETWEEN workspaces, because
 * `client_workspace_id` is what services/project-module-bridge.ts checks to
 * decide who may see a project: choosing the wrong one grants or denies
 * visibility to the wrong people. That reasoning is about a CHOICE. This module
 * only ever acts where there is none — an organisation with ZERO workspaces —
 * and the row it writes is not a guess about unknown data, it is the
 * organisation restated as its own workspace. A sponsor is its own client; a
 * CRO adds its clients afterwards.
 *
 * Restricting the write to the zero case is load-bearing in the other
 * direction too. An organisation that already has exactly one workspace is the
 * unambiguous case the anchor writer is waiting for; adding a second would
 * flip it to `AMBIGUOUS_CLIENT_WORKSPACE` and stop anchoring programs that
 * anchor today. This module must never be the reason an org acquires a second
 * workspace.
 *
 * ── One rule, two bindings ───────────────────────────────────────────────────
 * The decision lives here once. The callers differ only in how they talk to
 * Postgres inside their own transaction — a `pg` PoolClient for the boot seed,
 * a Drizzle transaction for signup and first-run setup — so each supplies a
 * `WorkspaceStore` binding and neither restates the rule.
 *
 * Every caller owns its transaction. This module never opens or commits one,
 * exactly as `ensureProgramProjectAnchor` and `ensureSubmissionSpine` do.
 */
import type { PoolClient } from 'pg';
import { eq } from 'drizzle-orm';
import { clientWorkspaces } from '../../../shared/schema';
import type { RequestDb } from '../../db/requestDb';

/** Why the organisation's own workspace was not written. Never a failure to try. */
export type DefaultWorkspaceSkip =
  /** The organisation already has at least one workspace. Nothing to do. */
  'ALREADY_HAS_WORKSPACE';

export interface DefaultWorkspaceResult {
  /** The organisation's workspace id — the existing one, or the one just written. */
  workspaceId: number | null;
  /** True when this call inserted the row; false when one already existed. */
  created: boolean;
  skipped?: DefaultWorkspaceSkip;
}

export interface DefaultWorkspaceIdentity {
  name: string;
  slug: string;
  description: string;
}

export interface EnsureDefaultWorkspaceInput {
  orgId: number;
  /** `organizations.name`, verbatim — the workspace is the organisation. */
  orgName: string;
  /** `organizations.slug`, when the creator has it. Derived from the name otherwise. */
  orgSlug?: string | null;
  /** The creating user — becomes created_by_id. Null for the platform's own seed. */
  userId?: number | null;
}

/**
 * The narrow port each caller binds to its own in-flight transaction.
 *
 * `firstWorkspaceId` is read in the same call as the count so the decision and
 * the value it returns come from one snapshot — a caller that already has a
 * workspace gets that id back rather than a bare "skipped".
 */
export interface WorkspaceStore {
  readWorkspaces(orgId: number): Promise<{ count: number; firstWorkspaceId: number | null }>;
  insertWorkspace(
    orgId: number,
    identity: DefaultWorkspaceIdentity,
    createdById: number | null,
  ): Promise<number | null>;
}

const SLUG_FALLBACK = 'workspace';

/** `organizations.slug` rules: lowercase, hyphen-separated, never empty. */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * What the organisation's own workspace is called.
 *
 * The name is the organisation's name verbatim, because that is what the row
 * means. The slug prefers the organisation's own slug — the two then agree
 * wherever a human reads both — and falls back to the name, then to a constant,
 * so the NOT NULL column is always satisfiable. `unique_org_slug` is scoped to
 * (organization_id, slug), so a shared fallback collides with nothing.
 */
export function defaultWorkspaceIdentity(input: {
  orgName: string;
  orgSlug?: string | null;
}): DefaultWorkspaceIdentity {
  const name = input.orgName.trim() || 'Workspace';
  const slug = slugify(input.orgSlug ?? '') || slugify(name) || SLUG_FALLBACK;
  return {
    name,
    slug,
    description: `Default workspace for ${name}`,
  };
}

/**
 * Give the organisation its own workspace, but only where it has none.
 *
 * Idempotent by the same standard as `ensureProgramProjectAnchor`: a second
 * call links, it never forks. Safe to call on every organisation creation and
 * from a migration-style repair over organisations that already exist.
 */
export async function ensureOrganizationDefaultWorkspace(
  store: WorkspaceStore,
  input: EnsureDefaultWorkspaceInput,
): Promise<DefaultWorkspaceResult> {
  const { count, firstWorkspaceId } = await store.readWorkspaces(input.orgId);

  if (count > 0) {
    // Already has one (or several). Return the existing id so the caller can
    // record what the organisation actually has, and write nothing: a second
    // workspace here would turn the anchor writer's unambiguous case into its
    // AMBIGUOUS one and stop anchoring programs that anchor today.
    return { workspaceId: firstWorkspaceId, created: false, skipped: 'ALREADY_HAS_WORKSPACE' };
  }

  const identity = defaultWorkspaceIdentity(input);
  const workspaceId = await store.insertWorkspace(input.orgId, identity, input.userId ?? null);
  // A null id means the insert hit `unique_org_slug` and did nothing — another
  // connection won the race. That organisation has its workspace; this call
  // simply did not write it, which is exactly `created: false`.
  return workspaceId == null
    ? { workspaceId: null, created: false, skipped: 'ALREADY_HAS_WORKSPACE' }
    : { workspaceId, created: true };
}

/** Binding for callers holding a `pg` PoolClient — the boot seed. */
export function poolClientWorkspaceStore(client: PoolClient): WorkspaceStore {
  return {
    async readWorkspaces(orgId) {
      const res = await client.query<{ workspace_count: string | number; workspace_id: string | number | null }>(
        `SELECT count(*) AS workspace_count, min(id) AS workspace_id
           FROM client_workspaces
          WHERE organization_id = $1`,
        [orgId],
      );
      const row = res.rows[0];
      return {
        count: Number(row?.workspace_count ?? 0),
        firstWorkspaceId: row?.workspace_id == null ? null : Number(row.workspace_id),
      };
    },
    async insertWorkspace(orgId, identity, createdById) {
      const res = await client.query<{ id: string | number }>(
        `INSERT INTO client_workspaces
           (organization_id, name, slug, description, status, created_by_id)
         VALUES ($1, $2, $3, $4, 'active', $5)
         ON CONFLICT (organization_id, slug) DO NOTHING
         RETURNING id`,
        [orgId, identity.name, identity.slug, identity.description, createdById],
      );
      return res.rows[0]?.id == null ? null : Number(res.rows[0].id);
    },
  };
}

/**
 * The Drizzle surface this module uses, taken from `RequestDb` rather than
 * described by hand: a `db.transaction(async tx => …)` handle is a
 * `PgTransaction`, whose `select`/`insert` are the same builders, so `tx`
 * satisfies this without a cast. Writing the builder chain out structurally
 * does not — the real types carry generics a hand-written shape cannot match.
 */
export type DrizzleWorkspaceExecutor = Pick<RequestDb, 'select' | 'insert'>;

/** Binding for callers inside a Drizzle transaction — signup and first-run setup. */
export function drizzleWorkspaceStore(tx: DrizzleWorkspaceExecutor): WorkspaceStore {
  return {
    async readWorkspaces(orgId) {
      const rows = await tx
        .select({ id: clientWorkspaces.id })
        .from(clientWorkspaces)
        .where(eq(clientWorkspaces.organizationId, orgId));
      const ids = rows.map(r => Number(r.id)).filter(Number.isFinite);
      return {
        count: ids.length,
        firstWorkspaceId: ids.length > 0 ? Math.min(...ids) : null,
      };
    },
    async insertWorkspace(orgId, identity, createdById) {
      const rows = await tx
        .insert(clientWorkspaces)
        .values({
          organizationId: orgId,
          name: identity.name,
          slug: identity.slug,
          description: identity.description,
          status: 'active',
          createdById,
        })
        .onConflictDoNothing({ target: [clientWorkspaces.organizationId, clientWorkspaces.slug] })
        .returning({ id: clientWorkspaces.id });
      return rows[0]?.id == null ? null : Number(rows[0].id);
    },
  };
}
