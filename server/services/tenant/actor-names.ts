/**
 * Names for the people a tenant's records point at — creators, owners,
 * assignees, approvers, auditors' actors — resolved inside the tenant scope.
 *
 * Since public.users took row-level security (D3, 2026-09-28) a tenant scope
 * reads only its current members' accounts, so looking a name up in `users`
 * found nothing for anyone who had left. This asks public.actor_name
 * (migrations/20260929_actor_names.sql) instead: name and email only, for
 * members of the calling organization and actors in its own audit trail, and
 * for nobody else. An id it does not answer for is simply absent from the map;
 * render that as the id (`user 12`), never as "System" or "Unknown", which
 * would attribute the act to someone else.
 *
 * The one resolver for code that collects ids first (Drizzle `inArray`
 * look-ups). SQL that joins per row uses
 * `LEFT JOIN LATERAL public.actor_name(<id column>) u ON TRUE` directly.
 * Evidence: docs/evidence/D3/2026-09-29-actor-names/.
 */
import { sql } from 'drizzle-orm';
import { db } from '../../db';

export interface ActorName {
  name: string | null;
  email: string | null;
}

/** id → name and email, for the ids this tenant scope may name. */
export async function resolveActorNames(
  ids: Iterable<number | null | undefined>
): Promise<Map<number, ActorName>> {
  const wanted = Array.from(
    new Set(Array.from(ids).filter((v): v is number => Number.isInteger(v) && (v as number) > 0))
  );
  const names = new Map<number, ActorName>();
  if (wanted.length === 0) return names;
  const ids_ = sql.join(
    wanted.map(id => sql`${id}`),
    sql`, `
  );
  const result = (await db.execute(sql`
    SELECT x.id, n.name, n.email
      FROM unnest(ARRAY[${ids_}]::int[]) AS x(id)
      CROSS JOIN LATERAL public.actor_name(x.id) n`)) as unknown as {
    rows: Array<{ id: number; name: string | null; email: string | null }>;
  };
  for (const r of result.rows) {
    names.set(Number(r.id), { name: r.name, email: r.email });
  }
  return names;
}

/** A display label for an actor id: their name when this tenant may name them, else `user <id>`. */
export function actorLabel(names: Map<number, ActorName>, id: number | null | undefined): string | null {
  if (id == null) return null;
  return names.get(id)?.name ?? `user ${id}`;
}
