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
    expect(src).toContain('SubmissionCenterItemRecord');
    expect(src).toContain('SUBMISSION_CENTER_ITEM_STATES');
  });

  it('adds authority profile and agency communication routes', () => {
    const src = read('server/routes/concept2cure-communication-center.ts');
    expect(src).toContain("router.get('/projects/:projectId/authority-profiles'");
    expect(src).toContain("router.get('/projects/:projectId/authority-profiles/templates'");
    expect(src).toContain("router.post('/projects/:projectId/authority-profiles'");
    expect(src).toContain("router.get('/projects/:projectId/agency-communications'");
    expect(src).toContain("router.post('/projects/:projectId/agency-communications'");
    expect(src).toContain('canViewVisibilityTier');
    expect(src).toContain('validateAuthorityProfileInput');
    expect(src).toContain('deriveCommunicationDueDate');
  });

  it('adds PublishOps service route scaffold with status transitions', () => {
    const src = read('server/routes/concept2cure-communication-center.ts');
    expect(src).toContain("router.get('/projects/:projectId/publishops/services'");
    expect(src).toContain("router.post('/projects/:projectId/publishops/services'");
    expect(src).toContain("/projects/:projectId/publishops/services/:serviceId/status");
    expect(src).toContain('status: z.enum(PUBLISHOPS_SERVICE_STATES)');
    expect(src).toContain('createCommunicationCenterTask');
    expect(src).toContain('createCommunicationCenterNotification');
    expect(src).toContain('publishops_completed');
    expect(src).toContain("router.get('/projects/:projectId/submission-center/items'");
    expect(src).toContain("router.post('/projects/:projectId/submission-center/items'");
    expect(src).toContain('/projects/:projectId/submission-center/items/:itemId/status');
    expect(src).toContain('validateSubmissionTransition');
  });

  it('persists communication center scaffold with migration-backed tables', () => {
    const routeSrc = read('server/routes/concept2cure-communication-center.ts');
    const parentRouteSrc = read('server/routes/concept2cure.ts');
    const migrationSrc = read('db/migrations/20260331_communication_center_scaffold.sql');
    expect(parentRouteSrc).toContain('registerCommunicationCenterRoutes(');
    expect(routeSrc).toContain('ensureCommunicationCenterTables');
    expect(routeSrc).toContain('concept2cure_authority_profiles');
    expect(routeSrc).toContain('concept2cure_agency_communications');
    expect(routeSrc).toContain('concept2cure_publishops_services');
    expect(routeSrc).toContain('concept2cure_submission_center_items');
    expect(migrationSrc).toContain('CREATE TABLE IF NOT EXISTS concept2cure_authority_profiles');
    expect(migrationSrc).toContain('CREATE TABLE IF NOT EXISTS concept2cure_agency_communications');
    expect(migrationSrc).toContain('CREATE TABLE IF NOT EXISTS concept2cure_publishops_services');
    const submissionMigrationSrc = read('db/migrations/20260401_submission_center_items.sql');
    expect(submissionMigrationSrc).toContain('CREATE TABLE IF NOT EXISTS concept2cure_submission_center_items');
    expect(routeSrc).not.toContain('CREATE TABLE IF NOT EXISTS concept2cure_authority_profiles');
  });

  it('wires Communication Center client to scoped backend endpoints', () => {
    const hookSrc = read('client/src/concept2cure/hooks/useCommunicationCenterData.ts');
    expect(hookSrc).toContain('/api/concept2cure/projects/${projectId}/authority-profiles');
    expect(hookSrc).toContain('/api/concept2cure/projects/${projectId}/authority-profiles/templates');
    expect(hookSrc).toContain('/api/concept2cure/projects/${projectId}/agency-communications');
    expect(hookSrc).toContain('/api/concept2cure/projects/${projectId}/publishops/services');
    expect(hookSrc).toContain('/api/concept2cure/projects/${projectId}/submission-center/items');
    expect(hookSrc).toContain('createManualAgencyEvent');
    expect(hookSrc).toContain('createPublishOpsRequest');
    expect(hookSrc).toContain('createSubmissionCenterItem');
    expect(hookSrc).toContain('transitionSubmissionCenterItem');
    expect(hookSrc).toContain("sourceType: 'manual_logged_event'");
    expect(hookSrc).toContain("entitlementLevel: 'managed_publishops_service'");
  });
});
