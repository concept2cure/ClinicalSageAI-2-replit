/**
 * RWE study-design advisor — unit tests. Deterministic; verifies design
 * resolution, target-trial framing, guardrails, and catalog.
 */
import { describe, it, expect } from 'vitest';
import { adviseRweDesign, listRweDesigns } from '../rwe-design';

describe('adviseRweDesign', () => {
  it('explains target-trial emulation and its bias-reduction rationale', () => {
    const r = adviseRweDesign({ design: 'target_trial_emulation' });
    expect(r.resolved.design).toBe('target_trial_emulation');
    expect(r.brief.toLowerCase()).toContain('immortal-time');
    expect(r.brief.toLowerCase()).toContain('time-zero');
  });

  it('resolves a self-controlled alias (sccs)', () => {
    const r = adviseRweDesign({ design: 'sccs' });
    expect(r.resolved.design).toBe('self_controlled');
    expect(r.brief.toLowerCase()).toContain('own control');
  });

  it('always includes the RWE good-practice guardrails', () => {
    const r = adviseRweDesign({ design: 'retrospective_cohort' });
    expect(r.brief.toLowerCase()).toContain('fit-for-purpose');
    expect(r.brief.toLowerCase()).toContain('confounding');
  });

  it('lists designs and data sources when none specified', () => {
    const r = adviseRweDesign({});
    expect(r.design).toBeNull();
    expect(r.brief).toContain('Electronic health records');
    const cat = listRweDesigns();
    expect(cat.designs.map(d => d.id)).toContain('pragmatic_trial');
  });
});
