/**
 * Every role a submission pyramid names is said in words (S11, the program
 * plan walk of 2026-11-04): the board printed "project_manager",
 * "toxicologist" and "clinical_lead" because PY_ROLES knew nine of the
 * engine's twenty-odd roles. A role added later reads in plain words, never
 * as its id.
 */
import { describe, expect, it } from 'vitest';
import { PY_ROLES, pyRoleLabel } from '../fixtures/pyramid-data';
import { getAllSupportedTypes, getPyramidForProject } from '../../../../../services/regulatory/SubmissionPyramidEngine';

const engineRoles = [...new Set(getAllSupportedTypes().flatMap((type) => getPyramidForProject(type).tasks.map((t) => t.role ?? '')))];

describe('the roles the pyramids name', () => {
  it('each has a label', () => {
    expect(engineRoles.length).toBeGreaterThan(10);
    expect(engineRoles.filter((role) => !PY_ROLES[role])).toEqual([]);
  });

  it('a role with no label yet is said in plain words, not as its id', () => {
    expect(pyRoleLabel('supply_chain')).toBe('Supply chain');
    expect(pyRoleLabel('regulatory_affairs_director')).toBe('Regulatory affairs director');
    expect(pyRoleLabel('')).toBe('Unassigned role');
  });
});
