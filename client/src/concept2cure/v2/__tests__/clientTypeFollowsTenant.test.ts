/**
 * A device or diagnostics company that signs up is shown as one.
 *
 * The slice 0 launch walk signed up a medtech organisation and found it stored as client_type
 * 'pharma'. Its rail carried CMC / Module 3, and New project said "Tailored for biopharma"
 * with the pharma filings first. Two causes:
 *   - POST /api/auth/signup stored industry_mode and never client_type;
 *   - the shell's lane was the browser's default ('biopharma') alone.
 * (docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice0/README.md, "What the walk found", item 1.)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientTypeForSignup } from '@shared/regulatory/client-type-profiles';
import { getSegment, shellSegment } from '../registryModel';

describe('sign-up states the client type its industry names', () => {
  it.each([
    ['medtech', undefined, 'medtech'],
    ['medtech', 'medical_device', 'medtech'],
    ['medtech', 'ivd_diagnostics', 'diagnostics'],
    ['biotech', undefined, 'biotech'],
    ['pharma', undefined, 'pharma'],
    ['cro', undefined, 'cro'],
  ] as const)('%s (%s) → %s', (industry, spec, want) => {
    expect(clientTypeForSignup(industry, spec)).toBe(want);
  });

  it('an industry that serves every category states none, so the column keeps its default', () => {
    for (const industry of ['regulatory', 'academic', 'medical_writing', '']) expect(clientTypeForSignup(industry)).toBeNull();
  });

  it('the sign-up route writes it on the new organisation', () => {
    const src = readFileSync(path.resolve(__dirname, '../../../../../server/routes/auth.ts'), 'utf8');
    const handler = src.slice(src.indexOf("router.post('/signup'"));
    expect(handler).toMatch(/const signupClientType = clientTypeForSignup\(industryMode, mdxSpecialization\)/);
    expect(handler.slice(0, handler.indexOf('stripeCustomerId,\n'))).toMatch(/clientType: signupClientType/);
  });
});

describe("the shell's lane follows the organisation until the person chooses one", () => {
  it('a medtech or diagnostics organisation opens on its own lane, not the stored default', () => {
    expect(shellSegment('biopharma', false, 'medtech')).toBe('medtech');
    expect(shellSegment('biopharma', false, 'diagnostics')).toBe('diagnostics');
  });

  it('biotech and pharma are the one biopharma lane', () => {
    expect(shellSegment('medtech', false, 'pharma')).toBe('biopharma');
    expect(shellSegment('medtech', false, 'biotech')).toBe('biopharma');
  });

  it("a lane the person chose wins; an unknown or unread client type keeps the stored lane", () => {
    expect(shellSegment('biopharma', true, 'medtech')).toBe('biopharma');
    expect(shellSegment('biopharma', false, null)).toBe('biopharma');
    expect(shellSegment('biopharma', false, 'no-such-type')).toBe('biopharma');
  });

  it('every client type sign-up can state names a lane', () => {
    for (const t of ['medtech', 'diagnostics', 'biotech', 'pharma', 'cro']) expect(getSegment(t), t).toBeTruthy();
  });
});
