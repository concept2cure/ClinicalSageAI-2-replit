/**
 * `recordSchemaGaps` claims to sit at the one seam every caller shares. The
 * cases that matter are the ones a shim above PGlite could never see: a
 * statement Drizzle issues directly, and one issued inside a transaction
 * client. Each is shown recorded — and recorded once — while the error still
 * reaches the caller unchanged.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { recordSchemaGaps } from '../pglite-harness';

let pglite: PGlite;
afterEach(async () => {
  await pglite?.close();
});

describe('recordSchemaGaps — one recorder at the PGlite seam', () => {
  it('records a missing relation on pglite.query and rethrows the error unchanged', async () => {
    pglite = new PGlite();
    const gaps = recordSchemaGaps(pglite);
    await expect(pglite.query('SELECT 1 FROM no_such_table')).rejects.toMatchObject({
      code: '42P01',
    });
    expect(gaps).toEqual([
      {
        code: '42P01',
        message: 'relation "no_such_table" does not exist',
        sql: 'SELECT 1 FROM no_such_table',
      },
    ]);
  });

  it('records a missing column on pglite.exec', async () => {
    pglite = new PGlite();
    const gaps = recordSchemaGaps(pglite);
    await expect(pglite.exec('SELECT no_such_col FROM pg_class')).rejects.toMatchObject({
      code: '42703',
    });
    expect(gaps.map(g => g.code)).toEqual(['42703']);
  });

  it('sees a statement Drizzle issues directly — the path a pool shim never sees', async () => {
    pglite = new PGlite();
    const gaps = recordSchemaGaps(pglite);
    const db = drizzle(pglite);
    // Drizzle wraps the driver error; the SQLSTATE rides on `cause`.
    await expect(db.execute(sql`INSERT INTO audit_logs (id) VALUES (1)`)).rejects.toSatisfy(
      e => (e as { cause?: { code?: string } }).cause?.code === '42P01'
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].message).toContain('"audit_logs"');
  });

  it('sees a statement inside pglite.transaction, recorded exactly once', async () => {
    pglite = new PGlite();
    const gaps = recordSchemaGaps(pglite);
    await expect(
      pglite.transaction(async tx => {
        await tx.query('SELECT 1 FROM no_such_table');
      })
    ).rejects.toMatchObject({ code: '42P01' });
    expect(gaps).toHaveLength(1);
  });

  it('sees a statement inside a Drizzle transaction, recorded exactly once', async () => {
    pglite = new PGlite();
    const gaps = recordSchemaGaps(pglite);
    const db = drizzle(pglite);
    await expect(
      db.transaction(async tx => {
        await tx.execute(sql`SELECT 1 FROM no_such_table`);
      })
    ).rejects.toSatisfy(e => (e as { cause?: { code?: string } }).cause?.code === '42P01');
    expect(gaps).toHaveLength(1);
  });

  it('still records a failure the caller swallows — the case the recorder exists for', async () => {
    pglite = new PGlite();
    const gaps = recordSchemaGaps(pglite);
    try {
      await pglite.query('INSERT INTO audit_logs (id) VALUES (1)');
    } catch {
      /* a non-fatal audit writer swallowing its own error */
    }
    expect(gaps).toHaveLength(1);
  });

  it('does not record errors that are not schema gaps', async () => {
    pglite = new PGlite();
    const gaps = recordSchemaGaps(pglite);
    await expect(pglite.query('SELEC 1')).rejects.toMatchObject({ code: '42601' });
    expect(gaps).toEqual([]);
  });
});
