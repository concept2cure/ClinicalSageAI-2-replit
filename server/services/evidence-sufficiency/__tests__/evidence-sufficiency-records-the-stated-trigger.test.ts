/**
 * An assessment run is recorded with the trigger its caller stated, or not at
 * all. Until 2026-10-15 an unstated trigger was written as 'manual' — a claim
 * that a person started the run, which nobody said. The column is NOT NULL, so
 * an unstated trigger is refused before anything is written.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';

const insertCalls: Array<{ values: any }> = [];

vi.mock('../../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
          then: (resolve: (rows: unknown[]) => void) => resolve([]),
        }),
      }),
    }),
    insert: () => ({
      values: (v: any) => {
        insertCalls.push({ values: v });
        return { returning: () => Promise.resolve([{ id: 'assess-1' }]) };
      },
    }),
  },
}));

import { assessSufficiency } from '../evidence-sufficiency.service';
import type { EvidenceObject } from '../../../../shared/schema/programs';

const ORG = 9;
const PROGRAM = '11111111-1111-1111-1111-111111111111';

const ev = (
  evidenceType: string,
  status: 'approved' | 'pending' | 'rejected' | 'superseded' = 'approved',
  extras: Partial<EvidenceObject> = {}
): EvidenceObject =>
  ({
    id: `ev-${Math.random().toString(36).slice(2, 8)}`,
    organizationId: ORG,
    programId: PROGRAM,
    title: 'evidence',
    code: null,
    description: null,
    evidenceType,
    evidenceCategory: 'clinical',
    evidenceLevel: null,
    sourceType: 'internal',
    sourceReference: null,
    sourceCitation: null,
    documentId: null,
    documentVersion: null,
    pageRange: null,
    excerpt: null,
    qualityScore: '0.8',
    relevanceScore: '0.7',
    validFrom: null,
    validUntil: null,
    isVerified: false,
    verifiedBy: null,
    verifiedAt: null,
    authors: null,
    publicationDate: null,
    journal: null,
    doi: null,
    pmid: null,
    abstract: null,
    testType: null,
    testLab: null,
    testDate: null,
    testResults: { p_value: 0.001 },
    status,
    metadata: null,
    tags: [],
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extras,
  }) as EvidenceObject;

beforeEach(() => {
  insertCalls.length = 0;
});

describe('assessSufficiency — the recorded trigger is the caller\'s', () => {
  test('refuses to persist a run whose trigger was not stated', async () => {
    await expect(assessSufficiency({
      organizationId: ORG, programId: PROGRAM, pathway: 'PMA',
      profile: { hasPatientContact: false, isSoftware: false, isElectrical: false },
      evidenceOverride: [ev('risk_assessment')],
    })).rejects.toMatchObject({ statusCode: 422, field: 'trigger' });
    expect(insertCalls, 'an unstated trigger was recorded').toHaveLength(0);
  });

  test('records the stated trigger', async () => {
    await assessSufficiency({
      organizationId: ORG, programId: PROGRAM, pathway: 'PMA',
      profile: { hasPatientContact: false, isSoftware: false, isElectrical: false },
      evidenceOverride: [ev('risk_assessment')], trigger: 'scheduled',
    });
    expect(insertCalls[0].values.trigger).toBe('scheduled');
  });

  test('a dry run needs no trigger', async () => {
    await assessSufficiency({
      organizationId: ORG, programId: PROGRAM, pathway: 'PMA',
      profile: { hasPatientContact: false, isSoftware: false, isElectrical: false },
      evidenceOverride: [ev('risk_assessment')], dryRun: true,
    });
    expect(insertCalls).toHaveLength(0);
  });
});
