/**
 * 30-audit-log.mjs — GA demo seed: governed-action audit timeline.
 *
 * Surface fed by this module:
 *   GET /api/mdx/audit (server/routes/mdx-audit.ts) — the kit Audit Log /
 *   Communication Center audit-trail surface (client useAuditTrail). Its read is:
 *     SELECT al.id, al.user_id, al.action, al.table_name, al.record_id,
 *            al.new_values, al.created_at, COALESCE(u.name, u.email) AS actor_name
 *       FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
 *      WHERE al.tenant_id = $org ORDER BY al.created_at DESC LIMIT n
 *   The route surfaces new_values.role / .reason / .sha / .prev, derives the
 *   action/resource filter registries from the rows, counts the "Signings
 *   today" KPI from action = 'sign', and program-filters on
 *   record_id ILIKE %program% OR new_values::text ILIKE %program%.
 *
 * DDL sources: migrations/0000_sweet_joseph.sql + shared/schema.ts (auditLogs:
 * id uuid default gen_random_uuid(), tenant_id int NOT NULL, user_id int,
 * action/table_name/record_id text NOT NULL, old_values/new_values json,
 * ip_address/user_agent text, created_at timestamp NOT NULL default now(),
 * updated_at via migrations/20260525_audit_logs_updated_at.sql) plus the
 * optional Mutation Primitives envelope columns added by
 * migrations/20260527_mutation_primitives.sql (actor_id, target, target_type,
 * target_id, reason, payload_hash, ana_action_id, sha256_chain, occurred_at)
 * and hmac_seal (migrations/20260609_audit_hmac_seal.sql). Because those
 * chain columns are additive and may be absent in a given environment, this
 * module introspects information_schema.columns and only writes columns that
 * exist. Chain-integrity columns (payload_hash, sha256_chain, hmac_seal,
 * ana_action_id) are intentionally left NULL — that is the documented legacy
 * state (see 20260527 §3), so seeded rows never break seal verification.
 * Writer parity: templateStore.ts auditTemplate() writes (id, tenant_id,
 * user_id, action, table_name, record_id, actor_id, target, target_type,
 * target_id, reason, occurred_at) — mirrored here for the template events.
 *
 * Conventions: runs inside the caller's open transaction (no BEGIN/COMMIT),
 * table guarded via to_regclass, idempotent via SELECT-before-INSERT keyed on
 * (tenant_id, action, table_name, record_id) — audit_logs has no natural
 * unique key and is append-only (UPDATE/DELETE are trigger-blocked in some
 * environments), so ON CONFLICT upserts are not an option. All rows carry
 * tenant_id = org.id, the column the read query filters on. Timestamps are
 * SQL now() - interval offsets (no JS Date arithmetic).
 */

async function tableExists(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS t`, [`public.${table}`]);
  return Boolean(r.rows[0]?.t);
}

// Demo team seeded earlier in this transaction by scripts/seed-ga-demo.mjs;
// each event resolves its actor by email and falls back to the admin user.
const TEAM_EMAILS = {
  sarah: 'sarah.chen@concept2cure.pro',
  raj: 'raj.patel@concept2cure.pro',
  emily: 'emily.watson@concept2cure.pro',
  david: 'david.kim@concept2cure.pro',
};

/**
 * 12 governed-action events over the last 30 days, oldest first so the
 * demo sha/prev values chain forward (new_values sugar only — real chain
 * columns stay NULL). ago = SQL interval subtracted from now(); the two
 * newest events sit under an hour old so the "Events today" and "Signings
 * today" KPIs are non-zero on the day the seed runs. Every event carries a
 * program token in record_id and/or new_values.program so the route's
 * program filter matches. (action, table_name, record_id) is unique per
 * event — it is the idempotency key.
 */
const EVENTS = [
  {
    ago: '26 days 2 hours', action: 'c2c.template.create',
    tableName: 'c2c_template_specs', recordId: 'tpl_chmp_resp',
    actor: 'emily', role: 'Senior Medical Writer', targetType: 'template',
    program: 'BX-420',
    reason: 'Created template "EMA CHMP Response Template"',
    sha: '9f2c41d8a6e05b73',
  },
  {
    ago: '24 days 4 hours', action: 'approve',
    tableName: 'workflow_approvals', recordId: 'BX-420-PIP-AR-2026',
    actor: 'raj', role: 'Director, Clinical Operations', targetType: 'approval',
    program: 'BX-420',
    reason: 'Approved BX-420 PIP annual progress report for EMA submission',
    sha: '4b8e19c7d2f6a034',
  },
  {
    ago: '21 days 7 hours', action: 'sign',
    tableName: 'nonclinical_studies', recordId: 'TX-702',
    actor: 'david', role: 'Quality Assurance Lead', targetType: 'study',
    program: 'BX-099',
    reason: 'Part 11 e-signature: QA release of TX-702 39-week cynomolgus toxicology report',
    sha: 'd71a5e92c48b06f5',
  },
  {
    ago: '18 days 3 hours', action: 'dispatch',
    tableName: 'esg_transmittals', recordId: 'JP-VAR-2024-3',
    actor: 'sarah', role: 'VP Regulatory Affairs', targetType: 'transmittal',
    program: 'BX-099',
    reason: 'Dispatched BX-099 partial change notification package to PMDA gateway',
    sha: '2e94c7b1f8a35d60',
  },
  {
    ago: '15 days 6 hours', action: 'dispatch',
    tableName: 'submission_gateways', recordId: 'BX-301-PIP-MOD-002',
    actor: 'sarah', role: 'VP Regulatory Affairs', targetType: 'gateway',
    program: 'BX-301',
    reason: 'Dispatched BX-301 PIP modification package to EMA via CESP',
    sha: 'a05d38f6e19c72b4',
  },
  {
    ago: '12 days 1 hour', action: 'c2c.template.update',
    tableName: 'c2c_template_specs', recordId: 'tpl_estar_cover',
    actor: 'emily', role: 'Senior Medical Writer', targetType: 'template',
    program: 'BX-204',
    reason: 'Updated template "FDA eSTAR Cover Letter"',
    sha: '6c31b9e4d7f2a850',
  },
  {
    ago: '10 days 5 hours', action: 'approve',
    tableName: 'documents', recordId: 'BX-256-PREIND-BRIEF',
    actor: 'sarah', role: 'VP Regulatory Affairs', targetType: 'document',
    program: 'BX-256',
    reason: 'Approved BX-256 pre-IND briefing package for FDA submission',
    sha: 'e8470d2c5a91f36b',
  },
  {
    ago: '6 days 2 hours', action: 'sign',
    tableName: 'coauthor_documents', recordId: 'BX-099-M2.7',
    actor: 'raj', role: 'Director, Clinical Operations', targetType: 'document',
    program: 'BX-099',
    reason: 'Part 11 e-signature: content lock of BX-099 Module 2.7 clinical summary',
    sha: '51f6a3d90e7c24b8',
  },
  {
    ago: '3 days 4 hours', action: 'c2c.template.update',
    tableName: 'c2c_template_specs', recordId: 'tpl_house_ctd',
    actor: 'emily', role: 'Senior Medical Writer', targetType: 'template',
    program: 'BX-099',
    reason: 'Updated template "Concept2Cure House Style — CTD"',
    sha: 'c29e60b5f4d817a3',
  },
  {
    ago: '1 day 3 hours', action: 'approve',
    tableName: 'workflow_approvals', recordId: 'BX-099-SNDA-RESP-014',
    actor: 'sarah', role: 'VP Regulatory Affairs', targetType: 'approval',
    program: 'BX-099',
    reason: 'Approved response to FDA information request IR-014 (BX-099 sNDA)',
    sha: '7a4d92f1c8e6305b',
  },
  {
    ago: '45 minutes', action: 'sign',
    tableName: 'ectd_sequences', recordId: 'BX-204-ESTAR-0001',
    actor: 'admin', role: 'Chief Science Officer', targetType: 'sequence',
    program: 'BX-204',
    reason: 'Part 11 e-signature: released BX-204 eSTAR sequence 0001 for FDA transmission',
    sha: '08b5e7c2a94f61d3',
  },
  {
    ago: '20 minutes', action: 'dispatch',
    tableName: 'esg_transmittals', recordId: 'BX-204-ESTAR-0001',
    actor: 'sarah', role: 'VP Regulatory Affairs', targetType: 'transmittal',
    program: 'BX-204',
    reason: 'Dispatched BX-204 eSTAR sequence 0001 to FDA ESG (WebTrader)',
    sha: 'f36a10d94c7e82b5',
  },
];

export default async function seed(client, { org, admin }) {
  if (!(await tableExists(client, 'audit_logs'))) {
    console.log('   ⚠ audit_logs not found — skipping');
    return;
  }

  // The chain-envelope columns (20260527_mutation_primitives.sql) are additive
  // and environment-dependent; write only the columns that actually exist.
  const colRes = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_logs'`,
  );
  const cols = new Set(colRes.rows.map((r) => r.column_name));

  // Resolve demo team actors (fall back to the admin when a member is absent).
  const usersRes = await client.query(
    `SELECT id, email FROM users WHERE email = ANY($1::text[])`,
    [Object.values(TEAM_EMAILS)],
  );
  const idByEmail = new Map(usersRes.rows.map((r) => [r.email, r.id]));
  const actorId = (key) =>
    key === 'admin' ? admin.id : (idByEmail.get(TEAM_EMAILS[key]) ?? admin.id);

  let inserted = 0;
  let existing = 0;
  let prevSha = null;

  for (const e of EVENTS) {
    const dup = await client.query(
      `SELECT 1 FROM audit_logs
        WHERE tenant_id = $1 AND action = $2 AND table_name = $3 AND record_id = $4
        LIMIT 1`,
      [org.id, e.action, e.tableName, e.recordId],
    );
    if (dup.rows[0]) {
      existing += 1;
      prevSha = e.sha;
      continue;
    }

    const uid = actorId(e.actor);
    // Keys the surface reads out of new_values: role, reason, sha, prev.
    // program makes the route's new_values::text ILIKE %program% filter match.
    const newValues = {
      role: e.role,
      reason: e.reason,
      sha: e.sha,
      ...(prevSha ? { prev: prevSha } : {}),
      program: e.program,
    };

    const insertCols = ['id', 'tenant_id', 'user_id', 'action', 'table_name', 'record_id'];
    const insertVals = ['gen_random_uuid()', '$1', '$2', '$3', '$4', '$5'];
    const params = [org.id, uid, e.action, e.tableName, e.recordId];
    const addParam = (col, value, cast = '') => {
      if (!cols.has(col)) return;
      params.push(value);
      insertCols.push(col);
      insertVals.push(`$${params.length}${cast}`);
    };

    addParam('new_values', JSON.stringify(newValues), '::json');

    // Timestamps: one shared interval parameter, subtracted from now() in SQL.
    if (cols.has('created_at') || cols.has('occurred_at') || cols.has('updated_at')) {
      params.push(e.ago);
      const expr = `now() - $${params.length}::interval`;
      for (const col of ['created_at', 'occurred_at', 'updated_at']) {
        if (cols.has(col)) {
          insertCols.push(col);
          insertVals.push(expr);
        }
      }
    }

    // Mutation Primitives envelope columns (writer parity with
    // templateStore.auditTemplate); skipped when the migration has not run.
    addParam('actor_id', uid);
    addParam('target', `${e.targetType}:${e.recordId}`);
    addParam('target_type', e.targetType);
    addParam('target_id', e.recordId);
    addParam('reason', e.reason);
    addParam('ip_address', '10.0.0.1');
    addParam('user_agent', 'Concept2Cure.RI/GA-Seed');

    await client.query(
      `INSERT INTO audit_logs (${insertCols.join(', ')})
       VALUES (${insertVals.join(', ')})`,
      params,
    );
    inserted += 1;
    prevSha = e.sha;
  }

  console.log(
    `   ✓ audit timeline: ${inserted} governed-action audit_logs events seeded` +
      (existing ? ` (${existing} already present)` : ''),
  );
}
