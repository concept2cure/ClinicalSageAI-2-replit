/**
 * Tests for describeToolPlan — the human-readable narration labels surfaced
 * in the stream's tool_use / tool_result events (and the tool trace). Pure.
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
      'Reconciling where your program stands',
    ]);
    // Each step echoes its tool name so the client can correlate with events.
    expect(plan.map(p => p.tool)).toEqual([
      'regulatory_deadline_radar',
      'scan_project_risks',
      'detect_evidence_contradictions',
      'get_session_briefing',
    ]);
  });

  it('interpolates input into parameterized labels', () => {
    const [d] = describeToolPlan([
      { id: '1', name: 'lookup_submission_deficiencies', input: { submission_type: 'nda' } },
    ]);
    expect(d.label).toBe('Looking up likely submission deficiencies for Nda');
  });

  it('falls back to a humanized name for unlabeled tools (never raw snake_case)', () => {
    const [d] = describeToolPlan([{ id: '1', name: 'some_unmapped_tool', input: {} }]);
    expect(d.label).toBe('Some unmapped tool');
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
      'Reading the vault document',
      'Saving the document to the vault',
      'Opening the Trial Master File',
      'Finding the reports that fit your programs',
      'Drafting the Module 2.5 Clinical Overview',
    ]);
  });

  it('reports the batch draft count in the human label', () => {
    const [one] = describeToolPlan([{ id: '1', name: 'batch_draft_sections', input: { sections: [{}] } }]);
    expect(one.label).toBe('Drafting 1 section in parallel');
    const [many] = describeToolPlan([
      { id: '2', name: 'batch_draft_sections', input: { sections: [{}, {}, {}, {}, {}] } },
    ]);
    expect(many.label).toBe('Drafting 5 sections in parallel');
    const [none] = describeToolPlan([{ id: '3', name: 'batch_draft_sections', input: {} }]);
    expect(none.label).toBe('Drafting sections in parallel');
  });

  it('labels the connected-repository search with the query', () => {
    const [d] = describeToolPlan([
      { id: '1', name: 'search_connected_repositories', input: { query: 'signed 1572' } },
    ]);
    expect(d.label).toBe('Searching your connected repositories for "signed 1572"');
  });

  it('interpolates the report type into the generate_report label', () => {
    const [d] = describeToolPlan([
      { id: '1', name: 'generate_report', input: { report_type_id: 'readiness.executive_digest' } },
    ]);
    expect(d.label).toBe('Generating the "readiness.executive_digest" report');
    const [bare] = describeToolPlan([{ id: '2', name: 'generate_report', input: {} }]);
    expect(bare.label).toBe('Generating the report');
  });
});
