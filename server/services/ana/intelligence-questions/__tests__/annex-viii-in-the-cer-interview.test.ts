/**
 * The CER interview's own answers reach the Annex VIII engine (founder's
 * directive, 2026-10-12).
 *
 * `annex-viii-classification.test.ts` holds the reading and the sentences. This
 * holds the thing that was actually missing: that the facts a person answers in
 * the CER flow, in the nodes that flow asks them in, arrive at the engine and
 * come back on the interview's issue trail.
 */
import { describe, expect, it } from 'vitest';

import type { FlowEngineContext, FlowState } from '../types.js';
import { advanceFlow } from '../engine.js';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null, clientType: 'medtech' };

const at = (currentNodeId: string, answers: Record<string, Record<string, unknown>> = {}): FlowState => ({
  flowId: 'cer-report-v1',
  flowCategory: 'cer_report',
  currentNodeId,
  answers,
  completedNodes: [],
  issues: [],
  startedAt: '2026-10-12T00:00:00.000Z',
  complete: false,
  sectionProgress: {},
});

/** The classification-detail answers, submitted in the node the CER flow asks them in. */
const DETAIL = {
  classification_justification:
    'Non-invasive external device with no energy source, used transiently on intact skin; Annex VIII Rule 1 applies.',
  invasiveness_type: 'non_invasive',
  active_device: 'no',
  body_contact_type: 'skin',
};

const noticesOf = (result: { event: { newIssues?: Array<{ checkId: string; message: string }> } | null }) =>
  (result.event?.newIssues ?? []).filter(i => i.checkId.startsWith('annex_viii_'));

describe('a CER programme that answers the classification facts', () => {
  it('is told the class the rules reach, and which rule reached it', () => {
    const result = advanceFlow(
      at('device_classification_detail', { intended_purpose: { duration_of_use: 'transient' } }),
      'device_classification_detail',
      DETAIL,
      CTX,
    );
    const stated = noticesOf(result).find(i => i.checkId === 'annex_viii_class_stated');
    expect(stated, 'the engine was asking for these facts and the interview was asking them').toBeDefined();
    expect(stated!.message).toMatch(/Rule 1/);
  });

  it('is told when the class it declared earlier disagrees with its own answers', () => {
    /* The class is declared in `cer_device_info`, four nodes before the facts
       are given — so nothing but the flattened view could have compared them. */
    const result = advanceFlow(
      at('device_classification_detail', {
        cer_device_info: { eu_mdr_class: 'class_iib' },
        intended_purpose: { duration_of_use: 'transient' },
      }),
      'device_classification_detail',
      DETAIL,
      CTX,
    );
    const mismatch = noticesOf(result).find(i => i.checkId === 'annex_viii_class_mismatch')!;
    expect(mismatch).toBeDefined();
    expect(mismatch.message).toMatch(/stated Class IIb/);
    expect(mismatch.message).toMatch(/Class I under Annex VIII Rule 1/);
  });

  it('is told which facts the rules still need, in the engine’s own words', () => {
    const result = advanceFlow(
      at('device_classification_detail'),
      'device_classification_detail',
      { ...DETAIL, invasiveness_type: 'surgically_invasive' },
      CTX,
    );
    const open = noticesOf(result).find(i => i.checkId === 'annex_viii_not_determined')!;
    expect(open, 'a surgically invasive device with no duration is not classified').toBeDefined();
    expect(open.message).toMatch(/cannot be determined without/);
  });

  it('is told when the rule it cited is not the rule that decides', () => {
    const result = advanceFlow(
      at('device_classification_detail', { intended_purpose: { duration_of_use: 'transient' } }),
      'device_classification_detail',
      {
        ...DETAIL,
        classification_justification:
          'Classified under Annex VIII Rule 11 as software providing information for diagnostic decisions.',
        classification_rule: 'Rule 11',
      },
      CTX,
    );
    const cited = noticesOf(result).find(i => i.checkId === 'annex_viii_rule_not_cited')!;
    expect(cited).toBeDefined();
    expect(cited.message).toMatch(/You cited Rule 11/);
  });

  it('says nothing to a node whose answers state no classification fact', () => {
    /* This case was written with field ids the node does not have, so
       validation refused the answers, `advanceFlow` returned before the
       notices were computed, and the assertion passed vacuously — the exact
       failure the house rule about gates is about. The ids are the node's own
       now, and the test proves validation passed before it proves silence. */
    const result = advanceFlow(
      at('cer_device_info'),
      'cer_device_info',
      {
        cer_device_name: 'Acme external monitor',
        cer_manufacturer: 'Acme Medical BV',
        ce_marking_status: 'ce_marked_mdr',
        device_description_summary:
          'An external patient monitor that displays vital signs at the bedside and records them for review.',
        is_implantable: 'no',
        is_novel_device: 'no',
        eu_mdr_class: 'class_iia',
      },
      CTX,
    );
    const validation = (result.event?.newIssues ?? []).filter(i => i.checkId.startsWith('validation_'));
    expect(validation.map(i => i.checkId), 'the answers must be accepted for the silence to mean anything').toEqual([]);
    expect(noticesOf(result), 'a declared class alone is not a classification to check').toEqual([]);
  });

  it('reads the implantable answer the first node asks, which decides Rule 8', () => {
    const result = advanceFlow(
      at('device_classification_detail', {
        cer_device_info: { is_implantable: 'yes' },
        intended_purpose: { duration_of_use: 'permanent' },
      }),
      'device_classification_detail',
      { ...DETAIL, invasiveness_type: 'implantable' },
      CTX,
    );
    const stated = noticesOf(result).find(i => i.checkId === 'annex_viii_class_stated')!;
    expect(stated, 'an implant is Rule 8, and the answer is given four nodes earlier').toBeDefined();
    expect(stated.message).toMatch(/Rule 8/);
  });
});
