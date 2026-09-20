/**
 * A FHIR validation rule that threw is not a rule the resource satisfied.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * executeRule already had the correct behaviour, with the comment to match:
 *
 *     } catch (error) {
 *       // Rule execution error = validation failure
 *       return { passed: false };
 *     }
 *
 * But checkValueSet and checkSlice each ended
 * `catch { return { passed: true }; }`, catching the exception one level DOWN
 * and reporting the rule as complied-with. A malformed valueSet expression —
 * JSON.parse throws on anything that is not JSON — therefore turned a
 * coded-value constraint into a pass.
 *
 * The switch's `default:` arm did the same in a different shape: an
 * unrecognised ruleType returned `{ passed: true }`, reporting a rule that was
 * never evaluated as satisfied. That one was not in the finding.
 *
 * REACH: this service is mounted nowhere — affirmatively disproven at three
 * hops during verification, which is why the finding was re-rated from critical
 * to low. It is fixed anyway: a rule engine that reports unevaluated rules as
 * passed is wrong wherever it is eventually wired.
 */
import { describe, it, expect } from 'vitest';

import { FHIRValidationEngine } from '../fhir-validation.service';

/** Reach the private dispatcher; no pool call is made on these paths. */
function execute(rule: unknown, resource: unknown): { passed: boolean } {
  const engine = new FHIRValidationEngine({ pool: {} as never });
  return (
    engine as unknown as {
      executeRule: (r: unknown, res: unknown) => { passed: boolean };
    }
  ).executeRule(rule, resource);
}

describe('an unevaluated rule is never reported as satisfied', () => {
  it('fails a valueSet rule whose expression cannot be parsed', () => {
    const result = execute(
      { id: 'r1', ruleType: 'valueset', fhirPath: 'status', expression: 'not-json' },
      { resourceType: 'Patient', status: 'active' },
    );

    // Was { passed: true }: a constraint that could not be evaluated, recorded
    // as met.
    expect(result.passed).toBe(false);
  });

  it('fails a slice rule whose expression cannot be parsed', () => {
    const result = execute(
      { id: 'r2', ruleType: 'slice', fhirPath: 'name', expression: '{malformed' },
      { resourceType: 'Patient', name: [{ use: 'official' }] },
    );

    expect(result.passed).toBe(false);
  });

  it('fails a rule whose type it does not recognise', () => {
    const result = execute(
      { id: 'r3', ruleType: 'no-such-rule-type', fhirPath: 'status', expression: '[]' },
      { resourceType: 'Patient', status: 'active' },
    );

    expect(result.passed).toBe(false);
  });

  it('still passes a valueSet rule the resource genuinely satisfies', () => {
    // The fix removes fail-open, not the rule engine.
    const result = execute(
      {
        id: 'r4',
        ruleType: 'valueset',
        fhirPath: 'status',
        expression: JSON.stringify(['active', 'inactive']),
      },
      { resourceType: 'Patient', status: 'active' },
    );

    expect(result.passed).toBe(true);
  });
});
