import {
  resolveDocumentMode,
  canEscalateToEdit,
  STAGE_DEFAULT_MODE,
  STAGE_ALLOWS_EDIT_ESCALATION,
  MODE_CAPABILITIES,
  type WorkflowStage,
  type DocumentMode,
} from '../DocumentModeContext';

// =============================================================================
// 1. Stage default mode tests
// =============================================================================

describe('STAGE_DEFAULT_MODE', () => {
  it('maps project-home to none', () => {
    expect(STAGE_DEFAULT_MODE['project-home']).toBe('none');
  });

  it('maps dossier to preview', () => {
    expect(STAGE_DEFAULT_MODE['dossier']).toBe('preview');
  });

  it('maps documents to view', () => {
    expect(STAGE_DEFAULT_MODE['documents']).toBe('view');
  });

  it('maps section-workspace to edit', () => {
    expect(STAGE_DEFAULT_MODE['section-workspace']).toBe('edit');
  });

  it('maps review to view', () => {
    expect(STAGE_DEFAULT_MODE['review']).toBe('view');
  });

  it('maps submissions to readonly', () => {
    expect(STAGE_DEFAULT_MODE['submissions']).toBe('readonly');
  });
});

// =============================================================================
// 2. resolveDocumentMode tests
// =============================================================================

describe('resolveDocumentMode', () => {
  it('returns stage default when no artifact status or override', () => {
    const stages: WorkflowStage[] = [
      'project-home',
      'dossier',
      'documents',
      'section-workspace',
      'review',
      'submissions',
    ];
    for (const stage of stages) {
      // submissions is always readonly regardless, which matches its stage default
      expect(resolveDocumentMode(stage)).toBe(STAGE_DEFAULT_MODE[stage]);
      expect(resolveDocumentMode(stage, null, null)).toBe(STAGE_DEFAULT_MODE[stage]);
      expect(resolveDocumentMode(stage, undefined, undefined)).toBe(STAGE_DEFAULT_MODE[stage]);
    }
  });

  it('returns readonly for locked artifact regardless of stage', () => {
    const stages: WorkflowStage[] = [
      'project-home',
      'dossier',
      'documents',
      'section-workspace',
      'review',
      'submissions',
    ];
    for (const stage of stages) {
      expect(resolveDocumentMode(stage, 'locked')).toBe('readonly');
      expect(resolveDocumentMode(stage, 'locked', 'edit')).toBe('readonly');
    }
  });

  it('returns readonly for submissions regardless of artifact status', () => {
    expect(resolveDocumentMode('submissions', 'draft')).toBe('readonly');
    expect(resolveDocumentMode('submissions', 'review')).toBe('readonly');
    expect(resolveDocumentMode('submissions', 'approved')).toBe('readonly');
    expect(resolveDocumentMode('submissions', null)).toBe('readonly');
  });

  it('honors user override to edit when stage allows escalation', () => {
    expect(resolveDocumentMode('documents', 'draft', 'edit')).toBe('edit');
    expect(resolveDocumentMode('section-workspace', 'draft', 'edit')).toBe('edit');
    expect(resolveDocumentMode('review', 'review', 'edit')).toBe('edit');
  });

  it('honors user override to view when stage allows escalation', () => {
    expect(resolveDocumentMode('documents', 'draft', 'view')).toBe('view');
    expect(resolveDocumentMode('section-workspace', 'draft', 'view')).toBe('view');
    expect(resolveDocumentMode('review', 'draft', 'view')).toBe('view');
  });

  it('ignores user override when stage forbids escalation', () => {
    expect(resolveDocumentMode('project-home', 'draft', 'edit')).toBe('none');
    expect(resolveDocumentMode('dossier', 'draft', 'edit')).toBe('preview');
    expect(resolveDocumentMode('submissions', 'draft', 'edit')).toBe('readonly');
  });

  it('returns readonly for locked artifact even with user override', () => {
    expect(resolveDocumentMode('documents', 'locked', 'edit')).toBe('readonly');
    expect(resolveDocumentMode('section-workspace', 'locked', 'edit')).toBe('readonly');
    expect(resolveDocumentMode('review', 'locked', 'edit')).toBe('readonly');
  });

  // Per-stage behavior
  it('project-home always returns none', () => {
    expect(resolveDocumentMode('project-home')).toBe('none');
    expect(resolveDocumentMode('project-home', 'draft')).toBe('none');
    expect(resolveDocumentMode('project-home', 'draft', 'edit')).toBe('none');
  });

  it('dossier returns preview by default', () => {
    expect(resolveDocumentMode('dossier')).toBe('preview');
    expect(resolveDocumentMode('dossier', 'draft')).toBe('preview');
    expect(resolveDocumentMode('dossier', 'approved')).toBe('preview');
  });

  it('documents returns view by default', () => {
    expect(resolveDocumentMode('documents')).toBe('view');
    expect(resolveDocumentMode('documents', 'draft')).toBe('view');
    expect(resolveDocumentMode('documents', 'review')).toBe('view');
  });

  it('section-workspace returns edit by default', () => {
    expect(resolveDocumentMode('section-workspace')).toBe('edit');
    expect(resolveDocumentMode('section-workspace', 'draft')).toBe('edit');
    expect(resolveDocumentMode('section-workspace', 'review')).toBe('edit');
  });

  it('review returns view by default', () => {
    expect(resolveDocumentMode('review')).toBe('view');
    expect(resolveDocumentMode('review', 'draft')).toBe('view');
    expect(resolveDocumentMode('review', 'approved')).toBe('view');
  });

  it('submissions returns readonly even for draft artifacts', () => {
    expect(resolveDocumentMode('submissions', 'draft')).toBe('readonly');
    expect(resolveDocumentMode('submissions', 'draft', 'edit')).toBe('readonly');
  });

  it('ignores non-edit/view user overrides even when stage allows escalation', () => {
    // 'none', 'preview', 'readonly' are not valid escalation targets
    expect(resolveDocumentMode('documents', 'draft', 'none')).toBe('view');
    expect(resolveDocumentMode('documents', 'draft', 'preview')).toBe('view');
    expect(resolveDocumentMode('documents', 'draft', 'readonly')).toBe('view');
  });
});

// =============================================================================
// 3. canEscalateToEdit tests
// =============================================================================

describe('canEscalateToEdit', () => {
  it('blocks escalation in submissions with reason', () => {
    const result = canEscalateToEdit('submissions');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Documents are locked during submission. Return to Section Workspace to edit.'
    );
  });

  it('blocks escalation in dossier with reason', () => {
    const result = canEscalateToEdit('dossier');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Open the document in Section Workspace to edit.');
  });

  it('blocks escalation in project-home', () => {
    const result = canEscalateToEdit('project-home');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Editing is not available in this view.');
  });

  it('allows escalation in documents', () => {
    const result = canEscalateToEdit('documents');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('allows escalation in section-workspace', () => {
    const result = canEscalateToEdit('section-workspace');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('allows escalation in review for review status', () => {
    const result = canEscalateToEdit('review', 'review');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('allows escalation in review for draft status', () => {
    const result = canEscalateToEdit('review', 'draft');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('blocks escalation for locked artifacts with reason', () => {
    const stages: WorkflowStage[] = ['documents', 'section-workspace', 'review'];
    for (const stage of stages) {
      const result = canEscalateToEdit(stage, 'locked');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(
        'This document is locked. Request unlock from an authorized reviewer.'
      );
    }
  });

  it('warns on approved artifacts but allows', () => {
    const result = canEscalateToEdit('documents', 'approved');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('This document is approved. Editing will reset it to draft status.');
  });

  it('provides correct reason strings', () => {
    // submissions reason
    expect(canEscalateToEdit('submissions').reason).toContain('locked during submission');

    // dossier reason
    expect(canEscalateToEdit('dossier').reason).toContain('Section Workspace');

    // project-home reason
    expect(canEscalateToEdit('project-home').reason).toContain('not available');

    // locked reason
    expect(canEscalateToEdit('documents', 'locked').reason).toContain('Request unlock');

    // approved reason
    expect(canEscalateToEdit('documents', 'approved').reason).toContain('reset it to draft');
  });

  it('blocks escalation in review for non-review/non-draft status', () => {
    // An artifact that is neither 'review' nor 'draft' in the review stage
    // and is not 'locked' or 'approved' triggers the review-specific gate
    const result = canEscalateToEdit('review', 'some-other-status');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Document must be in review or draft status to edit during review.');
  });
});

// =============================================================================
// 4. MODE_CAPABILITIES tests
// =============================================================================

describe('MODE_CAPABILITIES', () => {
  it('none mode: canvas not visible, nothing editable', () => {
    const cap = MODE_CAPABILITIES['none'];
    expect(cap.canvasVisible).toBe(false);
    expect(cap.editable).toBe(false);
    expect(cap.showToolbar).toBe(false);
    expect(cap.showAIActions).toBe(false);
    expect(cap.canSave).toBe(false);
    expect(cap.canToggleLock).toBe(false);
    expect(cap.slashCommands).toBe(false);
    expect(cap.showEditButton).toBe(false);
    expect(cap.showReviewToggle).toBe(false);
  });

  it('preview mode: canvas visible, not editable, no toolbar', () => {
    const cap = MODE_CAPABILITIES['preview'];
    expect(cap.canvasVisible).toBe(true);
    expect(cap.editable).toBe(false);
    expect(cap.showToolbar).toBe(false);
    expect(cap.showAIActions).toBe(false);
    expect(cap.canSave).toBe(false);
    expect(cap.showEditButton).toBe(false);
  });

  it('view mode: canvas visible, not editable, toolbar shown, edit button shown', () => {
    const cap = MODE_CAPABILITIES['view'];
    expect(cap.canvasVisible).toBe(true);
    expect(cap.editable).toBe(false);
    expect(cap.showToolbar).toBe(true);
    expect(cap.showEditButton).toBe(true);
    expect(cap.showAIActions).toBe(false);
    expect(cap.canSave).toBe(false);
  });

  it('edit mode: canvas visible, editable, all actions enabled', () => {
    const cap = MODE_CAPABILITIES['edit'];
    expect(cap.canvasVisible).toBe(true);
    expect(cap.editable).toBe(true);
    expect(cap.showToolbar).toBe(true);
    expect(cap.showAIActions).toBe(true);
    expect(cap.canSave).toBe(true);
    expect(cap.canToggleLock).toBe(true);
    expect(cap.slashCommands).toBe(true);
    expect(cap.showReviewToggle).toBe(true);
    // edit mode does NOT show the "Edit" button (already editing)
    expect(cap.showEditButton).toBe(false);
  });

  it('readonly mode: canvas visible, not editable, toolbar shown, no edit button', () => {
    const cap = MODE_CAPABILITIES['readonly'];
    expect(cap.canvasVisible).toBe(true);
    expect(cap.editable).toBe(false);
    expect(cap.showToolbar).toBe(true);
    expect(cap.showEditButton).toBe(false);
    expect(cap.showAIActions).toBe(false);
    expect(cap.canSave).toBe(false);
    expect(cap.canToggleLock).toBe(false);
  });

  it('edit mode enables slash commands', () => {
    expect(MODE_CAPABILITIES['edit'].slashCommands).toBe(true);
    // all other modes have slash commands disabled
    const others: DocumentMode[] = ['none', 'preview', 'view', 'readonly'];
    for (const m of others) {
      expect(MODE_CAPABILITIES[m].slashCommands).toBe(false);
    }
  });

  it('only edit mode has canSave true', () => {
    const modes: DocumentMode[] = ['none', 'preview', 'view', 'edit', 'readonly'];
    for (const m of modes) {
      if (m === 'edit') {
        expect(MODE_CAPABILITIES[m].canSave).toBe(true);
      } else {
        expect(MODE_CAPABILITIES[m].canSave).toBe(false);
      }
    }
  });

  it('only edit mode has canToggleLock true', () => {
    const modes: DocumentMode[] = ['none', 'preview', 'view', 'edit', 'readonly'];
    for (const m of modes) {
      if (m === 'edit') {
        expect(MODE_CAPABILITIES[m].canToggleLock).toBe(true);
      } else {
        expect(MODE_CAPABILITIES[m].canToggleLock).toBe(false);
      }
    }
  });

  it('only view mode has showEditButton true', () => {
    const modes: DocumentMode[] = ['none', 'preview', 'view', 'edit', 'readonly'];
    for (const m of modes) {
      if (m === 'view') {
        expect(MODE_CAPABILITIES[m].showEditButton).toBe(true);
      } else {
        expect(MODE_CAPABILITIES[m].showEditButton).toBe(false);
      }
    }
  });
});

// =============================================================================
// 5. Escalation edge cases
// =============================================================================

describe('escalation edge cases', () => {
  it('documents + locked = blocked', () => {
    const result = canEscalateToEdit('documents', 'locked');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('locked');
  });

  it('review + approved = allowed with warning', () => {
    const result = canEscalateToEdit('review', 'approved');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('approved');
    expect(result.reason).toContain('reset it to draft');
  });

  it('section-workspace + locked = blocked', () => {
    const result = canEscalateToEdit('section-workspace', 'locked');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('locked');
    expect(result.reason).toContain('Request unlock');
  });

  it('submissions + draft = blocked', () => {
    const result = canEscalateToEdit('submissions', 'draft');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('locked during submission');
  });

  it('resolveDocumentMode: locked artifact in escalation-allowed stage still returns readonly', () => {
    expect(resolveDocumentMode('documents', 'locked', 'edit')).toBe('readonly');
    expect(resolveDocumentMode('review', 'locked', 'edit')).toBe('readonly');
    expect(resolveDocumentMode('section-workspace', 'locked', 'edit')).toBe('readonly');
  });

  it('resolveDocumentMode: submissions with user override to edit still returns readonly', () => {
    expect(resolveDocumentMode('submissions', 'draft', 'edit')).toBe('readonly');
    expect(resolveDocumentMode('submissions', null, 'edit')).toBe('readonly');
  });
});

// =============================================================================
// 6. STAGE_ALLOWS_EDIT_ESCALATION mapping
// =============================================================================

describe('STAGE_ALLOWS_EDIT_ESCALATION', () => {
  it('project-home does not allow escalation', () => {
    expect(STAGE_ALLOWS_EDIT_ESCALATION['project-home']).toBe(false);
  });

  it('dossier does not allow escalation', () => {
    expect(STAGE_ALLOWS_EDIT_ESCALATION['dossier']).toBe(false);
  });

  it('documents allows escalation', () => {
    expect(STAGE_ALLOWS_EDIT_ESCALATION['documents']).toBe(true);
  });

  it('section-workspace allows escalation', () => {
    expect(STAGE_ALLOWS_EDIT_ESCALATION['section-workspace']).toBe(true);
  });

  it('review allows escalation', () => {
    expect(STAGE_ALLOWS_EDIT_ESCALATION['review']).toBe(true);
  });

  it('submissions does not allow escalation', () => {
    expect(STAGE_ALLOWS_EDIT_ESCALATION['submissions']).toBe(false);
  });
});
