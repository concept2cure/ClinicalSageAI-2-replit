/**
 * Regulatory-graph traversal tests against the canonical claim tables
 * (evidence_claims + evidence_claim_links).
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';

interface MockState {
  perTable: Map<unknown, unknown[]>;
}
const mockState: MockState = { perTable: new Map() };

function setRows(tableRef: unknown, rows: unknown[]) {
  mockState.perTable.set(tableRef, rows);
}

function makeChain() {
  let activeTable: unknown = null;
  const chain: any = {
    from(t: unknown) {
      activeTable = t;
      return chain;
    },
    where() {
      return chain;
    },
    limit() {
      return Promise.resolve(mockState.perTable.get(activeTable) ?? []);
    },
    orderBy() {
      return chain;
    },
    then(resolve: (rows: unknown[]) => void) {
      resolve(mockState.perTable.get(activeTable) ?? []);
    },
  };
  return chain;
}

vi.mock('../../../db', () => ({
  db: { select: () => makeChain() },
}));

import {
  findContradictedClaims,
  findOrphanClaims,
  traceClaimEvidence,
  traceClaimsForDocument,
} from '../regulatory-graph.service';
import { evidenceClaims, evidenceClaimLinks } from '../../../../shared/schema';

const PROGRAM_ID = 7;

const claim = (id: number, status = 'proposed', isCurrent = true) => ({
  id,
  sourceId: 1,
  programId: PROGRAM_ID,
  organizationId: 1,
  claimText: `claim ${id}`,
  claimType: 'performance',
  pageNumber: null,
  sectionReference: null,
  sentenceIndex: null,
  confidence: '0.50',
  extractionMethod: 'pattern',
  version: 1,
  previousVersionId: null,
  isCurrent,
  metadata: {},
  extractedBy: null,
  createdAt: new Date(),
  // governance fields added 2026-04-29
  code: null,
  status,
  supersededByClaimId: null,
  riskLevel: null,
  riskRationale: null,
  population: null,
  anatomicalSite: null,
  useEnvironment: null,
  sourceDocument: null,
  sourcePath: null,
  tags: [],
});

const link = (id: number, claimId: number, documentId: number, linkType: string) => ({
  id,
  claimId,
  documentId,
  sectionId: null,
  programId: PROGRAM_ID,
  organizationId: 1,
  linkType,
  strength: '1.00',
  createdBy: null,
  createdAt: new Date(),
  deletedAt: null,
  deletedBy: null,
});

beforeEach(() => {
  mockState.perTable.clear();
});

describe('traceClaimEvidence', () => {
  test('partitions links by type; supersedes is not surfaced', async () => {
    setRows(evidenceClaims, [claim(1)]);
    setRows(evidenceClaimLinks, [
      link(1, 1, 100, 'supports'),
      link(2, 1, 101, 'contradicts'),
      link(3, 1, 102, 'references'),
      link(4, 1, 103, 'supersedes'),
    ]);
    const trace = await traceClaimEvidence(1);
    expect(trace).not.toBeNull();
    expect(trace!.supporting).toHaveLength(1);
    expect(trace!.contradicting).toHaveLength(1);
    expect(trace!.referencing).toHaveLength(1);
  });

  test('returns null when claim does not exist', async () => {
    setRows(evidenceClaims, []);
    expect(await traceClaimEvidence(999)).toBeNull();
  });
});

describe('traceClaimsForDocument', () => {
  test('returns claims linked to a document', async () => {
    setRows(evidenceClaimLinks, [link(1, 7, 50, 'supports')]);
    setRows(evidenceClaims, [claim(7)]);
    const out = await traceClaimsForDocument(50);
    expect(out).toHaveLength(1);
    expect(out[0].claim.id).toBe(7);
  });
});

describe('findOrphanClaims', () => {
  test('flags zero-link and no-supporting-link claims', async () => {
    setRows(evidenceClaims, [claim(1), claim(2), claim(3)]);
    setRows(evidenceClaimLinks, [
      link(10, 1, 200, 'contradicts'), // 1 → no_supporting_links
      link(11, 2, 201, 'supports'), //    2 → supported
      // 3 has no links → no_links
    ]);
    const out = await findOrphanClaims(PROGRAM_ID);
    const map = new Map(out.map(o => [o.claim.id, o.reason]));
    expect(map.get(1)).toBe('no_supporting_links');
    expect(map.get(3)).toBe('no_links');
    expect(map.has(2)).toBe(false);
  });
});

describe('findContradictedClaims', () => {
  test('returns only claims with at least one contradicts link', async () => {
    setRows(evidenceClaims, [claim(1), claim(2)]);
    setRows(evidenceClaimLinks, [
      link(10, 1, 100, 'supports'),
      link(11, 1, 101, 'contradicts'),
      link(12, 2, 102, 'supports'),
    ]);
    const out = await findContradictedClaims(PROGRAM_ID);
    expect(out).toHaveLength(1);
    expect(out[0].claim.id).toBe(1);
    expect(out[0].contradictionCount).toBe(1);
    expect(out[0].supportingCount).toBe(1);
  });
});
