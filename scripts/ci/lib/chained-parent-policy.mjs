/** Recognize only the existing deploy-replayed chained parent-policy generator.
 * This models declared isolation capability, like the gate's literal CREATE
 * POLICY rule; live policy correctness remains the native RLS gates' concern.
 * Unknown generator shapes fail rather than silently exempting their tables.
 */
export function chainedParentPolicyTables(source) {
  const sql = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
  const array = /\bchained\s+TEXT\[\]\[\]\s*:=\s*ARRAY\[([\s\S]*?)\]\s*;/i.exec(sql);
  if (!array) throw new Error('chained parent-policy declaration is missing');
  const end = /\bEND\s*\$\$\s*;/i.exec(sql.slice(array.index));
  if (!end) throw new Error('chained parent-policy block terminator is missing');
  const generator = sql.slice(array.index, array.index + end.index + end[0].length);
  const normalized = generator.replace(/\s+/g, ' ').toLowerCase();
  const required = [
    'for i in 1 .. array_length(chained, 1) loop',
    "split_part(chained[i][1], '.', 1)",
    "split_part(chained[i][1], '.', 2)",
    'fk_col := chained[i][2];',
    "split_part(chained[i][3], '.', 1)",
    "split_part(chained[i][3], '.', 2)",
    'parent_col := chained[i][4];',
    "where schemaname=parent_schema and tablename=parent and policyname='tenant_isolation_policy') then",
    "execute format('alter table %i.%i enable row level security', child_schema, child)",
    "execute format('alter table %i.%i force row level security', child_schema, child)",
    "predicate := format('exists (select 1 from %i.%i p where p.%i = %i.%i.%i)', parent_schema, parent, parent_col, child_schema, child, fk_col)",
    'create policy tenant_isolation_policy on %i.%i for all',
    '$pol$, child_schema, child, predicate, predicate)',
  ];
  for (const clause of required) {
    if (!normalized.includes(clause)) throw new Error(`unrecognized chained parent-policy generator: ${clause}`);
  }
  // Both predicates must actually consume the two supplied parent expressions.
  const policy = /CREATE\s+POLICY\s+tenant_isolation_policy\s+ON\s+%I\.%I\s+FOR\s+ALL\s+USING\s*\([\s\S]*?OR\s+%s\s*\)\s+WITH\s+CHECK\s*\([\s\S]*?OR\s+%s\s*\)\s*\$pol\$/i;
  if (!policy.test(generator)) throw new Error('chained parent-policy USING/WITH CHECK no longer delegates to its parent');
  const name = '[a-z_][a-z0-9_]*(?:\\.[a-z_][a-z0-9_]*)?';
  const row = new RegExp(`\\[\\s*'(${name})'\\s*,\\s*'(${name})'\\s*,\\s*'(${name})'\\s*,\\s*'(${name})'\\s*\\]`, 'gi');
  const tables = [];
  const remainder = array[1].replace(row, (_all, child) => { tables.push(child.toLowerCase().replace(/^public\./, '')); return ''; });
  if (!tables.length || /[^\s,]/.test(remainder)) throw new Error('chained parent-policy rows must remain four literal identifiers');
  return new Set(tables);
}
