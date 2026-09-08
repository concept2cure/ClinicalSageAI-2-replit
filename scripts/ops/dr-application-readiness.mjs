import pg from "pg";

const databaseUrl = process.env.DR_RESTORED_DATABASE_URL;
if (!databaseUrl) throw new Error("DR_RESTORED_DATABASE_URL is required");

const client = new pg.Client({ connectionString: databaseUrl, application_name: "c2c-dr-readiness-proof" });
try {
  await client.connect();
  await client.query("SELECT set_config('app.tenant_id', $1, false)", ["10000000-0000-4000-8000-000000000001"]);
  const readiness = await client.query(`
    SELECT current_user AS role, session_user AS session_role,
      (SELECT count(*)::int FROM dr_proof.users WHERE auth_subject = 'dr-auth-alpha') AS authenticated_users,
      (SELECT count(*)::int FROM dr_proof.regulated_records) AS readable_records
  `);
  const row = readiness.rows[0];
  if (row.role !== "c2c_dr_app" || row.session_role !== "c2c_dr_app" || row.authenticated_users !== 1 || row.readable_records !== 1) {
    throw new Error("restored application RLS readiness check failed");
  }
  process.stdout.write("restored application database boot/read journey passed under c2c_dr_app\n");
} finally {
  await client.end();
}
