/**
 * getModuleStatus: a module's `completion` is the share of its REQUIRED
 * sections whose artifact is approved or locked.
 *
 * Until 2026-10-15 it was the share of ALL the module's registry sections,
 * optional ones included, that had an artifact at ANY status, so a module made
 * entirely of unapproved drafts read 100 complete (audit report_ind_ivd_irb
 * finding 29). `drafted` keeps the any-artifact count under its own name.
 */
import { describe, it, expect } from 'vitest';
import { IND_SECTIONS, getModuleStatus } from '../ind-section-registry';

const MODULE_1 = IND_SECTIONS.filter((s) => s.module === 1);
const MODULE_2 = IND_SECTIONS.filter((s) => s.module === 2);

describe('getModuleStatus', () => {
  it('a module whose every section is an unapproved draft is drafted, not complete', () => {
    const m1 = getModuleStatus(MODULE_1.map((s) => ({ ctdSection: s.code, status: 'draft' })))['Module 1'];
    expect(m1.drafted).toBe(MODULE_1.length);
    expect(m1.approved).toBe(0);
    expect(m1.completion).toBe(0);
  });

  it('counts only the required sections, and only their approved or locked artifacts', () => {
    const required = MODULE_2.filter((s) => s.required);
    const optional = MODULE_2.filter((s) => !s.required);
    expect(optional.length).toBeGreaterThan(0); // precondition: Module 2 has an optional section (2.7)
    const approvedRequired = required.slice(0, 2);
    const artifacts = [
      { ctdSection: approvedRequired[0].code, status: 'approved' },
      { ctdSection: approvedRequired[1].code, status: 'locked' },
      { ctdSection: required[2].code, status: 'draft' },
      // An approved optional section moves no required count.
      ...optional.map((s) => ({ ctdSection: s.code, status: 'approved' })),
    ];
    const m2 = getModuleStatus(artifacts)['Module 2'];
    expect(m2.total).toBe(MODULE_2.length);
    expect(m2.required).toBe(required.length);
    expect(m2.drafted).toBe(3 + optional.length);
    expect(m2.approved).toBe(2 + optional.length);
    expect(m2.requiredApproved).toBe(2);
    expect(m2.completion).toBe(Math.round((2 / required.length) * 100));
  });

  it('reads 100 only when every required section is approved or locked', () => {
    const m1 = getModuleStatus(MODULE_1.filter((s) => s.required).map((s) => ({ ctdSection: s.code, status: 'locked' })))['Module 1'];
    expect(m1.completion).toBe(100);
  });
});
