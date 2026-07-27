/**
 * Onboarding readiness (the read-only AnA tool's backing service).
 *
 * Locks: it reports honestly, it never claims a workspace is empty when it
 * simply could not read it, and — the structural property — onboarding exposes
 * NO write-capable tool to the model.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../../db', () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

const { summarizeOnboardingReadiness } = await import('../onboarding-readiness');

beforeEach(() => {
  // A safe default: anything else in the import chain that touches the pool
  // during a test gets a well-formed empty result rather than an unhandled
  // rejection attributed to whichever test happens to be running.
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe('summarizeOnboardingReadiness', () => {
  it('reports which fields are set and which are blank', async () => {
    queryMock.mockResolvedValue({ rows: [{ name: 'Meridian Therapeutics', client_type: null, industry_mode: '  ' }] });
    const r = await summarizeOnboardingReadiness(2);
    expect(r.filled).toEqual(['Organization name']);
    expect(r.missing.map((m) => m.label)).toEqual(['Client type', 'Industry / therapeutic area']);
    // Tells the client how to fill them, and that approval gates any write.
    expect(r.summary).toMatch(/nothing is saved until you review and approve/i);
  });

  it('says nothing is outstanding when the profile is complete', async () => {
    queryMock.mockResolvedValue({ rows: [{ name: 'Meridian', client_type: 'biotech', industry_mode: 'oncology' }] });
    const r = await summarizeOnboardingReadiness(2);
    expect(r.missing).toHaveLength(0);
    expect(r.summary).toMatch(/nothing is outstanding/i);
  });

  it('never claims the workspace is empty when it simply could not read it', async () => {
    queryMock.mockImplementation(async () => {
      throw new Error('connection reset');
    });
    const r = await summarizeOnboardingReadiness(2);
    expect(r.summary).toMatch(/could not read/i);
    // Crucially it does NOT list fields as missing — that would be a false
    // statement about the client's own data.
    expect(r.missing).toHaveLength(0);
    expect(r.filled).toHaveLength(0);
  });
});

/* The tool-registry assertion lives in ./onboarding-tool-registry.test.ts —
   it pulls in the full AnA tool tree, which must not share this file's pool
   mock. */
