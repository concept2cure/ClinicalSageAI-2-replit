/**
 * Phase 7 Workspace Hardening — Structural Validation Tests
 *
 * Verifies that Phase 7 hardening edits are in place:
 *   7A: Outline navigation — HeadingWithId extension renders heading IDs
 *   7B: Live content sync — TipTap onUpdate fires onLiveContentChange
 *   7C: Dossier per-status metrics — DossierTree shows draft/review/approved/locked counts
 *   7D: Governed actions in ProjectFileTree — context menu with cut/place/copy-ctd
 *   7E: Cut/paste state — pendingMove prop, paste indicator
 *   7F: Template hierarchy depth — sections 1.5, 1.7, 1.13 present
 *   7G: Viewport responsive panels — left/right rail responsive widths
 *   7H: Required-children indicator — DossierTree checks getSectionRequirements
 *
 * SOURCE-LEVEL structural assertions — no DOM rendering required.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const EDITOR = path.join(
  ROOT,
  'client/src/concept2cure/components/editor/UnifiedDocumentEditor.tsx'
);
const EDITOR_PANEL = path.join(ROOT, 'client/src/concept2cure/components/editor/EditorPanel.tsx');
const DOSSIER_TREE = path.join(
  ROOT,
  'client/src/concept2cure/components/workspace/DossierTree.tsx'
);
const FILE_TREE = path.join(
  ROOT,
  'client/src/concept2cure/components/workspace/ProjectFileTree.tsx'
);
const SHELL = path.join(
  ROOT,
  'client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx'
);
const HIERARCHY = path.join(ROOT, 'client/src/concept2cure/models/ctdHierarchy.ts');

function readSrc(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

// ── 7A: HeadingWithId extension renders heading IDs for outline nav ──────────

describe('7A — HeadingWithId extension', () => {
  const src = readSrc(EDITOR);

  it('imports @tiptap/extension-heading', () => {
    expect(src).toContain("from '@tiptap/extension-heading'");
  });

  it('defines HeadingWithId extension', () => {
    expect(src).toContain('HeadingWithId');
    expect(src).toContain('Heading.extend(');
  });

  it('adds outline ID to rendered headings', () => {
    expect(src).toContain('data-outline-id');
    expect(src).toContain('outline-');
  });

  it('includes slugify function for stable IDs', () => {
    expect(src).toContain('function slugify');
    expect(src).toMatch(/\.toLowerCase\(\)/);
    expect(src).toMatch(/replace\(.*[^a-z0-9]/);
  });

  it('disables built-in heading in StarterKit', () => {
    expect(src).toContain('StarterKit.configure({ heading: false })');
  });

  it('adds HeadingWithId to extensions array', () => {
    // HeadingWithId must be in the extensions array
    const extensionsBlock = src.slice(
      src.indexOf('extensions: ['),
      src.indexOf('],', src.indexOf('extensions: [')) + 2
    );
    expect(extensionsBlock).toContain('HeadingWithId');
  });
});

// ── 7B: Live content sync — TipTap onUpdate fires onLiveContentChange ───────

describe('7B — Live content sync pipeline', () => {
  const editorSrc = readSrc(EDITOR);
  const panelSrc = readSrc(EDITOR_PANEL);

  it('editor has onLiveContentChange prop', () => {
    expect(editorSrc).toContain('onLiveContentChange');
  });

  it('TipTap onUpdate calls onLiveContentChange', () => {
    expect(editorSrc).toContain('onLiveContentChange?.(editor.getHTML())');
  });

  it('EditorPanel passes onLiveContentChange to UnifiedDocumentEditor', () => {
    expect(panelSrc).toContain('onLiveContentChange');
  });

  it('EditorPanel forwards live content via onContentChange', () => {
    expect(panelSrc).toContain('onContentChange?.(html');
  });
});

// ── 7C: Dossier per-status metrics ──────────────────────────────────────────

describe('7C — DossierTree per-status metrics', () => {
  const src = readSrc(DOSSIER_TREE);

  it('metrics interface includes status count fields', () => {
    expect(src).toContain('draftCount');
    expect(src).toContain('reviewCount');
    expect(src).toContain('approvedCount');
    expect(src).toContain('lockedCount');
  });

  it('renders draft count chip', () => {
    expect(src).toMatch(/draftCount.*>.*D/s);
  });

  it('renders review count chip', () => {
    expect(src).toMatch(/reviewCount.*>.*R/s);
  });

  it('renders approved count chip', () => {
    expect(src).toMatch(/approvedCount.*>.*A/s);
  });

  it('renders locked count chip', () => {
    expect(src).toMatch(/lockedCount.*>.*L/s);
  });

  it('shows status tooltip with D/R/A/L breakdown', () => {
    expect(src).toMatch(/title=.*D.*R.*A.*L/);
  });
});

// ── 7D: Governed actions in ProjectFileTree ─────────────────────────────────

describe('7D — ProjectFileTree governed actions', () => {
  const treeSrc = readSrc(FILE_TREE);
  const shellSrc = readSrc(SHELL);

  it('FileTree accepts onCutDocument prop', () => {
    expect(treeSrc).toContain('onCutDocument');
  });

  it('FileTree accepts onOpenPlacement prop', () => {
    expect(treeSrc).toContain('onOpenPlacement');
  });

  it('FileTree accepts onCopyCtdPath prop', () => {
    expect(treeSrc).toContain('onCopyCtdPath');
  });

  it('FileTree has context menu state', () => {
    expect(treeSrc).toContain('contextMenu');
    expect(treeSrc).toContain('setContextMenu');
  });

  it('FileTree has right-click handler', () => {
    expect(treeSrc).toContain('onContextMenu');
  });

  it('Shell wires governed actions to ProjectFileTree', () => {
    // Shell must pass all three callbacks
    expect(shellSrc).toContain('onCutDocument={handleCutDocument}');
    expect(shellSrc).toContain('onOpenPlacement={');
    expect(shellSrc).toContain('onCopyCtdPath={');
  });
});

// ── 7E: Cut/paste state ─────────────────────────────────────────────────────

describe('7E — Cut/paste move surface', () => {
  const treeSrc = readSrc(FILE_TREE);

  it('FileTree accepts pendingMove prop', () => {
    expect(treeSrc).toContain('pendingMove');
  });

  it('FileTree shows pending move indicator', () => {
    // Visual indicator for cut state
    expect(treeSrc).toMatch(/pendingMove.*artifact/s);
  });

  it('FileTree accepts onPasteHere callback', () => {
    expect(treeSrc).toContain('onPasteHere');
  });
});

// ── 7F: Template hierarchy depth ────────────────────────────────────────────

describe('7F — Deepened CTD hierarchy', () => {
  const src = readSrc(HIERARCHY);

  it('includes section 1.5 — Safety Reports', () => {
    expect(src).toContain("ctdSection: '1.5'");
  });

  it('includes section 1.5 sub-sections', () => {
    expect(src).toContain("ctdSection: '1.5.1'");
    expect(src).toContain("ctdSection: '1.5.2'");
  });

  it('includes section 1.7 — Correspondence/Meeting Minutes', () => {
    expect(src).toContain("ctdSection: '1.7'");
  });

  it('includes section 1.7 sub-sections', () => {
    expect(src).toContain("ctdSection: '1.7.1'");
    expect(src).toContain("ctdSection: '1.7.2'");
    expect(src).toContain("ctdSection: '1.7.3'");
  });

  it('includes section 1.13 — Environmental Assessment', () => {
    expect(src).toContain("ctdSection: '1.13'");
  });

  it('has templates for new sections', () => {
    // Check IND_TEMPLATES covers the new sections
    expect(src).toMatch(/ctdSection.*1\.5/);
    expect(src).toMatch(/ctdSection.*1\.7/);
    expect(src).toMatch(/ctdSection.*1\.13/);
  });

  it('has section descriptions for new sections', () => {
    // getSectionDescription should cover new sections
    expect(src).toContain("'1.5':");
    expect(src).toContain("'1.7':");
    expect(src).toContain("'1.13':");
  });
});

// ── 7G: Viewport responsive panels ─────────────────────────────────────────

describe('7G — Responsive viewport scaling', () => {
  const shellSrc = readSrc(SHELL);

  it('left rail uses responsive width', () => {
    // Should have base width + larger breakpoint width
    expect(shellSrc).toContain('w-[180px]');
    expect(shellSrc).toContain('2xl:w-[220px]');
  });

  it('right inspector uses responsive width', () => {
    expect(shellSrc).toContain('w-[200px]');
    expect(shellSrc).toContain('2xl:w-[240px]');
  });
});

// ── 7H: Required children indicator ─────────────────────────────────────────

describe('7H — Required children indicator in DossierTree', () => {
  const src = readSrc(DOSSIER_TREE);

  it('imports getSectionRequirements from ctdHierarchy', () => {
    expect(src).toContain('getSectionRequirements');
  });

  it('computes missing required children', () => {
    expect(src).toContain('missingRequired');
    expect(src).toContain('requiredChildren');
  });

  it('renders missing-required indicator', () => {
    // Should show some UI when required children are missing
    expect(src).toMatch(/missingRequired.*length/);
  });
});
