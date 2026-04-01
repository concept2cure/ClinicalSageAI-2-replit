/**
 * Stage 6 — Governed Workspace and Document Lifecycle Hardening
 *
 * Structural smoke checks for beta-critical governed workspace flows.
 * These are source-shape assertions (tripwire tests), not browser E2E.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SHELL = path.join(
  ROOT,
  'client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx'
);
const ZEN_APP = path.join(ROOT, 'client/src/concept2cure/ZenApp.tsx');
const CONCEPT2CURE_ROUTES = path.join(ROOT, 'server/routes/concept2cure.ts');
const SECTION_REQ_PANEL = path.join(
  ROOT,
  'client/src/concept2cure/components/workspace/SectionRequirementsPanel.tsx'
);

const readSrc = (filePath: string): string => fs.readFileSync(filePath, 'utf-8');

describe('Stage 6 — governed workspace lifecycle smoke', () => {
  const shellSrc = readSrc(SHELL);
  const zenSrc = readSrc(ZEN_APP);
  const routesSrc = readSrc(CONCEPT2CURE_ROUTES);
  const sectionReqPanelSrc = readSrc(SECTION_REQ_PANEL);

  it('keeps artifact create intents in workspace shell', () => {
    expect(shellSrc).toContain('handleCreateNew');
    expect(shellSrc).toContain('handleCreateFromTemplate');
    expect(shellSrc).toContain('/api/concept2cure/projects/${projectId}/artifacts');
  });

  it('keeps open existing artifact flow and escalation gating', () => {
    expect(shellSrc).toContain('openArtifactId');
    expect(shellSrc).toContain('const tryOpenForEdit');
    expect(shellSrc).toContain("setSelectedDocId(openArtifactId)");
    expect(shellSrc).toContain("setMode('edit')");
  });

  it('keeps active document context propagation hook', () => {
    expect(shellSrc).toContain('onActiveDocumentChange?:');
    expect(shellSrc).toContain('Bubble active document context up for chat awareness');
    expect(shellSrc).toContain('onActiveDocumentChange({');
    expect(shellSrc).toContain('onActiveDocumentChange(null)');
    expect(shellSrc).toContain('onContentChange={handleDocContentChange}');
  });

  it('keeps governed placement flow and dialog wiring', () => {
    expect(shellSrc).toContain('handlePlacementConfirm');
    expect(shellSrc).toContain('handlePlacementConfirmWithCleanup');
    expect(shellSrc).toContain('<PlacementDialog');
  });

  it('keeps editor handoff props and consumed-state callbacks', () => {
    expect(shellSrc).toContain('<EditorPanel');
    expect(shellSrc).toContain('initialContent={initialContent}');
    expect(shellSrc).toContain('onInitialContentConsumed={onInitialContentConsumed}');
    expect(shellSrc).toContain('openArtifactId={openArtifactId}');
    expect(shellSrc).toContain('onOpenArtifactConsumed={onOpenArtifactConsumed}');
  });

  it('keeps review/provenance/audit entry points from shell tabs', () => {
    expect(shellSrc).toContain('switch (documentTab)');
    expect(shellSrc).toContain("setEditorInitialInspector('provenance')");
    expect(shellSrc).toContain("setEditorInitialInspector('compare')");
    expect(shellSrc).toContain("setEditorInitialInspector('audit')");
    expect(shellSrc).toContain('<GovernedDocumentPanel');
  });

  it('keeps return-to-workspace state persistence and restore', () => {
    expect(shellSrc).toContain('localStorage.setItem(`c2c_last_artifact_${projectId}`, selectedDocId)');
    expect(shellSrc).toContain('localStorage.getItem(`c2c_last_artifact_${projectId}`)');
  });

  it('keeps parent shell integration for context + handoff cleanup', () => {
    expect(zenSrc).toContain('<ProjectWorkspaceShell');
    expect(zenSrc).toContain('onInitialContentConsumed={() => setPendingEditorContent(null)}');
    expect(zenSrc).toContain('onOpenArtifactConsumed={() => setOpenArtifactId(undefined)}');
    expect(zenSrc).toContain('onActiveDocumentChange={doc =>');
  });

  it('keeps backend lifecycle endpoints used by governed workspace', () => {
    expect(routesSrc).toContain("router.get('/projects/:projectId/artifacts'");
    expect(routesSrc).toContain("router.post(");
    expect(routesSrc).toContain("'/projects/:projectId/artifacts',");
    expect(routesSrc).toContain("router.put(");
    expect(routesSrc).toContain("'/projects/:projectId/artifacts/:artifactId/placement',");
    expect(routesSrc).toContain("'/projects/:projectId/artifacts/:artifactId/provenance',");
    expect(routesSrc).toContain("'/projects/:projectId/artifacts/:artifactId/versions',");
    expect(routesSrc).toContain("router.post('/artifacts/export-docx'");
    expect(routesSrc).toContain("router.post('/artifacts/export-pdf'");
    expect(routesSrc).toContain("router.post('/artifacts/export-pptx'");
  });

  it('extracts SectionRequirementsPanel as subordinate child without orchestration rewrite', () => {
    expect(shellSrc).toContain(
      "import { SectionRequirementsPanel, type SectionMetrics } from './SectionRequirementsPanel'"
    );
    expect(shellSrc).toContain('<SectionRequirementsPanel');
    expect(sectionReqPanelSrc).toContain('export function SectionRequirementsPanel');
    expect(sectionReqPanelSrc).toContain('Section Requirements');
  });
});

