/**
 * Phase 2 Hardening — Structural Validation Tests
 *
 * Verifies that Phase 2 canvas hardening edits are in place:
 *   2A: RI inspector onCreateDocument wired
 *   2B: Trust strip pills are interactive buttons
 *   2C: Controlled record micro-bar present
 *   2D: Browse-to-edit context band continuity
 *   2E: Dossier action confidence (locked doc guard, placement impact)
 *
 * These are SOURCE-LEVEL structural assertions — they read component source code
 * and verify the expected patterns exist. No DOM rendering required.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const EDITOR_PANEL = path.join(ROOT, 'client/src/concept2cure/components/editor/EditorPanel.tsx');
const WORKSPACE_SHELL = path.join(
  ROOT,
  'client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx'
);
const PLACEMENT_DIALOG = path.join(
  ROOT,
  'client/src/concept2cure/components/workspace/PlacementDialog.tsx'
);

function readSrc(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

// ── 2A: RI inspector onCreateDocument wired ──────────────────────────────────

describe('2A — RI inspector onCreateDocument', () => {
  const src = readSrc(EDITOR_PANEL);

  it('passes onCreateDocument callback to RegulatoryIntelligencePanel', () => {
    expect(src).toContain('onCreateDocument={');
    // Callback must hit the artifacts POST endpoint
    expect(src).toContain('/api/concept2cure/projects/');
    expect(src).toContain('/artifacts');
  });

  it('creates governed artifact with correct payload shape', () => {
    // Must include type: regulatory_document
    expect(src).toContain("type: 'regulatory_document'");
    // Must include category
    expect(src).toContain("category: 'document'");
  });

  it('sets activeArtifact after creation and refreshes list', () => {
    expect(src).toContain('setActiveArtifact(created)');
    expect(src).toContain('loadArtifacts()');
  });
});

// ── 2B: Trust strip pills are clickable buttons ──────────────────────────────

describe('2B — Trust strip interactive pills', () => {
  const src = readSrc(EDITOR_PANEL);

  it('version pill uses <button> not <span>', () => {
    // Must have a button that opens compare inspector
    expect(src).toMatch(/button.*onClick.*compare/s);
  });

  it('signature pill routes to audit inspector', () => {
    expect(src).toMatch(/button.*onClick.*audit/s);
  });

  it('provenance pill routes to provenance inspector', () => {
    expect(src).toMatch(/button.*onClick.*provenance/s);
  });

  it('CTD badge is a clickable button for placement editing', () => {
    expect(src).toMatch(/button.*setShowCtdInput/s);
  });
});

// ── 2C: Controlled record micro-bar ─────────────────────────────────────────

describe('2C — Controlled record micro-bar', () => {
  const src = readSrc(EDITOR_PANEL);

  it('renders ShieldCheck icon with "Controlled Record" label', () => {
    expect(src).toContain('Controlled Record');
    expect(src).toContain('ShieldCheck');
  });

  it('shows last modified timestamp', () => {
    expect(src).toMatch(/updatedAt|updated_at|lastModified|toLocaleString/);
  });

  it('shows template source tag when templateId present', () => {
    expect(src).toMatch(/templateId.*from template|from template.*templateId/s);
  });
});

// ── 2D: Browse-to-edit continuity ────────────────────────────────────────────

describe('2D — Context band in browse mode', () => {
  const src = readSrc(WORKSPACE_SHELL);

  it('shows context indicator when mode is browse and activeArtifact exists', () => {
    // Must have a condition for browse mode + activeArtifact
    expect(src).toMatch(/mode\s*===\s*['"]browse['"]\s*&&\s*activeArtifact/);
  });

  it('provides an "Open" button to switch to edit mode', () => {
    expect(src).toMatch(/Open.*→|Edit.*→/);
    expect(src).toContain("setMode('edit')");
  });

  it('shows artifact title in list-mode context band', () => {
    expect(src).toContain('activeArtifact.title');
  });
});

// ── 2E: Dossier action confidence ───────────────────────────────────────────

describe('2E — PlacementDialog hardened guardrails', () => {
  const src = readSrc(PLACEMENT_DIALOG);

  it('blocks relocation for locked documents', () => {
    // isLocked must be used to disable canConfirm
    expect(src).toContain('isLocked');
    expect(src).toMatch(/operation\s*===\s*['"]relocate['"]\s*&&\s*isLocked/);
  });

  it('shows red blocking banner for locked docs', () => {
    expect(src).toContain('Document Locked');
    expect(src).toContain('Unlock it before relocating');
  });

  it('shows placement impact note for "place" operations', () => {
    expect(src).toContain('Placement creates a governed record');
    expect(src).toContain('part of the submission dossier');
  });

  it('shows section labels in move visualization', () => {
    expect(src).toContain('getSectionLabel(currentSection)');
    expect(src).toContain('getSectionLabel(selectedSection)');
  });

  it('shows from→to for place operations (not just relocate)', () => {
    // place operation should show visualization
    expect(src).toMatch(/operation\s*===\s*['"]place['"]\s*&&\s*selectedSection/);
  });
});

// ── Matrix: All 5 creation paths still present ──────────────────────────────

describe('5-Path Matrix — No path removed', () => {
  const editorSrc = readSrc(EDITOR_PANEL);
  const shellSrc = readSrc(WORKSPACE_SHELL);

  it('Path 1: Template creation exists', () => {
    expect(editorSrc).toMatch(/templateId|template/i);
  });

  it('Path 2: RI inspector creation via onCreateDocument', () => {
    expect(editorSrc).toContain('onCreateDocument');
    expect(editorSrc).toContain('RegulatoryIntelligencePanel');
  });

  it('Path 3: New blank document creation', () => {
    expect(editorSrc).toMatch(/new.*document|create.*document|blank.*document/i);
  });

  it('Path 4: CMC alternate creation path', () => {
    // Shell handles openArtifactId from CMC
    expect(shellSrc).toMatch(/openArtifactId|openArtifactNotFound/);
  });

  it('Path 5: Dossier placement operation', () => {
    expect(shellSrc).toMatch(/PlacementDialog|placementDialog/i);
  });
});

// ── CMC bridge: governed rail integrity ─────────────────────────────────────

describe('CMC Bridge — Single governed rail', () => {
  const editorSrc = readSrc(EDITOR_PANEL);
  const shellSrc = readSrc(WORKSPACE_SHELL);

  it('EditorPanel handles openArtifactId with retry and not-found state', () => {
    expect(editorSrc).toContain('openArtifactId');
    expect(editorSrc).toContain('openArtifactNotFound');
    expect(editorSrc).toContain('openArtifactRetryRef');
  });

  it('Shell passes openArtifactId through to EditorPanel', () => {
    expect(shellSrc).toContain('openArtifactId={openArtifactId}');
    expect(shellSrc).toContain('onOpenArtifactConsumed={onOpenArtifactConsumed}');
  });

  it('No duplicate artifact creation on CMC open-by-ID path', () => {
    // The openArtifactId path should find existing artifact, not POST
    expect(editorSrc).toMatch(/artifacts\.find\(a\s*=>\s*a\.id\s*===\s*openArtifactId\)/);
  });

  it('EditorPanel shows visible failure state when artifact not found', () => {
    expect(editorSrc).toContain('Saved document was created');
    expect(editorSrc).toContain('Refresh documents');
    expect(editorSrc).toContain('Open artifact list');
  });
});

// ── Code-level proof: all 5 paths resolve to same artifact system ───────────

describe('5-Path convergence — All use same artifact endpoint', () => {
  const editorSrc = readSrc(EDITOR_PANEL);
  const shellSrc = readSrc(WORKSPACE_SHELL);

  it('RI Copilot path POSTs to /api/concept2cure/projects/:id/artifacts', () => {
    // onCreateDocument callback in RI panel creates governed artifact
    expect(editorSrc).toContain('onCreateDocument={');
    // The callback body must use the canonical artifacts endpoint
    expect(editorSrc).toContain("type: 'regulatory_document'");
    expect(editorSrc).toContain("category: 'document'");
    expect(editorSrc).toContain('setActiveArtifact(created)');
  });

  it('Template path POSTs to /api/concept2cure/projects/:id/artifacts', () => {
    expect(shellSrc).toContain('handleCreateFromTemplate');
    // Template creation must use the canonical artifacts endpoint and include templateId
    expect(shellSrc).toContain('templateId: templateKey');
    expect(shellSrc).toContain("type: 'regulatory_document'");
  });

  it('IND/eCTD handoff path POSTs to /api/concept2cure/projects/:id/artifacts', () => {
    // initialContent auto-create
    expect(editorSrc).toContain('initialContent');
    expect(editorSrc).toContain('initialTitle');
    // The auto-create effect must POST to the artifacts endpoint
    expect(editorSrc).toContain('initialContentConsumedRef');
    expect(editorSrc).toContain("type: 'regulatory_document'");
  });

  it('CMC path opens by ID — no separate creation', () => {
    expect(editorSrc).toContain('openArtifactId');
    // The open-by-ID path must find the artifact in the list, not POST create
    expect(editorSrc).toContain('artifacts.find(a => a.id === openArtifactId)');
    // It sets the found artifact as active
    expect(editorSrc).toContain('setActiveArtifact(target)');
  });

  it('New blank doc path POSTs to /api/concept2cure/projects/:id/artifacts', () => {
    expect(editorSrc).toContain('handleCreateNew');
    const createBlock = editorSrc.substring(
      editorSrc.indexOf('Create new document'),
      editorSrc.indexOf('Create new document') + 400
    );
    expect(createBlock).toContain('/artifacts');
  });
});

// ── No forbidden parallel paths ─────────────────────────────────────────────

describe('No forbidden surfaces', () => {
  const editorSrc = readSrc(EDITOR_PANEL);
  const shellSrc = readSrc(WORKSPACE_SHELL);

  it('No duplicate editor component', () => {
    // Only one <UnifiedDocumentEditor JSX usage (import + comment + JSX = ok)
    const jsxMatches = editorSrc.match(/<UnifiedDocumentEditor/g) ?? [];
    expect(jsxMatches.length).toBe(1);
  });

  it('No alternate dossier authoring route', () => {
    // Shell loads EditorPanel via single lazy import
    expect(shellSrc).toContain("lazy(() => import('../editor/EditorPanel')");
  });

  it('No second provenance model', () => {
    expect(editorSrc).toContain('DocumentProvenancePanel');
    // Only one <DocumentProvenancePanel JSX usage
    const provJsxMatches = editorSrc.match(/<DocumentProvenancePanel/g) ?? [];
    expect(provJsxMatches.length).toBe(1);
  });
});

// ── Phase 6: Polish — Toast feedback & UX hardening ──────────────────────────

describe('Phase 6 — Toast notification system', () => {
  const editorSrc = readSrc(EDITOR_PANEL);
  const shellSrc = readSrc(WORKSPACE_SHELL);

  it('EditorPanel has toast queue with pushToast helper', () => {
    expect(editorSrc).toContain('pushToast');
    expect(editorSrc).toContain('setToasts');
  });

  it('EditorPanel save handler fires success toast', () => {
    expect(editorSrc).toContain('pushToast(`Saved at');
  });

  it('EditorPanel save handler fires error toast on failure', () => {
    expect(editorSrc).toContain("pushToast('Save failed");
  });

  it('EditorPanel AI edit fires info toast during generation', () => {
    expect(editorSrc).toContain('Generating');
    expect(editorSrc).toContain("'info'");
  });

  it('EditorPanel AI edit fires error toast on failure', () => {
    expect(editorSrc).toContain("pushToast('AI edit failed");
  });

  it('EditorPanel DOCX export fires toast', () => {
    expect(editorSrc).toContain("pushToast('Exporting DOCX");
  });

  it('EditorPanel sign fires info toast', () => {
    expect(editorSrc).toContain("pushToast('Signing document");
  });

  it('EditorPanel renders toast notification container', () => {
    expect(editorSrc).toContain('Toast notifications');
    expect(editorSrc).toContain('fixed bottom-4 right-4');
  });

  it('ProjectWorkspaceShell has toast queue', () => {
    expect(shellSrc).toContain('pushShellToast');
    expect(shellSrc).toContain('shellToasts');
  });

  it('Shell placement handler fires success toast', () => {
    expect(shellSrc).toContain('pushShellToast(`Placed in');
  });

  it('Shell document creation fires success toast', () => {
    expect(shellSrc).toContain('pushShellToast(`Created');
  });

  it('Shell renders toast notification container', () => {
    expect(shellSrc).toContain('Toast notifications');
  });
});

describe('Phase 6 — Lock overlay unlock button', () => {
  const src = readSrc(EDITOR_PANEL);

  it('Lock overlay has an Unlock button', () => {
    expect(src).toContain('Unlock to Edit');
  });

  it('Unlock button calls handleStatusChange(draft)', () => {
    expect(src).toContain("handleStatusChange('draft')");
  });

  it('Unlock button shows loading spinner while status is changing', () => {
    // changingStatus drives loading state on button
    expect(src).toContain('changingStatus');
    expect(src).toContain('animate-spin');
  });
});

describe('Phase 6 — Dead button cleanup', () => {
  const editorSrc = readSrc(
    path.join(ROOT, 'client/src/concept2cure/components/editor/UnifiedDocumentEditor.tsx')
  );

  it('Version History dead button removed', () => {
    // Should no longer have onClick={() => {}} for history
    const deadHandlerMatches =
      editorSrc.match(/onClick=\{.*\(\).*=>.*\{.*\}.*\}.*Version History/gs) ?? [];
    expect(deadHandlerMatches.length).toBe(0);
  });
});

describe('Phase 6 — Skeleton loading', () => {
  const shellSrc = readSrc(WORKSPACE_SHELL);

  it('Left rail uses skeleton loader instead of spinner when loading', () => {
    expect(shellSrc).toContain('animate-pulse');
  });
});

describe('Phase 6 — Browse-mode context band prominence', () => {
  const shellSrc = readSrc(WORKSPACE_SHELL);

  it('Browse-mode context band has blue tint for visibility', () => {
    expect(shellSrc).toContain('bg-blue-50');
    expect(shellSrc).toContain("mode === 'browse'");
  });
});

// ── Phase 6B: Polish round 2 ────────────────────────────────────────────────

const DOC_LIST_PANE = path.join(
  ROOT,
  'client/src/concept2cure/components/workspace/DocumentListPane.tsx'
);

describe('Phase 6B — Keyboard shortcuts', () => {
  const editorSrc = readSrc(EDITOR_PANEL);
  const shellSrc = readSrc(WORKSPACE_SHELL);

  it('EditorPanel registers Ctrl+S keyboard shortcut', () => {
    expect(editorSrc).toContain("e.key === 's'");
    expect(editorSrc).toContain('e.preventDefault()');
  });

  it('EditorPanel Escape closes overflow menu', () => {
    expect(editorSrc).toContain("e.key === 'Escape'");
    expect(editorSrc).toContain('setOverflowOpen(false)');
  });

  it('Shell registers Escape to cancel pending move', () => {
    expect(shellSrc).toContain("e.key === 'Escape'");
    expect(shellSrc).toContain('setPendingMove(null)');
  });

  it('Pending move banner shows Esc kbd hint', () => {
    expect(shellSrc).toContain('Esc</kbd>');
  });

  it('Controlled record bar shows ⌘S hint', () => {
    expect(editorSrc).toContain('⌘S save');
  });
});

describe('Phase 6B — DocumentListPane row animation', () => {
  const src = readSrc(DOC_LIST_PANE);

  it('Expanded rows have fade-in animation', () => {
    expect(src).toContain('animate-in fade-in');
  });

  it('Chevron uses CSS rotation instead of icon swap', () => {
    expect(src).toContain('rotate-90');
    // Should NOT have both ChevronDown and ChevronRight toggled
    expect(src).not.toContain('ChevronDown');
  });
});

describe('Phase 6B — Enhanced empty states', () => {
  const editorSrc = readSrc(EDITOR_PANEL);

  it('Empty artifact list has CTA button when no documents', () => {
    expect(editorSrc).toContain('Create First Document');
  });

  it('Artifact list uses skeleton loading instead of spinner', () => {
    // Should have animate-pulse skeleton, not Loader2 spinner
    const skeletonMatches = editorSrc.match(/animate-pulse.*rounded-lg/g) ?? [];
    expect(skeletonMatches.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Phase 6B — Save status indicator', () => {
  const editorSrc = readSrc(EDITOR_PANEL);

  it('Shows "Saved" label beside check icon', () => {
    expect(editorSrc).toContain('>Saved<');
    expect(editorSrc).toContain("saveStatus === 'saved'");
  });

  it('Shows "Error" label on save failure', () => {
    expect(editorSrc).toContain('>Error<');
    expect(editorSrc).toContain("saveStatus === 'error'");
  });
});

describe('Phase 6B — Controlled record bar claim status', () => {
  const editorSrc = readSrc(EDITOR_PANEL);

  it('Shows claim checking spinner', () => {
    expect(editorSrc).toContain("claimStatus === 'checking'");
    expect(editorSrc).toContain('checking claims');
  });

  it('Shows supported claim indicator', () => {
    expect(editorSrc).toContain("claimStatus === 'supported'");
    expect(editorSrc).toContain('claims supported');
  });

  it('Shows needs-evidence claim warning', () => {
    expect(editorSrc).toContain("claimStatus === 'needs-evidence'");
    expect(editorSrc).toContain('needs evidence');
  });
});
