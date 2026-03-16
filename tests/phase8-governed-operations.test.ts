/**
 * Phase 8 — Governed Document Operations — Structural Validation Tests
 *
 * Verifies that Phase 8 governance edits are in place:
 *   8A: Backend status transition rules — VALID_TRANSITIONS, regression requires reason
 *   8B: GovernedDocumentPanel — tabs, transitions, rationale modal, API calls
 *   8C: Workspace shell wiring — import, state, callback, render of GovernedDocumentPanel
 *   8D: Lock enforcement — isReadOnly passed to editor, unlock requires reason
 *   8E: EditorPanel status change — accepts reason parameter, forward-only overflow menu
 *   8F: Provenance reason field — provenance event and audit log include reason
 *
 * SOURCE-LEVEL structural assertions — no DOM rendering required.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
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

// ── 8A: Backend status transition rules ──────────────────────────────────────

describe('8A — Backend transition rules', () => {
  const src = readSrc(BACKEND);

  it('defines VALID_TRANSITIONS map', () => {
    expect(src).toContain('VALID_TRANSITIONS');
    expect(src).toContain("draft: ['review']");
  });

  it('allows draft → review', () => {
    expect(src).toContain("draft: ['review']");
  });

  it('allows review → approved or draft', () => {
    expect(src).toContain("review: ['approved', 'draft']");
  });

  it('allows approved → locked or review', () => {
    expect(src).toContain("approved: ['locked', 'review']");
  });

  it('allows locked → draft only', () => {
    expect(src).toContain("locked: ['draft']");
  });

  it('defines REGRESSIONS set', () => {
    expect(src).toContain('REGRESSIONS');
  });

  it('requires reason for regression transitions', () => {
    // Backend checks reason length for regression transitions
    expect(src).toContain('reason');
    expect(src).toMatch(/reason.*length|length.*reason/s);
  });

  it('returns 400 for invalid transitions', () => {
    expect(src).toContain('Invalid transition:');
  });
});

// ── 8B: GovernedDocumentPanel component ──────────────────────────────────────

describe('8B — GovernedDocumentPanel component', () => {
  const src = readSrc(GOVERNED_PANEL);

  it('exports GovernedDocumentPanel', () => {
    expect(src).toContain('export function GovernedDocumentPanel');
  });

  it('defines three tabs: Status, Audit, Versions', () => {
    expect(src).toContain("'status'");
    expect(src).toContain("'audit'");
    expect(src).toContain("'versions'");
  });

  it('defines VALID_TRANSITIONS for frontend enforcement', () => {
    expect(src).toContain('VALID_TRANSITIONS');
  });

  it('defines STATUS_LABELS with D/R/A/L', () => {
    expect(src).toContain('STATUS_LABELS');
    expect(src).toContain('Draft');
    expect(src).toContain('In Review');
    expect(src).toContain('Approved');
    expect(src).toContain('Locked');
  });

  it('renders transition buttons for valid next states', () => {
    expect(src).toContain('TRANSITION_LABELS');
  });

  it('detects regression transitions with isRegression()', () => {
    expect(src).toContain('isRegression');
  });

  it('shows rationale modal for regressions', () => {
    expect(src).toContain('rationaleTarget');
    expect(src).toContain('rationale');
  });

  it('enforces minimum 5 char rationale', () => {
    expect(src).toContain('rationale.trim().length < 5');
    expect(src).toContain('disabled={rationale.trim().length < 5');
  });

  it('calls PUT /status API', () => {
    expect(src).toContain('/status');
    expect(src).toContain("method: 'PUT'");
  });

  it('calls GET /provenance API', () => {
    expect(src).toContain('/provenance');
  });

  it('calls GET /versions API', () => {
    expect(src).toContain('/versions');
  });

  it('supports rollback via POST /rollback', () => {
    expect(src).toContain('/rollback');
    expect(src).toContain("method: 'POST'");
  });

  it('renders EventIcon with type-specific icons', () => {
    expect(src).toContain('EventIcon');
  });

  it('displays content hash for integrity', () => {
    expect(src).toContain('contentHash');
  });
});

// ── 8C: Workspace shell wiring ──────────────────────────────────────────────

describe('8C — WorkspaceShell ↔ GovernedDocumentPanel wiring', () => {
  const src = readSrc(SHELL);

  it('imports GovernedDocumentPanel', () => {
    expect(src).toContain("from './GovernedDocumentPanel'");
  });

  it('manages showGovernedPanel state', () => {
    expect(src).toContain('showGovernedPanel');
    expect(src).toContain('setShowGovernedPanel');
  });

  it('defines handleGovernedStatusChange callback', () => {
    expect(src).toContain('handleGovernedStatusChange');
  });

  it('opens governed panel on document selection', () => {
    // handleSelectDoc sets showGovernedPanel(true)
    expect(src).toContain('setShowGovernedPanel(true)');
  });

  it('renders GovernedDocumentPanel with artifact prop', () => {
    expect(src).toContain('artifact={activeArtifact}');
  });

  it('passes onStatusChange to GovernedDocumentPanel', () => {
    expect(src).toContain('onStatusChange={handleGovernedStatusChange}');
  });

  it('renders GovernedDocumentPanel alongside SectionRequirementsPanel (mutually exclusive)', () => {
    expect(src).toContain('showGovernedPanel');
    expect(src).toContain('SectionRequirementsPanel');
  });
});

// ── 8D: Lock enforcement ────────────────────────────────────────────────────

describe('8D — Lock enforcement in editor', () => {
  const src = readSrc(EDITOR_PANEL);

  it('passes isReadOnly when document is locked', () => {
    expect(src).toContain("isReadOnly={activeArtifact?.status === 'locked'}");
  });

  it('shows lock overlay with reason input', () => {
    expect(src).toContain('unlockReason');
    expect(src).toContain('Reason for unlocking');
  });

  it('requires minimum 5 chars for unlock reason', () => {
    expect(src).toContain('unlockReason.trim().length < 5');
  });

  it('passes unlock reason to handleStatusChange', () => {
    expect(src).toContain("handleStatusChange('draft', unlockReason.trim())");
  });

  it('shows lock overlay when status is locked', () => {
    expect(src).toContain("activeArtifact?.status === 'locked'");
    expect(src).toContain('Document Locked');
  });
});

// ── 8E: EditorPanel status handling ─────────────────────────────────────────

describe('8E — EditorPanel status change with reason', () => {
  const src = readSrc(EDITOR_PANEL);

  it('handleStatusChange accepts optional reason parameter', () => {
    expect(src).toContain('async (newStatus: string, reason?: string)');
  });

  it('sends reason in status change request body', () => {
    expect(src).toContain('if (reason) body.reason = reason');
  });

  it('overflow menu only shows forward transitions (no unlock)', () => {
    // Overflow menu is gated: only rendered when NOT locked
    expect(src).toContain("activeArtifact?.status !== 'locked'");
    expect(src).toContain('forward transitions only');
  });

  it('overflow menu shows Submit for Review / Approve / Lock', () => {
    expect(src).toContain('Submit for Review');
    expect(src).toContain('Approve');
    expect(src).toContain("'Lock'");
  });
});

// ── 8F: Provenance + audit log include reason ───────────────────────────────

describe('8F — Provenance reason field', () => {
  const src = readSrc(BACKEND);

  it('provenance event details include reason', () => {
    // The emitProvenanceEvent call includes reason in details
    expect(src).toMatch(/reason:\s*reason\s*\|\|\s*null/);
  });

  it('audit log entry includes reason', () => {
    // logAuditEntry includes reason
    expect(src).toContain('logAuditEntry');
    // The audit entry details include reason field
    const auditReasonCount = (src.match(/reason:\s*reason/g) || []).length;
    expect(auditReasonCount).toBeGreaterThanOrEqual(2); // provenance + audit
  });
});
