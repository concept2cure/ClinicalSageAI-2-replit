/**
 * Onboarding proposal extraction (P2) — the anti-fabrication guarantees.
 *
 * These lock the behaviour that makes AnA's extraction safe to show a client:
 * a value survives only if the model quoted a source span that REALLY occurs in
 * the document. Everything else is dropped and reported, never displayed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const routeMock = vi.fn();
const enabledProviders = { value: ['anthropic'] as string[] };

vi.mock('../../ai-gateway/gateway', () => ({
  getGateway: () => ({
    getEnabledProviders: () => enabledProviders.value,
    route: (...a: unknown[]) => routeMock(...a),
  }),
}));

const { extractOnboardingProposals } = await import('../proposal-extraction');

const DOC = `
Meridian Therapeutics, Inc. is a clinical-stage biotech company focused on oncology.
Our lead program MER-204 is an IND-enabling study in advanced solid tumors.
Primary contact: Dr. Elena Ruiz (elena@meridian.io).
`;

const reply = (proposals: unknown[]) => ({ content: JSON.stringify(proposals) });

beforeEach(() => {
  routeMock.mockReset();
  enabledProviders.value = ['anthropic'];
});

describe('extractOnboardingProposals — verified provenance', () => {
  it('keeps a value whose quoted excerpt really appears in the document', async () => {
    routeMock.mockResolvedValue(
      reply([
        { targetField: 'org_profile.name', value: 'Meridian Therapeutics', confidence: 0.93, excerpt: 'Meridian Therapeutics, Inc. is a clinical-stage biotech', page: 1 },
      ]),
    );
    const res = await extractOnboardingProposals({ text: DOC, fileName: 'profile.pdf' });
    const f = res.groups.flatMap((g) => g.fields);
    expect(f).toHaveLength(1);
    expect(f[0].value).toBe('Meridian Therapeutics');
    expect(f[0].provenance.file).toBe('profile.pdf');
    expect(f[0].provenance.page).toBe(1);
    expect(f[0].confidence).toBeCloseTo(0.93);
  });

  it('DROPS a fabricated value whose quoted excerpt is not in the document', async () => {
    routeMock.mockResolvedValue(
      reply([
        { targetField: 'org_profile.name', value: 'Totally Invented Corp', confidence: 0.99, excerpt: 'Totally Invented Corp is headquartered in Zurich', page: 1 },
      ]),
    );
    const res = await extractOnboardingProposals({ text: DOC, fileName: 'profile.pdf' });
    expect(res.groups).toHaveLength(0);
    expect(res.warnings.join(' ')).toMatch(/could not be found/i);
  });

  it('drops a value with a missing or too-short excerpt rather than showing it unsourced', async () => {
    routeMock.mockResolvedValue(
      reply([
        { targetField: 'org_profile.name', value: 'Meridian Therapeutics', confidence: 0.9 },
        { targetField: 'program.code', value: 'MER-204', confidence: 0.9, excerpt: 'MER' },
      ]),
    );
    const res = await extractOnboardingProposals({ text: DOC, fileName: 'profile.pdf' });
    expect(res.groups.flatMap((g) => g.fields)).toHaveLength(0);
  });

  it('ignores fields the workspace does not collect, and reports that it did', async () => {
    routeMock.mockResolvedValue(
      reply([
        { targetField: 'org_profile.secretBudget', value: '9000', confidence: 0.9, excerpt: 'Meridian Therapeutics, Inc. is a clinical-stage' },
      ]),
    );
    const res = await extractOnboardingProposals({ text: DOC, fileName: 'profile.pdf' });
    expect(res.groups).toHaveLength(0);
    expect(res.warnings.join(' ')).toMatch(/does not collect/i);
  });

  it('flags low confidence for human review and clamps out-of-range values', async () => {
    routeMock.mockResolvedValue(
      reply([
        { targetField: 'program.indication', value: 'advanced solid tumors', confidence: 0.4, excerpt: 'IND-enabling study in advanced solid tumors' },
        { targetField: 'program.code', value: 'MER-204', confidence: 42, excerpt: 'Our lead program MER-204 is an IND-enabling study' },
      ]),
    );
    const res = await extractOnboardingProposals({ text: DOC, fileName: 'profile.pdf' });
    const byField = Object.fromEntries(res.groups.flatMap((g) => g.fields).map((f) => [f.targetField, f]));
    expect(byField['program.indication'].status).toBe('needs_review');
    expect(byField['program.code'].confidence).toBe(1); // clamped, not trusted verbatim
  });

  it('never invents when the model reply is unusable', async () => {
    routeMock.mockResolvedValue({ content: 'I could not read that document, sorry!' });
    const res = await extractOnboardingProposals({ text: DOC, fileName: 'profile.pdf' });
    expect(res.groups).toHaveLength(0);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('never invents when no provider is available', async () => {
    enabledProviders.value = [];
    const res = await extractOnboardingProposals({ text: DOC, fileName: 'profile.pdf' });
    expect(res.groups).toHaveLength(0);
    expect(routeMock).not.toHaveBeenCalled();
    expect(res.warnings.join(' ')).toMatch(/unavailable/i);
  });

  it('never invents when the document has no readable text', async () => {
    const res = await extractOnboardingProposals({ text: '   ', fileName: 'scan.pdf' });
    expect(res.groups).toHaveLength(0);
    expect(routeMock).not.toHaveBeenCalled();
    expect(res.warnings.join(' ')).toMatch(/no readable text/i);
  });

  it('surfaces an extraction failure honestly instead of throwing', async () => {
    routeMock.mockRejectedValue(new Error('gateway exploded'));
    const res = await extractOnboardingProposals({ text: DOC, fileName: 'profile.pdf' });
    expect(res.groups).toHaveLength(0);
    expect(res.warnings.join(' ')).toMatch(/gateway exploded/);
  });

  it('groups verified proposals by entity in a stable order', async () => {
    routeMock.mockResolvedValue(
      reply([
        { targetField: 'contact.email', value: 'elena@meridian.io', confidence: 0.9, excerpt: 'Dr. Elena Ruiz (elena@meridian.io)' },
        { targetField: 'org_profile.name', value: 'Meridian Therapeutics', confidence: 0.9, excerpt: 'Meridian Therapeutics, Inc. is a clinical-stage' },
        { targetField: 'program.code', value: 'MER-204', confidence: 0.9, excerpt: 'Our lead program MER-204' },
      ]),
    );
    const res = await extractOnboardingProposals({ text: DOC, fileName: 'profile.pdf' });
    expect(res.groups.map((g) => g.entity)).toEqual(['org_profile', 'program', 'contact']);
  });
});
