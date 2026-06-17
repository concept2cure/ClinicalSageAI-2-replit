/**
 * Guards the expanded role adaptation: AnA now adapts to biostatistician,
 * pharmacovigilance, and quality personas in addition to the original set.
 * Asserts inferRole routing + that each new role's overlay flows into the
 * assembled system prompt.
 */

import { describe, it, expect } from 'vitest';
import { inferRole, buildRoleAdaptiveContext } from '../ana-ri/role-adapter.js';
import { buildAnaRISystemPrompt } from '../ana-ri/persona.js';

describe('expanded role inference', () => {
  it('routes biostatistician signals', () => {
    expect(inferRole({ title: 'Principal Biostatistician' })).toBe('biostatistician');
    expect(inferRole({ department: 'Biostatistics' })).toBe('biostatistician');
    expect(inferRole({ screenName: 'biostatistics-workbench' })).toBe('biostatistician');
  });

  it('routes pharmacovigilance signals', () => {
    expect(inferRole({ title: 'Director, Pharmacovigilance' })).toBe('pharmacovigilance');
    expect(inferRole({ department: 'Drug Safety & Vigilance' })).toBe('pharmacovigilance');
  });

  it('routes quality/QA signals (no longer collapsed into cmc)', () => {
    expect(inferRole({ title: 'QA Manager' })).toBe('quality');
    expect(inferRole({ department: 'Quality Assurance' })).toBe('quality');
    // CMC still routes to cmc_lead
    expect(inferRole({ title: 'CMC Lead' })).toBe('cmc_lead');
  });

  it('falls back to general when no signal matches', () => {
    expect(inferRole({})).toBe('general');
  });
});

describe('new role overlays reach the system prompt', () => {
  it('biostatistician overlay mentions estimand/E9(R1)', () => {
    const p = buildAnaRISystemPrompt({ userRole: 'biostatistician' });
    expect(p).toMatch(/estimand/i);
    expect(p).toMatch(/E9\(R1\)/);
  });

  it('pharmacovigilance overlay mentions reporting clocks', () => {
    const p = buildAnaRISystemPrompt({ userRole: 'pharmacovigilance' });
    expect(p).toMatch(/expedited-reporting|15-day/i);
  });

  it('quality overlay mentions CAPA / 21 CFR 210/211', () => {
    const p = buildAnaRISystemPrompt({ userRole: 'quality' });
    expect(p).toMatch(/CAPA/);
    expect(p).toMatch(/210\/211/);
  });
});

describe('role-adaptive output structure covers new roles', () => {
  it('emits tailored structure for each new role', () => {
    expect(buildRoleAdaptiveContext('biostatistician', null)).toMatch(/statistical defensibility/i);
    expect(buildRoleAdaptiveContext('pharmacovigilance', null)).toMatch(/reporting-clock|reporting deadlines|clock/i);
    expect(buildRoleAdaptiveContext('quality', null)).toMatch(/inspection-readiness|210\/211/i);
  });
});
