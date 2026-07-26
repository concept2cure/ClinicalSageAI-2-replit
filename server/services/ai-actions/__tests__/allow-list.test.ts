/**
 * AI-Actions allow-list — the 11 Phase-2 handlers (inline-AI, template extract/
 * render, OCR) are registered in index.ts but were rejected by the /execute
 * validator because VALID_ACTION_TYPES hadn't been updated. This locks in that
 * they are now accepted AND that role permissions are enforced as intended, so a
 * regression that drops them (or over-permits a mutating action) fails here.
 */
import { describe, expect, it } from 'vitest';
import { isValidActionType, checkActionPermission } from '../shared-utils';

const NEWLY_ENABLED = [
  'summarize_selection', 'explain_selection', 'rewrite_selection',
  'extract_structured_data', 'compare_selection', 'refine_with_validation_findings',
  'create_followup_task', 'attach_selection_as_source',
  'extract_template_from_upload', 'render_document_with_template', 'ocr_extract_text',
];
const ORIGINAL_EIGHT = [
  'create_document_from_artifact', 'promote_artifact', 'save_document_version',
  'run_validation', 'route_document_to_module', 'export_document',
  'attach_sources_to_document', 'refine_with_validation',
];
// Read-only analysis vs content-mutating — permissions must differ.
const READ_ONLY = ['summarize_selection', 'explain_selection', 'compare_selection', 'extract_structured_data', 'ocr_extract_text', 'extract_template_from_upload', 'render_document_with_template'];
const MUTATING = ['rewrite_selection', 'refine_with_validation_findings', 'attach_selection_as_source', 'create_followup_task'];

describe('ai-actions allow-list', () => {
  it('accepts all 11 previously-trapped Phase-2 action types', () => {
    for (const t of NEWLY_ENABLED) {
      expect(isValidActionType(t), `${t} should be a valid action type`).toBe(true);
    }
  });

  it('still accepts the original eight action types', () => {
    for (const t of ORIGINAL_EIGHT) expect(isValidActionType(t)).toBe(true);
  });

  it('rejects unknown action types', () => {
    expect(isValidActionType('definitely_not_an_action')).toBe(false);
  });

  it('lets a viewer run read-only analysis actions', () => {
    for (const t of READ_ONLY) {
      expect(checkActionPermission(t, 'viewer'), `viewer should be allowed ${t}`).toBeNull();
    }
  });

  it('blocks a viewer from content-mutating actions but allows editor and admin', () => {
    for (const t of MUTATING) {
      expect(checkActionPermission(t, 'viewer'), `viewer should be blocked from ${t}`).toBeTruthy();
      expect(checkActionPermission(t, 'editor'), `editor should be allowed ${t}`).toBeNull();
      expect(checkActionPermission(t, 'admin'), `admin should be allowed ${t}`).toBeNull();
    }
  });
});
