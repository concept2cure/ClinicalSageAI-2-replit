/**
 * The branches that could never be taken, in the real interviews
 * (founder's directive, 2026-10-12).
 *
 * `branch-reads-every-answer.test.ts` holds the engine's behaviour on a
 * two-node flow of its own. This holds the consequence where it matters: the
 * questions 30 dead branch predicates were guarding, in the flows a sponsor
 * actually answers. A device that is provided sterile was never asked how it
 * is sterilised; a device containing software was never asked to classify it;
 * a vaccine BLA was never asked for lot release.
 *
 * Each case names the field the branch reads, the node that asks it, and the
 * node that could not be reached.
 */
import { describe, expect, it } from 'vitest';

import type { FlowCategory, FlowEngineContext, FlowState } from '../types.js';
import { advanceFlow } from '../engine.js';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null, clientType: 'medtech' };

const stateAt = (
  flowCategory: FlowCategory,
  currentNodeId: string,
  answers: Record<string, Record<string, unknown>>,
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

describe('a 510(k) for a device provided sterile', () => {
  /* `is_sterile` is asked in `device_basics`; the branch to `sterilization` is
     declared on `biocompatibility`, four nodes later. */
  const atBiocompatibility = (basics: Record<string, unknown>) =>
    advanceFlow(
      stateAt('device_510k', 'biocompatibility', { device_basics: basics }),
      'biocompatibility',
      { biocompat_required: 'no' },
      CTX,
    );

  it('reaches the sterilisation questions', () => {
    const result = atBiocompatibility({ is_sterile: 'yes', contains_software: 'no', is_electronic: 'no' });
    expect(result.event?.node.id, 'a sterile device was never asked how it is sterilised').toBe('sterilization');
  });

  it('reaches the software classification for a device containing software', () => {
    const result = atBiocompatibility({ is_sterile: 'no', contains_software: 'yes', is_electronic: 'no' });
    expect(result.event?.node.id).toBe('software_classification');
  });

  it('reaches the EMC testing for an electrically powered device, which the flow puts first', () => {
    const result = atBiocompatibility({ is_sterile: 'yes', contains_software: 'yes', is_electronic: 'yes' });
    expect(result.event?.node.id, 'the flow’s own branch order decides').toBe('emc_testing_detail');
  });

  it('goes on to labelling where none of them applies, as it always did', () => {
    const result = atBiocompatibility({ is_sterile: 'no', contains_software: 'no', is_electronic: 'no' });
    expect(result.event?.node.id).toBe('labeling');
  });
});

describe('a BLA for a vaccine', () => {
  it('reaches the lot-release questions', () => {
    /* `product_class` is asked in `product_identification`; the branch to
       `vaccine_lot_release` is declared on `process_validation_comparability`. */
    const result = advanceFlow(
      stateAt('bla_submission', 'process_validation_comparability', { product_identification: { product_class: 'vaccine' } }),
      'process_validation_comparability',
      {
        process_validation_status: 'ongoing',
        cpps_defined: 'yes',
        cqas_defined: 'yes',
        control_strategy:
          'In-process controls link each critical process parameter to the quality attribute it affects, with release specifications set from the qualification batches.',
        lot_release_testing: 'no',
      },
      { ...CTX, clientType: 'pharma' },
    );
    expect(result.event?.node.id, 'a vaccine BLA was never asked for lot release').toBe('vaccine_lot_release');
  });
});
