/**
 * The describe_capabilities tool DESCRIPTION says a configured integration can
 * be tried — not that it is live or verified working.
 *
 * The handler's guidance was corrected (describe-capabilities-says-configured-
 * is-not-working.test.ts), but the description the model reads before it ever
 * calls the tool still said it introspects AnA's "OWN live abilities" so the
 * model would "only promise and attempt what is truly available". Nothing in
 * the tool calls an integration: every entry's reachability is 'unchecked', so
 * "configured" is all it can report.
 */
import { describe, expect, it } from 'vitest';
import { DESCRIBE_CAPABILITIES } from '../evidence-literature-tool-defs';

describe('describe_capabilities description: configured can be tried, not verified', () => {
  it('does not call configured integrations live or truly available', () => {
    const description = DESCRIBE_CAPABILITIES.description;
    expect(description).not.toMatch(/truly available/i);
    expect(description).not.toMatch(/live abilities/i);
  });

  it('says a configured integration can be tried and is not verified working', () => {
    const description = DESCRIBE_CAPABILITIES.description;
    expect(description).toMatch(/configured .*can be tried/i);
    expect(description).toMatch(/not (verified|known) to work/i);
  });
});
