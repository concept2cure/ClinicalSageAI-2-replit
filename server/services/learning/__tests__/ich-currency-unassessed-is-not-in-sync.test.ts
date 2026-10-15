/**
 * ICH currency: something that was not compared is not "in sync".
 *
 * Until 2026-10-15 assessIchCurrency fell through to
 * `finding: 'in_sync', detail: 'Corpus already reflects <code>.'` for every card
 * it had no rule for: a withdrawal, a draft for consultation, and any card
 * whose code carried no revision number to compare. A draft of a newer revision
 * was even reported as 'revision_available' ("Update code + summary"), as if it
 * had been adopted. With no cards at all (for example, no scan has run in this
 * process) GET /api/learning/horizon/ich-currency answered with an empty
 * worklist, which reads as "the corpus is current".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const lastScan = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('../../../jobs/regulatoryHorizonScan', () => ({ getLastHorizonResult: () => lastScan.value }));

import { makeCard, type CardDraft } from '../knowledge-card';
import { assessIchCurrency } from '../ich-currency';
import { buildHorizonDigest } from '../horizon-digest';
import { __setHorizonStore } from '../horizon-store';
import horizonRouter from '../../../routes/learning-horizon';

function card(over: Partial<CardDraft>) {
  return makeCard({
    sourceId: 'ich-workproducts',
    body: 'ICH',
    jurisdictions: ['global'],
    standardCode: 'E6(R3)',
    title: 'GCP',
    changeKind: 'press',
    summary: 'ICH E6(R3) Good Clinical Practice.',
    segments: ['pharma'],
    topics: ['GCP'],
    url: 'https://www.ich.org/',
    confidence: 0.9,
    grounded: true,
    ...over,
  });
}

describe('assessIchCurrency', () => {
  it('sends a withdrawal to a person instead of calling it in sync', () => {
    const c = card({ changeKind: 'withdrawal', title: 'E6(R3) withdrawn' });
    const report = assessIchCurrency([c]);
    expect(report.actions.find(a => a.cardId === c.id)?.finding).toBe('needs_review');
    expect(report.inSync).toBe(0);
  });

  it('sends a draft for consultation to a person, even when it names a newer revision', () => {
    const c = card({ standardCode: 'E6(R4)', changeKind: 'draft_for_consultation', title: 'E6(R4) draft' });
    expect(assessIchCurrency([c]).actions[0]?.finding).toBe('needs_review');
  });

  it('a code with no revision number to compare is undetermined, not in sync', () => {
    const c = card({ standardCode: 'E6', title: 'E6 news' });
    const item = assessIchCurrency([c]).actions[0];
    expect(item?.finding).toBe('undetermined');
    expect(item?.detail).toMatch(/no revision number/);
  });

  it('still reports in_sync when the card names the revision the corpus shows', () => {
    const report = assessIchCurrency([card({})]);
    expect(report.status).toBe('assessed');
    expect(report.actions).toEqual([]);
    expect(report.inSync).toBe(1);
  });

  it('with no ICH card, reports not assessed and says what was not compared', () => {
    const report = assessIchCurrency([]);
    expect(report.status).toBe('not_assessed');
    expect(report.notAssessedReason).toMatch(/No ICH knowledge card/);
    expect(report.notAssessedReason).toContain(String(report.corpusSize));
  });
});

describe('the read API', () => {
  const app = express();
  app.use('/api/learning/horizon', horizonRouter);

  beforeEach(() => {
    __setHorizonStore(null);
    lastScan.value = null;
  });

  it('GET /ich-currency on an empty store answers "not assessed", not an empty worklist of updates', async () => {
    const res = await request(app).get('/api/learning/horizon/ich-currency');

    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('not_assessed');
    expect(res.body.note).toMatch(/^Not assessed\./);
    expect(res.body.note).toContain('No horizon scan has run in this process.');
  });

  it('GET /summary reports no ICH action count when the corpus was not assessed, and says the scan was incomplete', async () => {
    lastScan.value = {
      sourcesScanned: 0,
      digest: buildHorizonDigest([], {
        sourcesDue: 1,
        unreadSources: [{ sourceId: 'ich-workproducts', error: 'HTTP 503' }],
        itemsHarvested: 0,
        undistilledItems: [],
      }),
      ichCurrency: assessIchCurrency([]),
    };

    const res = await request(app).get('/api/learning/horizon/summary');

    expect(res.status).toBe(200);
    expect(res.body.lastScan.ichActions).toBeNull();
    expect(res.body.lastScan.complete).toBe(false);
  });
});
