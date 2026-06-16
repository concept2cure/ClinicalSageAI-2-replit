import { describe, it, expect } from 'vitest';

import {
  HORIZON_SOURCES,
  enabledSources,
  cadenceDays,
  getSource,
  horizonSourcesSummary,
} from '../regulatory-horizon-sources';
import { makeCard, cardId, cardHash, fnv1a, type CardDraft } from '../knowledge-card';
import { decidePromotion, policyFromEnv, DEFAULT_POLICY } from '../promotion-policy';
import { assessIchCurrency, revisionOf } from '../ich-currency';
import { buildHorizonDigest, type ScanRecord } from '../horizon-digest';
import { parseFeedItems } from '../harvester';
import { isGrounded } from '../distiller';

function draft(over: Partial<CardDraft> = {}): CardDraft {
  return {
    sourceId: 'ich-workproducts',
    body: 'ICH',
    jurisdictions: ['global'],
    standardCode: 'E6(R3)',
    title: 'GCP modernised',
    changeKind: 'revision',
    summary: 'ICH E6(R3) modernises Good Clinical Practice around quality-by-design.',
    segments: ['pharma'],
    topics: ['GCP'],
    url: 'https://www.ich.org/',
    confidence: 0.9,
    grounded: true,
    ...over,
  };
}

describe('horizon source registry', () => {
  it('has unique, well-formed ids and at least one enabled source', () => {
    const ids = HORIZON_SOURCES.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(enabledSources().length).toBeGreaterThan(0);
    for (const s of HORIZON_SOURCES) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.title.length).toBeGreaterThan(0);
    }
  });

  it('includes the harmonisation backbone (ICH) as an enabled global source', () => {
    const ich = getSource('ich-workproducts');
    expect(ich?.body).toBe('ICH');
    expect(ich?.jurisdiction).toBe('global');
    expect(ich?.enabled).toBe(true);
  });

  it('summary counts reconcile with the registry', () => {
    const sum = horizonSourcesSummary();
    expect(sum.total).toBe(HORIZON_SOURCES.length);
    expect(sum.enabled).toBe(enabledSources().length);
  });

  it('maps cadence to interval days', () => {
    expect(cadenceDays('daily')).toBe(1);
    expect(cadenceDays('weekly')).toBe(7);
    expect(cadenceDays('monthly')).toBe(30);
  });
});

describe('knowledge card identity + hashing', () => {
  it('fnv1a is deterministic and 8 hex chars', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
  });

  it('same substance → same id (dedupe), changed substance → changed hash', () => {
    const a = makeCard(draft());
    const b = makeCard(draft({ summary: 'A different wording but same change.' }));
    // id is keyed on source+standard+date+title, so these collapse together:
    expect(b.id).toBe(a.id);
    // hash is keyed on substance, so the changed summary changes the hash:
    expect(cardHash(draft({ summary: 'changed' }))).not.toBe(cardHash(draft()));
    expect(cardId(draft({ standardCode: 'E8(R1)' }))).not.toBe(cardId(draft()));
  });

  it('new cards start pending', () => {
    expect(makeCard(draft()).status).toBe('pending');
  });
});

describe('promotion policy', () => {
  it('auto-promotes high-confidence grounded revisions', () => {
    const out = decidePromotion(makeCard(draft({ changeKind: 'revision', confidence: 0.95 })));
    expect(out.decision).toBe('auto_promote');
  });

  it('always sends new guidelines and withdrawals to human review', () => {
    expect(decidePromotion(makeCard(draft({ changeKind: 'new_guideline', confidence: 0.99 }))).decision).toBe('review');
    expect(decidePromotion(makeCard(draft({ changeKind: 'withdrawal', confidence: 0.99 }))).decision).toBe('review');
  });

  it('quarantines ungrounded cards regardless of confidence', () => {
    expect(decidePromotion(makeCard(draft({ grounded: false, confidence: 0.99 }))).decision).toBe('quarantine');
  });

  it('routes mid-confidence to review and low-confidence to quarantine', () => {
    expect(decidePromotion(makeCard(draft({ confidence: 0.6 }))).decision).toBe('review');
    expect(decidePromotion(makeCard(draft({ confidence: 0.2 }))).decision).toBe('quarantine');
  });

  it('policyFromEnv falls back to safe defaults', () => {
    const p = policyFromEnv();
    expect(p.autoPromoteMinConfidence).toBe(DEFAULT_POLICY.autoPromoteMinConfidence);
    expect(p.alwaysReviewChangeKinds).toContain('new_guideline');
  });
});

describe('ICH currency check (feeds the existing corpus)', () => {
  it('reads revision integers', () => {
    expect(revisionOf('E6(R3)')).toBe(3);
    expect(revisionOf('M4')).toBeUndefined();
  });

  it('flags a code absent from the corpus as missing_in_corpus', () => {
    const card = makeCard(draft({ standardCode: 'E99(R1)', title: 'Imaginary new guideline' }));
    const report = assessIchCurrency([card]);
    expect(report.actions.some(a => a.finding === 'missing_in_corpus')).toBe(true);
  });

  it('treats a code the corpus already indexes at the same revision as in_sync', () => {
    // E6(R3) is in the shipped corpus at R3 → no action.
    const card = makeCard(draft({ standardCode: 'E6(R3)', effectiveDate: undefined, changeKind: 'press' }));
    const report = assessIchCurrency([card]);
    expect(report.actions.find(a => a.cardId === card.id)).toBeUndefined();
    expect(report.inSync).toBeGreaterThanOrEqual(1);
  });

  it('ignores non-ICH cards', () => {
    const fda = makeCard(draft({ body: 'FDA', standardCode: undefined, sourceId: 'fda-guidance' }));
    expect(assessIchCurrency([fda]).ichCardsConsidered).toBe(0);
  });
});

describe('weekly digest', () => {
  it('summarises decisions and surfaces only the review queue', () => {
    const records: ScanRecord[] = [
      { card: makeCard(draft({ confidence: 0.95 })), decision: 'auto_promote', reason: 'ok' },
      { card: makeCard(draft({ standardCode: 'E20', title: 'Adaptive trials', changeKind: 'new_guideline' })), decision: 'review', reason: 'rule-bearing' },
      { card: makeCard(draft({ standardCode: 'X1', confidence: 0.1, grounded: false })), decision: 'quarantine', reason: 'low' },
    ];
    const d = buildHorizonDigest(records, 3);
    expect(d.totals.ingested).toBe(3);
    expect(d.totals.autoPromoted).toBe(1);
    expect(d.totals.review).toBe(1);
    expect(d.totals.quarantined).toBe(1);
    expect(d.reviewQueue).toHaveLength(1);
    expect(d.markdown).toContain('Needs your review');
  });

  it('says nothing needs attention when the review queue is empty', () => {
    const d = buildHorizonDigest([{ card: makeCard(draft({ confidence: 0.95 })), decision: 'auto_promote', reason: 'ok' }], 1);
    expect(d.markdown).toContain('Nothing needs your attention');
  });
});

describe('feed parsing + grounding', () => {
  it('parses RSS items (title, link, date)', () => {
    const xml = `<rss><channel>
      <item><title>ICH E6(R3) reaches Step 4</title><link>https://www.ich.org/e6r3</link><pubDate>Wed, 01 Jan 2025 00:00:00 GMT</pubDate><description>GCP modernised.</description></item>
    </channel></rss>`;
    const items = parseFeedItems(xml, 'ich-workproducts', 10);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('E6(R3)');
    expect(items[0].url).toBe('https://www.ich.org/e6r3');
    expect(items[0].publishedAt).toBeDefined();
  });

  it('parses Atom entries with href links', () => {
    const xml = `<feed><entry><title>New guidance</title><link href="https://x/y"/><updated>2025-02-02T00:00:00Z</updated><summary>Body.</summary></entry></feed>`;
    const items = parseFeedItems(xml, 'fda-guidance', 10);
    expect(items[0].url).toBe('https://x/y');
  });

  it('grounding requires summary tokens to trace to source text', () => {
    const src = 'ICH E6(R3) modernises Good Clinical Practice around quality by design and risk-based monitoring.';
    expect(isGrounded('E6(R3) modernises Good Clinical Practice quality design', src)).toBe(true);
    expect(isGrounded('Completely unrelated fabricated assertion about nitrosamine impurities limits', src)).toBe(false);
  });
});
