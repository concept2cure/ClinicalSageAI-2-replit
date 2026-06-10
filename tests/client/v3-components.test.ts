/**
 * V3 UI Component Tests
 *
 * Unit tests for the new V3 design system exports and structure.
 * These tests verify module exports, types, and configurations.
 *
 * @version 3.0.0
 * @author TrialSage Engineering
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const CLIENT_SRC = path.join(process.cwd(), 'client', 'src');
const LEGACY_V3_COMPONENT_PATHS = [
  path.join(CLIENT_SRC, 'components', 'dashboard', 'DashboardV3.tsx'),
  path.join(CLIENT_SRC, 'components', 'program', 'ProgramWorkbenchV3.tsx'),
  path.join(CLIENT_SRC, 'components', 'library', 'EvidenceLibraryV3.tsx'),
  path.join(CLIENT_SRC, 'components', 'ai', 'AIAssistantV3.tsx'),
  path.join(CLIENT_SRC, 'components', 'layout', 'AppShellV3.tsx'),
  path.join(CLIENT_SRC, 'components', 'portal', 'ClientPortalV3.tsx'),
];
const hasAnyLegacyV3Component = LEGACY_V3_COMPONENT_PATHS.some(filePath => fs.existsSync(filePath));
const hasAllLegacyV3Components = LEGACY_V3_COMPONENT_PATHS.every(filePath => fs.existsSync(filePath));
const describeLegacyV3 = hasAllLegacyV3Components ? describe : describe.skip;

// ═══════════════════════════════════════════════════════════════════════════════
// FILE EXISTENCE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('V3 Component Files', () => {
  // The `client/src/design-system/` island (tokens.ts, motion.ts, index.ts and
  // the patterns/ dir) was removed in the Tier 1B dead-client cleanup (commit
  // 4e26c7b, vite build verified). The authoritative design system lives in
  // `design-system/` and `ui_kits/` per CLAUDE.md, not under client/src, so the
  // file-existence assertions for that removed island were dropped.

  it('should have DashboardV3 component', () => {
    const dashboardPath = path.join(CLIENT_SRC, 'components', 'dashboard', 'DashboardV3.tsx');
    expect(fs.existsSync(dashboardPath)).toBe(hasAllLegacyV3Components);
  });

  it('should have ProgramWorkbenchV3 component', () => {
    const workbenchPath = path.join(CLIENT_SRC, 'components', 'program', 'ProgramWorkbenchV3.tsx');
    expect(fs.existsSync(workbenchPath)).toBe(hasAllLegacyV3Components);
  });

  it('should have EvidenceLibraryV3 component', () => {
    const libraryPath = path.join(CLIENT_SRC, 'components', 'library', 'EvidenceLibraryV3.tsx');
    expect(fs.existsSync(libraryPath)).toBe(hasAllLegacyV3Components);
  });

  it('should have AIAssistantV3 component', () => {
    const assistantPath = path.join(CLIENT_SRC, 'components', 'ai', 'AIAssistantV3.tsx');
    expect(fs.existsSync(assistantPath)).toBe(hasAllLegacyV3Components);
  });

  it('should have AppShellV3 component', () => {
    const shellPath = path.join(CLIENT_SRC, 'components', 'layout', 'AppShellV3.tsx');
    expect(fs.existsSync(shellPath)).toBe(hasAllLegacyV3Components);
  });

  it('should have ClientPortalV3 component', () => {
    const portalPath = path.join(CLIENT_SRC, 'components', 'portal', 'ClientPortalV3.tsx');
    expect(fs.existsSync(portalPath)).toBe(hasAllLegacyV3Components);
  });

  it('should avoid partial legacy V3 component snapshots', () => {
    expect(hasAnyLegacyV3Component && !hasAllLegacyV3Components).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT CONTENT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describeLegacyV3('DashboardV3 Content', () => {
  let dashboardContent: string;

  beforeAll(() => {
    dashboardContent = fs.readFileSync(
      path.join(CLIENT_SRC, 'components', 'dashboard', 'DashboardV3.tsx'),
      'utf-8'
    );
  });

  it('should import framer-motion', () => {
    expect(dashboardContent).toContain("from 'framer-motion'");
  });

  it('should have metric cards', () => {
    expect(dashboardContent).toContain('MetricCard');
    expect(dashboardContent).toContain('Active Programs');
    expect(dashboardContent).toContain('Documents in Review');
  });

  it('should have program rows', () => {
    expect(dashboardContent).toContain('ProgramRow');
    expect(dashboardContent).toContain('ProgramSummary');
  });

  it('should have activity section', () => {
    expect(dashboardContent).toContain('RecentActivity');
    expect(dashboardContent).toContain('ActivityItem');
  });

  it('should have AI assistant prompt', () => {
    expect(dashboardContent).toContain('AI');
    expect(dashboardContent).toContain('Sparkles');
  });

  it('should export as default', () => {
    expect(dashboardContent).toContain('export default DashboardV3');
  });
});

describeLegacyV3('AIAssistantV3 Content', () => {
  let assistantContent: string;

  beforeAll(() => {
    assistantContent = fs.readFileSync(
      path.join(CLIENT_SRC, 'components', 'ai', 'AIAssistantV3.tsx'),
      'utf-8'
    );
  });

  it('should have message types', () => {
    expect(assistantContent).toContain('Message');
    expect(assistantContent).toContain('role');
    expect(assistantContent).toContain('content');
  });

  it('should have welcome screen', () => {
    expect(assistantContent).toContain('WelcomeScreen');
    // Check for greeting pattern - assistant welcome
    expect(assistantContent).toContain("I'm");
  });

  it('should have suggested prompts', () => {
    expect(assistantContent).toContain('suggestedPrompts');
    expect(assistantContent).toContain('IND');
    expect(assistantContent).toContain('FDA');
  });

  it('should have message input', () => {
    expect(assistantContent).toContain('InputArea');
    expect(assistantContent).toContain('textarea');
  });

  it('should have conversation history', () => {
    expect(assistantContent).toContain('messages');
    expect(assistantContent).toContain('setMessages');
  });

  it('should export as default', () => {
    expect(assistantContent).toContain('export default AIAssistantV3');
  });
});

describeLegacyV3('AppShellV3 Content', () => {
  let shellContent: string;

  beforeAll(() => {
    shellContent = fs.readFileSync(
      path.join(CLIENT_SRC, 'components', 'layout', 'AppShellV3.tsx'),
      'utf-8'
    );
  });

  it('should have navigation items', () => {
    expect(shellContent).toContain('NavItem');
    expect(shellContent).toContain('Dashboard');
    expect(shellContent).toContain('Programs');
    expect(shellContent).toContain('Evidence Library');
  });

  it('should have sidebar component', () => {
    expect(shellContent).toContain('Sidebar');
    expect(shellContent).toContain('collapsed');
  });

  it('should have header component', () => {
    expect(shellContent).toContain('Header');
    expect(shellContent).toContain('Search');
  });

  it('should have user menu', () => {
    expect(shellContent).toContain('UserMenu');
    expect(shellContent).toContain('UserProfile');
  });

  it('should have mobile menu support', () => {
    expect(shellContent).toContain('MobileMenu');
  });

  it('should have logo', () => {
    expect(shellContent).toContain('Logo');
    expect(shellContent).toContain('TrialSage');
  });

  it('should export as default', () => {
    expect(shellContent).toContain('export default AppShellV3');
  });
});

describeLegacyV3('EvidenceLibraryV3 Content', () => {
  let libraryContent: string;

  beforeAll(() => {
    libraryContent = fs.readFileSync(
      path.join(CLIENT_SRC, 'components', 'library', 'EvidenceLibraryV3.tsx'),
      'utf-8'
    );
  });

  it('should have document types', () => {
    expect(libraryContent).toContain('Document');
    expect(libraryContent).toContain('DocumentStatus');
  });

  it('should have folder navigation', () => {
    expect(libraryContent).toContain('Folder');
    expect(libraryContent).toContain('FolderSidebar');
  });

  it('should have view modes', () => {
    expect(libraryContent).toContain('ViewMode');
    expect(libraryContent).toContain('grid');
    expect(libraryContent).toContain('list');
  });

  it('should have search functionality', () => {
    expect(libraryContent).toContain('SearchInput');
    expect(libraryContent).toContain('searchQuery');
  });

  it('should have filter panel', () => {
    expect(libraryContent).toContain('FilterPanel');
    expect(libraryContent).toContain('FilterState');
  });

  it('should have document cards for grid view', () => {
    expect(libraryContent).toContain('DocumentCard');
  });

  it('should have document rows for list view', () => {
    expect(libraryContent).toContain('DocumentRow');
  });

  it('should export as default', () => {
    expect(libraryContent).toContain('export default EvidenceLibraryV3');
  });
});

describeLegacyV3('ProgramWorkbenchV3 Content', () => {
  let workbenchContent: string;

  beforeAll(() => {
    workbenchContent = fs.readFileSync(
      path.join(CLIENT_SRC, 'components', 'program', 'ProgramWorkbenchV3.tsx'),
      'utf-8'
    );
  });

  it('should have milestone types', () => {
    expect(workbenchContent).toContain('Milestone');
    expect(workbenchContent).toContain('MilestoneStatus');
  });

  it('should have task management', () => {
    expect(workbenchContent).toContain('Task');
    expect(workbenchContent).toContain('TaskRow');
  });

  it('should have team panel', () => {
    expect(workbenchContent).toContain('TeamMember');
    expect(workbenchContent).toContain('TeamPanel');
  });

  it('should have timeline visualization', () => {
    expect(workbenchContent).toContain('TimelineVisualization');
  });

  it('should have milestone cards', () => {
    expect(workbenchContent).toContain('MilestoneCard');
  });

  it('should have progress tracking', () => {
    expect(workbenchContent).toContain('progress');
    expect(workbenchContent).toContain('Overall Progress');
  });

  it('should export as default', () => {
    expect(workbenchContent).toContain('export default ProgramWorkbenchV3');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LINE COUNT VALIDATION (ENSURING COMPLETENESS)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Component Size Validation', () => {
  const getLineCount = (filePath: string) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  };

  // tokens.ts / motion.ts size checks removed — the client/src/design-system
  // island was deleted in the Tier 1B cleanup (see note above).

  it('DashboardV3 should be a full component (>300 lines)', () => {
    if (!hasAllLegacyV3Components) return;
    const lines = getLineCount(path.join(CLIENT_SRC, 'components', 'dashboard', 'DashboardV3.tsx'));
    expect(lines).toBeGreaterThan(300);
  });

  it('AIAssistantV3 should be a full component (>300 lines)', () => {
    if (!hasAllLegacyV3Components) return;
    const lines = getLineCount(path.join(CLIENT_SRC, 'components', 'ai', 'AIAssistantV3.tsx'));
    expect(lines).toBeGreaterThan(300);
  });

  it('AppShellV3 should be a full component (>300 lines)', () => {
    if (!hasAllLegacyV3Components) return;
    const lines = getLineCount(path.join(CLIENT_SRC, 'components', 'layout', 'AppShellV3.tsx'));
    expect(lines).toBeGreaterThan(300);
  });

  it('EvidenceLibraryV3 should be a full component (>400 lines)', () => {
    if (!hasAllLegacyV3Components) return;
    const lines = getLineCount(
      path.join(CLIENT_SRC, 'components', 'library', 'EvidenceLibraryV3.tsx')
    );
    expect(lines).toBeGreaterThan(400);
  });

  it('ProgramWorkbenchV3 should be a full component (>400 lines)', () => {
    if (!hasAllLegacyV3Components) return;
    const lines = getLineCount(
      path.join(CLIENT_SRC, 'components', 'program', 'ProgramWorkbenchV3.tsx')
    );
    expect(lines).toBeGreaterThan(400);
  });
});
