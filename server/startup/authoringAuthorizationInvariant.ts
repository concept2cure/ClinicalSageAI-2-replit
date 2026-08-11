import type { Pool } from 'pg';

const REQUIRED_CONSTRAINTS = [
  'doc_permissions_role_check',
  'doc_permissions_validity_check',
  'doc_permissions_doc_tenant_fkey',
  'doc_permissions_section_doc_tenant_fkey',
] as const;

const REQUIRED_TRIGGER = 'authoring_document_seed_permissions';

/**
 * Fail startup before the authoring routes mount when object authorization is
 * incomplete. This is intentionally stricter than waiting for the first edit to
 * discover a missing permission table: an enabled regulated capability must not
 * advertise readiness while its least-privilege control is absent.
 */
export async function assertAuthoringAuthorizationReady(pool: Pool): Promise<void> {
  const optional = process.env.AUTHORING_SUBSYSTEM_OPTIONAL === 'true';
  const tableResult = await pool.query(
    `SELECT to_regclass('public.authoring_documents')::text AS documents,
            to_regclass('public.doc_permissions')::text AS permissions`,
  );
  const documentsPresent = Boolean(tableResult.rows[0]?.documents);
  const permissionsPresent = Boolean(tableResult.rows[0]?.permissions);

  if (!documentsPresent && !permissionsPresent && optional) return;
  if (!documentsPresent) {
    throw new Error(
      'Authoring authorization invariant failed: authoring_documents is absent. ' +
        'Provision the atomic authoring subsystem before mounting authoring routes.',
    );
  }
  if (!permissionsPresent) {
    throw new Error(
      'Authoring authorization invariant failed: doc_permissions is absent. ' +
        'Run the atomic authoring subsystem migration; object mutations must not run without it.',
    );
  }

  const constraintResult = await pool.query(
    `SELECT conname
       FROM pg_constraint
      WHERE conrelid = 'public.doc_permissions'::regclass
        AND conname = ANY($1::text[])`,
    [REQUIRED_CONSTRAINTS],
  );
  const haveConstraints = new Set(constraintResult.rows.map(row => String(row.conname)));
  const missingConstraints = REQUIRED_CONSTRAINTS.filter(name => !haveConstraints.has(name));

  const triggerResult = await pool.query(
    `SELECT tgname
       FROM pg_trigger
      WHERE tgrelid = 'public.authoring_documents'::regclass
        AND NOT tgisinternal
        AND tgname = $1`,
    [REQUIRED_TRIGGER],
  );

  const rlsResult = await pool.query(
    `SELECT relrowsecurity, relforcerowsecurity
       FROM pg_class
      WHERE oid = 'public.doc_permissions'::regclass`,
  );
  const rls = rlsResult.rows[0];
  const problems: string[] = [];
  if (missingConstraints.length > 0) {
    problems.push(`missing constraints: ${missingConstraints.join(', ')}`);
  }
  if (triggerResult.rows.length === 0) problems.push(`missing trigger: ${REQUIRED_TRIGGER}`);
  if (!rls?.relrowsecurity || !rls?.relforcerowsecurity) {
    problems.push('RLS is not both enabled and forced on doc_permissions');
  }

  if (problems.length > 0) {
    throw new Error(
      `Authoring authorization invariant failed: ${problems.join('; ')}. ` +
        'The authoring permission control is partial and the application will not mount it.',
    );
  }
}

export default assertAuthoringAuthorizationReady;
