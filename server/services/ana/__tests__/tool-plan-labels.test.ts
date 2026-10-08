/**
 * Tests for describeToolPlan — the human-readable narration labels surfaced
 * in the stream's step and tool_use events (and the tool trace). Pure.
 *
 * Since ANA-SUMMARY S3 every label comes from the tool's `present` entry in
 * tool-authorization.register.json through presentStep, in the doing form
 * (the stream switches a finished step to the done form). What a step was
 * asked is its preview, never part of its label, so an input — a report type
 * id, a query, a count of sections the model listed — no longer reaches the
 * label (step-presentation.test.ts covers the preview).
 */

import { describe, it, expect } from 'vitest';
import { describeToolPlan } from '../agentic-loop.js';

describe('describeToolPlan', () => {
  it('gives friendly, calm labels to the proactive / evidence tools', () => {
    const plan = describeToolPlan([
      { id: '1', name: 'regulatory_deadline_radar', input: {} },
      { id: '2', name: 'scan_project_risks', input: {} },
      { id: '3', name: 'detect_evidence_contradictions', input: {} },
      { id: '4', name: 'get_session_briefing', input: {} },
    ]);
    expect(plan.map(p => p.label)).toEqual([
      'Scanning regulatory deadlines',
      'Scanning open project risks',
      'Checking the evidence for contradictions',
      'Looking up where your program stands',
    ]);
    // Each step echoes its tool name so the client can correlate with events.
    expect(plan.map(p => p.tool)).toEqual([
      'regulatory_deadline_radar',
      'scan_project_risks',
      'detect_evidence_contradictions',
      'get_session_briefing',
    ]);
  });

  it('keeps the input out of the label: it is the preview, from allow-listed fields only', () => {
    const [d] = describeToolPlan([
      { id: '1', name: 'lookup_submission_deficiencies', input: { submission_type: 'nda' } },
    ]);
    expect(d.label).toBe('Looking up likely submission deficiencies');
  });

  it('reads "Running a step" for a tool with no entry, never its name', () => {
    const [d] = describeToolPlan([{ id: '1', name: 'some_unmapped_tool', input: {} }]);
    expect(d.label).toBe('Running a step');
    expect(d.label).not.toMatch(/unmapped/i);
  });

  it('gives calm labels to the document-lifecycle + eTMF + reporting tools', () => {
    const plan = describeToolPlan([
      { id: '1', name: 'read_vault_document', input: {} },
      { id: '2', name: 'save_document_to_vault', input: {} },
      { id: '3', name: 'get_tmf_view', input: {} },
      { id: '4', name: 'suggest_reports', input: {} },
      { id: '5', name: 'draft_clinical_overview_m2_5', input: {} },
    ]);
    expect(plan.map(p => p.label)).toEqual([
      // Not "the vault document": this tool reads the Artifacts Center, and the
      // Vault is a different store (vault-named-tools-honesty.test.ts).
      'Reading an Artifacts Center document',
      'Saving a document to the Vault',
      'Opening the Trial Master File',
      'Looking up reports that fit your programs',
      'Drafting the Module 2.5 Clinical Overview',
    ]);
  });

  it('labels a batch draft without a count the model chose', () => {
    const [one] = describeToolPlan([{ id: '1', name: 'batch_draft_sections', input: { sections: [{}] } }]);
    const [many] = describeToolPlan([{ id: '2', name: 'batch_draft_sections', input: { sections: [{}, {}, {}, {}, {}] } }]);
    expect(one.label).toBe('Drafting several sections at once');
    expect(many.label).toBe(one.label);
  });

  it('labels the connected-repository search by what it searches; the query is the preview', () => {
    const [d] = describeToolPlan([
      { id: '1', name: 'search_connected_repositories', input: { query: 'signed 1572' } },
    ]);
    expect(d.label).toBe('Searching your connected repositories');
  });

  it('never puts a report type id in the generate_report label', () => {
    const [d] = describeToolPlan([
      { id: '1', name: 'generate_report', input: { report_type_id: 'readiness.executive_digest' } },
    ]);
    expect(d.label).toBe('Generating a report');
    expect(d.label).not.toContain('readiness.executive_digest');
  });
});
