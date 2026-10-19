/**
 * A memory entry whose writer stated no confidence stores null.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * client_memory_entries.confidence_score and project_memory_entries.
 * confidence_score were declared `.default(0.8)`. Any writer that left the
 * column out (the feature store, the HAQ seed) stored 0.8 — a confidence
 * nobody stated, shown as "80% confidence" and ranked as if measured.
 *
 * Each table is created from its Drizzle definition, with the literal column
 * defaults it declares, on PGlite; a row is written through Drizzle without a
 * confidence and read back.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { clientMemoryEntries, projectMemoryEntries } from '../schema';

let pg: PGlite;

/** CREATE TABLE from the Drizzle definition: columns, types, literal defaults. */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => {
    // No pgvector in this PGlite; embeddings are not under test.
    const type = col.getSQLType().startsWith('vector') ? 'text' : col.getSQLType();
    const d = col.default;
    const literal = typeof d === 'number' || typeof d === 'boolean' ? ` DEFAULT ${d}`
      : typeof d === 'string' ? ` DEFAULT '${d.replace(/'/g, "''")}'` : '';
    return `"${col.name}" ${type}${col.primary ? ' PRIMARY KEY' : ''}${literal}`;
  });
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

beforeAll(async () => {
  pg = new PGlite();
  for (const t of [clientMemoryEntries, projectMemoryEntries]) await pg.exec(ddlOf(t as PgTable));
}, 60_000);

afterAll(async () => { await pg?.close(); });

describe('memory entry confidence is null unless a writer states one', () => {
  it.each([
    ['client_memory_entries', clientMemoryEntries],
    ['project_memory_entries', projectMemoryEntries],
  ] as const)('%s declares no default confidence', (_name, table) => {
    const column = getTableConfig(table as PgTable).columns.find(c => c.name === 'confidence_score');
    expect(column, 'confidence_score column').toBeDefined();
    expect(column?.default, 'the schema fills in a confidence nobody stated').toBeUndefined();
  });

  it('a client memory row written without a confidence stores null, not 0.8', async () => {
    const [row] = await drizzle(pg)
      .insert(clientMemoryEntries)
      .values({ profileId: 1, organizationId: 7, category: 'persona', title: 'Mission', content: 'Cure rare disease.' })
      .returning({ confidence: clientMemoryEntries.confidenceScore });
    expect(row.confidence, 'the column default supplied a confidence').toBeNull();
  });

  it('a project memory row written without a confidence stores null, not 0.8', async () => {
    const [row] = await drizzle(pg)
      .insert(projectMemoryEntries)
      .values({ projectProfileId: 1, projectId: 42, organizationId: 7, category: 'strategy', title: 'Design', content: 'Randomized.' })
      .returning({ confidence: projectMemoryEntries.confidenceScore });
    expect(row.confidence, 'the column default supplied a confidence').toBeNull();
  });

  it('control: a confidence a writer states is stored as stated', async () => {
    const [row] = await drizzle(pg)
      .insert(projectMemoryEntries)
      .values({ projectProfileId: 1, projectId: 42, organizationId: 7, category: 'strategy', title: 'Scored', content: 'x', confidenceScore: 0.42 })
      .returning({ confidence: projectMemoryEntries.confidenceScore });
    expect(row.confidence).toBeCloseTo(0.42, 5);
  });
});
