/**
 * Phase 10 — Runtime Proof, E-Sign, and Submission Snapshot
 *
 * Verifies Phase 10 additions:
 *   10A: Schema — concept2cureSubmissionSnapshots table definition
 *   10B: Backend — attestation validation on approve/lock
 *   10C: Backend — signature creation on approve/lock transitions
 *   10D: Backend — snapshot creation on lock
 *   10E: Backend — GET /snapshots endpoint
 *   10F: Backend — export role check (viewer = 403)
 *   10G: Backend — signature role check (POST /signatures)
 *
 * 10H–10K (frontend) were REMOVED on 2026-09-10 — see the note where they used
 * to be, at the foot of this file. Backend coverage 10A–10G is unchanged.
 *
 * SOURCE-LEVEL structural assertions — no DOM rendering required.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SCHEMA = path.join(ROOT, 'shared/schema.ts');
const BACKEND = path.join(ROOT, 'server/routes/concept2cure.ts');
// The export family (download included) moved to its own router (L53, slice 7).
const EXPORTS = path.join(ROOT, 'server/routes/c2c/exports.ts');
// The artifact domain (status, signatures, snapshots) moved to its own router (L53, slice 8).
const ARTIFACTS = path.join(ROOT, 'server/routes/c2c/artifacts.ts');
// GovernedDocumentPanel.tsx was removed with the disconnected legacy island in
// the design-system port (CLAUDE.md), taking 10H–10K with it. The backend
// governance wiring (10A–10G) stays fully covered.

function readSrc(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

// ── 10A: Schema — concept2cureSubmissionSnapshots table ──────────────────────

describe('10A — Schema: concept2cureSubmissionSnapshots table', () => {
  const src = readSrc(SCHEMA);

  it('defines concept2cureSubmissionSnapshots table', () => {
    expect(src).toContain('concept2cureSubmissionSnapshots');
    expect(src).toContain("'concept2cure_submission_snapshots'");
  });

  it('has snapshotId column with unique constraint', () => {
    expect(src).toContain('snapshot_id');
    expect(src).toMatch(/snapshotId.*text.*unique|snapshotId.*notNull.*unique/);
  });

  it('has artifactId column', () => {
    expect(src).toContain('artifact_id');
  });

  it('has actionType column with enum-like definition', () => {
    expect(src).toContain('action_type');
    expect(src).toContain('actionType');
  });

  it('has contentHash and exportHash columns', () => {
    expect(src).toContain('content_hash');
    expect(src).toContain('export_hash');
  });

  it('has attestationText and signatureMeaning columns', () => {
    expect(src).toMatch(
      /attestation_text.*concept2cureSubmissionSnapshots|concept2cureSubmissionSnapshots.*attestation_text/s
    );
    expect(src).toMatch(
      /signature_meaning.*concept2cureSubmissionSnapshots|concept2cureSubmissionSnapshots.*signature_meaning/s
    );
  });

  it('has actor attribution columns', () => {
    expect(src).toContain('actor_id');
    expect(src).toContain('actor_name');
    expect(src).toContain('actor_email');
    expect(src).toContain('actor_role');
  });

  it('has versionId, approvedVersionId, publishedVersionId columns', () => {
    // These should appear in the snapshots table definition context
    const snapshotsSection = src.slice(src.indexOf("'concept2cure_submission_snapshots'"));
    expect(snapshotsSection).toContain('version_id');
    expect(snapshotsSection).toContain('approved_version_id');
    expect(snapshotsSection).toContain('published_version_id');
  });

  it('exports insert schema and types', () => {
    expect(src).toContain('insertConcept2cureSubmissionSnapshotSchema');
    expect(src).toContain('Concept2cureSubmissionSnapshot');
    expect(src).toContain('InsertConcept2cureSubmissionSnapshot');
  });

  it('has indexes on key columns', () => {
    const snapshotsSection = src.slice(src.indexOf("'concept2cure_submission_snapshots'"));
    expect(snapshotsSection).toContain('c2c_snap_id_idx');
    expect(snapshotsSection).toContain('c2c_snap_artifact_idx');
  });
});

// ── 10B: Backend — attestation validation on approve/lock ────────────────────

describe('10B — Backend: attestation validation', () => {
  const src = readSrc(ARTIFACTS);

  it('extracts attestation from request body', () => {
    // Destructured: const { status, reason, attestation } = req.body;
    expect(src).toMatch(/\{.*attestation.*\}.*=.*req\.body/s);
  });

  it('returns 400 when approve/lock lacks attestation', () => {
    // Should check for attestation requirement and return 400
    expect(src).toMatch(/attestation.*required|meaning.*attestationText.*required/i);
    expect(src).toContain('400');
  });

  it('validates attestation has meaning and attestationText', () => {
    expect(src).toMatch(/attestation\.meaning/);
    expect(src).toMatch(/attestation\.attestationText/);
  });
});

// ── 10C: Backend — signature creation on approve/lock ────────────────────────

describe('10C — Backend: signature creation on approve/lock', () => {
  const src = readSrc(ARTIFACTS);

  it('creates signature record on approve/lock transitions', () => {
    // The status PUT handler should insert into concept2cureSignatures
    expect(src).toMatch(/concept2cureSignatures.*insert|insert.*concept2cureSignatures/s);
  });

  it('uses signatureType approval or publish', () => {
    // Ternary: signatureType: status === 'approved' ? 'approval' : 'publish'
    expect(src).toMatch(/signatureType.*'approval'.*'publish'/);
  });

  it('computes SHA-256 signatureHash', () => {
    expect(src).toContain('sha256');
    expect(src).toContain('signatureHash');
  });

  it('includes signatureManifest with attestation details', () => {
    expect(src).toContain('signatureManifest');
    expect(src).toContain('attestationText');
  });
});

// ── 10D: Backend — snapshot creation on lock ─────────────────────────────────

describe('10D — Backend: snapshot creation on lock/publish', () => {
  const src = readSrc(ARTIFACTS);

  it('inserts into concept2cureSubmissionSnapshots on lock', () => {
    expect(src).toMatch(
      /concept2cureSubmissionSnapshots.*insert|insert.*concept2cureSubmissionSnapshots/s
    );
  });

  it('creates snapshot with actionType', () => {
    expect(src).toContain('actionType');
  });

  it('includes attestation data in snapshot', () => {
    expect(src).toContain('attestationText');
    expect(src).toContain('signatureMeaning');
  });

  it('links snapshot to signature via metadata', () => {
    expect(src).toContain('signatureId');
  });
});

// ── 10E: Backend — GET /snapshots endpoint ───────────────────────────────────

describe('10E — Backend: GET /snapshots endpoint', () => {
  const src = readSrc(ARTIFACTS);

  it('defines GET route for snapshots', () => {
    expect(src).toMatch(/get.*artifacts.*snapshots|snapshots.*get/i);
  });

  it('queries concept2cureSubmissionSnapshots table', () => {
    expect(src).toContain('concept2cureSubmissionSnapshots');
  });

  it('orders results by createdAt', () => {
    expect(src).toMatch(/createdAt|created_at/);
  });

  it('returns snapshot fields in response', () => {
    expect(src).toContain('snapshotId');
    expect(src).toContain('actionType');
  });
});

// ── 10F: Backend — export role check ─────────────────────────────────────────

describe('10F — Backend: export role check on download', () => {
  const src = readSrc(EXPORTS);

  it('checks role on document download', () => {
    // Download handler should check user role
    expect(src).toMatch(/download.*role|role.*download/is);
  });

  it('returns 403 for unauthorized export roles', () => {
    expect(src).toContain('403');
  });
});

// ── 10G: Backend — signature role check ──────────────────────────────────────

describe('10G — Backend: signature role check', () => {
  const src = readSrc(ARTIFACTS);

  it('restricts signature creation to authorized roles', () => {
    // POST signatures should check for admin/approver/reviewer
    expect(src).toMatch(
      /signatures.*admin.*approver.*reviewer|admin.*approver.*reviewer.*signatures/s
    );
  });

  it('returns 403 for unauthorized signature roles', () => {
    // Should have a 403 response for unauthorized signing attempts
    expect(src).toMatch(/403.*sign|sign.*403/is);
  });
});

// ── 10H–10K: Frontend — REMOVED 2026-09-10 (WO-8), not skipped ───────────────
//
// Four `describe.skip` blocks used to sit here: SnapshotsTab, the attestation
// modal, AuditTab attestation rendering, and fetchData-includes-snapshots. Each
// opened with `const src = '';` and a comment saying GovernedDocumentPanel.tsx
// had been removed in the design-system port.
//
// They were deleted rather than left skipped because they could never be
// un-skipped. Every assertion ran `expect(src).toContain(...)` against a
// hardcoded empty string, so un-skipping them fails every assertion at once and
// reveals nothing about the product; the component they described is gone
// (`find client server -name '*GovernedDocumentPanel*'` returns nothing). A
// skipped block that cannot be un-skipped is not pending work — it is dead code
// shaped like pending work, and it inflated the apparent test surface for
// exactly the Part 11 e-signature UI a reader would most want covered.
//
// What is NOT lost: the backend governance wiring, 10A–10G above, still runs —
// attestation validation on approve/lock, signature creation on transitions,
// snapshot creation on lock, the snapshots endpoint, and both role checks.
// That is where the Part 11 obligations are enforced.
//
// When the Phase 3 workbench reintroduces an attestation surface, write these
// against the file that then exists. Recreating the assertions from this
// deleted block would pin the new UI to the shape of a component nobody chose.
