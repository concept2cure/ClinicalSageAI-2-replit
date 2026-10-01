/**
 * Database-level audit (pgaudit): created where the server loads it, and
 * required — fail closed — where the deployment says it must be recording.
 *
 * Why (security audit INF-13, remediation plan P1-11, W2 / D1). The
 * application's Part 11 trail records what the application does. It cannot
 * record a statement that never went through the application: someone with the
 * owner's credentials editing a record in psql, a one-off script, a
 * compromised migration. pgaudit is the control for that path, and the RDS
 * parameter group set `pgaudit.log = write,ddl` from the start. It recorded
 * nothing: on RDS pgaudit runs only when it is in `shared_preload_libraries`
 * AND the extension has been created in the database, and neither was ever
 * done. A configured control that is not running is worse than an absent one,
 * because the configuration is what an assessor reads.
 *
 * So: the parameter group now preloads it (terraform/modules/rds), and
 * deploy-migrate calls this on every deploy, as the owner (on RDS the master,
 * a member of rds_superuser, which CREATE EXTENSION pgaudit needs):
 *
 *   • preloaded            → CREATE EXTENSION IF NOT EXISTS pgaudit, then read
 *                            pgaudit.log back; 'none' or empty is not recording;
 *   • not preloaded        → nothing to create. Fine on a laptop or in CI;
 *                            a FAILURE when DB_AUDIT_REQUIRED=pgaudit, which the
 *                            stack sets on every task (terraform/stack/main.tf).
 *
 * A required audit that is not recording stops the deploy before the services
 * roll, naming what is missing. Any other DB_AUDIT_REQUIRED value is refused
 * too: a typo must not turn a required control into an optional one.
 */

export const DB_AUDIT_ENV = 'DB_AUDIT_REQUIRED';

/** Parse DB_AUDIT_REQUIRED: '' / unset → not required; 'pgaudit' → required; anything else → refused. */
export function databaseAuditRequired(env = process.env) {
  const raw = (env[DB_AUDIT_ENV] ?? '').trim();
  if (raw === '') return false;
  if (raw === 'pgaudit') return true;
  throw new Error(
    `${DB_AUDIT_ENV}='${raw}' is not understood. The only value is 'pgaudit' (or unset, where ` +
      `database-level audit is not required). Refusing rather than treating it as off.`,
  );
}

const preloads = value =>
  String(value ?? '')
    .split(',')
    .map(s => s.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);

/**
 * @param {{ query: (sql: string) => Promise<{ rows: any[] }> }} client  owner connection
 * @param {{ required: boolean, log?: (m: string) => void }} options
 * @returns {Promise<{ state: 'recording' | 'not-loaded', classes?: string }>}
 */
export async function ensureDatabaseAudit(client, { required, log = () => {} }) {
  const preload = (await client.query(`SELECT current_setting('shared_preload_libraries', true) AS v`)).rows[0]?.v;
  if (!preloads(preload).includes('pgaudit')) {
    if (required) {
      throw new Error(
        `database-level audit is required (${DB_AUDIT_ENV}=pgaudit) and this server does not load pgaudit ` +
          `(shared_preload_libraries = '${preload ?? ''}'). Statements that bypass the application are not ` +
          `being recorded. The RDS parameter group must list pgaudit in shared_preload_libraries, and the ` +
          `instance must have rebooted since that change (a static parameter).`,
      );
    }
    log(`  • pgaudit is not loaded on this server; database-level audit is not required here`);
    return { state: 'not-loaded' };
  }

  await client.query('CREATE EXTENSION IF NOT EXISTS pgaudit');
  const classes = (await client.query(`SELECT current_setting('pgaudit.log', true) AS v`)).rows[0]?.v ?? '';
  if (!classes.trim() || classes.trim().toLowerCase() === 'none') {
    if (required) {
      throw new Error(
        `pgaudit is loaded but records nothing: pgaudit.log = '${classes}'. The RDS parameter group sets ` +
          `the classes to record (write, ddl); something has overridden it.`,
      );
    }
    log(`  • pgaudit is loaded but pgaudit.log is '${classes}': recording nothing`);
    return { state: 'recording', classes };
  }
  log(`  ✓ pgaudit loaded and recording: ${classes}`);
  return { state: 'recording', classes };
}
