/**
 * The governed-action ledger's `command` vocabulary must be widened on every
 * database this set builds.
 *
 * `migrations/20260527_mutation_primitives.sql` creates `c2c_ana_actions` with a
 * CHECK enumerating twelve universal mutations. `recordGovernedAction` has since
 * been adopted platform-wide with a free `command: string` — 'create', 'update',
 * 'review', 'approve', 'reaffirm', 'transmittal_rollback', 'apply-sample-size',
 * 'task.create' and more. Every such INSERT raises 23514 and rolls back the
 * WHOLE governed transaction, so the domain mutation fails AND no audit row is
 * written.
 *
 * `db/migrations/20260730_c2c_ana_actions_command_vocab.sql` replaces that
 * allow-list with a length bound. It was written on 2026-07-30 and left OUT of
 * C2C_MIGRATION_FILES, so it ran on no applier and no gate noticed:
 * ci:migration-reachability asks whether a TABLE the server queries is created
 * by something an applier runs, and this migration creates no table — it
 * replaces a constraint. Measured 2026-09-08 against a database with the whole
 * set applied: the narrow CHECK was still in force and
 * POST /api/biostat-bridge/designs/:id/apply-sample-size answered 500 (23514).
 *
 * This pins the two things that were wrong: the file is on the applier, and it
 * runs AFTER the file that creates the constraint (CLAUDE.md RULE 1 — the set
 * replays in order, so a widening ordered before its creator is reverted on
 * every deploy).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const CREATOR = 'migrations/20260527_mutation_primitives.sql';
const WIDENER = 'db/migrations/20260730_c2c_ana_actions_command_vocab.sql';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

/**
 * The same failure shape, found by the same audit on 2026-09-08: a fix written,
 * merged, and left off every applier, so the schema never gained what the code
 * reads. Each was proven against a database built by scripts/db/install-fresh.mjs
 * plus the whole migration set — the closest thing to a deployed schema this
 * repository can build.
 */
describe.each([
  {
    file: 'db/migrations/20260617_audit_events_hmac_seal.sql',
    what: 'audit_events.hmac_seal',
    // SELECT … hmac_seal FROM audit_events (21 CFR Part 11 §11.70 seal verification)
    reader: ['server/services/audit/chain.ts', /hmac_seal\s*\n?\s*FROM audit_events/],
  },
  {
    file: 'db/migrations/20260905_gdpr_dsar_execution_evidence.sql',
    what: 'gdpr_data_subject_requests.execution_evidence',
    // UPDATE gdpr_data_subject_requests SET … execution_evidence = $2
    reader: ['server/services/compliance/gdprComplianceService.ts', /execution_evidence = \$\d/],
  },
])('$what is on the applier', ({ file, reader }) => {
  it('the migration that adds it is in C2C_MIGRATION_FILES', () => {
    expect(C2C_MIGRATION_FILES, `${file} runs on no database unless it is in the set`).toContain(file);
  });

  it('the server reads the column, so an absent one is a live failure, not a latent one', () => {
    const [path, pattern] = reader as [string, RegExp];
    expect(read(path)).toMatch(pattern);
  });

  it('is guarded and idempotent, because the set replays every entry on every deploy', () => {
    const sql = read(file);
    expect(sql).toMatch(/to_regclass|information_schema/);
    expect(sql).toMatch(/IF NOT EXISTS|IF EXISTS/);
  });
});

describe('c2c_ana_actions command vocabulary', () => {
  it('the widening migration is on the applier', () => {
    expect(C2C_MIGRATION_FILES, `${WIDENER} runs on no database unless it is in the set`).toContain(WIDENER);
  });

  it('runs after the migration that creates the narrow CHECK, so the replay order is create-then-widen', () => {
    const creator = C2C_MIGRATION_FILES.indexOf(CREATOR);
    const widener = C2C_MIGRATION_FILES.indexOf(WIDENER);
    expect(creator).toBeGreaterThanOrEqual(0);
    expect(widener).toBeGreaterThan(creator);
  });

  it('both files are replay-safe, because every entry of the set runs on every deploy', () => {
    expect(read(CREATOR)).toMatch(/CREATE TABLE IF NOT EXISTS c2c_ana_actions/);
    const w = read(WIDENER);
    expect(w).toMatch(/DROP CONSTRAINT IF EXISTS c2c_ana_actions_command_check/);
    expect(w).toMatch(/c2c_ana_actions_command_bounds/);
  });

  it('the widening is load-bearing: commands the server writes are outside the original allow-list', () => {
    // The allow-list is read from the creating migration rather than restated,
    // so this stays true if that list is ever edited.
    const allowed = new Set(
      (read(CREATOR).match(/CHECK \(command IN \(([^)]*)\)/s)?.[1] ?? '')
        .split(',')
        .map((s) => s.trim().replace(/^'|'$/g, ''))
        .filter(Boolean),
    );
    expect(allowed.size).toBeGreaterThan(0);
    // Two the biostatistics bridge writes; both would raise 23514 under the allow-list.
    for (const command of ['apply-sample-size', 'task.create']) {
      expect(allowed.has(command), `${command} is not in the original allow-list`).toBe(false);
    }
    const bridge = read('server/services/biostatistics-bridge/bridge-service.ts');
    expect(bridge).toMatch(/command: 'apply-sample-size'/);
    expect(bridge).toMatch(/command: 'task\.create'/);
  });
});
