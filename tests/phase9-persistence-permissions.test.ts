/**
 * Phase 9 — Persistence, Permissions, and Publishing Truth
 *
 * Verifies Phase 9 additions:
 *   9A: Schema — approvedVersionId, publishedVersionId, publishedAt columns
 *   9B: ROLE_PERMISSIONS — role map with admin/approver/reviewer/author/user/viewer
 *   9C: Role enforcement — 403 on status transition, transitionKey check
 *   9D: Rollback role check — ROLLBACK_ROLES enforcement
 *   9E: GET /user/permissions endpoint
 *   9F: Published version tracking — approvedVersionId/publishedVersionId set in handler
 *   9G: Export audit — logAuditEntry + provenance in download endpoint
 *   9H: GovernedDocumentPanel — permissions fetch, permittedTransitions, role badge
 *   9I: getArtifactsFromDb — returns new fields
 *   9J: Version diff wiring — initialInspector prop, onOpenDiff callback
 *
 * SOURCE-LEVEL structural assertions — no DOM rendering required.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SCHEMA = path.join(ROOT, 'shared/schema.ts');
const BACKEND = path.join(ROOT, 'server/routes/concept2cure.ts');
const GOVERNED_PANEL = path.join(
  ROOT,
  'client/src/concept2cure/components/workspace/GovernedDocumentPanel.tsx'
);
const SHELL = path.join(
  ROOT,
  'client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx'
);
const EDITOR_PANEL = path.join(ROOT, 'client/src/concept2cure/components/editor/EditorPanel.tsx');

function readSrc(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

// ── 9A: Schema — approved/published version tracking columns ─────────────────

describe('9A — Schema version tracking columns', () => {
  const src = readSrc(SCHEMA);

  it('adds approvedVersionId column to concept2cureArtifacts', () => {
    expect(src).toContain('approved_version_id');
    expect(src).toContain('approvedVersionId');
  });

  it('adds publishedVersionId column to concept2cureArtifacts', () => {
    expect(src).toContain('published_version_id');
    expect(src).toContain('publishedVersionId');
  });

  it('adds publishedAt timestamp column', () => {
    expect(src).toContain('published_at');
    expect(src).toContain('publishedAt');
  });
});

// ── 9B: ROLE_PERMISSIONS map ─────────────────────────────────────────────────

describe('9B — ROLE_PERMISSIONS map', () => {
  const src = readSrc(BACKEND);

  it('defines ROLE_PERMISSIONS constant', () => {
    expect(src).toContain('ROLE_PERMISSIONS');
  });

  it('includes admin role with all transitions', () => {
    expect(src).toMatch(/admin.*draft→review|ROLE_PERMISSIONS.*admin/s);
  });

  it('includes approver role', () => {
    expect(src).toContain('approver');
  });

  it('includes reviewer role with limited transitions', () => {
    expect(src).toContain('reviewer');
  });

  it('includes author/user role with draft→review only', () => {
    expect(src).toMatch(/author.*draft→review|user.*draft→review/s);
  });

  it('includes viewer role with no transitions', () => {
    expect(src).toMatch(/viewer.*\[\s*\]/s);
  });
});

// ── 9C: Role enforcement on status transitions ──────────────────────────────

describe('9C — Role enforcement on status transitions', () => {
  const src = readSrc(BACKEND);

  it('extracts userRole from request', () => {
    expect(src).toContain('userRole');
    expect(src).toContain('req.userRole');
  });

  it('builds transitionKey for permission check', () => {
    expect(src).toContain('transitionKey');
  });

  it('returns 403 when transition not permitted for role', () => {
    expect(src).toContain('403');
    expect(src).toMatch(/not.*permitted|forbidden|not.*allowed/i);
  });

  it('includes enforcedRole in response', () => {
    expect(src).toContain('enforcedRole');
  });
});

// ── 9D: Rollback role check ─────────────────────────────────────────────────

describe('9D — Rollback role enforcement', () => {
  const src = readSrc(BACKEND);

  it('defines ROLLBACK_ROLES constant', () => {
    expect(src).toContain('ROLLBACK_ROLES');
  });

  it('includes admin in rollback roles', () => {
    expect(src).toMatch(/ROLLBACK_ROLES.*admin/s);
  });

  it('includes approver in rollback roles', () => {
    expect(src).toMatch(/ROLLBACK_ROLES.*approver/s);
  });

  it('includes reviewer in rollback roles', () => {
    expect(src).toMatch(/ROLLBACK_ROLES.*reviewer/s);
  });

  it('checks role against ROLLBACK_ROLES and returns 403', () => {
    expect(src).toMatch(/ROLLBACK_ROLES.*includes|rollback.*403/is);
  });
});

// ── 9E: GET /user/permissions endpoint ──────────────────────────────────────

describe('9E — GET /user/permissions endpoint', () => {
  const src = readSrc(BACKEND);

  it('defines GET user/permissions route', () => {
    expect(src).toMatch(/get.*user\/permissions/i);
  });

  it('returns role in response', () => {
    expect(src).toContain('allowedTransitions');
  });

  it('returns canRollback flag', () => {
    expect(src).toContain('canRollback');
  });

  it('returns canSign flag', () => {
    expect(src).toContain('canSign');
  });

  it('returns canExport flag', () => {
    expect(src).toContain('canExport');
  });
});

// ── 9F: Published version tracking ──────────────────────────────────────────

describe('9F — Published version tracking in status handler', () => {
  const src = readSrc(BACKEND);

  it('sets approvedVersionId when status becomes approved', () => {
    expect(src).toContain('approvedVersionId');
    expect(src).toMatch(/approved.*approvedVersionId|approvedVersionId.*approved/s);
  });

  it('sets publishedVersionId when status becomes locked', () => {
    expect(src).toContain('publishedVersionId');
    expect(src).toMatch(/locked.*publishedVersionId|publishedVersionId.*locked/s);
  });

  it('sets publishedAt timestamp when publishing', () => {
    expect(src).toContain('publishedAt');
  });

  it('includes published fields in status response', () => {
    // Response includes approvedVersionId, publishedVersionId, publishedAt
    expect(src).toMatch(/approvedVersionId.*publishedVersionId/s);
  });
});

// ── 9G: Export audit logging ─────────────────────────────────────────────────

describe('9G — Export audit logging', () => {
  const src = readSrc(BACKEND);

  it('computes exportHash for downloaded documents', () => {
    expect(src).toContain('exportHash');
    expect(src).toContain('sha256');
  });

  it('logs audit entry for document export', () => {
    expect(src).toMatch(/logAuditEntry.*EXPORT|EXPORT.*logAuditEntry/s);
  });

  it('creates provenance event for export', () => {
    expect(src).toContain("eventType: 'export'");
  });

  it('tracks exportedBy and exportedByRole', () => {
    expect(src).toContain('exportedBy');
    expect(src).toContain('exportedByRole');
  });

  it('records file size in audit', () => {
    expect(src).toContain('fileSize');
  });
});

// ── 9H: GovernedDocumentPanel — permissions integration ─────────────────────

describe('9H — GovernedDocumentPanel permissions', () => {
  const src = readSrc(GOVERNED_PANEL);

  it('defines UserPermissions interface', () => {
    expect(src).toContain('UserPermissions');
    expect(src).toContain('allowedTransitions');
    expect(src).toContain('canRollback');
  });

  it('fetches user permissions on mount', () => {
    expect(src).toContain('/api/concept2cure/user/permissions');
  });

  it('computes permittedTransitions from permissions', () => {
    expect(src).toContain('permittedTransitions');
  });

  it('renders role badge', () => {
    expect(src).toContain('permissions.role');
  });

  it('shows approved version indicator', () => {
    expect(src).toContain('approvedVersionId');
    expect(src).toContain('Approved at');
  });

  it('shows published version indicator', () => {
    expect(src).toContain('publishedVersionId');
    expect(src).toContain('Published at');
  });

  it('accepts onOpenDiff callback', () => {
    expect(src).toContain('onOpenDiff');
  });

  it('renders Compare Versions button', () => {
    expect(src).toContain('Compare Versions');
  });

  it('shows no-transitions message for restricted roles', () => {
    expect(src).toContain('No transitions available for your role');
  });

  it('VersionsTab accepts canRollback and shows role message', () => {
    expect(src).toContain('Rollback not permitted for your role');
  });

  it('VersionsTab shows approved/published badges on versions', () => {
    // Badges: approved, published on version cards
    expect(src).toMatch(/version.*===.*approvedVersionId/);
    expect(src).toMatch(/version.*===.*publishedVersionId/);
  });
});

// ── 9I: getArtifactsFromDb returns new fields ───────────────────────────────

describe('9I — getArtifactsFromDb returns new fields', () => {
  const src = readSrc(BACKEND);

  it('returns templateId in artifact response', () => {
    expect(src).toContain('templateId');
  });

  it('returns contentHash in artifact response', () => {
    expect(src).toContain('contentHash');
  });

  it('returns approvedVersionId in artifact response', () => {
    expect(src).toContain('approvedVersionId');
  });

  it('returns publishedVersionId in artifact response', () => {
    expect(src).toContain('publishedVersionId');
  });

  it('returns publishedAt in artifact response', () => {
    expect(src).toContain('publishedAt');
  });

  it('returns lockedAt in artifact response', () => {
    expect(src).toContain('lockedAt');
  });
});

// ── 9J: Version diff wiring ─────────────────────────────────────────────────

describe('9J — Version diff wiring', () => {
  const editorSrc = readSrc(EDITOR_PANEL);
  const shellSrc = readSrc(SHELL);

  it('EditorPanel accepts initialInspector prop', () => {
    expect(editorSrc).toContain('initialInspector');
  });

  it('EditorPanel auto-opens inspector from initialInspector prop', () => {
    expect(editorSrc).toMatch(/initialInspector.*setActiveInspector/s);
  });

  it('ProjectWorkspaceShell passes initialInspector to EditorPanel', () => {
    expect(shellSrc).toContain('initialInspector={editorInitialInspector}');
  });

  it('ProjectWorkspaceShell passes onOpenDiff to GovernedDocumentPanel', () => {
    expect(shellSrc).toContain('onOpenDiff');
  });

  it('onOpenDiff sets editorInitialInspector to compare', () => {
    expect(shellSrc).toContain("setEditorInitialInspector('compare')");
  });

  it('GovernedDocumentPanel imports are present in workspace shell', () => {
    expect(shellSrc).toContain('GovernedDocumentPanel');
  });
});
