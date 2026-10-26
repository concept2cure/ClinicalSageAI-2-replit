import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  checkProjectWriterOwners, findProjectInserts, projectCreationOwnerSelfTest,
  repositoryProjectWriters, WRITER_OWNERS, findRetiredCreatorRegistrations, repositoryRetiredCreatorRegistrations,
  findRouteRegistrations, RETIRED_CREATORS,
} from '../../scripts/ci/check-project-creation-owners.mjs';

const sourceOf = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const RETIRED_POSTS = [...RETIRED_CREATORS].flatMap(([file, endpoints]) => endpoints.map(endpoint => [file, endpoint] as const));
const RETAINED_ROUTES = [
  ['server/routes/concept2cure.ts', 'get', '/projects'],
  ['server/routes/concept2cure.ts', 'get', '/projects/:id'],
  ['server/routes/concept2cure.ts', 'put', '/projects/:id'],
  ['server/routes/device-projects.ts', 'get', '/'],
  ['server/routes/device-projects.ts', 'put', '/:id'],
  ['server/routes/device-projects.ts', 'delete', '/:id'],
  ['server/routes/projects-management.ts', 'get', '/'],
  ['server/routes/projects-management.ts', 'patch', '/:projectId'],
  ['server/routes/project-hierarchy.ts', 'get', '/:projectId/children'],
  ['server/routes/project-hierarchy.ts', 'patch', '/:projectId/move'],
  ['server/bootstrap/register-advanced-platform-routes.ts', 'get', '/api/workspace/projects'],
  ['server/routes/ctd-onboarding.ts', 'get', '/projects'],
  ['server/routes/ctd-onboarding.ts', 'post', '/projects/:id/upload'],
  ['server/routes/program-journey.routes.ts', 'get', '/'],
  ['server/routes/ana-platform-control.ts', 'get', '/capabilities'],
  ['server/routes/ana-platform-control.ts', 'patch', '/settings'],
  ['server/routes/ana-platform-control.ts', 'patch', '/projects/:projectId'],
] as const;

describe('project creation stays with canonical intake and explicit deferred owners', () => {
  it('rejects planted SQL/ORM writers, aliases, extra sites and unreasoned exceptions', () => {
    expect(projectCreationOwnerSelfTest()).toEqual({ planted: 25, readsAndComments: 5, owners: 4 });
  });

  it('has no alternate program/PM creation writer in production server sources', () => {
    expect(checkProjectWriterOwners(repositoryProjectWriters())).toEqual([]);
  });

  it('refuses another program writer even in the PM anchor owner file', () => {
    const sites = WRITER_OWNERS.map(owner => ({ ...owner, line: 1, kind: 'SQL' }));
    const planted = findProjectInserts('db.insert(regulatoryPrograms).values({})', 'server/services/c2c/program-project-anchor.ts');
    expect(checkProjectWriterOwners([...sites, ...planted])).toEqual([
      expect.stringContaining('alternate regulatory_programs ORM writer'),
    ]);
  });

  it('keeps the retired workspace creator closed independently of which store it writes', () => {
    const file = 'server/bootstrap/register-advanced-platform-routes.ts';
    expect(findRetiredCreatorRegistrations("app.post('/api/workspace/projects', () => pool.query('INSERT INTO ind_projects (name) VALUES ($1)'))", file)).toEqual([
      expect.stringContaining('retired POST /api/workspace/projects'),
    ]);
    expect(findRetiredCreatorRegistrations("app.get('/api/workspace/projects', handler)", file)).toEqual([]);
    expect(repositoryRetiredCreatorRegistrations()).toEqual([]);
  });

  it('keeps each owner exception exact, reasoned and unable to accumulate freed slots', () => {
    const owner = WRITER_OWNERS[1];
    const site = findProjectInserts('db.insert(projects).values({})', owner.file);
    expect(checkProjectWriterOwners(site, [owner])).toEqual([]);
    expect(checkProjectWriterOwners([...site, ...site], [owner])).toEqual([
      expect.stringContaining('expected 1 writer, found 2'),
    ]);
    expect(checkProjectWriterOwners([], [owner])).toEqual([
      expect.stringContaining('expected 1 writer, found 0'),
    ]);
    expect(checkProjectWriterOwners(site, [{ ...owner, reason: ' ' }])).toEqual([
      expect.stringContaining('one site and a reason required'),
    ]);
    expect(checkProjectWriterOwners([...site, ...site], [{ ...owner, count: 2 }])).toEqual([
      expect.stringContaining('one site and a reason required'),
    ]);
  });
});

describe('bracket ORM syntax still belongs to canonical intake', () => {
  it.each([
    'const p = schema.projects; db["insert"](p).values({});',
    'db.insert(schema["projects"]).values({});',
    'db["insert"](schema["regulatoryPrograms"]).values({});',
  ])('rejects a bracket writer: %s', source => {
    const sites = findProjectInserts(source, 'server/routes/planted.ts');
    expect(sites).toHaveLength(1);
    expect(checkProjectWriterOwners(sites, [])).toHaveLength(1);
  });
});

describe('retirement preserves the existing readable and governed route outcomes', () => {
  it('covers all twelve retired POST registrations', () => {
    expect(RETIRED_POSTS).toHaveLength(12);
  });

  it.each(RETIRED_POSTS)('closes the alternate POST in %s at %s', (file, endpoint) => {
    expect(findRetiredCreatorRegistrations(sourceOf(file), file)).toEqual([]);
    expect(findRetiredCreatorRegistrations(`router.post(${JSON.stringify(endpoint)}, handler)`, file)).toHaveLength(1);
  });

  it.each(RETAINED_ROUTES)('retains %s %s %s', (file, method, endpoint) => {
    expect(findRouteRegistrations(sourceOf(file), file)).toEqual(expect.arrayContaining([
      expect.objectContaining({ method, path: endpoint }),
    ]));
  });

  it('treats comments, ordinary GETs and chained or bracket registrations distinctly', () => {
    const file = 'server/bootstrap/register-advanced-platform-routes.ts';
    expect(findRouteRegistrations('// app.post("/api/workspace/projects", h)\napp.get("/api/workspace/projects", h)', file)).toEqual([
      expect.objectContaining({ method: 'get', path: '/api/workspace/projects' }),
    ]);
    expect(findRouteRegistrations('router.route("/projects").post(handler); router["post"](`/children`, handler)', file).map(route => route.path)).toEqual(['/projects', '/children']);
    expect(findProjectInserts('// db.insert(projects)\n/* INSERT INTO regulatory_programs */\ndb.query(`-- INSERT INTO projects\nSELECT 1`); db.insert(projectSections);')).toEqual([]);
  });
});
