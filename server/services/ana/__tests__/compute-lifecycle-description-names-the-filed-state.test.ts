/**
 * compute_lifecycle_operations tells the model what a named prior sequence loads:
 * the state on file through that sequence, from sequences sent or acknowledged,
 * and that a named sequence not on file fails with PRIOR_SEQUENCE_NOT_FOUND.
 *
 * Until 2026-10-15 the tool said the prior sequence's "stored leaf manifest is
 * loaded automatically from your organization's compilation history", and the
 * prior_sequence_number property that the engine "loads that sequence's stored
 * leaves". The loader now reads only filed compiles (sent or acknowledged), folds
 * the filed history through the named sequence, and refuses a sequence that is
 * not on file, none of which the model was told.
 */
import { describe, it, expect } from 'vitest';
import { COMPUTE_LIFECYCLE_OPERATIONS } from '../submission-center-tool-defs';
import { PriorSequenceNotFoundError } from '../../ectd/prior-sequence-loader';

const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;
const NOT_FOUND = new PriorSequenceNotFoundError('').code;
const props = COMPUTE_LIFECYCLE_OPERATIONS.input_schema.properties as Record<string, { description: string }>;

describe('compute_lifecycle_operations', () => {
  const description = COMPUTE_LIFECYCLE_OPERATIONS.description;

  it('says a named prior sequence loads the state on file through it, from sequences sent or acknowledged', () => {
    expect(description).toMatch(/state on file through that sequence/);
    expect(description).toMatch(/sent or acknowledged/);
    expect(description).not.toMatch(/compilation history/);
  });

  it(`says a named sequence not on file fails with ${NOT_FOUND}`, () => {
    expect(description).toContain(`not on file fails with ${NOT_FOUND}`);
  });

  it('fits under the 1024-character tool-description limit', () => {
    expect(description.length).toBeLessThanOrEqual(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
  });

  it('its prior-sequence properties say the same', () => {
    for (const name of ['application_number', 'prior_sequence_number']) {
      expect(props[name].description, name).toMatch(/state on file through/);
      expect(props[name].description, name).not.toMatch(/compilation history|stored leaves/);
    }
    expect(props.prior_sequence_number.description).toContain(NOT_FOUND);
  });
});
