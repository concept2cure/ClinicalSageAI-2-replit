/**
 * E8 — Pre-IND / EOP2 briefing-book builder with reviewer-challenge pre-mortem.
 *
 * Covers the pure core (server/services/ana/briefing-book-core.ts):
 *   - required_strings derivation (mandatory headers + sponsor questions);
 *   - markdown assembly contains every required string verbatim (so the verify
 *     pass/fail contract is honest);
 *   - honesty guard: fixture data is not_assessed and not sealable/exportable;
 *     anticipated pushback is anticipated, never an actual agency position;
 *     a zero precedent corpus yields insufficient_data, not a fabricated risk;
 *   - challenge → sponsor-question mapping;
 *   - tool registration + schema exposure.
 */

import { describe, it, expect } from 'vitest';
import {
  MANDATORY_SECTION_HEADERS,
  deriveRequiredStrings,
  assembleBriefingBook,
  composeBriefingBookPremortem,
  normalizeReviewerChallenges,
  normalizePremortemFindings,
  sponsorQuestionLabel,
  FIXTURE_EOP2_MEETING,
  FIXTURE_EOP2_CONTEXT,
  type AnticipatedChallenge,
} from '../briefing-book-core.js';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const QS = [
  'Does the Agency concur with the proposed primary endpoint?',
  'Is the safety database adequate?',
];

describe('deriveRequiredStrings', () => {
  it('derives mandatory headers followed by every sponsor question, verbatim', () => {
    const out = deriveRequiredStrings({ keyQuestions: QS });
    // Headers come first, in order.
    expect(out.slice(0, MANDATORY_SECTION_HEADERS.length)).toEqual([...MANDATORY_SECTION_HEADERS]);
    // Then each sponsor question, verbatim.
    expect(out).toContain(QS[0]);
    expect(out).toContain(QS[1]);
    expect(out.length).toBe(MANDATORY_SECTION_HEADERS.length + 2);
  });

  it('dedupes and prunes blank questions', () => {
    const out = deriveRequiredStrings({ keyQuestions: [QS[0], '  ', QS[0], 'Background'] });
    // 'Background' already a header → not duplicated; blank pruned; dup pruned.
    expect(out.filter(s => s === QS[0]).length).toBe(1);
    expect(out.filter(s => s === 'Background').length).toBe(1);
  });

  it('returns just the headers when there are no sponsor questions', () => {
    expect(deriveRequiredStrings({})).toEqual([...MANDATORY_SECTION_HEADERS]);
  });
});

describe('assembleBriefingBook', () => {
  it('produces markdown containing every required string verbatim', () => {
    const book = assembleBriefingBook(
      { id: 'm1', type: 'eop2', keyQuestions: QS },
      { productName: 'C2C-117', indication: 'R/R AML' },
    );
    for (const required of book.requiredStrings) {
      expect(book.content).toContain(required);
    }
    expect(book.questionCount).toBe(2);
    expect(book.title).toContain('End-of-Phase 2');
    expect(book.title).toContain('C2C-117');
  });

  it('numbers each sponsor question under Questions for the Agency', () => {
    const book = assembleBriefingBook({ id: 'm1', type: 'pre_ind', keyQuestions: QS });
    expect(book.content).toContain(`${sponsorQuestionLabel(0)} ${QS[0]}`);
    expect(book.content).toContain(`${sponsorQuestionLabel(1)} ${QS[1]}`);
    expect(book.title).toContain('Pre-IND');
  });
});

describe('composeBriefingBookPremortem — honesty guard', () => {
  const challenges: AnticipatedChallenge[] = [
    { severity: 'high', question: `Concern about ${QS[0]}`, lens: 'biostatistics_skeptic' },
    { severity: 'critical', question: 'Unrelated CMC concern', lens: 'cmc_heavy_reviewer' },
  ];

  it('marks fixture/sample data not_assessed and NOT sealable/exportable', () => {
    const v = composeBriefingBookPremortem({
      meeting: { keyQuestions: QS },
      challenges,
      precedentCount: 0,
      dataSource: 'fixture',
    });
    expect(v.assessment).toBe('not_assessed');
    expect(v.sealable).toBe(false);
    expect(v.summary).toMatch(/not sealable or exportable/i);
  });

  it('marks live data assessed and sealable', () => {
    const v = composeBriefingBookPremortem({
      meeting: { keyQuestions: QS },
      challenges,
      precedentCount: 12,
      dataSource: 'live',
    });
    expect(v.assessment).toBe('assessed');
    expect(v.sealable).toBe(true);
  });

  it('always frames pushback as anticipated, never an actual agency position', () => {
    const v = composeBriefingBookPremortem({
      meeting: { keyQuestions: QS },
      challenges,
      precedentCount: 12,
      dataSource: 'live',
    });
    expect(v.anticipated).toBe(true);
    expect(v.summary.toLowerCase()).toContain('anticipated');
    // Never asserts an actual FDA position.
    expect(v.summary.toLowerCase()).not.toContain('the fda requires');
  });

  it('reports insufficient_data (not a fabricated risk) when the corpus is empty', () => {
    const v = composeBriefingBookPremortem({
      meeting: { keyQuestions: QS },
      challenges,
      precedentCount: 0,
      dataSource: 'live',
    });
    expect(v.overallRisk).toBe('insufficient_data');
    expect(v.precedentCount).toBe(0);
  });

  it('rolls up to the max anticipated severity once a corpus exists', () => {
    const v = composeBriefingBookPremortem({
      meeting: { keyQuestions: QS },
      challenges,
      precedentCount: 25,
      dataSource: 'live',
    });
    expect(v.overallRisk).toBe('critical');
  });

  it('maps each challenge under the sponsor question it references, else unmapped', () => {
    const v = composeBriefingBookPremortem({
      meeting: { keyQuestions: QS },
      challenges,
      precedentCount: 25,
      dataSource: 'live',
    });
    const q1 = v.perQuestion.find(q => q.number === 1);
    expect(q1?.challenges.length).toBe(1); // references QS[0]
    expect(v.unmappedChallenges.length).toBe(1); // the CMC concern
  });
});

describe('normalizers', () => {
  it('normalizes simulate_reviewer_challenges output', () => {
    const out = normalizeReviewerChallenges({
      challenges: [
        { question: 'Q?', severity: 'High', lens: 'skeptical_reviewer', suggested_response: 'do X' },
        { challenge: 'Q2?', severity: 'bogus' },
        { question: '   ' }, // pruned
      ],
    });
    expect(out.length).toBe(2);
    expect(out[0].severity).toBe('high');
    expect(out[0].suggestedResponse).toBe('do X');
    expect(out[1].severity).toBe('medium'); // unknown severity → medium
  });

  it('normalizes run_submission_premortem findings', () => {
    const out = normalizePremortemFindings({
      findings: [
        { reviewerQuestion: 'Why?', severity: 'critical', remediation: 'fix', category: 'deficiency' },
      ],
    });
    expect(out.length).toBe(1);
    expect(out[0].severity).toBe('critical');
    expect(out[0].suggestedResponse).toBe('fix');
    expect(out[0].lens).toBe('deficiency');
  });
});

describe('fixtures', () => {
  it('the EOP2 fixture assembles a complete, fixture-sourced book', () => {
    const book = assembleBriefingBook(FIXTURE_EOP2_MEETING, FIXTURE_EOP2_CONTEXT);
    expect(book.questionCount).toBe(FIXTURE_EOP2_MEETING.keyQuestions!.length);
    for (const required of book.requiredStrings) expect(book.content).toContain(required);
  });
});

describe('assemble_briefing_book tool', () => {
  it('registers a handler', () => {
    expect(typeof getToolHandler('assemble_briefing_book')).toBe('function');
  });

  it('is exposed in ALL_ANA_TOOLS', () => {
    const def = ALL_ANA_TOOLS.find(t => t.name === 'assemble_briefing_book');
    expect(def).toBeDefined();
    expect(def!.description.length).toBeGreaterThan(50);
  });

  it('builds a fixture book that is not_assessed and not sealable (honest default)', async () => {
    const handler = getToolHandler('assemble_briefing_book')!;
    const out = JSON.parse(await handler({ run_premortem: false }, { organizationId: 'org_1' } as any));
    expect(out.error).toBeUndefined();
    expect(out.status).toBe('generated');
    expect(out.documentType).toBe('briefing-book');
    expect(Array.isArray(out.requiredStrings)).toBe(true);
    expect(out.premortem.assessment).toBe('not_assessed');
    expect(out.premortem.sealable).toBe(false);
    expect(out.premortem.anticipated).toBe(true);
    // Every required string is present verbatim in the assembled content.
    for (const required of out.requiredStrings) expect(out.content).toContain(required);
  });
});
