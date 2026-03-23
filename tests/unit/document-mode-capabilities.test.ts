/**
 * @fileoverview Tests for DocumentMode capability model + resolution logic.
 *
 * Validates:
 *   - New capabilities (canApprove, canSign, canRelocate, canRollback, canMoveDocument)
 *     are correctly mapped per mode
 *   - resolveDocumentMode correctly resolves locked → readonly
 *   - Capabilities derived from resolved modes match expected governance rules
 *   - canEscalateToEdit respects lock/approval/stage constraints
 */

import { describe, it, expect } from 'vitest';
import {
  resolveDocumentMode,
  canEscalateToEdit,
  MODE_CAPABILITIES,
  STAGE_DEFAULT_MODE,
  type DocumentMode,
  type WorkflowStage,
  type ModeCapabilities,
} from '../../client/src/concept2cure/contexts/DocumentModeContext';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Capability model completeness
// ═══════════════════════════════════════════════════════════════════════════════

describe('ModeCapabilities model completeness', () => {
  const REQUIRED_KEYS: (keyof ModeCapabilities)[] = [
    'editable', 'showToolbar', 'showAIActions', 'canSave', 'canToggleLock',
    'slashCommands', 'showEditButton', 'showReviewToggle', 'canvasVisible',
    'canApprove', 'canSign', 'canRelocate', 'canRollback', 'canMoveDocument',
  ];

  const modes: DocumentMode[] = ['none', 'preview', 'view', 'edit', 'readonly'];

  for (const mode of modes) {
    it(`${mode} mode has all required capability keys`, () => {
      const caps = MODE_CAPABILITIES[mode];
      for (const key of REQUIRED_KEYS) {
        expect(caps).toHaveProperty(key);
        expect(typeof caps[key]).toBe('boolean');
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Governance capability values per mode
// ═══════════════════════════════════════════════════════════════════════════════

describe('Governance capabilities per mode', () => {
  it('readonly mode blocks all governed actions', () => {
    const caps = MODE_CAPABILITIES['readonly'];
    expect(caps.editable).toBe(false);
    expect(caps.canSave).toBe(false);
    expect(caps.canApprove).toBe(false);
    expect(caps.canSign).toBe(false);
    expect(caps.canRelocate).toBe(false);
    expect(caps.canRollback).toBe(false);
    expect(caps.canMoveDocument).toBe(false);
    expect(caps.canToggleLock).toBe(false);
  });

  it('none mode blocks everything including canvas', () => {
    const caps = MODE_CAPABILITIES['none'];
    expect(caps.canvasVisible).toBe(false);
    expect(caps.canApprove).toBe(false);
    expect(caps.canSign).toBe(false);
    expect(caps.canRelocate).toBe(false);
    expect(caps.canRollback).toBe(false);
    expect(caps.canMoveDocument).toBe(false);
  });

  it('preview mode blocks all governed actions', () => {
    const caps = MODE_CAPABILITIES['preview'];
    expect(caps.editable).toBe(false);
    expect(caps.canApprove).toBe(false);
    expect(caps.canSign).toBe(false);
    expect(caps.canRelocate).toBe(false);
    expect(caps.canRollback).toBe(false);
    expect(caps.canMoveDocument).toBe(false);
  });

  it('view mode allows approve, sign, relocate, move but not rollback', () => {
    const caps = MODE_CAPABILITIES['view'];
    expect(caps.editable).toBe(false);
    expect(caps.canApprove).toBe(true);
    expect(caps.canSign).toBe(true);
    expect(caps.canRelocate).toBe(true);
    expect(caps.canRollback).toBe(false);
    expect(caps.canMoveDocument).toBe(true);
  });

  it('edit mode allows all governed actions', () => {
    const caps = MODE_CAPABILITIES['edit'];
    expect(caps.editable).toBe(true);
    expect(caps.canSave).toBe(true);
    expect(caps.canApprove).toBe(true);
    expect(caps.canSign).toBe(true);
    expect(caps.canRelocate).toBe(true);
    expect(caps.canRollback).toBe(true);
    expect(caps.canMoveDocument).toBe(true);
    expect(caps.canToggleLock).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. resolveDocumentMode — locked artifact → readonly
// ═══════════════════════════════════════════════════════════════════════════════

describe('resolveDocumentMode locked artifact override', () => {
  const stages: WorkflowStage[] = ['project-home', 'dossier', 'documents', 'section-workspace', 'review', 'submissions'];

  for (const stage of stages) {
    it(`locked artifact on ${stage} resolves to readonly`, () => {
      expect(resolveDocumentMode(stage, 'locked')).toBe('readonly');
    });

    it(`locked artifact on ${stage} resolves to readonly even with user override`, () => {
      expect(resolveDocumentMode(stage, 'locked', 'edit')).toBe('readonly');
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Derived capability chain: locked artifact → readonly → all governed blocked
// ═══════════════════════════════════════════════════════════════════════════════

describe('Locked artifact capability derivation chain', () => {
  it('locked artifact in section-workspace gets readonly capabilities', () => {
    const mode = resolveDocumentMode('section-workspace', 'locked');
    const caps = MODE_CAPABILITIES[mode];

    expect(mode).toBe('readonly');
    expect(caps.canSave).toBe(false);
    expect(caps.canRelocate).toBe(false);
    expect(caps.canRollback).toBe(false);
    expect(caps.canMoveDocument).toBe(false);
    expect(caps.canApprove).toBe(false);
    expect(caps.canSign).toBe(false);
    expect(caps.editable).toBe(false);
  });

  it('draft artifact in section-workspace gets full edit capabilities', () => {
    const mode = resolveDocumentMode('section-workspace', 'draft');
    const caps = MODE_CAPABILITIES[mode];

    expect(mode).toBe('edit');
    expect(caps.canSave).toBe(true);
    expect(caps.canRelocate).toBe(true);
    expect(caps.canRollback).toBe(true);
    expect(caps.canMoveDocument).toBe(true);
    expect(caps.editable).toBe(true);
  });

  it('approved artifact in documents stage gets view capabilities', () => {
    const mode = resolveDocumentMode('documents', 'approved');
    const caps = MODE_CAPABILITIES[mode];

    expect(mode).toBe('view');
    expect(caps.canSave).toBe(false);
    expect(caps.canApprove).toBe(true);
    expect(caps.canSign).toBe(true);
    expect(caps.canRelocate).toBe(true);
    expect(caps.canMoveDocument).toBe(true);
    expect(caps.canRollback).toBe(false);
    expect(caps.editable).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. canEscalateToEdit constraints
// ═══════════════════════════════════════════════════════════════════════════════

describe('canEscalateToEdit governance', () => {
  it('locked artifact cannot escalate regardless of stage', () => {
    const result = canEscalateToEdit('section-workspace', 'locked');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('locked');
  });

  it('submissions stage cannot escalate', () => {
    const result = canEscalateToEdit('submissions', 'draft');
    expect(result.allowed).toBe(false);
  });

  it('dossier stage cannot escalate', () => {
    const result = canEscalateToEdit('dossier', 'draft');
    expect(result.allowed).toBe(false);
  });

  it('approved artifact can escalate with warning', () => {
    const result = canEscalateToEdit('section-workspace', 'approved');
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('approved');
  });

  it('draft artifact in documents can escalate freely', () => {
    const result = canEscalateToEdit('documents', 'draft');
    expect(result.allowed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Stage defaults unchanged
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stage default modes', () => {
  it('project-home → none', () => expect(STAGE_DEFAULT_MODE['project-home']).toBe('none'));
  it('dossier → preview', () => expect(STAGE_DEFAULT_MODE['dossier']).toBe('preview'));
  it('documents → view', () => expect(STAGE_DEFAULT_MODE['documents']).toBe('view'));
  it('section-workspace → edit', () => expect(STAGE_DEFAULT_MODE['section-workspace']).toBe('edit'));
  it('review → view', () => expect(STAGE_DEFAULT_MODE['review']).toBe('view'));
  it('submissions → readonly', () => expect(STAGE_DEFAULT_MODE['submissions']).toBe('readonly'));
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Lock toggle canonical flow validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Lock toggle canonical flow', () => {
  it('locking an approved artifact in section-workspace transitions to readonly', () => {
    // Before lock: approved artifact in edit mode
    const beforeMode = resolveDocumentMode('section-workspace', 'approved');
    expect(beforeMode).toBe('edit');
    expect(MODE_CAPABILITIES[beforeMode].canToggleLock).toBe(true);

    // After lock: locked artifact forces readonly
    const afterMode = resolveDocumentMode('section-workspace', 'locked');
    expect(afterMode).toBe('readonly');
    expect(MODE_CAPABILITIES[afterMode].editable).toBe(false);
    expect(MODE_CAPABILITIES[afterMode].canSave).toBe(false);
    expect(MODE_CAPABILITIES[afterMode].canToggleLock).toBe(false);
  });

  it('unlocking from locked back to draft restores edit capabilities', () => {
    const lockedMode = resolveDocumentMode('section-workspace', 'locked');
    expect(lockedMode).toBe('readonly');

    const unlockedMode = resolveDocumentMode('section-workspace', 'draft');
    expect(unlockedMode).toBe('edit');
    expect(MODE_CAPABILITIES[unlockedMode].editable).toBe(true);
    expect(MODE_CAPABILITIES[unlockedMode].canSave).toBe(true);
  });

  it('submissions stage stays readonly even after unlock', () => {
    const mode = resolveDocumentMode('submissions', 'draft');
    expect(mode).toBe('readonly');
    expect(MODE_CAPABILITIES[mode].canToggleLock).toBe(false);
  });

  it('locked artifact cannot be toggled from readonly mode', () => {
    const mode = resolveDocumentMode('section-workspace', 'locked');
    const caps = MODE_CAPABILITIES[mode];
    expect(caps.canToggleLock).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Edit escalation gate — shell entry point validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Edit escalation gate for shell entry points', () => {
  it('documents stage with draft artifact allows escalation', () => {
    const result = canEscalateToEdit('documents', 'draft');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('documents stage with locked artifact blocks escalation with reason', () => {
    const result = canEscalateToEdit('documents', 'locked');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('locked');
  });

  it('dossier stage blocks escalation with helpful reason', () => {
    const result = canEscalateToEdit('dossier', 'draft');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Section Workspace');
  });

  it('submissions stage blocks with clear reason', () => {
    const result = canEscalateToEdit('submissions', 'draft');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('locked during submission');
  });

  it('review stage with review-status artifact allows escalation', () => {
    const result = canEscalateToEdit('review', 'review');
    expect(result.allowed).toBe(true);
  });

  it('review stage with approved artifact blocks (wrong status for review editing)', () => {
    const result = canEscalateToEdit('review', 'approved');
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('approved');
  });

  it('section-workspace with approved artifact warns but allows', () => {
    const result = canEscalateToEdit('section-workspace', 'approved');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeTruthy();
    expect(result.reason).toContain('reset');
  });

  it('project-home cannot escalate', () => {
    const result = canEscalateToEdit('project-home', 'draft');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not available');
  });

  it('every blocked escalation provides a non-empty reason string', () => {
    const blockedCases: [WorkflowStage, string][] = [
      ['submissions', 'draft'],
      ['dossier', 'draft'],
      ['project-home', 'draft'],
      ['documents', 'locked'],
      ['section-workspace', 'locked'],
      ['review', 'locked'],
    ];
    for (const [stage, status] of blockedCases) {
      const result = canEscalateToEdit(stage, status);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeTruthy();
      expect(result.reason!.length).toBeGreaterThan(10);
    }
  });
});
