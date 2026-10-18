/**
 * A question that offers positions enforces them, and one that offers none
 * does not take a position (2026-10-12 review).
 *
 * Two holes the review found on the enforcement side of the catalogue work:
 *
 *   1. `validateAnswers` checked a value against the field's options only for
 *      `select` and `radio`. So `agency_select` — the one answer the platform
 *      keys the Module 1 backbone, the validation profile, the gateway and the
 *      routes on — offered twelve agencies and accepted anything. A caller
 *      could store prose where the question asked for a region.
 *   2. A question whose governed catalogue holds nothing for this programme
 *      (AnA has no routes to market for PMDA) offers NO positions, so the
 *      option check had nothing to check against and every string passed. The
 *      card sends the person's own words under OTHER_POSITION; a tool or an
 *      API caller could send prose, and the record would carry it as though
 *      AnA had offered it.
 *
 * And one honesty defect beside them: an agency named in the person's own words
 * left `primaryRegion` unset, so the route question told them no agency had
 * been named — contradicting the answer they had just given.
 */
import { describe, expect, it } from 'vitest';

import { OTHER_POSITION, otherFieldId } from '@shared/types/intelligence-questions';
import type { FlowEngineContext, FlowState } from '../types.js';
import { advanceFlow } from '../engine.js';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null, clientType: 'medtech' };

const at = (currentNodeId: string, answers: Record<string, Record<string, unknown>> = {}): FlowState => ({
  flowId: 'project-setup-v1',
  flowCategory: 'project_setup',
  currentNodeId,
  answers,
  completedNodes: [],
  issues: [],
  startedAt: '2026-10-12T00:00:00.000Z',
  complete: false,
  sectionProgress: {},
});

const validationOf = (result: { event: { newIssues?: Array<{ checkId: string; message: string }> } | null }) =>
  (result.event?.newIssues ?? []).filter(i => i.checkId.startsWith('validation_'));

describe('the agency question', () => {
  it('refuses an agency it does not offer, rather than storing prose', () => {
    const refused = advanceFlow(
      at('regulatory_targets'),
      'regulatory_targets',
      { primary_regulatory_agency: 'the Belgian competent authority' },
      CTX,
    );
    const errors = validationOf(refused);
    expect(errors.length, 'twelve agencies offered and anything accepted').toBe(1);
    expect(errors[0].message).toMatch(/is not a valid option/);
  });

  it('takes one it does offer', () => {
    const taken = advanceFlow(at('regulatory_targets'), 'regulatory_targets', { primary_regulatory_agency: 'JP' }, CTX);
    expect(validationOf(taken)).toEqual([]);
  });

  it('takes an agency it does not hold in the person’s own words', () => {
    const own = advanceFlow(
      at('regulatory_targets'),
      'regulatory_targets',
      {
        primary_regulatory_agency: OTHER_POSITION,
        [otherFieldId('primary_regulatory_agency')]: 'ANVISA, through a Brazilian registration holder',
      },
      CTX,
    );
    expect(validationOf(own)).toEqual([]);
    expect(own.state.ownWords?.regulatory_targets?.primary_regulatory_agency).toMatch(/ANVISA/);
  });

  it('does not then tell them no agency was named', () => {
    /* The route question falls back to FDA's routes, which is honest, but it
       used to say "No primary agency has been named yet" to a person who had
       just named one. */
    const drawn = advanceFlow(
      at('device_classification', {
        regulatory_targets: { primary_regulatory_agency: OTHER_POSITION, product_type: 'medical_device' },
      }),
      'device_classification',
      { device_class: 'class_ii' },
      CTX,
    ).event!.node;
    const help = drawn.fields.find(f => f.id === 'device_submission_pathway')?.helpText ?? '';
    expect(help, 'contradicting the answer they gave').not.toMatch(/No primary agency has been named/);
    expect(help).toMatch(/does not hold the agency you named/);
    expect(help, 'and says whose routes these are instead').toMatch(/these are FDA’s/);
  });
});

describe('a question whose catalogue holds nothing for this programme', () => {
  const japan = () =>
    at('medtech_regulatory', {
      regulatory_targets: { primary_regulatory_agency: 'JP', product_type: 'medical_device' },
    });

  it('refuses a position, because it offered none', () => {
    const refused = advanceFlow(japan(), 'medtech_regulatory', { device_submission_pathway: 'Shonin application' }, CTX);
    const errors = validationOf(refused);
    expect(errors.length, 'every string passed before this').toBe(1);
    expect(errors[0].message).toMatch(/holds no positions for this programme/);
    expect(errors[0].message, 'and says what to do instead').toMatch(/own words/);
  });

  it('takes the person’s own words, which are the answer here', () => {
    const own = advanceFlow(
      japan(),
      'medtech_regulatory',
      {
        device_submission_pathway: OTHER_POSITION,
        [otherFieldId('device_submission_pathway')]: 'Shonin application via a Japanese marketing authorisation holder',
      },
      CTX,
    );
    expect(validationOf(own)).toEqual([]);
    expect(own.state.ownWords?.medtech_regulatory?.device_submission_pathway).toMatch(/Shonin/);
  });

  it('still takes a position where the catalogue DOES hold them', () => {
    const us = advanceFlow(
      at('medtech_regulatory', {
        regulatory_targets: { primary_regulatory_agency: 'US', product_type: 'medical_device' },
      }),
      'medtech_regulatory',
      { device_submission_pathway: 'US_510K', predicate_device: 'K123456 — Acme' },
      CTX,
    );
    expect(validationOf(us)).toEqual([]);
  });
});
