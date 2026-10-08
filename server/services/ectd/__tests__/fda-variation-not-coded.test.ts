/**
 * FDA "variation" is not coded as an amendment to the original application
 * (F19b; WORKFLOW_DECISION_2026-10-08 §5).
 *
 * The defect: fdaSubmissionTypeFor coded a 'variation' sequence exactly like an
 * amendment (FDA submission type "Original Application", sub-type "amendment"),
 * so a post-approval change left the packager as an amendment to the original
 * application. FDA has no variation; its post-approval changes are supplements
 * (PAS, CBE-30, CBE-0), which are not built yet. The reason is the market
 * verdict's (market-support.ts FDA_VARIATION_REASON). The reason is asserted
 * by its words, so this file runs against the packager as it was.
 */
import { describe, it, expect } from 'vitest';
import { buildPackagerInputFromCore, fdaSubmissionTypeFor } from '../core-to-packager';

const args = (region: string, type: string) => ({
  sequence: { sequenceNumber: '0004', region, type },
  submission: { applicationType: region === 'fda' ? 'nda' : 'maa', productName: 'C2C-001' },
  applicationId: region === 'fda' ? '123456' : 'EMEA/H/C/0001',
  sponsorId: 'ORG-1',
  sponsorName: 'Concept2Cure',
  outputDir: '/out',
  leaves: [],
  resolveFile: () => null,
});

describe('FDA variation', () => {
  it('an FDA variation sequence is refused with the reason, never coded as an amendment', () => {
    expect(() => fdaSubmissionTypeFor({ sequenceNumber: '0005', region: 'fda', type: 'variation' }, [])).toThrow(
      /'Variation' is the EU term\. An FDA post-approval change is a supplement/,
    );
  });

  it('an FDA variation does not reach the packager input', () => {
    expect(() => buildPackagerInputFromCore(args('fda', 'variation') as never)).toThrow(/supplement/);
  });

  it('an EU variation sequence still packages: the FDA coding is not derived for it', () => {
    const res = buildPackagerInputFromCore(args('eu', 'variation') as never);
    expect(res.input.region).toBe('ema');
    expect(res.input).not.toHaveProperty('fda');
  });

  it('an FDA amendment is still an Original Application, sub-type amendment', () => {
    const res = buildPackagerInputFromCore(args('fda', 'amendment') as never);
    expect(res.input.fda).toMatchObject({ submissionType: 'original', submissionSubType: 'amendment' });
  });
});
