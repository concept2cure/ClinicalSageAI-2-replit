#!/usr/bin/env node
/**
 * Self-test for scripts/ci/check-tenant-isolation.mjs (ci:tenant-isolation).
 *
 * On the real tree the gate reports 8 candidates, all baselined, so CI's
 * `--strict-no-regression` run only ever prints OK — and a gate whose failure
 * branch has never been seen has not been tested (CLAUDE.md, working
 * agreement: "verify by making the check fail").
 *
 * Each case writes a throwaway server/ tree (and, where the case needs one, a
 * docs/reports/tenant-isolation-baseline.json) into a temp directory, writes a
 * copy of the gate whose `repoRoot` is that directory and whose `./lib/`
 * imports resolve to the repo's real helpers, runs it as a subprocess, and
 * asserts its verdict. Every red case asserts the EXACT set of flagged
 * (file, line, tables) through `--json` as well as the `--strict` exit code and
 * the site named in its text output, so a near-miss in the same file that got
 * flagged fails the case just as a missed defect does.
 *
 * The red cases are the shapes this gate's history is about:
 *   - DP-37 (2026-09-26 security lens): the submission service's leaf-program
 *     lookup, `SELECT program_id … FROM vault.documents WHERE id = …::uuid`,
 *     with no tenant predicate while its siblings had one — caught as
 *     "1 NEW finding above baseline".
 *   - the submission lane (2026-09-28): an injected unscoped read of
 *     `ectd_sequences` by primary key, invisible until those tables joined
 *     TENANT_SCOPED_TABLES.
 *   - the optional tenant predicate `($1::INT IS NULL OR org_id = $1)` that
 *     let clinical-operations-routes.ts read every organization's studies while
 *     this gate reported nothing — including on tables NOT in the list.
 *   - a fragment assembled from fragments with no tenant predicate anywhere
 *     (15a38fbf), and VR-08's check-in walk over any row naming the head.
 *   - writes, the removed phantom allowlist path `server/routes/admin.ts`, and
 *     suppression markers that must not suppress (no reason; out of range).
 *
 * The clean cases are the near-misses a sloppier gate would flag: DP-37 as
 * fixed, project-vault's `WHERE ${uploadsWhere}` idiom (nested), SQL with
 * quoted literals before its tenant filter, `(org_id IS NULL OR org_id = $1)`
 * (global-or-own, not an escape), SQL inside comments, table names that only
 * start with a tenant table's name, the skip rules (allowlist, workers/,
 * .test/.spec/.dbtest — 736ab7c1), and a reasoned inline suppression.
 *
 * Baseline semantics (`--write-baseline` / `--strict-no-regression`, what CI
 * runs): a baselined finding passes; it survives line drift and whitespace
 * reflow (content-hash fingerprint); an edited statement is new; the same SQL
 * in a second file is new (file-scoped fingerprint — DP-37's "second caller");
 * a fixed entry is reported, not fatal; a missing baseline fails; a legacy
 * `file:line:tables` entry covers its (file, tables) and nothing else.
 *
 * SELFTEST_GATE_PATH points the selftest at another copy of the gate (used to
 * show it failing on a mutant); it defaults to the real gate.
 *
 * Usage: node scripts/ci/check-tenant-isolation.selftest.mjs   (exit 0 = all held)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:tenant-isolation:selftest]';
const GATE = path.resolve(
  process.env.SELFTEST_GATE_PATH || path.join(repoRoot, 'scripts', 'ci', 'check-tenant-isolation.mjs'),
);
const LIB_DIR = path.join(repoRoot, 'scripts', 'ci', 'lib');
const BASELINE_REL = path.join('docs', 'reports', 'tenant-isolation-baseline.json');

/* ── Harness ───────────────────────────────────────────────────────────────── */

/** The gate's source with its root moved to `root`. Refuses to guess. */
function patchedGate(root) {
  const original = fs.readFileSync(GATE, 'utf8');
  let src = original.replace(/const repoRoot = [^;]+;/, `const repoRoot = ${JSON.stringify(root)};`);
  if (src === original) {
    throw new Error(`could not repoint repoRoot in ${GATE} — the gate changed shape; update the selftest`);
  }
  let libs = 0;
  src = src.replace(/from '\.\/lib\/([\w.-]+\.mjs)'/g, (_all, file) => {
    libs++;
    return `from ${JSON.stringify(pathToFileURL(path.join(LIB_DIR, file)).href)}`;
  });
  if (libs === 0 || /from '\.\.?\//.test(src)) {
    throw new Error(`could not rewrite the gate's relative imports in ${GATE}; update the selftest`);
  }
  return src;
}

/** A fixture tree: { root, write(files), baseline(fps), run(args), cleanup() }. */
function tree(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-isolation-selftest-'));
  fs.mkdirSync(path.join(root, 'server'), { recursive: true });
  const gate = path.join(root, 'gate.mjs'); // outside server/, so never scanned
  fs.writeFileSync(gate, patchedGate(root));
  const t = {
    root,
    files: {},
    write(more) {
      for (const [rel, content] of Object.entries(more)) {
        const full = path.join(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
        t.files[rel] = content;
      }
    },
    baseline(fingerprints) {
      const full = path.join(root, BASELINE_REL);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, JSON.stringify({ generatedAt: '2026-10-01T00:00:00.000Z', fingerprints }, null, 2));
    },
    readBaseline() {
      return JSON.parse(fs.readFileSync(path.join(root, BASELINE_REL), 'utf8'));
    },
    run(args = []) {
      const r = spawnSync(process.execPath, [gate, ...args], { cwd: root, encoding: 'utf8' });
      return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? '' };
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
  t.write(files);
  return t;
}

/** 1-based line of the first line containing `needle` (the literal's opening line). */
function lineOf(content, needle) {
  const idx = content.indexOf(needle);
  if (idx < 0) throw new Error(`fixture needle not found: ${JSON.stringify(needle)}`);
  return content.slice(0, idx).split('\n').length;
}

const indent = (out) => out.trimEnd().split('\n').map((l) => `| ${l}`).join('\n');

/** Assert one run's exit code and what its output does and does not say. */
function expectRun(t, args, { exit, say = [], notSay = [] }) {
  const r = t.run(args);
  const p = [];
  const label = args.length ? args.join(' ') : '(default mode)';
  if (r.code !== exit) p.push(`${label}: expected exit ${exit}, got ${r.code}`);
  for (const s of say) if (!r.out.includes(s)) p.push(`${label}: output lacked ${JSON.stringify(s)}`);
  for (const s of notSay) if (r.out.includes(s)) p.push(`${label}: output wrongly contained ${JSON.stringify(s)}`);
  if (p.length) p.push(indent(r.out));
  return { problems: p, out: r.out };
}

/**
 * Assert the EXACT finding set. `flags` is [file, needle-on-opening-line, tables[]].
 * Checks `--json` for the set and `--strict` for the exit code and the named site.
 */
function expectFlags(t, flags, { suppressed = [] } = {}) {
  const p = [];
  const want = flags
    .map(([file, needle, tables]) => `${file}:L${lineOf(t.files[file], needle)}:[${[...tables].sort().join(',')}]`)
    .sort();

  const j = t.run(['--json']);
  let parsed;
  try {
    parsed = JSON.parse(j.stdout);
  } catch {
    return [`--json: output was not JSON (exit ${j.code})`, indent(j.out)];
  }
  const got = parsed.findings.map((f) => `${f.file}:L${f.line}:[${[...f.tables].sort().join(',')}]`).sort();
  for (const w of want) if (!got.includes(w)) p.push(`not flagged (should be): ${w}`);
  for (const g of got) if (!want.includes(g)) p.push(`flagged (should not be): ${g}`);

  const gotSuppressed = parsed.suppressed.map((s) => `${s.file}:${s.reason}`).sort();
  const wantSuppressed = [...suppressed].sort();
  if (JSON.stringify(gotSuppressed) !== JSON.stringify(wantSuppressed)) {
    p.push(`suppressed: expected ${JSON.stringify(wantSuppressed)}, got ${JSON.stringify(gotSuppressed)}`);
  }

  if (flags.length === 0) {
    p.push(...expectRun(t, ['--strict'], { exit: 0, say: ['OK — no raw SQL against tenant-scoped tables'] }).problems);
  } else {
    const say = [`FAIL — ${flags.length} candidate violation(s)`];
    for (const [file, needle] of flags) say.push(`  ${file}  (`, `L${lineOf(t.files[file], needle)}  tables=[`);
    p.push(...expectRun(t, ['--strict'], { exit: 1, say }).problems);
  }
  return p;
}

/** Fingerprints the gate printed as NEW in --strict-no-regression output. */
function newFingerprints(out) {
  return [...out.matchAll(/^ {2}(server\/\S+#[0-9a-f]{12}:\S*)$/gm)].map((m) => m[1]);
}

/* ── Fixtures: the shapes from this gate's history ─────────────────────────── */

const SUBMISSION_SERVICE = 'server/services/submission-service/submission-service.ts';

/** DP-37 as it shipped: the Vault arm reads program_id by uuid with no tenant predicate. */
const DP37_UNSCOPED = `import { sql } from 'drizzle-orm';
type LeafRef = { documentId: number | null; documentUuid: string | null };

/** Per store that records a project: the read of a document's project. */
const LEAF_PROGRAM_READS = {
  vault_documents: (ref: LeafRef) =>
    ref.documentUuid
      ? sql\`SELECT program_id::text AS program_id FROM vault.documents WHERE id = \${ref.documentUuid}::uuid\`
      : null,
  c2c_document_sections: (ref: LeafRef, organizationId: number) =>
    ref.documentId
      ? sql\`SELECT d.project_id::text AS program_id
        FROM c2c_document_sections s JOIN c2c_documents d ON d.id = s.document_id
       WHERE s.id = \${ref.documentId} AND d.org_id = \${organizationId}\`
      : null,
};
export { LEAF_PROGRAM_READS };
`;

/** DP-37 as fixed: the predicate reaches the tenant through the program. */
const DP37_FIXED = `import { sql } from 'drizzle-orm';
type LeafRef = { documentId: number | null; documentUuid: string | null };
const LEAF_PROGRAM_READS = {
  vault_documents: (ref: LeafRef, organizationId: number) =>
    ref.documentUuid
      ? sql\`
      SELECT d.program_id::text AS program_id
        FROM vault.documents d JOIN regulatory_programs rp ON rp.id = d.program_id
       WHERE d.id = \${ref.documentUuid}::uuid AND rp.organization_id = \${organizationId}\`
      : null,
};
export { LEAF_PROGRAM_READS };
`;

const RAG_BASELINED = `import { pool } from '../db';
export async function chunkText(documentId: number) {
  const r = await pool.query(\`SELECT rc.content FROM rag_chunks rc
       JOIN rag_documents rd ON rd.id = rc.document_id
      WHERE rd.id = $1\`, [documentId]);
  return r.rows;
}
`;

/* ── Cases ─────────────────────────────────────────────────────────────────── */

const cases = [
  {
    name: 'harness — the patched gate scans the fixture tree, not this repository (empty tree is OK under --strict)',
    check: (t) => expectFlags(t, []),
  },

  // ── RED: the defect shapes ────────────────────────────────────────────────
  {
    name: 'RED — DP-37: unscoped leaf-program lookup on vault.documents (its scoped sibling stays quiet)',
    files: { [SUBMISSION_SERVICE]: DP37_UNSCOPED },
    check: (t) =>
      expectFlags(t, [[SUBMISSION_SERVICE, 'FROM vault.documents WHERE id', ['documents']]]),
  },
  {
    name: 'RED — DP-37 as CI caught it: --strict-no-regression fails on 1 NEW finding above the baseline and names it',
    files: { 'server/services/advancedRAGPipeline.ts': RAG_BASELINED },
    check: (t) => {
      const p = [];
      p.push(...expectRun(t, ['--write-baseline'], { exit: 0, say: ['(1 findings)'] }).problems);
      const ragFp = t.readBaseline().fingerprints[0] ?? '';
      t.write({ [SUBMISSION_SERVICE]: DP37_UNSCOPED });
      const r = expectRun(t, ['--strict-no-regression'], {
        exit: 1,
        say: ['FAIL — 1 NEW finding(s) above baseline of 1'],
      });
      p.push(...r.problems);
      const fresh = newFingerprints(r.out);
      if (fresh.length !== 1 || !/^server\/services\/submission-service\/submission-service\.ts#[0-9a-f]{12}:documents$/.test(fresh[0])) {
        p.push(`expected exactly the DP-37 fingerprint as NEW, got ${JSON.stringify(fresh)}`);
      }
      if (fresh.includes(ragFp)) p.push('the baselined rag_chunks finding was reported as NEW');
      return p;
    },
  },
  {
    name: 'RED — submission lane (2026-09-28): ectd_sequences / submission_leaves / electronic_signatures read by primary key',
    files: {
      'server/services/cmc/submission-spine.ts': `import { pool } from '../../db';
export async function sequenceById(id: number) {
  return pool.query(\`SELECT * FROM ectd_sequences WHERE id = $1\`, [id]);
}
export async function leavesOf(sequenceId: number) {
  return pool.query(\`SELECT l.* FROM submission_leaves l WHERE l.sequence_id = $1 ORDER BY l.position\`, [sequenceId]);
}
export async function releaseSignature(recordId: string) {
  return pool.query(\`SELECT signer_id, meaning, signed_at FROM electronic_signatures WHERE record_id = $1\`, [recordId]);
}
`,
    },
    check: (t) =>
      expectFlags(t, [
        ['server/services/cmc/submission-spine.ts', 'FROM ectd_sequences', ['ectd_sequences']],
        ['server/services/cmc/submission-spine.ts', 'FROM submission_leaves', ['submission_leaves']],
        ['server/services/cmc/submission-spine.ts', 'FROM electronic_signatures', ['electronic_signatures']],
      ]),
  },
  {
    name: 'RED — clinical-operations: ($1::INT IS NULL OR org_id = $1) is flagged even on tables NOT in the tenant list',
    files: {
      'server/routes/clinical-operations-routes.ts': `import { pool } from '../db';
export async function studies(orgId: number | null) {
  return pool.query(\`SELECT id, title, phase FROM clinical_ops.studies WHERE ($1::INT IS NULL OR org_id = $1) ORDER BY id\`, [orgId]);
}
export async function deviations(orgId: number | null, studyId: number) {
  return pool.query(\`SELECT d.* FROM clinical_ops.protocol_deviations d
     WHERE d.study_id = $1 AND ($2::int IS NULL OR d.org_id = $2)\`, [studyId, orgId]);
}
`,
    },
    check: (t) =>
      expectFlags(t, [
        ['server/routes/clinical-operations-routes.ts', 'FROM clinical_ops.studies', []],
        ['server/routes/clinical-operations-routes.ts', 'SELECT d.* FROM clinical_ops.protocol_deviations', []],
      ]),
  },
  {
    name: 'RED — an optional tenant predicate on a listed table, although organization_id appears in the SELECT list',
    files: {
      'server/services/project-portfolio.ts': `import { pool } from '../db';
export async function portfolio(orgId: number | null) {
  return pool.query(\`SELECT id, organization_id, name FROM projects
     WHERE ($1::int IS NULL OR organization_id = $1) AND deleted_at IS NULL\`, [orgId]);
}
`,
    },
    check: (t) =>
      expectFlags(t, [['server/services/project-portfolio.ts', 'SELECT id, organization_id, name FROM projects', ['projects']]]),
  },
  {
    name: 'RED — a WHERE assembled from fragments with no tenant predicate (15a38fbf), and the VR-08 head walk',
    files: {
      'server/services/vault/vault-checkin.ts': `import { pool } from '../../db';
const liveWhere = \`d.deleted_at IS NULL\`;
const headsWhere = \`\${liveWhere} AND d.superseded_by IS NULL\`;
export async function heads(programId: string) {
  return pool.query(\`SELECT d.id, d.title FROM vault.documents d WHERE \${headsWhere} AND d.program_id = $1\`, [programId]);
}
export async function successorOf(headId: string) {
  return pool.query(\`SELECT id, version FROM vault.documents WHERE supersedes_document_id = $1 ORDER BY version DESC\`, [headId]);
}
`,
    },
    check: (t) =>
      expectFlags(t, [
        ['server/services/vault/vault-checkin.ts', 'SELECT d.id, d.title FROM vault.documents d', ['documents']],
        ['server/services/vault/vault-checkin.ts', 'WHERE supersedes_document_id', ['documents']],
      ]),
  },
  {
    name: 'RED — writes and every quote style: UPDATE / DELETE FROM / INSERT INTO, single- and double-quoted, public. prefix',
    files: {
      'server/services/document-lifecycle.ts': `import { pool } from '../db';
export async function archive(id: string) {
  await pool.query(\`UPDATE documents SET status = 'archived', updated_at = NOW() WHERE id = $1\`, [id]);
  await pool.query('DELETE FROM document_versions WHERE document_id = $1', [id]);
  await pool.query("INSERT INTO audit_events (event_type, entity_id) VALUES ('document.archived', $1)", [id]);
}
`,
      'server/services/user-lookup.ts': `import { pool } from '../db';
export const byId = (id: number) => pool.query('SELECT id, email, password_hash FROM public.users WHERE id = $1', [id]);
`,
    },
    check: (t) =>
      expectFlags(t, [
        ['server/services/document-lifecycle.ts', 'UPDATE documents SET', ['documents']],
        ['server/services/document-lifecycle.ts', 'DELETE FROM document_versions', ['document_versions']],
        ['server/services/document-lifecycle.ts', 'INSERT INTO audit_events', ['audit_events']],
        ['server/services/user-lookup.ts', 'FROM public.users', ['users']],
      ]),
  },
  {
    name: 'RED — a marker with no reason suppresses nothing; a reasoned marker does not reach a query 9 lines below it',
    files: {
      'server/services/marker-misuse.ts': `import { pool } from '../db';
export async function a(id: string) {
  // tenant-isolation-safe:
  return pool.query(\`SELECT program_id FROM vault.documents WHERE id = $1\`, [id]);
}
export async function b(id: number) {
  // tenant-isolation-safe: runs inside withTenantContext; RLS app.current_org_id scopes the row
  const r = await pool.query(\`SELECT name FROM projects WHERE id = $1\`, [id]);
  const name = r.rows[0]?.name;
  const label = String(name ?? '');
  const trimmed = label.trim();
  const upper = trimmed.toUpperCase();
  const tag = upper.slice(0, 8);
  void tag;
  return pool.query(\`SELECT id FROM project_tasks WHERE project_id = $1\`, [id]);
}
`,
    },
    check: (t) =>
      expectFlags(
        t,
        [
          ['server/services/marker-misuse.ts', 'SELECT program_id FROM vault.documents', ['documents']],
          ['server/services/marker-misuse.ts', 'FROM project_tasks', ['project_tasks']],
        ],
        { suppressed: ['server/services/marker-misuse.ts:runs inside withTenantContext; RLS app.current_org_id scopes the row'] },
      ),
  },
  {
    name: 'RED control for the skip rules — only the plain file and the removed phantom server/routes/admin.ts are scanned',
    files: (() => {
      const unscoped = "import { pool } from '../db';\nexport const del = (id: number) => pool.query(`DELETE FROM projects WHERE id = $1`, [id]);\n";
      return {
        'server/services/plain.ts': unscoped,
        'server/routes/admin.ts': unscoped, // the phantom allowlist entry, removed: must be scanned
        'server/routes/auth.ts': unscoped, // exact-path allowlist
        'server/workers/reindex.ts': unscoped, // path-prefix allowlist
        'server/services/__tests__/fixture.ts': unscoped,
        'server/services/retention.test.ts': unscoped,
        'server/services/retention.spec.ts': unscoped,
        // 736ab7c1: a real-database test's fixtures TRUNCATE and seed by design.
        'server/services/project-retention.dbtest.ts':
          "await pool.query(`TRUNCATE projects CASCADE`);\nawait pool.query(`INSERT INTO projects (id, name) VALUES (1, 'x')`);\n",
        'server/_archive/old.ts': unscoped,
        'server/node_modules/pkg/index.js': unscoped,
        'server/dist/server.js': unscoped,
      };
    })(),
    check: (t) =>
      expectFlags(t, [
        ['server/services/plain.ts', 'DELETE FROM projects', ['projects']],
        ['server/routes/admin.ts', 'DELETE FROM projects', ['projects']],
      ]),
  },
  {
    name: 'mode — default (no flag) reports the finding as WARN and exits 0; only --strict and --strict-no-regression fail',
    files: { [SUBMISSION_SERVICE]: DP37_UNSCOPED },
    check: (t) =>
      expectRun(t, [], {
        exit: 0,
        say: ['WARN — 1 candidate violation(s)', SUBMISSION_SERVICE, 'tables=[documents]'],
      }).problems,
  },

  // ── GREEN: near-misses a sloppier gate would flag ─────────────────────────
  {
    name: 'GREEN — DP-37 as fixed: the tenant predicate reaches vault.documents through regulatory_programs',
    files: { [SUBMISSION_SERVICE]: DP37_FIXED },
    check: (t) => expectFlags(t, []),
  },
  {
    name: 'GREEN — project-vault idiom: WHERE ${uploadsWhere} and a fragment built from it (${headsWhere}) carry the predicate',
    files: {
      'server/routes/c2c/project-vault.ts': `import { pool } from '../../db';
export async function listUploads(programId: string, orgId: number) {
  const uploadsWhere = \`d.program_id = $1 AND d.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM regulatory_programs rp
             WHERE rp.id = d.program_id
               AND rp.organization_id = $2
               AND rp.deleted_at IS NULL
          )\`;
  const headsWhere = \`\${uploadsWhere} AND d.superseded_by IS NULL\`;
  const total = await pool.query(\`SELECT COUNT(*)::int AS n FROM vault.documents d WHERE \${uploadsWhere}\`, [programId, orgId]);
  const rows = await pool.query(\`SELECT d.id, d.title FROM vault.documents d WHERE \${headsWhere} ORDER BY d.created_at DESC\`, [programId, orgId]);
  return { total: total.rows[0].n, rows: rows.rows };
}
`,
    },
    check: (t) => expectFlags(t, []),
  },
  {
    name: "GREEN — quoted SQL literals ('active', '') before the tenant filter do not hide it",
    files: {
      'server/services/document-search.ts': `import { pool } from '../db';
export async function active(orgId: number) {
  return pool.query(\`SELECT id, title FROM documents
     WHERE status = 'active' AND title <> '' AND kind IN ('protocol', 'sap')
       AND organization_id = $1\`, [orgId]);
}
export const memberCount = (orgId: number) =>
  pool.query("SELECT COUNT(*) FROM organization_users WHERE role <> 'viewer' AND organization_id = $1", [orgId]);
`,
    },
    check: (t) => expectFlags(t, []),
  },
  {
    name: 'GREEN — (org_id IS NULL OR org_id = $1) is global-or-own, and ($2 IS NULL OR status = $2) is not a tenant escape',
    files: {
      'server/services/knowledge-templates.ts': `import { pool } from '../db';
export async function templates(orgId: number, status: string | null) {
  const shared = await pool.query(\`SELECT id, title FROM knowledge_entries WHERE (org_id IS NULL OR org_id = $1)\`, [orgId]);
  const own = await pool.query(\`SELECT id FROM projects WHERE ($2::text IS NULL OR status = $2) AND organization_id = $1\`, [orgId, status]);
  return { shared: shared.rows, own: own.rows };
}
`,
    },
    check: (t) => expectFlags(t, []),
  },
  {
    name: 'GREEN — SQL inside comments, a table name only as a word, and tables that merely START with a tenant table name',
    files: {
      'server/services/notes.ts': `import { pool } from '../db';
// Old query, kept for the record: SELECT * FROM documents WHERE id = $1
/* Previously: DELETE FROM projects WHERE id = $1 — removed in DP-37's fix. */
/**
 * UPDATE users SET locked = true WHERE id = $1 was the legacy lockout.
 */
export const TABLE = 'documents';
export const msg = 'Updated documents for the organization';
export const staged = () => pool.query(\`SELECT id FROM documents_import_staging WHERE batch_id = $1\`, [1]);
export const types = () => pool.query(\`SELECT code, label FROM public.document_types ORDER BY code\`);
export const tpl = () => pool.query(\`SELECT id FROM project_task_templates WHERE active\`);
`,
    },
    check: (t) => expectFlags(t, []),
  },
  {
    name: 'GREEN — a reasoned // tenant-isolation-safe: marker suppresses its query and is recorded with its reason',
    files: {
      'server/services/vault/vault-rls-reader.ts': `import { pool } from '../../db';
export async function programOf(id: string) {
  // tenant-isolation-safe: runs inside withTenantContext; RLS core.can_access_program scopes vault.documents
  return pool.query(\`SELECT program_id FROM vault.documents WHERE id = $1\`, [id]);
}
`,
    },
    check: (t) => {
      const p = expectFlags(t, [], {
        suppressed: [
          'server/services/vault/vault-rls-reader.ts:runs inside withTenantContext; RLS core.can_access_program scopes vault.documents',
        ],
      });
      p.push(...expectRun(t, ['--strict'], { exit: 0, say: ['1 query(ies) inline-suppressed'] }).problems);
      return p;
    },
  },

  // ── Baseline semantics (--write-baseline / --strict-no-regression) ────────
  {
    name: 'BASELINE — written fingerprint is file#sha12:tables; a baselined finding passes; line drift and reflow do not churn it',
    files: { [SUBMISSION_SERVICE]: DP37_UNSCOPED },
    check: (t) => {
      const p = [];
      p.push(
        ...expectRun(t, ['--write-baseline'], {
          exit: 0,
          say: ['baseline written to docs/reports/tenant-isolation-baseline.json (1 findings)'],
        }).problems,
      );
      const fps = t.readBaseline().fingerprints;
      if (fps.length !== 1 || !/^server\/services\/submission-service\/submission-service\.ts#[0-9a-f]{12}:documents$/.test(fps[0])) {
        p.push(`unexpected baseline fingerprints ${JSON.stringify(fps)}`);
      }
      p.push(
        ...expectRun(t, ['--strict-no-regression'], {
          exit: 0,
          say: ['OK — no new findings above baseline (1 current, 1 baseline)'],
        }).problems,
      );
      // An unrelated edit pushes the query down 8 lines and reflows its whitespace.
      const drifted =
        '// eight lines of unrelated change above the query\n'.repeat(8) +
        DP37_UNSCOPED.replace(
          'sql`SELECT program_id::text AS program_id FROM vault.documents WHERE id',
          'sql`SELECT program_id::text AS program_id\n          FROM vault.documents\n         WHERE id',
        );
      if (drifted === DP37_UNSCOPED) p.push('fixture error: reflow did not apply');
      t.write({ [SUBMISSION_SERVICE]: drifted });
      p.push(
        ...expectRun(t, ['--strict-no-regression'], {
          exit: 0,
          say: ['OK — no new findings above baseline (1 current, 1 baseline)'],
          notSay: ['NEW finding', 'resolved'],
        }).problems,
      );
      return p;
    },
  },
  {
    name: 'BASELINE — editing a baselined unscoped statement makes it NEW (and the old entry reported resolved)',
    files: { [SUBMISSION_SERVICE]: DP37_UNSCOPED },
    check: (t) => {
      const p = expectRun(t, ['--write-baseline'], { exit: 0, say: ['(1 findings)'] }).problems;
      t.write({
        [SUBMISSION_SERVICE]: DP37_UNSCOPED.replace('::uuid`', '::uuid AND deleted_at IS NULL`'),
      });
      const r = expectRun(t, ['--strict-no-regression'], {
        exit: 1,
        say: ['FAIL — 1 NEW finding(s) above baseline of 1', '1 previously-flagged finding(s) resolved'],
      });
      p.push(...r.problems);
      if (newFingerprints(r.out).length !== 1) p.push(`expected 1 NEW fingerprint, got ${JSON.stringify(newFingerprints(r.out))}`);
      return p;
    },
  },
  {
    name: "BASELINE — the same unscoped SQL in a second file is NEW (fingerprints are file-scoped: DP-37's second caller)",
    files: { [SUBMISSION_SERVICE]: DP37_UNSCOPED },
    check: (t) => {
      const p = expectRun(t, ['--write-baseline'], { exit: 0, say: ['(1 findings)'] }).problems;
      t.write({ 'server/services/submission-service/leaf-placement.ts': DP37_UNSCOPED });
      const r = expectRun(t, ['--strict-no-regression'], {
        exit: 1,
        say: ['FAIL — 1 NEW finding(s) above baseline of 1'],
      });
      p.push(...r.problems);
      const fresh = newFingerprints(r.out);
      if (fresh.length !== 1 || !fresh[0].startsWith('server/services/submission-service/leaf-placement.ts#')) {
        p.push(`expected exactly leaf-placement.ts as NEW, got ${JSON.stringify(fresh)}`);
      }
      return p;
    },
  },
  {
    name: 'BASELINE — a fixed (stale) entry is reported as resolved, not fatal; the gate does not fail on over-allowance',
    files: { [SUBMISSION_SERVICE]: DP37_FIXED },
    check: (t) => {
      t.baseline(['server/services/submission-service/submission-service.ts#59f216b0a04a:documents']);
      return expectRun(t, ['--strict-no-regression'], {
        exit: 0,
        say: ['1 previously-flagged finding(s) resolved', 'OK — no new findings above baseline (0 current, 1 baseline)'],
      }).problems;
    },
  },
  {
    name: 'BASELINE — --strict-no-regression with no baseline file fails',
    files: { [SUBMISSION_SERVICE]: DP37_FIXED },
    check: (t) =>
      expectRun(t, ['--strict-no-regression'], { exit: 1, say: ['FAIL — baseline file not found'] }).problems,
  },
  {
    name: 'BASELINE — a legacy file:line:tables entry covers its (file, tables) at any line, and no other table set',
    files: { 'server/services/advancedRAGPipeline.ts': RAG_BASELINED },
    check: (t) => {
      t.baseline(['server/services/advancedRAGPipeline.ts:869:rag_chunks,rag_documents']);
      const p = expectRun(t, ['--strict-no-regression'], {
        exit: 0,
        say: ['OK — no new findings above baseline (1 current, 1 baseline)'],
      }).problems;
      t.write({
        'server/services/advancedRAGPipeline.ts':
          RAG_BASELINED +
          'export const job = (id: number) => pool.query(`SELECT status FROM deep_research_jobs WHERE id = $1`, [id]);\n',
      });
      const r = expectRun(t, ['--strict-no-regression'], {
        exit: 1,
        say: ['FAIL — 1 NEW finding(s) above baseline of 1'],
      });
      p.push(...r.problems);
      const fresh = newFingerprints(r.out);
      if (fresh.length !== 1 || !/^server\/services\/advancedRAGPipeline\.ts#[0-9a-f]{12}:deep_research_jobs$/.test(fresh[0])) {
        p.push(`expected exactly the deep_research_jobs fingerprint as NEW, got ${JSON.stringify(fresh)}`);
      }
      return p;
    },
  },
];

/* ── Run ───────────────────────────────────────────────────────────────────── */

const started = Date.now();
const shown = GATE.startsWith(repoRoot + path.sep) ? path.relative(repoRoot, GATE) : GATE;
console.log(`${TAG} gate under test: ${shown}`);
let failed = 0;
for (const c of cases) {
  let problems;
  const t = tree(c.files ?? {});
  try {
    problems = c.check(t);
  } catch (err) {
    problems = [`threw: ${err?.stack ?? err}`];
  } finally {
    t.cleanup();
  }
  const ok = problems.length === 0;
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name}`);
  for (const line of problems.flatMap((p) => String(p).split('\n'))) console.log(`      ${line}`);
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold (${secs}s).`);
  process.exit(1);
}
console.log(`\n${TAG} ${cases.length} passed — the gate fails on what it exists to catch. (${secs}s)`);
