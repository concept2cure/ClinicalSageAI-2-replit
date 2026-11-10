/**
 * The standard job roles by client type (founder decision P-119, slice 1;
 * docs/design/CLIENT_TYPE_JOB_ROLES_2026-11-10.md).
 *
 * The catalog is data that five other things must agree with. Each is read here
 * from where it is decided, never restated:
 *
 *   - the job-role store's limits: `qmsJobRoleCreateSchema` (shared/qms/training.ts),
 *     which mirrors the table's CHECKs and its live unique index on lower(name);
 *   - the access levels an administrator assigns and what each may do:
 *     shared/constants/org-roles.ts, the signing policy
 *     (server/services/part11/signing-authority.ts) and the project check
 *     (server/services/project-sharing-access.ts);
 *   - the launch catalog's surfaces: shared/constants/launch-scope.ts;
 *   - the client types: shared/regulatory/client-type-profiles.ts;
 *   - the plan's task roles: read from services/regulatory, by import and from
 *     the source text, so a key added there with no job role fails here.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SIGNING_ROLES, isSigningAuthorized } from '../../../server/services/part11/signing-authority';
import { hasOrganizationProjectManagementRole } from '../../../server/services/project-sharing-access';
import { getAllSupportedTypes, getPyramidForProject } from '../../../services/regulatory/SubmissionPyramidEngine';
import { GLOBAL_PYRAMIDS } from '../../../services/regulatory/globalPyramids';
import { getAllINDSections, type INDSection } from '../../../services/regulatory/ind-ectd-sections';
import { LAUNCH_SHELL_SURFACES, LAUNCH_SURFACE_IDS, isLaunchSurface } from '../../constants/launch-scope';
import { ASSIGNABLE_ORG_ROLES, rolesHeldBy } from '../../constants/org-roles';
import { getSurface } from '../../constants/ui-surface-registry';
import { qmsJobRoleCreateSchema } from '../../qms/training';
import { getClientTypeProfile, type ClientType, type IndustryMode } from '../client-type-profiles';
import {
  JOB_ROLE_GROUPS, JOB_ROLE_KEYS_BY_CLIENT_TYPE, JOB_ROLE_KEYS_BY_INDUSTRY_MODE, PLAN_TASK_ROLE_HOLDERS_ELSEWHERE, STANDARD_JOB_ROLES,
  jobRoleForPlanTaskRole, matchStandardJobRole, standardJobRole, standardJobRolesByGroup, standardJobRolesFor, suggestedAccessLevel,
  type JobRoleGroup, type StandardJobRole,
} from '../client-type-job-roles';

const REPO = path.resolve(__dirname, '../../..');

/* Both lists are checked by the compiler against the type they enumerate: a new
   industry or client type with no entry here does not typecheck. */
const INDUSTRY_MODES = Object.keys({
  biotech: 1, pharma: 1, cro: 1, medtech: 1, academic: 1, regulatory: 1, medical_writing: 1,
} satisfies Record<IndustryMode, 1>) as IndustryMode[];
const CLIENT_TYPES = Object.keys({
  medtech: 1, biotech: 1, pharma: 1, diagnostics: 1, cro: 1, health: 1,
} satisfies Record<ClientType, 1>) as ClientType[];

/** Every list the catalog offers, named for a failure message. */
const LISTS: Array<{ of: string; keys: readonly string[] }> = [
  ...INDUSTRY_MODES.map((m) => ({ of: `industry ${m}`, keys: JOB_ROLE_KEYS_BY_INDUSTRY_MODE[m] })),
  ...CLIENT_TYPES.map((c) => ({ of: `client type ${c}`, keys: JOB_ROLE_KEYS_BY_CLIENT_TYPE[c] })),
];

const CATALOG_ORDER = STANDARD_JOB_ROLES.map((r) => r.key);
const groupOf = (key: string): JobRoleGroup | undefined => standardJobRole(key)?.group;
const keysOf = (roles: readonly StandardJobRole[]): string[] => roles.map((r) => r.key);
const inCatalogOrder = (keys: readonly string[]): string[] => CATALOG_ORDER.filter((k) => keys.includes(k));

/** What a level may do, from the checks that decide it. */
const signs = (level: string): boolean => isSigningAuthorized(level, [...DEFAULT_SIGNING_ROLES]);
/** Uses, edits and manages every project of the organisation, whatever its sharing. */
const reachesEveryProject = (level: string): boolean => hasOrganizationProjectManagementRole(level);
/** Reads the audit trail: AUDIT_READER_ROLES is manager and what extends it (its module reaches the database, so it is not imported). */
const holdsManager = (level: string): boolean => rolesHeldBy(level).includes('manager');

/* ── The plan's task roles, read from services/regulatory ───────────────────── */

/** Each plan the engines build, by its type, with the task roles it hands out. */
function planTaskRolesByPlan(): Map<string, Set<string>> {
  const plans = new Map<string, Set<string>>();
  for (const type of getAllSupportedTypes()) {
    const pyramid = getPyramidForProject(type);
    const tasks = [...pyramid.tasks, ...pyramid.phases.flatMap((p) => p.tasks)];
    plans.set(type, new Set(tasks.flatMap((task) => (task.role ? [task.role] : []))));
  }
  for (const [type, pyramid] of Object.entries(GLOBAL_PYRAMIDS)) plans.set(type, new Set(pyramid.tasks.map((task) => task.assignedRole)));
  return plans;
}

const PLANS = planTaskRolesByPlan();

/** The roles the plan's engines hand out: every pyramid's tasks and the IND section tree. */
function taskRolesByImport(): Set<string> {
  const found = new Set<string>();
  for (const roles of PLANS.values()) for (const role of roles) found.add(role);
  const walk = (sections: readonly INDSection[]): void => {
    for (const s of sections) found.add(s.role);
    for (const s of sections) walk(s.children ?? []);
  };
  walk(getAllINDSections());
  return found;
}

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFilesUnder(full);
    return /\.ts$/.test(entry.name) && !/\.(test|spec|d)\.ts$/.test(entry.name) ? [full] : [];
  });
}

/** Every `role: '…'` and `assignedRole: '…'` written under services/regulatory, wired to an engine or not. */
function taskRolesBySource(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFilesUnder(path.join(REPO, 'services/regulatory'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\b(?:role|assignedRole)\s*:\s*(['"`])([A-Za-z0-9_-]+)\1/g)) found.add(m[2]);
  }
  return found;
}

const IMPORTED_TASK_ROLES = taskRolesByImport();
const SOURCE_TASK_ROLES = taskRolesBySource();
const PLAN_TASK_ROLES = [...new Set([...IMPORTED_TASK_ROLES, ...SOURCE_TASK_ROLES])].sort();

/* ── The catalog ────────────────────────────────────────────────────────────── */

describe('the standard job roles', () => {
  it('are one frozen table', () => {
    expect(STANDARD_JOB_ROLES.length).toBeGreaterThan(0);
    expect(Object.isFrozen(STANDARD_JOB_ROLES)).toBe(true);
    for (const role of STANDARD_JOB_ROLES) {
      for (const part of [role, role.workAreas, role.planTaskRoles, role.offeredTo]) expect(Object.isFrozen(part), role.key).toBe(true);
    }
    for (const part of [JOB_ROLE_GROUPS, PLAN_TASK_ROLE_HOLDERS_ELSEWHERE, ...Object.values(PLAN_TASK_ROLE_HOLDERS_ELSEWHERE)]) {
      expect(Object.isFrozen(part)).toBe(true);
    }
    for (const { keys } of LISTS) expect(Object.isFrozen(keys)).toBe(true);
  });

  it('have stable snake_case keys, each once', () => {
    const malformed = STANDARD_JOB_ROLES.filter((r) => !/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(r.key)).map((r) => r.key);
    expect(malformed, 'keys that are not snake_case').toEqual([]);
    expect(new Set(CATALOG_ORDER).size, 'a key appears twice').toBe(CATALOG_ORDER.length);
  });

  it('have names the job-role store accepts, unique ignoring case', () => {
    for (const role of STANDARD_JOB_ROLES) {
      expect(role.name.length >= 1 && role.name.length <= 80 && role.name === role.name.trim(), role.key).toBe(true);
      // Plain ASCII words with single spaces, so lower-casing is the same here and in the store's index.
      expect(role.name, role.key).toMatch(/^[\x21-\x7e]+( [\x21-\x7e]+)*$/);
    }
    const lower = STANDARD_JOB_ROLES.map((r) => r.name.toLowerCase());
    const clashes = STANDARD_JOB_ROLES.filter((r, i) => lower.indexOf(lower[i]) !== i).map((r) => `${r.key} is "${r.name}" again`);
    expect(clashes, 'the store’s live unique index is on lower(name)').toEqual([]);
  });

  it('have one-sentence descriptions the job-role store accepts', () => {
    for (const role of STANDARD_JOB_ROLES) {
      const { description } = role;
      expect(description.length > 0 && description.length <= 500 && description === description.trim(), role.key).toBe(true);
      expect(role.description, `${role.key}: ends with a full stop`).toMatch(/[^.]\.$/);
      expect(role.description, `${role.key}: one sentence`).not.toMatch(/[.!?]\s/);
      expect(role.description, `${role.key}: says what the function is accountable for`).toMatch(/^Accountable\b/);
      // The create contract an administrator's adoption goes through in slice 2.
      const parsed = qmsJobRoleCreateSchema.safeParse({ name: role.name, description, reason: 'Adopting the standard job roles.' });
      expect(parsed.success, role.key).toBe(true);
    }
  });

  it('show no key or id to a person', () => {
    const surfaceIds = [...LAUNCH_SURFACE_IDS].filter((id) => id.includes('-'));
    for (const role of STANDARD_JOB_ROLES) {
      for (const text of [role.name, role.description, role.suggestedAccessReason]) {
        expect(text, `${role.key}: a key`).not.toMatch(/_/);
        expect(surfaceIds.filter((id) => text.includes(id)), `${role.key}: a surface id`).toEqual([]);
        expect(text, `${role.key}: British "organisation"`).not.toMatch(/organiz/i);
      }
    }
  });

  it('are listed group by group, in the order of the groups', () => {
    const groupIds = JOB_ROLE_GROUPS.map((g) => g.id);
    expect(groupIds).toEqual(['regulatory', 'clinical', 'data_statistics', 'safety', 'nonclinical', 'cmc', 'quality', 'device_diagnostics', 'program']);
    for (const g of JOB_ROLE_GROUPS) expect(g.name.trim().length, g.id).toBeGreaterThan(0);
    expect(new Set(JOB_ROLE_GROUPS.map((g) => g.name.toLowerCase())).size).toBe(JOB_ROLE_GROUPS.length);

    expect(STANDARD_JOB_ROLES.filter((r) => !groupIds.includes(r.group)).map((r) => r.key), 'roles in no known group').toEqual([]);
    const positions = STANDARD_JOB_ROLES.map((r) => groupIds.indexOf(r.group));
    expect(positions, 'the table is ordered by group').toEqual([...positions].sort((a, b) => a - b));
    expect(groupIds.filter((id) => !STANDARD_JOB_ROLES.some((r) => r.group === id)), 'groups with no role').toEqual([]);
  });
});

/* ── Suggested access levels ────────────────────────────────────────────────── */

describe('the access level a job role suggests', () => {
  it('is one an administrator can assign, and never admin', () => {
    for (const role of STANDARD_JOB_ROLES) {
      expect(ASSIGNABLE_ORG_ROLES as readonly string[], role.key).toContain(role.suggestedAccessLevel);
      expect(role.suggestedAccessLevel, `${role.key}: administration is a standing, not a function`).not.toBe('admin');
      expect(suggestedAccessLevel(role.key), role.key).toBe(role.suggestedAccessLevel);
    }
  });

  it('comes with one short clause of reason', () => {
    for (const role of STANDARD_JOB_ROLES) {
      const reason = role.suggestedAccessReason;
      expect(reason.length <= 160 && reason === reason.trim(), role.key).toBe(true);
      // It is shown after "Usually {Level} access:" under the role's name, so it starts small and carries no full stop.
      expect(reason, role.key).toMatch(/^[a-z][^.!?:]*$/);
      // A person is not "it", and the reason is for an administrator, not a note on how the levels nest.
      expect(reason, `${role.key}: calls a person "it"`).not.toMatch(/\b(it|its)\b/i);
      expect(reason, `${role.key}: permission mechanics`).not.toMatch(/\blevel\b|\ba (member|manager|viewer|reviewer)\b/i);
    }
  });

  /* The reason is prose, so it is held to the level by its own words. A level
     that signs says "signs" and no other level does; a level that reaches every
     project and the audit trail says so and no other level does; a level that
     writes names what it does to a record, and a level that only reads says
     "reads" and names nothing it does. So each step, Viewer to Member included,
     is justified in words, and no reason promises what its level cannot do. */
  it('is true to what the level can do, and no higher than its reason needs', () => {
    /** What a person does to a record, as the reasons say it. A reason with none of these only reads. */
    const ACTS = /\b(writes|drafts|prepares|files|records|maintains|produces|leads|keeps|manages|runs|signs)\b/;
    const onlyReads = (r: string): boolean => !ACTS.test(r) || /\bchanges nothing\b/.test(r);
    const reaches = (r: string): boolean => /\bevery project\b|\baudit trail\b/.test(r);
    /** Each rule a reason and its level must keep together. */
    const rules: Array<[string, (reason: string, level: string) => boolean]> = [
      ['only reads exactly when it is Viewer', (r, l) => onlyReads(r) === (l === 'viewer')],
      ['says "reads" when it is Viewer', (r, l) => l !== 'viewer' || /\breads\b/.test(r)],
      ['says "signs" exactly when it signs', (r, l) => /\bsigns\b/.test(r) === signs(l)],
      ['names every project or the audit trail exactly when it reads them', (r, l) => reaches(r) === holdsManager(l)],
      ['names every project only when it reaches every project', (r, l) => !/\bevery project\b/.test(r) || reachesEveryProject(l)],
    ];
    const wrong = STANDARD_JOB_ROLES.flatMap(({ key, suggestedAccessLevel: level, suggestedAccessReason: reason }) => rules
      .filter(([, holds]) => !holds(reason, level))
      .map(([rule]) => `${key} (${level}, "${reason}"): the reason ${rule}, and does not`));
    expect(wrong).toEqual([]);
  });

  /* The reason test reads "every project" and "audit trail" as one step above
     Member. That holds only while the project check and the audit readers admit
     the same levels; if they part, the reasons must be re-read. */
  it('rests on the project check and the audit readers admitting the same levels', () => {
    // Administration is never suggested (above), and both checks admit it on its own account.
    for (const level of ASSIGNABLE_ORG_ROLES.filter((l) => l !== 'admin')) expect(reachesEveryProject(level), level).toBe(holdsManager(level));
  });

  it('answers null for a role it does not know', () => {
    for (const key of ['not_a_role', '']) expect(suggestedAccessLevel(key)).toBeNull();
  });
});

/* ── Work areas ─────────────────────────────────────────────────────────────── */

describe('the work areas a job role uses', () => {
  it('are surfaces of the launch catalog, each once', () => {
    const wrong: string[] = [];
    for (const role of STANDARD_JOB_ROLES) {
      if (role.workAreas.length === 0 || new Set(role.workAreas).size !== role.workAreas.length) wrong.push(`${role.key}: no work area, or one twice`);
      const unknown = role.workAreas.filter((id) => !isLaunchSurface(id) || !getSurface(id));
      for (const id of unknown) wrong.push(`${role.key}: ${id} is not a launch surface with a row in the surface registry`);
    }
    expect(wrong).toEqual([]);
  });

  /* A role's work areas are its function's, across the products it serves: a
     regulatory affairs lead's include the device filings and the IND forms, and a
     reader shows those the organisation has. So every launch surface where work
     is done is some role's; only the shell's own surfaces are no one's. */
  it('reach every launch surface where work is done', () => {
    const used = new Set(STANDARD_JOB_ROLES.flatMap((r) => r.workAreas));
    const shell = new Set(Object.keys(LAUNCH_SHELL_SURFACES));
    expect([...LAUNCH_SURFACE_IDS].filter((id) => !shell.has(id) && !used.has(id)), 'launch surfaces no role works in').toEqual([]);
    // The functions that file: a device organisation's regulatory affairs work in its filings, and
    // whoever prepares an IND's forms works in them.
    const worksIn: Record<string, string[]> = {
      regulatory_affairs_lead: ['device-510k', 'device-pma', 'device-presub'], labeling_lead: ['labeling', 'device-udi'],
      regulatory_affairs_associate: ['device-510k', 'device-pma', 'device-presub', 'device-udi', 'ind-checklist'], sponsor_investigator: ['ind-checklist'],
    };
    for (const [key, areas] of Object.entries(worksIn)) {
      expect(areas.filter((id) => !standardJobRole(key)?.workAreas.includes(id)), key).toEqual([]);
    }
  });

  it('include the audit trail and the compliance reports only at a level that may read them', () => {
    const wrong = STANDARD_JOB_ROLES
      .filter((r) => r.workAreas.some((id) => id === 'audit-trail' || id === 'compliance-reports'))
      .filter((r) => !holdsManager(r.suggestedAccessLevel))
      .map((r) => `${r.key} (${r.suggestedAccessLevel})`);
    expect(wrong, 'the audit readers are managers, approvers and administrators').toEqual([]);
  });
});

/* ── By client type ─────────────────────────────────────────────────────────── */

describe('the roles each client type is offered', () => {
  it('cover every industry and every client type the profiles name', () => {
    expect(Object.keys(JOB_ROLE_KEYS_BY_INDUSTRY_MODE).sort()).toEqual([...INDUSTRY_MODES].sort());
    expect(Object.keys(JOB_ROLE_KEYS_BY_CLIENT_TYPE).sort()).toEqual([...CLIENT_TYPES].sort());
    for (const mode of INDUSTRY_MODES) expect(getClientTypeProfile(mode), mode).not.toBeNull();
  });

  it('are non-empty, known, unrepeated and in the catalog’s order', () => {
    const wrong: string[] = [];
    for (const { of, keys } of LISTS) {
      if (keys.length === 0) wrong.push(`${of}: no roles`);
      const unknown = keys.filter((k) => !standardJobRole(k));
      if (unknown.length) wrong.push(`${of}: unknown ${unknown.join(', ')}`);
      if (new Set(keys).size !== keys.length) wrong.push(`${of}: a role twice`);
      if (keys.join() !== inCatalogOrder(keys).join()) wrong.push(`${of}: not in the catalog's order`);
    }
    expect(wrong).toEqual([]);
  });

  it('agree where the two vocabularies share a name, and a health system is an academic one', () => {
    for (const shared of ['biotech', 'pharma', 'cro', 'medtech'] as const) {
      expect(JOB_ROLE_KEYS_BY_CLIENT_TYPE[shared], shared).toEqual(JOB_ROLE_KEYS_BY_INDUSTRY_MODE[shared]);
    }
    expect(JOB_ROLE_KEYS_BY_CLIENT_TYPE.health).toEqual(JOB_ROLE_KEYS_BY_INDUSTRY_MODE.academic);
  });

  it('leave no role offered to nobody', () => {
    const offered = new Set(LISTS.flatMap((l) => l.keys));
    expect(CATALOG_ORDER.filter((k) => !offered.has(k))).toEqual([]);
  });

  it('give a diagnostics organisation the device roles and the diagnostics ones', () => {
    const device = JOB_ROLE_KEYS_BY_CLIENT_TYPE.medtech;
    const diagnostics = JOB_ROLE_KEYS_BY_CLIENT_TYPE.diagnostics;
    expect(device.filter((k) => !diagnostics.includes(k)), 'device roles a diagnostics organisation lacks').toEqual([]);
    const only = diagnostics.filter((k) => !device.includes(k));
    expect(only.length, 'roles only a diagnostics organisation gets').toBeGreaterThan(0);
    expect(only.map(groupOf).every((g) => g === 'device_diagnostics')).toBe(true);
  });

  /* Nonclinical evidence is not drug-only: a device's biocompatibility and animal
     studies are nonclinical work, and the PMA plan hands them out. Safety (the
     pharmacovigilance of a medicine) and CMC are. */
  it('offer no drug-only function to a device organisation', () => {
    const deviceLists = [
      JOB_ROLE_KEYS_BY_INDUSTRY_MODE.medtech, JOB_ROLE_KEYS_BY_CLIENT_TYPE.medtech, JOB_ROLE_KEYS_BY_CLIENT_TYPE.diagnostics,
    ];
    for (const keys of deviceLists) {
      expect(keys).not.toContain('eu_qualified_person_for_pharmacovigilance');
      expect(keys).not.toContain('qualified_person');
      expect(keys.filter((k) => ['safety', 'cmc'].includes(groupOf(k) ?? ''))).toEqual([]);
      expect(keys).toContain('nonclinical_lead');
    }
    // The two examples are real roles, offered to a drug organisation.
    expect(JOB_ROLE_KEYS_BY_INDUSTRY_MODE.pharma).toContain('eu_qualified_person_for_pharmacovigilance');
    expect(JOB_ROLE_KEYS_BY_INDUSTRY_MODE.pharma).toContain('qualified_person');
  });

  it('offer no device-only function to a drug organisation', () => {
    for (const type of ['biotech', 'pharma'] as const) {
      for (const keys of [JOB_ROLE_KEYS_BY_INDUSTRY_MODE[type], JOB_ROLE_KEYS_BY_CLIENT_TYPE[type]]) {
        expect(keys, type).not.toContain('person_responsible_for_regulatory_compliance');
        expect(keys.filter((k) => groupOf(k) === 'device_diagnostics'), type).toEqual([]);
      }
    }
    expect(JOB_ROLE_KEYS_BY_INDUSTRY_MODE.medtech).toContain('person_responsible_for_regulatory_compliance');
  });

  it('offer the CMC group to every drug and biologic type', () => {
    const cmc = CATALOG_ORDER.filter((k) => groupOf(k) === 'cmc');
    expect(cmc.length).toBeGreaterThan(0);
    // The whole group, to each: a clinical-stage biotech makes, tests and (in the EU) certifies its batches too.
    for (const type of ['biotech', 'pharma'] as const) {
      for (const keys of [JOB_ROLE_KEYS_BY_INDUSTRY_MODE[type], JOB_ROLE_KEYS_BY_CLIENT_TYPE[type]]) {
        expect(cmc.filter((k) => !keys.includes(k)), `${type}: CMC roles it is not offered`).toEqual([]);
      }
    }
  });

  /* A biotech files marketing applications as a pharma organisation does (its
     profile names NDA and BLA), and sign-up files every "biotech or pharma"
     organisation as biotech. So it is offered every role a filing staffs; only
     the EU QPPV, a marketing authorisation holder's appointment, stays pharma's. */
  it('offer a biotech every role a pharma organisation is offered for a filing', () => {
    expect(getClientTypeProfile('biotech')?.personaEmphasis).toMatch(/\b(NDA|BLA)\b/);
    expect(JOB_ROLE_KEYS_BY_INDUSTRY_MODE.pharma.filter((k) => !JOB_ROLE_KEYS_BY_INDUSTRY_MODE.biotech.includes(k)))
      .toEqual(['eu_qualified_person_for_pharmacovigilance']);
    expect(JOB_ROLE_KEYS_BY_INDUSTRY_MODE.biotech.filter((k) => !JOB_ROLE_KEYS_BY_INDUSTRY_MODE.pharma.includes(k))).toEqual([]);
  });

  /* An organisation that serves sponsors (a CRO, a consultancy, a medical-writing
     house) does not hold the sponsor's own accountabilities. */
  it('offer no sponsor-only function to an organisation that serves sponsors', () => {
    const sponsorOnly = ['clinical_lead', 'clinical_pharmacologist', 'eu_qualified_person_for_pharmacovigilance', 'qualified_person',
      'market_access_lead', 'sponsor_investigator', 'executive_sponsor'];
    for (const mode of ['cro', 'regulatory', 'medical_writing'] as const) {
      const keys = JOB_ROLE_KEYS_BY_INDUSTRY_MODE[mode];
      expect(keys.filter((k) => sponsorOnly.includes(k)), mode).toEqual([]);
      expect(keys.filter((k) => groupOf(k) === 'nonclinical'), mode).toEqual([]);
      expect(keys.filter((k) => groupOf(k) === 'cmc'), mode).toEqual(mode === 'regulatory' ? ['regulatory_cmc_lead'] : []);
    }
    const only = { sponsor_investigator: 'academic', study_coordinator: 'academic', project_director: 'cro', regulatory_consultant: 'regulatory' };
    for (const [key, mode] of Object.entries(only)) {
      expect(INDUSTRY_MODES.filter((m) => JOB_ROLE_KEYS_BY_INDUSTRY_MODE[m].includes(key)), key).toEqual([mode]);
    }
  });
});

/* ── standardJobRolesFor ────────────────────────────────────────────────────── */

describe('standardJobRolesFor', () => {
  it('answers the industry’s list, or the client type’s when that is all it is told', () => {
    for (const mode of INDUSTRY_MODES) {
      expect(keysOf(standardJobRolesFor({ industryMode: mode })), mode).toEqual(JOB_ROLE_KEYS_BY_INDUSTRY_MODE[mode]);
    }
    for (const type of CLIENT_TYPES) {
      expect(keysOf(standardJobRolesFor({ clientType: type })), type).toEqual(JOB_ROLE_KEYS_BY_CLIENT_TYPE[type]);
    }
  });

  it('gives an organisation that states both types both lists, in the catalog’s order', () => {
    expect(keysOf(standardJobRolesFor({ industryMode: 'medtech', clientType: 'diagnostics' })))
      .toEqual(JOB_ROLE_KEYS_BY_CLIENT_TYPE.diagnostics);
    const both = keysOf(standardJobRolesFor({ industryMode: 'biotech', clientType: 'medtech' }));
    expect(both).toEqual(inCatalogOrder([...JOB_ROLE_KEYS_BY_INDUSTRY_MODE.biotech, ...JOB_ROLE_KEYS_BY_CLIENT_TYPE.medtech]));
    expect(new Set(both).size).toBe(both.length);
  });

  /* organizations.client_type is NOT NULL DEFAULT 'pharma': an organisation that
     never said so carries it. Read beside a known industry it is not a statement. */
  it('does not read the column’s default client type as a second statement', () => {
    for (const mode of INDUSTRY_MODES) {
      expect(keysOf(standardJobRolesFor({ industryMode: mode, clientType: 'pharma' })), mode)
        .toEqual(JOB_ROLE_KEYS_BY_INDUSTRY_MODE[mode]);
    }
    const device = keysOf(standardJobRolesFor({ industryMode: 'medtech', clientType: 'pharma' }));
    expect(device).not.toContain('eu_qualified_person_for_pharmacovigilance');
    expect(device).not.toContain('qualified_person');
    // Alone, it is all that is known, and it is answered.
    expect(keysOf(standardJobRolesFor({ clientType: 'pharma' }))).toEqual(JOB_ROLE_KEYS_BY_CLIENT_TYPE.pharma);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(keysOf(standardJobRolesFor({ industryMode: '  MedTech ', clientType: ' DIAGNOSTICS' })))
      .toEqual(JOB_ROLE_KEYS_BY_CLIENT_TYPE.diagnostics);
  });

  it('answers an empty list for a type it does not know, and never throws', () => {
    const unknowns: unknown[] = [undefined, null, {}, 'biotech', 7, [], { industryMode: null, clientType: undefined },
      { industryMode: 'veterinary' }, { clientType: '' }, { industryMode: 'constructor', clientType: '__proto__' }, { industryMode: 7, clientType: {} }];
    for (const input of unknowns) expect(standardJobRolesFor(input as never), JSON.stringify(input)).toEqual([]);
    // One known value beside an unknown one is still answered.
    expect(keysOf(standardJobRolesFor({ industryMode: 'veterinary', clientType: 'cro' }))).toEqual(JOB_ROLE_KEYS_BY_CLIENT_TYPE.cro);
  });

  it('is pure: the same answer each time, in a list the caller owns', () => {
    const first = standardJobRolesFor({ industryMode: 'pharma' });
    const again = standardJobRolesFor({ industryMode: 'pharma' });
    expect(again).toEqual(first);
    expect(again).not.toBe(first);
    first.length = 0;
    expect(standardJobRolesFor({ industryMode: 'pharma' })).toEqual(again);
    expect(() => { (again[0].workAreas as string[]).push('home'); }).toThrow(TypeError);
  });
});

describe('standardJobRolesByGroup', () => {
  it('lists the same roles under their groups, in the groups’ order, with no empty group', () => {
    for (const org of [{ industryMode: 'pharma' }, { clientType: 'diagnostics' }, { industryMode: 'medical_writing' }]) {
      const grouped = standardJobRolesByGroup(org);
      expect(grouped.flatMap((g) => keysOf(g.roles))).toEqual(keysOf(standardJobRolesFor(org)));
      const ids = grouped.map((g) => g.group);
      expect(ids).toEqual(JOB_ROLE_GROUPS.map((g) => g.id).filter((id) => ids.includes(id)));
      for (const g of grouped) expect([g.roles.length > 0, g.name, g.roles.every((r) => r.group === g.group)], g.group)
        .toEqual([true, JOB_ROLE_GROUPS.find((x) => x.id === g.group)?.name, true]);
    }
    expect(standardJobRolesByGroup(undefined)).toEqual([]);
    expect(standardJobRolesByGroup({ industryMode: 'veterinary' })).toEqual([]);
  });
});

/* ── One vocabulary with the program plan ───────────────────────────────────── */

describe('the plan’s task roles', () => {
  it('are read from services/regulatory, by import and from the source', () => {
    expect(IMPORTED_TASK_ROLES.size, 'the engines hand out no role: the reader is dead').toBeGreaterThan(0);
    expect(SOURCE_TASK_ROLES.size, 'the source names no role: the reader is dead').toBeGreaterThan(0);
    // The fallback the engine prints for a task with no role is not a role.
    expect(PLAN_TASK_ROLES).not.toContain('unassigned');
  });

  it('each map to exactly one job role', () => {
    const wrong: string[] = [];
    for (const key of PLAN_TASK_ROLES) {
      const holders = STANDARD_JOB_ROLES.filter((r) => r.planTaskRoles.includes(key));
      if (holders.length !== 1) {
        wrong.push(`${key}: ${holders.length === 0 ? 'no job role answers it' : `answered by ${keysOf(holders).join(' and ')}`}`);
      } else if (jobRoleForPlanTaskRole(key)?.key !== holders[0].key) {
        wrong.push(`${key}: jobRoleForPlanTaskRole answers ${jobRoleForPlanTaskRole(key)?.key ?? 'null'}, the table says ${holders[0].key}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('are the only task roles a job role claims, and the claim agrees with the lookup', () => {
    const wrong: string[] = [];
    for (const role of STANDARD_JOB_ROLES) {
      if (new Set(role.planTaskRoles).size !== role.planTaskRoles.length) wrong.push(`${role.key}: a task role twice`);
      for (const key of role.planTaskRoles) {
        if (!PLAN_TASK_ROLES.includes(key)) wrong.push(`${role.key}: ${key} is not a task role the plan uses`);
        if (jobRoleForPlanTaskRole(key)?.key !== role.key) wrong.push(`${role.key}: ${key} is looked up as ${jobRoleForPlanTaskRole(key)?.key ?? 'null'}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('have their holders elsewhere named by plan key, each a role that is not the key’s own', () => {
    const wrong: string[] = [];
    for (const [key, holders] of Object.entries(PLAN_TASK_ROLE_HOLDERS_ELSEWHERE)) {
      if (!PLAN_TASK_ROLES.includes(key)) wrong.push(`${key}: not a task role the plan uses`);
      for (const holder of holders.filter((h) => !standardJobRole(h))) wrong.push(`${key}: ${holder} is not a job role`);
      for (const holder of holders.filter((h) => jobRoleForPlanTaskRole(key)?.key === h)) wrong.push(`${key}: ${holder} already holds it`);
    }
    expect(wrong).toEqual([]);
  });

  /* The plan proposes an owner for each task. A plan for a kind of product
     must find, for every task, a role the organisation that makes that product
     is offered. Device plans are named here by type; every other plan is a
     medicine's, so a new device plan fails here until it is named.

     An academic centre or health system sponsors its investigators' own INDs
     (its profile: investigator-initiated IND), and the sponsor-investigator is
     accountable for the application, its conduct and its reporting. So the IND
     plans must find an owner it is offered too. Its other plans (a marketing
     application, a device filing) are no academic sponsor's, and may answer
     null: no proposed owner. */
  const DEVICE_PLANS = ['510K', 'DE_NOVO', 'PMA', 'EU_CE_MDR', 'EU_CE_IVDR'];
  const unowned = (org: { industryMode?: string; clientType?: string }, keys: Iterable<string>): string[] => {
    const offered = keysOf(standardJobRolesFor(org));
    return [...keys].filter((k) => !offered.includes(jobRoleForPlanTaskRole(k, org)?.key ?? ''));
  };

  const IND_PLANS = ['IND', 'IND_AMENDMENT', 'IND_ANNUAL_REPORT', 'IND_SAFETY_SUPPLEMENT'];

  it('find, in each plan, a role offered for every task to an organisation that makes that product', () => {
    for (const plan of [...DEVICE_PLANS, ...IND_PLANS]) expect(PLANS.has(plan), `${plan} is not a plan the engines build`).toBe(true);
    expect(getClientTypeProfile('academic')?.personaEmphasis).toMatch(/investigator-initiated IND/);
    const medicine = [{ industryMode: 'biotech' }, { industryMode: 'pharma' }];
    const academic = [{ industryMode: 'academic' }, { clientType: 'health' }];
    const device = [{ industryMode: 'medtech' }, { clientType: 'diagnostics' }];
    const makers = (plan: string) => (DEVICE_PLANS.includes(plan) ? device : IND_PLANS.includes(plan) ? [...medicine, ...academic] : medicine);
    const wrong = [...PLANS].flatMap(([plan, keys]) => makers(plan)
      .map((org) => `${plan} for ${JSON.stringify(org)}: ${unowned(org, keys).join(', ')}`)
      .filter((line) => !line.endsWith(': ')));
    expect(wrong).toEqual([]);
  });

  it('answer, for an organisation, the role it is offered for a task, or null', () => {
    // [task role, organisation's industry, answer]. No organisation: the key's own role. An organisation
    // offered no role for it: null (no proposed owner), never a role it cannot adopt.
    const cases: Array<[string, string | undefined, string | null]> = [
      ['safety_officer', undefined, 'pharmacovigilance_lead'], ['safety_officer', 'pharma', 'pharmacovigilance_lead'],
      ['safety_officer', 'medtech', 'post_market_surveillance_lead'], ['cmc_lead', 'medtech', 'manufacturing_engineering_lead'],
      ['cmc_lead', 'regulatory', 'regulatory_cmc_lead'], ['clinical_lead', 'academic', 'sponsor_investigator'],
      ['clinical_lead', 'cro', null], ['engineering', 'biotech', null], ['ra_lead', 'veterinary', null],
      ['safety_officer', 'academic', 'sponsor_investigator'], ['drug_safety', 'academic', 'sponsor_investigator'],
      ['regulatory_ops', 'academic', 'regulatory_affairs_associate'], ['engineering', 'academic', null],
    ];
    for (const [key, industryMode, answer] of cases) {
      const org = industryMode === undefined ? undefined : { industryMode };
      expect(jobRoleForPlanTaskRole(key, org)?.key ?? null, `${key} for ${industryMode}`).toBe(answer);
    }
    expect(jobRoleForPlanTaskRole('ra_lead', {})).toBeNull();
    // Every answer for an organisation is a role it is offered.
    for (const org of [...INDUSTRY_MODES.map((m) => ({ industryMode: m })), ...CLIENT_TYPES.map((c) => ({ clientType: c }))]) {
      const offered = keysOf(standardJobRolesFor(org));
      for (const key of PLAN_TASK_ROLES) {
        const answer = jobRoleForPlanTaskRole(key, org);
        if (answer) expect(offered, `${key} for ${JSON.stringify(org)}`).toContain(answer.key);
      }
    }
  });

  it('are looked up whatever their case or padding, and an unknown one is null', () => {
    const [known] = PLAN_TASK_ROLES;
    expect(jobRoleForPlanTaskRole(`  ${known.toUpperCase()} `)?.key).toBe(jobRoleForPlanTaskRole(known)?.key);
    for (const unknown of ['unassigned', 'not_a_task_role', '', '   ', 'constructor']) {
      expect(jobRoleForPlanTaskRole(unknown), unknown).toBeNull();
    }
  });
});

/* ── The program's fifteen roles (docs/design/THE_PROGRAM_2026-11-01.md §3.4) ── */

/** Each role the program design names, and the job role that is that function. */
const PROGRAM_ROLES: Readonly<Record<string, string>> = {
  'Program / project manager': 'project_manager', 'Global regulatory lead': 'regulatory_affairs_lead',
  'Regional regulatory leads': 'regional_regulatory_lead', 'Medical writing lead': 'lead_medical_writer',
  'Clinical lead (physician)': 'clinical_lead', 'Biostatistics lead': 'biostatistician',
  'Statistical programming lead': 'statistical_programmer', 'Data management lead': 'clinical_data_manager',
  'Safety physician / PV lead': 'pharmacovigilance_lead', 'Clinical pharmacology lead': 'clinical_pharmacologist',
  'Nonclinical lead': 'nonclinical_lead', 'CMC regulatory lead': 'regulatory_cmc_lead',
  'Labeling lead': 'labeling_lead', 'Publishing lead': 'regulatory_operations_lead', 'QA lead': 'quality_assurance_lead',
};

describe('the program’s roles', () => {
  it('each have a job role, and a marketing-stage sponsor is offered every one', () => {
    const doc = readFileSync(path.join(REPO, 'docs/design/THE_PROGRAM_2026-11-01.md'), 'utf8');
    const section = doc.split(/^### 3\.4 .*$/m)[1]?.split(/^#{2,3} /m)[0] ?? '';
    const named = [...section.matchAll(/^\| ([^|]+?) \| [^|]+ \|$/gm)]
      .map((m) => m[1].trim())
      .filter((cell) => cell !== 'Role' && !/^-+$/.test(cell));
    expect(named.length, 'the roles table of §3.4 was not found').toBeGreaterThan(0);

    const uncovered = named.filter((n) => !standardJobRole(PROGRAM_ROLES[n] ?? ''));
    expect(uncovered, 'program roles with no job role').toEqual([]);
    expect(Object.keys(PROGRAM_ROLES).filter((n) => !named.includes(n)), 'named here, no longer in §3.4').toEqual([]);
    const notOffered = named.filter((n) => !JOB_ROLE_KEYS_BY_INDUSTRY_MODE.pharma.includes(PROGRAM_ROLES[n]));
    expect(notOffered, 'program roles a pharma organisation is not offered').toEqual([]);
  });
});

/* ── Matching an organisation's own role name ───────────────────────────────── */

describe('matchStandardJobRole', () => {
  it('finds each role by its name, whatever the case and the whitespace', () => {
    for (const role of STANDARD_JOB_ROLES) {
      expect(matchStandardJobRole(role.name)?.key, role.name).toBe(role.key);
      expect(matchStandardJobRole(role.name.toUpperCase())?.key, role.name).toBe(role.key);
      expect(matchStandardJobRole(`  ${role.name.toLowerCase().replace(/ /g, ' \t ')}\n`)?.key, role.name).toBe(role.key);
    }
  });

  it('is never fuzzy: a near name is not a match', () => {
    const [role] = STANDARD_JOB_ROLES;
    const near = [`${role.name}s`, role.name.slice(0, -1), `Senior ${role.name}`, role.name.replace(/ /g, ''), role.key];
    for (const name of near) expect(matchStandardJobRole(name), name).toBeNull();
  });

  it('answers null for a name it does not know, and never throws', () => {
    const unknowns: unknown[] = ['Chief of everything', '', '   ', undefined, null, 7, {}, [], 'constructor', '__proto__'];
    for (const name of unknowns) expect(matchStandardJobRole(name as never), String(name)).toBeNull();
  });
});

/* ── Every helper is total ──────────────────────────────────────────────────── */

describe('every helper', () => {
  it('answers something for any input, and throws for none', () => {
    const inputs: unknown[] = [undefined, null, '', ' ', 'x', 0, NaN, true, {}, [], () => 1, Symbol('s'), '__proto__', 'toString'];
    for (const input of inputs) {
      const label = String(typeof input === 'symbol' ? 'symbol' : JSON.stringify(input) ?? typeof input);
      expect(() => standardJobRole(input as never), label).not.toThrow();
      expect(standardJobRole(input as never), label).toBeNull();
      expect(suggestedAccessLevel(input as never), label).toBeNull();
      expect(jobRoleForPlanTaskRole(input as never), label).toBeNull();
      expect([null, 'regulatory_affairs_lead'], label).toContain(jobRoleForPlanTaskRole('ra_lead', input as never)?.key ?? null);
      expect(matchStandardJobRole(input as never), label).toBeNull();
      expect(standardJobRolesFor(input as never), label).toEqual([]);
      expect(standardJobRolesFor({ industryMode: input, clientType: input } as never), label).toEqual([]);
      expect(standardJobRolesByGroup(input as never), label).toEqual([]);
    }
  });

  it('finds a role by its key', () => {
    for (const role of STANDARD_JOB_ROLES) expect(standardJobRole(role.key)).toBe(role);
  });
});
