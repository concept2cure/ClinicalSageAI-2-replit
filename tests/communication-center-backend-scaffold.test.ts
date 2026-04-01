import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(file: string) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

describe('Communication Center backend scaffold', () => {
  it('defines shared communication-center contracts', () => {
    const src = read('shared/types/communication-center.ts');
    expect(src).toContain('COMMUNICATION_VISIBILITY_TIERS');
    expect(src).toContain('PUBLISHOPS_SERVICE_STATES');
    expect(src).toContain('AuthorityProfileRecord');
    expect(src).toContain('AgencyCommunicationEventRecord');
    expect(src).toContain('PublishOpsServiceRecord');
  });

  it('adds authority profile and agency communication routes', () => {
    const src = read('server/routes/concept2cure.ts');
    expect(src).toContain("router.get('/projects/:projectId/authority-profiles'");
    expect(src).toContain("router.post('/projects/:projectId/authority-profiles'");
    expect(src).toContain("router.get('/projects/:projectId/agency-communications'");
    expect(src).toContain("router.post('/projects/:projectId/agency-communications'");
    expect(src).toContain('canViewVisibilityTier');
  });

  it('adds PublishOps service route scaffold with status transitions', () => {
    const src = read('server/routes/concept2cure.ts');
    expect(src).toContain("router.get('/projects/:projectId/publishops/services'");
    expect(src).toContain("router.post('/projects/:projectId/publishops/services'");
    expect(src).toContain("/projects/:projectId/publishops/services/:serviceId/status");
    expect(src).toContain('status: z.enum(PUBLISHOPS_SERVICE_STATES)');
  });

  it('persists communication center scaffold with migration-backed tables', () => {
    const routeSrc = read('server/routes/concept2cure.ts');
    const migrationSrc = read('db/migrations/20260331_communication_center_scaffold.sql');
    expect(routeSrc).toContain('ensureCommunicationCenterTables');
    expect(routeSrc).toContain('concept2cure_authority_profiles');
    expect(routeSrc).toContain('concept2cure_agency_communications');
    expect(routeSrc).toContain('concept2cure_publishops_services');
    expect(migrationSrc).toContain('CREATE TABLE IF NOT EXISTS concept2cure_authority_profiles');
    expect(migrationSrc).toContain('CREATE TABLE IF NOT EXISTS concept2cure_agency_communications');
    expect(migrationSrc).toContain('CREATE TABLE IF NOT EXISTS concept2cure_publishops_services');
    expect(routeSrc).not.toContain('CREATE TABLE IF NOT EXISTS concept2cure_authority_profiles');
  });

  it('wires Communication Center client to scoped backend endpoints', () => {
    const hookSrc = read('client/src/concept2cure/hooks/useCommunicationCenterData.ts');
    expect(hookSrc).toContain('/api/concept2cure/projects/${projectId}/authority-profiles');
    expect(hookSrc).toContain('/api/concept2cure/projects/${projectId}/agency-communications');
    expect(hookSrc).toContain('/api/concept2cure/projects/${projectId}/publishops/services');
  });

  it('mounts correspondence and submission-ops routes in server runtime', () => {
    const serverSrc = read('server/index.ts');
    expect(serverSrc).toContain("import regulatoryCorrespondenceRoutes from './routes/regulatory-correspondence'");
    expect(serverSrc).toContain("app.use('/api/regulatory-correspondence', regulatoryCorrespondenceRoutes)");
    expect(serverSrc).toContain("import submissionOpsRoutes from './routes/submission-ops'");
    expect(serverSrc).toContain("app.use('/api/submission-ops', submissionOpsRoutes)");
  });
});
