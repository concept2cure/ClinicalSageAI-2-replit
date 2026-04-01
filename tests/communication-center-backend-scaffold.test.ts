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

  it('mounts unified regulatory submissions route in server runtime', () => {
    const serverSrc = read('server/index.ts');
    expect(serverSrc).toContain("import regulatorySubmissionsRoutes from './routes/regulatorySubmissions'");
    expect(serverSrc).toContain("app.use('/api/regulatory-submissions', regulatorySubmissionsRoutes)");
  });

  it('replaces regulatory submissions null placeholders with schema-backed implementation', () => {
    const routeSrc = read('server/routes/regulatorySubmissions.ts');
    expect(routeSrc).toContain('regulatorySubmissions');
    expect(routeSrc).toContain('regulatoryTasks');
    expect(routeSrc).toContain('stageGates');
    expect(routeSrc).not.toContain('These schema tables are not yet defined');
    expect(routeSrc).not.toContain('const submissionProjects: any = null;');
  });

  it('bootstraps unified regulatory submissions feature toggle on startup', () => {
    const serverSrc = read('server/index.ts');
    expect(serverSrc).toContain('FeatureToggleService.initializeFeatureToggle');
    expect(serverSrc).toContain("'UNIFIED_REGULATORY_SUBMISSIONS'");
  });

  it('removes manual submission placeholder from correspondence intake UI', () => {
    const hubSrc = read('client/src/concept2cure/components/correspondence/RegulatoryCommunicationsHub.tsx');
    expect(hubSrc).not.toContain("submissionId: 'manual-submission'");
    expect(hubSrc).toContain('const resolvedSubmissionId = manualSubmissionId.trim() || selected?.submissionId');
  });

  it('uses honest empty/unavailable communication-center state without local scaffold fallback', () => {
    const hookSrc = read('client/src/concept2cure/hooks/useCommunicationCenterData.ts');
    expect(hookSrc).toContain('const [authorityProfiles, setAuthorityProfiles] = useState<AuthorityProfileItem[]>([])');
    expect(hookSrc).toContain('const [agencyEvents, setAgencyEvents] = useState<AgencyCommunicationEvent[]>([])');
    expect(hookSrc).toContain('const [dataUnavailable, setDataUnavailable] = useState(false)');
    expect(hookSrc).toContain('Live backend data could not be loaded. Showing current persisted records only.');
    expect(hookSrc).not.toContain('Using local scaffold data while backend data is unavailable.');
  });

  it('fails closed for regulatory correspondence persistence and discloses heuristic extraction', () => {
    const src = read('server/routes/regulatory-correspondence.ts');
    expect(src).toContain('function persistenceUnavailable');
    expect(src).toContain('Regulatory Correspondence OS persistence is unavailable');
    expect(src).toContain('if (!(await tableReady(pool))) return persistenceUnavailable(res);');
    expect(src).toContain("const ISSUE_EXTRACTION_METHOD = 'keyword_heuristic_v1'");
    expect(src).toContain("confidenceMethod: 'fixed_heuristic_score'");
    expect(src).not.toContain('v1-keyword-scaffold');
  });

  it('removes z.any payload contracts from task management schemas', () => {
    const src = read('server/routes/taskManagement.routes.ts');
    expect(src).toContain('const jsonValueSchema');
    expect(src).toContain('const taskDefinitionSchema');
    expect(src).not.toContain('z.any()');
  });
});
