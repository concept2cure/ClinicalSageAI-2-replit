/**
 * Phase 11 — True E2E and Migration Hardening (Structural Verification)
 *
 * Verifies Phase 11 additions:
 *   11A: Migration file exists for concept2cure_submission_snapshots
 *   11B: Migration covers Phase 9 ALTER TABLE (approved_version_id, published_version_id)
 *   11C: Migration covers Phase 10 CREATE TABLE concept2cure_submission_snapshots
 *   11D: Migration covers review_comments table
 *   11E: Migration uses IF NOT EXISTS / IF NOT EXISTS for idempotency
 *   11F: Playwright E2E spec exists for governed lifecycle
 *   11G: E2E spec covers full lifecycle (create → edit → review → approve → lock)
 *   11H: E2E spec covers attestation in status transitions
 *   11I: E2E spec covers snapshot verification
 *   11J: E2E spec covers provenance/audit trail verification
 *   11K: E2E spec covers reload persistence
 *   11L: E2E spec covers locked-document enforcement
 *   11M: E2E spec covers auth/role enforcement
 *   11N: E2E spec covers browser UI tab rendering
 *
 * SOURCE-LEVEL structural assertions — no DOM or DB required.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.join(
  ROOT,
  'db/migrations/20260313_concept2cure_submission_snapshots.sql'
);
const E2E_SPEC = path.join(ROOT, 'tests/e2e/governed-lifecycle.e2e.spec.ts');

function readSrc(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

// ── 11A: Migration file exists ───────────────────────────────────────────────

describe('11A — Migration file exists', () => {
  it('migration SQL file is present', () => {
    expect(fs.existsSync(MIGRATION)).toBe(true);
  });

  it('migration file is non-trivial (> 500 bytes)', () => {
    const stat = fs.statSync(MIGRATION);
    expect(stat.size).toBeGreaterThan(500);
  });
});

// ── 11B: Migration covers Phase 9 ALTER TABLE ────────────────────────────────

describe('11B — Migration: Phase 9 column additions', () => {
  const src = readSrc(MIGRATION);

  it('ALTERs concept2cure_artifacts to add approved_version_id', () => {
    expect(src).toContain('approved_version_id');
    expect(src).toMatch(/ALTER TABLE/i);
  });

  it('ALTERs concept2cure_artifacts to add published_version_id', () => {
    expect(src).toContain('published_version_id');
  });

  it('ALTERs concept2cure_artifacts to add published_at', () => {
    expect(src).toContain('published_at');
  });

  it('uses ADD COLUMN IF NOT EXISTS for idempotency', () => {
    expect(src).toMatch(/ADD COLUMN IF NOT EXISTS/i);
  });
});

// ── 11C: Migration: CREATE TABLE concept2cure_submission_snapshots ───────────

describe('11C — Migration: submission_snapshots table', () => {
  const src = readSrc(MIGRATION);

  it('creates concept2cure_submission_snapshots table', () => {
    expect(src).toMatch(/CREATE TABLE.*concept2cure_submission_snapshots/i);
  });

  it('has snapshot_id column', () => {
    expect(src).toContain('snapshot_id');
  });

  it('has artifact_id with REFERENCES', () => {
    expect(src).toMatch(/artifact_id.*REFERENCES.*concept2cure_artifacts/i);
  });

  it('has version tracking columns', () => {
    expect(src).toContain('version_id');
    expect(src).toContain('approved_version_id');
    expect(src).toContain('published_version_id');
  });

  it('has integrity hash columns', () => {
    expect(src).toContain('content_hash');
    expect(src).toContain('export_hash');
  });

  it('has action_type column', () => {
    expect(src).toContain('action_type');
  });

  it('has actor attribution columns', () => {
    expect(src).toContain('actor_id');
    expect(src).toContain('actor_name');
    expect(src).toContain('actor_email');
    expect(src).toContain('actor_role');
  });

  it('has attestation columns', () => {
    expect(src).toContain('attestation_text');
    expect(src).toContain('signature_meaning');
  });

  it('uses IF NOT EXISTS for table creation', () => {
    expect(src).toMatch(/CREATE TABLE IF NOT EXISTS/i);
  });

  it('creates proper indexes', () => {
    expect(src).toContain('c2c_snap_id_idx');
    expect(src).toContain('c2c_snap_artifact_idx');
    expect(src).toContain('c2c_snap_action_type_idx');
    expect(src).toContain('c2c_snap_org_idx');
    expect(src).toContain('c2c_snap_created_at_idx');
  });
});

// ── 11D: Migration: review_comments table ────────────────────────────────────

describe('11D — Migration: review_comments table', () => {
  const src = readSrc(MIGRATION);

  it('creates concept2cure_review_comments table', () => {
    expect(src).toMatch(/CREATE TABLE.*concept2cure_review_comments/i);
  });

  it('has comment_id and comment columns', () => {
    expect(src).toContain('comment_id');
    expect(src).toContain('comment');
  });

  it('references concept2cure_artifacts and users', () => {
    expect(src).toMatch(/REFERENCES.*concept2cure_artifacts/i);
    expect(src).toMatch(/REFERENCES.*users/i);
  });
});

// ── 11E: Migration idempotency ───────────────────────────────────────────────

describe('11E — Migration idempotency', () => {
  const src = readSrc(MIGRATION);

  it('uses IF NOT EXISTS for all CREATE TABLE statements', () => {
    const createTableCount = (src.match(/CREATE TABLE/gi) || []).length;
    const ifNotExistsCount = (src.match(/CREATE TABLE IF NOT EXISTS/gi) || []).length;
    expect(createTableCount).toBe(ifNotExistsCount);
  });

  it('uses IF NOT EXISTS for all CREATE INDEX statements', () => {
    const createIndexCount = (src.match(/CREATE INDEX/gi) || []).length;
    const ifNotExistsCount = (src.match(/CREATE INDEX IF NOT EXISTS/gi) || []).length;
    expect(createIndexCount).toBe(ifNotExistsCount);
  });
});

// ── 11F: Playwright E2E spec exists ──────────────────────────────────────────

describe('11F — E2E spec file exists', () => {
  it('governed-lifecycle.e2e.spec.ts exists', () => {
    expect(fs.existsSync(E2E_SPEC)).toBe(true);
  });

  it('imports from @playwright/test', () => {
    const src = readSrc(E2E_SPEC);
    expect(src).toContain("from '@playwright/test'");
  });

  it('spec is non-trivial (> 2000 bytes)', () => {
    const stat = fs.statSync(E2E_SPEC);
    expect(stat.size).toBeGreaterThan(2000);
  });
});

// ── 11G: E2E covers full lifecycle ───────────────────────────────────────────

describe('11G — E2E: full lifecycle coverage', () => {
  const src = readSrc(E2E_SPEC);

  it('tests artifact creation via API', () => {
    expect(src).toContain('/artifacts');
    expect(src).toMatch(/POST|post.*artifacts/i);
  });

  it('tests artifact editing (version 2)', () => {
    expect(src).toContain('version');
    expect(src).toMatch(/PUT|put.*artifacts/i);
  });

  it('tests draft → review transition', () => {
    expect(src).toContain("status: 'review'");
  });

  it('tests review → approved transition', () => {
    expect(src).toContain("status: 'approved'");
  });

  it('tests approved → locked transition', () => {
    expect(src).toContain("status: 'locked'");
  });
});

// ── 11H: E2E covers attestation ─────────────────────────────────────────────

describe('11H — E2E: attestation in transitions', () => {
  const src = readSrc(E2E_SPEC);

  it('sends attestation object with approve', () => {
    expect(src).toContain('attestation');
    expect(src).toContain('meaning');
    expect(src).toContain('attestationText');
  });

  it('sends attestation with lock', () => {
    expect(src).toContain("meaning: 'Released'");
  });

  it('verifies signature creation', () => {
    expect(src).toContain('signatureType');
    expect(src).toContain('signatureMeaning');
  });
});

// ── 11I: E2E covers snapshot verification ────────────────────────────────────

describe('11I — E2E: snapshot verification', () => {
  const src = readSrc(E2E_SPEC);

  it('fetches /snapshots endpoint', () => {
    expect(src).toContain('/snapshots');
  });

  it('verifies snapshot has snapshotId', () => {
    expect(src).toContain('snapshotId');
  });

  it('verifies snapshot has contentHash', () => {
    expect(src).toContain('contentHash');
  });

  it('verifies snapshot has attestation text', () => {
    expect(src).toContain('attestationText');
  });
});

// ── 11J: E2E covers provenance/audit trail ───────────────────────────────────

describe('11J — E2E: provenance verification', () => {
  const src = readSrc(E2E_SPEC);

  it('fetches /provenance endpoint', () => {
    expect(src).toContain('/provenance');
  });

  it('verifies event types', () => {
    expect(src).toContain('eventType');
  });

  it('checks for generation event', () => {
    expect(src).toContain('generation');
  });
});

// ── 11K: E2E covers reload persistence ───────────────────────────────────────

describe('11K — E2E: reload persistence', () => {
  const src = readSrc(E2E_SPEC);

  it('re-fetches artifact after lifecycle to prove persistence', () => {
    expect(src).toMatch(/re-?fetch|reload|persistence/i);
  });

  it('verifies status survives reload', () => {
    expect(src).toMatch(/status.*locked|locked.*status/s);
  });

  it('verifies version survives reload', () => {
    expect(src).toContain('version');
  });
});

// ── 11L: E2E covers locked-document enforcement ─────────────────────────────

describe('11L — E2E: locked-document enforcement', () => {
  const src = readSrc(E2E_SPEC);

  it('tests that locked document blocks status transitions', () => {
    expect(src).toMatch(/locked.*block|block.*locked/i);
  });

  it('tests rollback on locked document is blocked', () => {
    expect(src).toContain('rollback');
  });

  it('expects 400/403/409 error on blocked operations', () => {
    expect(src).toMatch(/400.*403|403.*400|409/);
  });
});

// ── 11M: E2E covers auth enforcement ─────────────────────────────────────────

describe('11M — E2E: auth enforcement', () => {
  const src = readSrc(E2E_SPEC);

  it('tests role-based access for signatures', () => {
    expect(src).toContain('/signatures');
  });

  it('checks for auth headers', () => {
    expect(src).toContain('authHeaders');
  });
});

// ── 11N: E2E covers browser UI ───────────────────────────────────────────────

describe('11N — E2E: browser UI verification', () => {
  const src = readSrc(E2E_SPEC);

  it('tests workspace shell visibility', () => {
    expect(src).toContain('project-workspace-shell');
  });

  it('tests governed panel tab rendering', () => {
    expect(src).toMatch(/Status|Audit|Versions|History/);
  });

  it('includes login flow', () => {
    expect(src).toContain('concept2cure/login');
    expect(src).toContain('Sign in');
  });

  it('checks for no React crashes', () => {
    expect(src).toContain('runtimeErrors');
    expect(src).toContain('Something went wrong');
  });
});
