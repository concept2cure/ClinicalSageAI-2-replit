import { describe, expect, it } from 'vitest';
import { WORKFLOW_TRANSITION_MAP } from '../workspaceShellControllers';

describe('WORKFLOW_TRANSITION_MAP', () => {
  it('defines required launch transition states', () => {
    expect(Object.keys(WORKFLOW_TRANSITION_MAP).sort()).toEqual([
      'browse_list',
      'dossier_planning',
      'edit_document',
      'project_home',
      'publish_package',
      'verify_review',
    ]);
  });

  it('requires context for edit and publish transitions', () => {
    expect(WORKFLOW_TRANSITION_MAP.edit_document.requires).toBe('selectedDocOrCreateIntent');
    expect(WORKFLOW_TRANSITION_MAP.publish_package.requires).toBe('submissionContext');
  });
});
