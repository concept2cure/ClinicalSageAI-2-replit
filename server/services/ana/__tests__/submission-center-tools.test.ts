/**
 * Smoke tests for the submission-center AnA tools.
 *
 * Verify wiring without a DB:
 *   1. Each tool is registered (getToolHandler returns a function) and present in ALL_ANA_TOOLS.
 *   2. The three pure compute tools (lifecycle / STF / cross-references) actually compute.
 *   3. The two ingestion tools refuse to run without ToolContext (org + user) and validate inputs.
 *
 * The persistence path of the ingestion tools is exercised by integration tests
 * against a seeded DB fixture.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler, type ToolContext } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const SUBMISSION_TOOLS = [
  'compute_lifecycle_operations',
  'generate_stf',
  'check_ectd_cross_references',
  'classify_submission_document',
  'extract_submission_document',
  'validate_ectd_package',
  'run_shadow_review',
  'plan_submission',
  'explain_validation_findings',
  'cross_region_gap_analysis',
  'dispatch_qc_check',
];

describe('submission-center AnA tools — registration', () => {
  it('registers a handler for every submission-center tool', () => {
    for (const name of SUBMISSION_TOOLS) {
      expect(typeof getToolHandler(name)).toBe('function');
    }
  });

  it('exposes every submission-center tool in ALL_ANA_TOOLS with a valid schema', () => {
    for (const name of SUBMISSION_TOOLS) {
      const tool = ALL_ANA_TOOLS.find(t => t.name === name);
      expect(tool, `${name} missing from ALL_ANA_TOOLS`).toBeTruthy();
      expect(tool!.input_schema.type).toBe('object');
      expect(typeof tool!.description).toBe('string');
    }
  });
});

describe('compute_lifecycle_operations (pure)', () => {
  it('diffs prior vs desired and assigns operations', async () => {
    const handler = getToolHandler('compute_lifecycle_operations')!;
    const out = JSON.parse(
      await handler({
        prior_leaves: [{ ctd_section: '2.5', file_name: 'overview.pdf', md5: 'a' }],
        desired_leaves: [
          { ctd_section: '2.5', file_name: 'overview.pdf', md5: 'b' }, // replace
          { ctd_section: '3.2.P.1', file_name: 'comp.pdf', md5: 'c' }, // new
        ],
      })
    );
    expect(out.ok).toBe(true);
    expect(out.summary).toMatchObject({ new: 1, replace: 1 });
  });
});

describe('generate_stf (pure)', () => {
  it('produces one stf.xml per study', async () => {
    const handler = getToolHandler('generate_stf')!;
    const out = JSON.parse(
      await handler({
        leaves: [
          { study_id: 'S-1', file_tag: 'study-report-body', ctd_section: '5.3.5.1', href: 'm5/s1/body.pdf', title: 'Body', operation: 'new' },
        ],
      })
    );
    expect(out.ok).toBe(true);
    expect(out.summary.studies).toBe(1);
    expect(out.files[0].xml).toContain('<study-id>S-1</study-id>');
  });

  it('returns a structured error when a tagged leaf is missing its file-tag', async () => {
    const handler = getToolHandler('generate_stf')!;
    const out = JSON.parse(
      await handler({ leaves: [{ study_id: 'S-1', file_tag: '', ctd_section: '5.3.5.1', href: 'h', title: 't', operation: 'new' }] })
    );
    expect(out.error).toMatch(/file-tag/);
  });
});

describe('check_ectd_cross_references (pure)', () => {
  it('resolves present references and flags missing targets', async () => {
    const handler = getToolHandler('check_ectd_cross_references')!;
    const out = JSON.parse(
      await handler({
        leaves: [
          { ctd_section: '2.5', file_name: 'overview.pdf', operation: 'new' },
          { ctd_section: '2.7', file_name: 'summary.pdf', operation: 'new' },
        ],
        references: [
          { source: '2.5', target: '2.7' }, // resolves
          { source: '2.5', target: '9.9' }, // broken
        ],
      })
    );
    expect(out.resolved).toHaveLength(1);
    expect(out.broken).toHaveLength(1);
    expect(out.ok).toBe(false);
  });
});

describe('validate_ectd_package (pure)', () => {
  it('returns a verdict, score, and findings for a leaf set', async () => {
    const handler = getToolHandler('validate_ectd_package')!;
    const out = JSON.parse(
      await handler({
        submission_type: 'IND',
        leaves: [
          { section_code: 'm1.1', title: 'Cover', checksum: 'd41d8cd98f00b204e9800998ecf8427e', operation: 'new', file_path: 'm1/us/cover.pdf' },
        ],
      })
    );
    expect(out.ok).toBe(true);
    expect(typeof out.score).toBe('number');
    expect(Array.isArray(out.findings)).toBe(true);
    expect(typeof out.valid).toBe('boolean');
  });
});

describe('submission AI tasks — tenant + input guards', () => {
  it('plan_submission refuses without org/user context', async () => {
    const handler = getToolHandler('plan_submission')!;
    const out = JSON.parse(await handler({ application_type: 'ind', client_type: 'biotech', regions: ['fda'] }, {} as ToolContext));
    expect(out.error).toMatch(/tenant context/);
  });
  it('plan_submission validates required inputs', async () => {
    const handler = getToolHandler('plan_submission')!;
    const out = JSON.parse(await handler({ client_type: 'biotech', regions: ['fda'] }, { organizationId: 1, userId: 2 } as ToolContext));
    expect(out.error).toMatch(/application_type/);
  });
  it('explain_validation_findings refuses without org/user context', async () => {
    const handler = getToolHandler('explain_validation_findings')!;
    const out = JSON.parse(await handler({ region: 'fda', findings: [{ severity: 'error', message: 'x' }] }, {} as ToolContext));
    expect(out.error).toMatch(/tenant context/);
  });
  it('cross_region_gap_analysis validates required inputs', async () => {
    const handler = getToolHandler('cross_region_gap_analysis')!;
    const out = JSON.parse(await handler({ source_region: 'fda' }, { organizationId: 1, userId: 2 } as ToolContext));
    expect(out.error).toMatch(/target_regions|application_type/);
  });
  it('dispatch_qc_check refuses without org/user context', async () => {
    const handler = getToolHandler('dispatch_qc_check')!;
    const out = JSON.parse(await handler({ region: 'fda', validation_errors: 0, unresolved_shadow_criticals: 0, leaves: [] }, {} as ToolContext));
    expect(out.error).toMatch(/tenant context/);
  });
});

describe('ingestion tools — tenant + input guards', () => {
  it('classify_submission_document refuses without org/user context', async () => {
    const handler = getToolHandler('classify_submission_document')!;
    const out = JSON.parse(await handler({ document_id: 1 }, {} as ToolContext));
    expect(out.error).toMatch(/tenant context/);
  });

  it('classify_submission_document requires a numeric document_id', async () => {
    const handler = getToolHandler('classify_submission_document')!;
    const out = JSON.parse(await handler({}, { organizationId: 1, userId: 2 } as ToolContext));
    expect(out.error).toMatch(/document_id/);
  });

  it('extract_submission_document refuses without org/user context', async () => {
    const handler = getToolHandler('extract_submission_document')!;
    const out = JSON.parse(await handler({ document_id: 1, section_code: '2.7', submission_id: 1 }, {} as ToolContext));
    expect(out.error).toMatch(/tenant context/);
  });

  it('extract_submission_document validates required inputs', async () => {
    const handler = getToolHandler('extract_submission_document')!;
    const out = JSON.parse(await handler({ document_id: 1 }, { organizationId: 1, userId: 2 } as ToolContext));
    expect(out.error).toMatch(/section_code|submission_id/);
  });
});
