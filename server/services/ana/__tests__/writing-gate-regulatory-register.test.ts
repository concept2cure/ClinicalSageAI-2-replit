/**
 * Writing Precision Gate — regulatory register.
 *
 * The claims dimension composes promotional-screening.ts, a lexicon built for
 * advertising copy. Applied unchanged to submission prose it flagged sentences
 * regulators require (the ICH E3 §5.3 consent statement, the statutory
 * Breakthrough Therapy designation, FDA endpoint names such as "clinical cure at
 * the test-of-cure visit") as high-severity over-claims, and the tool told AnA to
 * revise until they were gone. Meanwhile "the study was successful and drug X
 * will be approved" passed. These lock the submission register: named terms of
 * art are exempt (each with a basis), outcome predictions are caught by the
 * composed governance lexicon, and genuine over-claims stay flagged in both
 * registers.
 */

import { describe, it, expect } from 'vitest';

import { critiqueDraft, critiqueDocument, verifyRevision } from '../writing-precision-gate';
import { screenPromotionalLanguage } from '../promotional-screening';
import { CRITIQUE_DRAFT, VERIFY_REVISION, CRITIQUE_DOCUMENT } from '../writingQualityTools';
import { getToolHandler } from '../AnaToolExecutor';

const claimsOf = (text: string, register?: 'submission' | 'promotional') =>
  critiqueDraft({ text, register }).findings.filter(f => f.category === 'claims');

// Correct submission sentences that the advertising lexicon flagged as high.
const TERMS_OF_ART: Array<[string, string]> = [
  ['A1 ICH E3 §5.3 consent statement', 'All patients provided written informed consent before any study-specific procedure was performed.'],
  ['A2 statutory designation', 'FDA granted Breakthrough Therapy designation to drug X for this indication.'],
  ['A3 superiority hypothesis', 'The primary objective was to demonstrate that drug X is superior to placebo.'],
  ['A4 antibacterial endpoint', 'Clinical cure at the test-of-cure visit was the primary efficacy endpoint.'],
  ['A5 PK elimination', 'Drug X was eliminated primarily by renal excretion.'],
  ['A6 AE outcome', 'The event resolved completely without sequelae.'],
  ['A7 dose optimization', 'The dose-ranging study was designed to identify the optimal dose.'],
  ['best supportive care', 'Patients randomized to the control arm received best supportive care.'],
  ['BCVA endpoint', 'The primary endpoint was change from baseline in best corrected visual acuity.'],
  ['RECIST best overall response', 'Best overall response was assessed per RECIST 1.1.'],
  ['eligibility term', 'Eligible patients had biopsy-proven disease.'],
  ['microbiological eradication', 'The baseline pathogen was eradicated at the test-of-cure visit.'],
  ['follow-up census', 'Every patient will be followed for survival.'],
  ['site-qualified consent', 'All patients at participating sites provided written informed consent.'],
  ['renal elimination', 'Renal elimination accounted for 60% of the dose; the elimination half-life was 12 hours.'],
  ['tested superiority hypothesis', 'The study tested whether drug X was superior to placebo.'],
  ['powered superiority hypothesis', 'The study was powered to show that drug X is superior to placebo.'],
  ['disposition census', 'All patients completed the 12-week treatment period.'],
  ['AE outcome with a time point', 'The rash completely resolved by Day 10.'],
  ['AE outcome at clause end', 'By the final visit, the event had completely resolved.'],
];

describe('submission register (the gate default) exempts regulatory terms of art', () => {
  it.each(TERMS_OF_ART)('%s gives no claims finding', (_label, text) => {
    expect(claimsOf(text)).toEqual([]);
  });

  it('reports the register and the basis of each exemption it applied', () => {
    const report = critiqueDraft({ text: TERMS_OF_ART[1][1] });
    expect(report.register).toBe('submission');
    expect(report.claimExemptions.length).toBeGreaterThan(0);
    for (const e of report.claimExemptions) {
      expect(e.basis.ref).toBeTruthy();
      expect(['regulator-text', 'recall', 'platform-convention']).toContain(e.basis.confidence);
    }
  });

  it('exempts only the term of art, not another over-claim in the same sentence', () => {
    const found = claimsOf('Drug X is the best option, and the control arm received best supportive care.');
    expect(found.some(f => f.severity === 'high' && /superiority/.test(f.message))).toBe(true);
  });
});

describe('submission register catches regulatory-outcome claims (composes governance.detectUnsupportedClaims)', () => {
  it('flags a predicted approval and trial success as high regulatory_outcome findings', () => {
    const report = critiqueDraft({ text: 'The study was successful and drug X will be approved for this indication.' });
    const found = report.findings.filter(f => f.category === 'claims' && /regulatory_outcome/.test(f.message));
    expect(found.length).toBeGreaterThan(0);
    expect(found.every(f => f.severity === 'high')).toBe(true);
    expect(report.verdict).toBe('revise');
  });

  it('does not flag the standard protocol statement about IRB approval', () => {
    expect(claimsOf('The protocol will be approved by the IRB before enrolment.')).toEqual([]);
  });

  // Protocol governance: a named non-regulator approver is an operational step, not a prediction.
  it.each([
    'Any protocol amendment will be approved by the sponsor before implementation.',
    'Dose escalation will be approved by the Safety Review Committee.',
    'The protocol will be approved by the local ethics committee before enrolment.',
    'The protocol will be approved by each site IRB before enrolment.',
    'The Medical Monitor will approve each dose escalation decision.',
    'The protocol will be approved by the IRB and submitted to FDA with the IND.',
    'Each amendment will be approved by the sponsor and the IEC before implementation.',
  ])('does not flag the governance step: %s', (text) => {
    expect(claimsOf(text)).toEqual([]);
  });

  it.each([
    'Drug X will be approved for this indication.',
    'Drug X will be approved by FDA in 2027.',
    'The sponsor expects that FDA will approve drug X.',
    'The marketing authorisation application is likely to be approved by the European Commission.',
    // Fail closed: only a named non-regulatory approver drops a match; a date or any other agent keeps it.
    'Drug X will be approved by the end of 2027.',
    'Drug X will be approved by Q3 2027.',
    'We expect that drug X will be approved by year-end.',
    'Drug X will be approved by the Food and Drug Administration in 2027.',
    'Drug X will be approved by MHLW in Japan.',
    'Drug X will be approved by the Ministry of Health, Labour and Welfare.',
    'Drug X will be approved by CDER.',
    'Drug X will be approved by Swissmedic.',
    'The Food and Drug Administration will approve drug X.',
    'MHLW will approve drug X next year.',
    // A non-regulatory approver coordinated with any other agent does not drop the match.
    'The protocol and drug X will be approved by the IRB and FDA.',
    'Drug X will be approved by the sponsor and the European Medicines Agency.',
    'FDA and the sponsor will approve the label.',
    // A governance body followed by anything that may hold another agent does not drop the match.
    'Drug X will be approved by the IRB, then by FDA.',
    'Drug X will be approved by the Steering Committee and then by FDA.',
    "Drug X will be approved by the sponsor's target date of 2027.",
    'Drug X will be approved by the sponsor-requested action date.',
    'Drug X will be approved by the sponsor (FDA) next year.',
  ])('still flags the regulatory-decision prediction: %s', (text) => {
    expect(claimsOf(text).some(f => f.severity === 'high' && /regulatory_outcome/.test(f.message))).toBe(true);
  });

  it('the promotional register does not add the governance lexicon', () => {
    expect(claimsOf('This trial was successful.', 'promotional')).toEqual([]);
  });
});

describe('genuine over-claims stay flagged in both registers', () => {
  const GUARDS = [
    'All patients responded to treatment.',
    'The drug works in all patients.',
    'The treatment cures the disease and eliminates recurrence.',
    'Drug X is the best option.',
    'Our breakthrough therapy is the most effective option.',
    // Each of these sits next to a term of art; a span reaching across the sentence exempted it.
    'The objective response rate with drug X was superior to that with docetaxel.',
    'Our objective is simple: drug X is superior to every competitor.',
    'All patients responded to treatment and completed the study.',
    'All patients achieved complete remission and received follow-up.',
    'Every patient treated with drug X was cured and completed the study.',
    'All patients in Arm A responded and completed the study.',
    'Drug X eliminated tumour recurrence in patients with renal impairment.',
    'Drug X eliminates the disease and has low hepatic clearance.',
    'Drug X is a clinical cure for hepatitis C.',
    'Bacterial infections are eradicated by drug X.',
    // A result restated with "demonstrate that" is not a hypothesis; an outcome qualifier is not a census.
    'These results continue to demonstrate that drug X is superior to standard of care.',
    'All patients completed treatment without relapse.',
    'All patients in the study were treated successfully.',
    'All patients completed treatment with no relapse.',
    'All patients received drug X and improved.',
    'All patients received drug X and benefited.',
    'All patients received drug X and none relapsed.',
    // "resolved completely" is an AE outcome only when intransitive; with an object it is an efficacy claim.
    'Drug X completely resolved the disease.',
    'Treatment with drug X completely resolved the infection.',
    'Drug X resolved completely the symptoms of psoriasis.',
    'Drug X completely resolved psoriasis in the majority of patients.',
    'The infection was completely resolved by drug X.',
  ];
  for (const register of ['submission', 'promotional'] as const) {
    it.each(GUARDS)(`${register}: %s keeps a high claims finding`, (text) => {
      expect(claimsOf(text, register).some(f => f.severity === 'high')).toBe(true);
    });
  }
});

describe('promotional register (screen_promotional_language default) is unchanged', () => {
  it('still flags "All patients" in the consent statement', () => {
    const r = screenPromotionalLanguage(TERMS_OF_ART[0][1]);
    expect(r.register).toBe('promotional');
    expect(r.flags.some(f => f.category === 'absolute' && /all patients/i.test(f.phrase))).toBe(true);
    expect(r.exempted).toEqual([]);
  });
});

describe('register threads through verify_revision, critique_document and the tools', () => {
  it('verifyRevision and critiqueDocument use the submission register by default', () => {
    const consent = TERMS_OF_ART[0][1];
    expect(verifyRevision({ text: consent }, { text: consent }).passesNow).toBe(true);
    const doc = critiqueDocument([{ title: 'Ethics', text: consent }]);
    expect(doc.sections[0].report.findings.filter(f => f.category === 'claims')).toEqual([]);
    const promo = critiqueDocument([{ title: 'Ethics', text: consent }], { register: 'promotional' });
    expect(promo.sections[0].report.findings.some(f => f.category === 'claims')).toBe(true);
  });

  it('each tool declares the register input', () => {
    for (const tool of [CRITIQUE_DRAFT, VERIFY_REVISION, CRITIQUE_DOCUMENT]) {
      const props = tool.input_schema.properties as Record<string, { enum?: string[] }>;
      expect(props.register?.enum).toEqual(['submission', 'promotional']);
    }
  });

  it('critique_draft reports the register it applied and honours an explicit one', async () => {
    const handler = getToolHandler('critique_draft')!;
    const text = TERMS_OF_ART[1][1];
    const sub = JSON.parse(await handler({ text }, {}));
    expect(sub.register).toBe('submission');
    expect(sub.findings.filter((f: { category: string }) => f.category === 'claims')).toEqual([]);
    const promo = JSON.parse(await handler({ text, register: 'promotional' }, {}));
    expect(promo.register).toBe('promotional');
    expect(promo.findings.some((f: { category: string }) => f.category === 'claims')).toBe(true);
  });

  it('verify_revision and critique_document report the register', async () => {
    const text = TERMS_OF_ART[0][1];
    const vr = JSON.parse(await getToolHandler('verify_revision')!({ originalText: text, revisedText: text }, {}));
    expect(vr.register).toBe('submission');
    const cd = JSON.parse(await getToolHandler('critique_document')!({ sections: [{ title: 'Ethics', text }], register: 'promotional' }, {}));
    expect(cd.register).toBe('promotional');
  });
});

// A CSR runs to hundreds of kilobytes. The term-of-art check used to re-scan
// the whole text with every term pattern for each lexicon hit, so a 300 KB
// document took seconds in the submission register and blocked the event
// loop meanwhile. The spans are now found once per text; the result must be
// exactly what the per-hit scan gave (3849 flags, 5132 exempted).
describe('the submission register stays linear on a CSR-sized text', () => {
  const unit = 'All patients received drug X and were followed for 12 weeks. The objective was to demonstrate that drug X is superior to placebo. The event resolved completely without sequelae. Drug X is safe and well tolerated, a breakthrough cure. ';
  const text = unit.repeat(Math.ceil(300_000 / unit.length));

  it('screens 300 KB in well under a second, with the same verdicts', () => {
    const t0 = performance.now();
    const r = screenPromotionalLanguage(text, { register: 'submission' });
    const ms = performance.now() - t0;
    expect(r.flags.length).toBe(3849);
    expect(r.exempted.length).toBe(5132);
    expect(ms).toBeLessThan(1000);
  });
});
