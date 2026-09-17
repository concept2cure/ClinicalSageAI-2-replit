/**
 * The IVDR technical-file completeness board and its denominator.
 *
 * `overall` was `avgPct(allItems)`, where `allItems` is the concatenation of the
 * seven families' item arrays. A family with NO records contributes nothing to
 * that mean instead of contributing a zero — so the average is taken over
 * whatever evidence happens to exist, which can only ever be an average of
 * things that are present.
 *
 * `descItems` hardcodes `status: 'complete', pct: 100` for every row in
 * `ivdr_classifications`. Recording one Annex VIII classification — the first
 * thing a user does — therefore made `allItems` a single 100% item and
 * `overall` 100. The surface renders that as "Your IVDR technical file is 100%
 * complete", a "100% — Technical file complete" tile, "1/1 Requirements
 * evidenced" and "0 Not yet started", over a file with no GSPR assessment, no
 * analytical performance, no clinical performance, no scientific validity, no
 * Performance Evaluation Report and no PMPF plan.
 *
 * The unit is the REQUIREMENT FAMILY, which is what the surface's own copy
 * names ("These are IVDR requirements — General Safety & Performance (Annex I),
 * the Performance Evaluation Report (Annex XIII), analytical and clinical
 * performance, scientific validity and post-market follow-up"). Seven families,
 * always; a family with no evidence is 0% and is not started.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import createIvdCompletenessRoutes from '../ivd-completeness-routes';

/** Drizzle's node-postgres driver reads rows in array mode. */
type Row = unknown[];

/**
 * A pg client that answers only the tables named, and [] for everything else.
 *
 * Drizzle's node-postgres driver calls `client.query({ text, values, rowMode })`
 * rather than `client.query(sql)`, so the SQL has to be read off `.text` — a
 * fake that only matches a string argument silently answers [] to every query
 * and the test then proves nothing.
 */
function fakeClient(byTable: Record<string, Row[]>) {
  return {
    query: async (arg: unknown) => {
      const sql = typeof arg === 'string' ? arg : String((arg as { text?: unknown })?.text ?? '');
      for (const [table, rows] of Object.entries(byTable)) {
        if (new RegExp(table, 'i').test(sql)) return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

function completenessHandler() {
  const router = createIvdCompletenessRoutes() as unknown as {
    stack: Array<{ route?: { path: string; stack: Array<{ handle: unknown }> } }>;
  };
  const layer = router.stack.find((l) => l.route?.path === '/completeness');
  if (!layer?.route) throw new Error('GET /completeness is not mounted');
  return layer.route.stack[layer.route.stack.length - 1].handle as (
    req: Request,
    res: Response,
  ) => Promise<unknown>;
}

async function callWith(byTable: Record<string, Row[]>) {
  const json = vi.fn();
  const res = { json, status: vi.fn().mockReturnThis() } as unknown as Response;
  const req = { tenantId: 7, dbClient: fakeClient(byTable) } as unknown as Request;
  await completenessHandler()(req, res);
  expect(json, 'the handler did not respond').toHaveBeenCalled();
  return (json.mock.calls[0][0] as { data: any }).data;
}

describe('IVDR completeness — a family with no evidence counts as zero', () => {
  it('one Annex VIII classification is not a complete technical file', async () => {
    const data = await callWith({ ivdr_classifications: [['AcmeDx HPV Assay', 'C']] });

    // Six of the seven families hold nothing. 100% is the answer the board gave.
    expect(data.overall, 'a single classification row reported the file complete').toBeLessThan(100);
    // One evidenced family out of seven.
    expect(data.overall).toBe(Math.round(100 / 7));

    const zeroFamilies = (data.families as Array<{ pct: number }>).filter((f) => f.pct === 0);
    expect(zeroFamilies.length, 'six families should hold nothing').toBe(6);

    /* The tiles beside the headline must use the same unit as the headline.
       "1/1 Requirements evidenced — 0 Not yet started" beside "100% complete"
       was three statements of the same falsehood, not one. */
    expect(data.summary.total).toBe(7);
    expect(data.summary.evidenced).toBe(1);
    expect(data.summary.notStarted).toBe(6);
  });

  it('an empty file is 0%, and says seven families are not started', async () => {
    const data = await callWith({});
    expect(data.overall).toBe(0);
    expect(data.summary.total).toBe(7);
    expect(data.summary.evidenced).toBe(0);
    expect(data.summary.notStarted).toBe(7);
  });

  it('flags is a count of flagged evidence, not a hardcoded zero', async () => {
    /* `flags: 0` was a literal in the response and drives an "Open evidence
       flags" tile — a number presented as the result of a check that never ran.
       With nothing flagged the honest value is still 0, so this pins the SOURCE
       by requiring it to track the items. */
    const data = await callWith({ ivdr_classifications: [['AcmeDx HPV Assay', 'C']] });
    const flagged = (data.families as Array<{ items: Array<{ flag?: unknown }> }>)
      .flatMap((f) => f.items)
      .filter((i) => Boolean(i.flag)).length;
    expect(data.summary.flags).toBe(flagged);
  });
});
