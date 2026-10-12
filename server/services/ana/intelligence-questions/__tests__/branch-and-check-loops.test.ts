/**
 * What reading every answer brought to life, and what it must refuse
 * (review of the eight question-directive commits, 2026-10-12).
 *
 * `df8e5200` made branch predicates read every answer the interview holds,
 * which was right and which woke 30 dead branches. A five-lens review of that
 * change found three things it had not walked:
 *
 *   1. one of those branches targets its OWN node — an emergency IND looped on
 *      `ind_review` for ever;
 *   2. the identical one-argument defect was still in `runIssueChecks`, one
 *      line below the branch call, silencing the single cross-node issue check
 *      in the repository: a critical MDR finding for a Class III device with no
 *      clinical investigation;
 *   3. the slice claimed a multi-country device project now reaches the
 *      timeline question, and it did not — the only branch to that node was on
 *      a question device projects skip.
 *
 * All three are held here.
 */
import { describe, expect, it } from 'vitest';

import type { FlowCategory, FlowEngineContext, FlowState } from '../types.js';
import { advanceFlow } from '../engine.js';
import { getAvailableFlows, getFlowDefinition } from '../flows/index.js';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null, clientType: 'medtech' };

const at = (
  flowCategory: FlowCategory,
  currentNodeId: string,
  answers: Record<string, Record<string, unknown>> = {},
): FlowState => ({
  flowId: `${flowCategory}-under-test`,
  flowCategory,
  currentNodeId,
  answers,
  completedNodes: [],
  issues: [],
  startedAt: '2026-10-12T00:00:00.000Z',
  complete: false,
  sectionProgress: {},
});

describe('a branch onto its own node', () => {
  /* The engine's refusal of the shape is held in
     `branch-reads-every-answer.test.ts`, on a flow that file controls. This
     holds the flows: the one branch that had it is gone. */
  it('exists in no flow any more', () => {
    const ctx: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null };
    const loops: string[] = [];
    for (const listed of getAvailableFlows(ctx)) {
      for (const node of getFlowDefinition(listed.category, ctx)?.nodes ?? []) {
        for (const branch of node.branches ?? []) {
          if (branch.goto === node.id) loops.push(`${listed.category}.${node.id}`);
        }
      }
    }
    expect(loops, 'a branch that can only loop').toEqual([]);
  });
});

describe('an issue check that reads an earlier answer', () => {
  it('fires — it is the one cross-node check in the repository, and it is critical', () => {
    /* cer_report: a Class III device with no clinical investigation. MDR
       Article 61(4) requires one for an implantable or Class III device, and
       the check could never fire while issue checks read one node's answers. */
    const result = advanceFlow(
      at('cer_report', 'clinical_investigation_detail', {
        clinical_investigation: { clinical_investigation_available: false },
        cer_device_info: { eu_mdr_class: 'class_iii' },
      }),
      'clinical_investigation_detail',
      {},
      CTX,
    );
    const issues = result.event?.newIssues ?? result.completeEvent?.issues ?? [];
    expect(
      issues.filter(i => i.checkId.startsWith('validation_')).map(i => i.checkId),
      'and the node no longer demands ten answers about an investigation that does not exist',
    ).toEqual([]);
    expect(issues.map(i => i.checkId), 'the only cross-node issue check in 233').toContain(
      'no_clinical_investigation_class_iii_check',
    );
  });

  it('and the 232 that read their own node still fire as they did', () => {
    const result = advanceFlow(
      at('device_510k', 'device_classification'),
      'device_classification',
      {
        product_code: 'DQA',
        regulation_number: '880.5100',
        device_class: 'class_iii',
        device_intended_use: 'For the drainage of urine from the bladder in a hospital setting over several days.',
        prescription_otc: 'prescription',
      },
      CTX,
    );
    const ids = (result.event?.newIssues ?? []).map(i => i.checkId);
    expect(ids).toContain('class_iii_device_check');
  });
});

describe('a multi-country device project', () => {
  it('reaches the timeline question, which the region slice claimed and did not deliver', () => {
    const result = advanceFlow(
      at('project_setup', 'medtech_regulatory', {
        regulatory_targets: { primary_regulatory_agency: 'US', multi_country_submission: true },
        product_details: { product_type: 'medical_device' },
      }),
      'medtech_regulatory',
      { device_submission_pathway: 'US_510K', predicate_device: 'K123456 — Acme' },
      CTX,
    );
    expect(result.event?.node.id).toBe('multi_country_setup');
  });

  it('and a single-country one still goes on to the team', () => {
    const result = advanceFlow(
      at('project_setup', 'medtech_regulatory', {
        regulatory_targets: { primary_regulatory_agency: 'US', multi_country_submission: false },
        product_details: { product_type: 'medical_device' },
      }),
      'medtech_regulatory',
      { device_submission_pathway: 'US_510K', predicate_device: 'K123456 — Acme' },
      CTX,
    );
    expect(result.event?.node.id).toBe('team_assignment');
  });
});
