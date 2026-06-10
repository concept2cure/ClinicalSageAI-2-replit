/**
 * Pharmacovigilance advisor — unit tests. Deterministic; verifies deliverable
 * resolution, stage filtering, ICSR clock content, and catalog.
 */
import { describe, it, expect } from 'vitest';
import { advisePharmacovigilance, listPvDeliverables } from '../pharmacovigilance';

describe('advisePharmacovigilance', () => {
  it('resolves the DSUR and notes the DIBD-based annual cadence', () => {
    const r = advisePharmacovigilance({ deliverable: 'dsur' });
    expect(r.resolved.deliverable).toBe('dsur');
    expect(r.brief).toContain('DIBD');
    expect(r.brief).toContain('ICH E2F');
  });

  it('resolves PBRER via the PSUR alias', () => {
    const r = advisePharmacovigilance({ deliverable: 'psur' });
    expect(r.resolved.deliverable).toBe('pbrer');
    expect(r.brief).toContain('benefit-risk');
  });

  it('surfaces the 7/15-day expedited clock for ICSRs', () => {
    const r = advisePharmacovigilance({ deliverable: 'susar' });
    expect(r.resolved.deliverable).toBe('icsr');
    expect(r.brief).toContain('15 days');
  });

  it('filters by development stage and includes both-stage deliverables', () => {
    const r = advisePharmacovigilance({ stage: 'development' });
    const ids = r.candidates.map(c => c.id);
    expect(ids).toContain('dsur');
    expect(ids).toContain('icsr'); // stage 'both'
    expect(ids).not.toContain('pbrer');
  });

  it('lists all PV deliverables', () => {
    const ids = listPvDeliverables().map(d => d.id);
    expect(ids).toEqual(expect.arrayContaining(['dsur', 'pbrer', 'icsr', 'signal_management']));
  });
});
