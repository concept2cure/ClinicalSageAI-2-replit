import { describe, expect, it } from 'vitest';
import {
  checkProjectWriterOwners, findProjectInserts, projectCreationOwnerSelfTest,
  repositoryProjectWriters, WRITER_OWNERS, findRetiredCreatorRegistrations, repositoryRetiredCreatorRegistrations,
} from '../../scripts/ci/check-project-creation-owners.mjs';

describe('project creation stays with canonical intake and explicit deferred owners', () => {
  it('rejects planted SQL/ORM writers, aliases, extra sites and unreasoned exceptions', () => {
    expect(projectCreationOwnerSelfTest()).toEqual({ planted: 19, readsAndComments: 5, owners: 4 });
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
});
