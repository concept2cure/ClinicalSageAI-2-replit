/**
 * The tenant purge's list read as a SEQUENCE over a live catalog: which tables
 * each step deletes, and which foreign keys stop it part-way (D6, 2026-10-29).
 * Used by scripts/ci/check-purge-coverage.mjs; its header says why, and its
 * selftest pins each shape.
 *
 * A step deletes its entry's table when the table exists and has
 * organization_id, or has a PURGE_PARENT_SCOPED predicate; otherwise the purge
 * skips it (42703). The same statement takes every table ON DELETE CASCADE
 * reaches from it.
 */

export const qualify = (t) => (t.includes('.') ? t : `public.${t}`);
export const DEL_ACTION = { a: 'NO ACTION', r: 'RESTRICT', n: 'SET NULL', d: 'SET DEFAULT', c: 'CASCADE' };

/** Every foreign key, with its delete action and whether a SET NULL/DEFAULT would hit a NOT NULL column. */
export const FOREIGN_KEYS_SQL = `
SELECT con.conname,
       cn.nspname || '.' || c.relname AS child,
       pn.nspname || '.' || p.relname AS parent,
       con.confdeltype AS del,
       (SELECT array_agg(a.attname::text ORDER BY k.i)
          FROM unnest(con.conkey) WITH ORDINALITY k(n, i)
          JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n) AS cols,
       COALESCE((SELECT bool_or(a.attnotnull)
          FROM unnest(COALESCE(con.confdelsetcols, con.conkey)) k(n)
          JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n), false) AS sets_not_null
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace cn ON cn.oid = c.relnamespace
  JOIN pg_class p ON p.oid = con.confrelid JOIN pg_namespace pn ON pn.oid = p.relnamespace
 WHERE con.contype = 'f' AND cn.nspname NOT IN ('pg_catalog', 'information_schema')
`;

/** Every table, with whether it has organization_id. */
export const TABLES_SQL = `
SELECT n.nspname || '.' || c.relname AS t,
       EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'organization_id'
                AND a.attnum > 0 AND NOT a.attisdropped) AS has_org
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
`;

/** table -> { step, entry, closure }: the first step whose statement deletes it. */
export function deletionSteps(fks, tables, ordered, parentScoped) {
  const hasOrg = new Map(tables.map((r) => [r.t, r.has_org]));
  const scoped = new Set(parentScoped.map(qualify));
  const cascadeFrom = new Map();
  for (const fk of fks.filter((k) => k.del === 'c')) {
    if (!cascadeFrom.has(fk.parent)) cascadeFrom.set(fk.parent, []);
    cascadeFrom.get(fk.parent).push(fk.child);
  }
  const deletedAt = new Map();
  ordered.forEach((entry, step) => {
    const t = qualify(entry);
    if (!hasOrg.has(t) || deletedAt.has(t)) return; // absent from this schema, or already gone
    if (!hasOrg.get(t) && !scoped.has(t)) return; // no organization_id, no predicate: skipped (42703)
    const closure = new Set([t]);
    const queue = [t];
    while (queue.length) {
      for (const ch of cascadeFrom.get(queue.shift()) ?? []) {
        if (!closure.has(ch)) { closure.add(ch); queue.push(ch); }
      }
    }
    for (const x of closure) if (!deletedAt.has(x)) deletedAt.set(x, { step, entry, closure });
  });
  return deletedAt;
}

/** A key with no delete action, or one that would null a NOT NULL column. */
const canStop = (fk) => fk.del === 'a' || fk.del === 'r' || ((fk.del === 'n' || fk.del === 'd') && fk.sets_not_null);

/**
 * Each key that stops the list: its referenced table is deleted at some step,
 * and its referencing table is not deleted at an earlier step or by the same
 * statement (its cascade).
 */
export function blockingKeys(fks, tables, ordered, parentScoped) {
  const deletedAt = deletionSteps(fks, tables, ordered, parentScoped);
  const found = [];
  for (const fk of fks) {
    const p = deletedAt.get(fk.parent);
    if (!p || fk.child === fk.parent || !canStop(fk)) continue;
    const c = deletedAt.get(fk.child);
    if (c && (c.step < p.step || (c.step === p.step && p.closure.has(fk.child)))) continue;
    const why = c ? `the purge deletes it later ('${c.entry}', after '${p.entry}')` : 'the purge never deletes it';
    found.push({ ...fk, why, at: p.entry });
  }
  return found.sort((a, b) => a.child.localeCompare(b.child) || a.conname.localeCompare(b.conname));
}
