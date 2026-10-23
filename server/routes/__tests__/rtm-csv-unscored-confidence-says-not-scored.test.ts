/**
 * The RTM CSV says "not scored" for a claim nobody scored.
 *
 * evidence_claims.confidence is nullable, and the CSV writer rendered null as
 * an empty cell. In a governed export a blank Confidence cell reads as a
 * dropped value or a zero, not as "this claim was never scored" — so an
 * unscored claim now carries the words, and a scored one its score.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { dbState } = vi.hoisted(() => ({ dbState: { claims: [] as unknown[], call: 0 } }));

// Minimal drizzle chain: claims on the first query, no links on the second.
vi.mock('../../db', () => {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.innerJoin = () => chain;
  chain.where = () => {
    const rows = dbState.call === 0 ? dbState.claims : [];
    dbState.call += 1;
    return Promise.resolve(rows);
  };
  return { db: { select: () => chain } };
});
vi.mock('../../services/compute/exportGovernance', () => ({
  registerExportGovernanceQuick: vi.fn(async () => ({ ok: true, id: 'gov-1' })),
}));

import router from '../rtm-export';

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown; tenantId: number }).user = { id: 3, organizationId: 1, name: 'Avery Author' };
    (req as unknown as { tenantId: number }).tenantId = 1;
    next();
  });
  a.use('/api/rtm', router);
  return a;
}

const claim = (claimId: number, confidence: string | null) => ({
  claimId, claimText: `Claim ${claimId}`, claimType: 'performance', confidence,
  extractionMethod: 'manual', sourceTitle: 'Study A', sourceType: 'csr', contentHash: 'abc', sourceFileName: 'a.pdf',
});

beforeEach(() => {
  dbState.call = 0;
  dbState.claims = [claim(1, null), claim(2, '0.90')];
});

describe('RTM CSV — an unscored claim says so', () => {
  it('writes "not scored" in the Confidence column, never a blank cell', async () => {
    const res = await request(app()).get('/api/rtm/programs/7/rtm/csv');
    expect(res.status).toBe(200);
    const [header, unscored, scored] = res.text.split('\n').map((line) => line.split(','));
    const col = header.indexOf('Confidence');
    expect(unscored[col], 'an unscored claim had a blank Confidence cell').toBe('not scored');
    expect(scored[col]).toBe('0.90');
  });
});
