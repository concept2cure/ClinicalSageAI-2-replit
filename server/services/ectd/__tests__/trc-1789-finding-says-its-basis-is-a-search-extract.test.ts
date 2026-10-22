/**
 * A TRC 1789 finding says what its basis is: a search extract of FDA's page,
 * not regulator text.
 *
 * Until 2026-10-15 the rule on every STF-coverage finding ended "regulator text
 * read through search, 2026-10-05)". fda.gov is refused by this environment's
 * egress policy, so the PDF was never opened; only search extracts were seen, and
 * shared/regulatory/regulatory-basis.ts files a search extract as `recall`, not
 * `regulator-text` (the bases matched only against search extracts were
 * relabelled recall that day). The finding told its reader the rule had been
 * checked against FDA's text.
 */
import { describe, it, expect } from 'vitest';
import { auditStfCoverage } from '../ectd4-validator';

describe('auditStfCoverage — the basis a TRC 1789 finding states', () => {
  const [finding] = auditStfCoverage([{ section: '5.3.5.1', title: 'Pivotal study report' }], {
    region: 'US',
    fileTagModelled: false,
  });

  it('names a search extract of the regulator page, and says the PDF was not read', () => {
    expect(finding.rule).toContain('seen in a search extract of the regulator page, 2026-10-05; the PDF was not read)');
  });

  it('does not present the rule as regulator text', () => {
    expect(finding.rule).not.toMatch(/regulator text/);
  });
});
