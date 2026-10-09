/**
 * LORENZ eValidator adapter — severity mapping + report parsing (JSON + XML) +
 * the fail-closed runExternalValidation helper.
 *
 * The engine binary itself is licensed and absent here; these lock the parsing
 * + fail-closed contract the drop-in depends on.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeSeverity,
  parseEvalidatorJsonReport,
  parseEvalidatorXmlReport,
  parseEvalidatorReport,
  LorenzEValidatorAdapter,
} from '../lorenz-adapter';
import { runExternalValidation } from '../index';

describe('normalizeSeverity', () => {
  it('maps engine tokens to error/warning/info', () => {
    expect(normalizeSeverity('Error')).toBe('error');
    expect(normalizeSeverity('High')).toBe('error');
    expect(normalizeSeverity('Warning')).toBe('warning');
    expect(normalizeSeverity('Medium')).toBe('warning');
    expect(normalizeSeverity('Pass')).toBe('info');
    expect(normalizeSeverity(undefined)).toBe('info');
  });
});

describe('parseEvalidatorJsonReport', () => {
  it('parses the native findings shape', () => {
    const f = parseEvalidatorJsonReport(JSON.stringify({
      findings: [{ ruleId: 'FDA-1734', severity: 'error', message: 'STF missing', location: 'm5/x.xml' }],
    }));
    expect(f).toEqual([{ ruleId: 'FDA-1734', severity: 'error', message: 'STF missing', leafHref: 'm5/x.xml', criterion: undefined }]);
  });
  it('parses a bare array + alternate field names', () => {
    const f = parseEvalidatorJsonReport(JSON.stringify([{ number: '2', type: 'Warning', description: 'x', href: 'a' }]));
    expect(f[0]).toMatchObject({ ruleId: '2', severity: 'warning', message: 'x', leafHref: 'a' });
  });
});

/**
 * A report this product cannot read is refused, never read as clean.
 * 2026-09-23 (W5/D7, WO-9 Click 6). The parser returned [] for any envelope
 * other than an array or {findings}, and mapped any severity it did not know to
 * 'info'; the adapter turned both into passed:true — a report it could not read,
 * or an error it could not name, cleared the external validation gate.
 */
describe('parseEvalidatorJsonReport — fails closed', () => {
  it('refuses an envelope it does not know, naming what it found', () => {
    expect(() => parseEvalidatorJsonReport(JSON.stringify({ results: [{ ruleId: '1734', severity: 'High' }] })))
      .toThrow(/not an eValidator report this product reads.*results/);
  });

  it('refuses a "findings" member that is not an array', () => {
    expect(() => parseEvalidatorJsonReport(JSON.stringify({ findings: { ruleId: '1734' } }))).toThrow(/findings/);
  });

  it('refuses a finding whose severity it cannot map, instead of counting it as info', () => {
    expect(() => parseEvalidatorJsonReport(JSON.stringify([{ ruleId: '1734', severity: 'Blocker', message: 'x' }])))
      .toThrow(/finding 1.*severity "Blocker"/);
  });

  it('refuses a finding with no severity at all', () => {
    expect(() => parseEvalidatorJsonReport(JSON.stringify([{ ruleId: '1734', message: 'x' }])))
      .toThrow(/finding 1.*no severity/);
  });

  it('refuses a row that is not an object', () => {
    expect(() => parseEvalidatorJsonReport(JSON.stringify(['1734 error']))).toThrow(/finding 1/);
  });

  it('still reads an empty findings list as no findings — a clean report is a clean report', () => {
    expect(parseEvalidatorJsonReport(JSON.stringify({ findings: [] }))).toEqual([]);
  });

  it('reads the agency severity words: High is an error, Medium and Low are warnings, Pass is info', () => {
    const f = parseEvalidatorJsonReport(JSON.stringify([
      { ruleId: 'a', severity: 'High', message: '' },
      { ruleId: 'b', severity: 'Medium', message: '' },
      { ruleId: 'c', severity: 'Low', message: '' },
      { ruleId: 'd', severity: 'Pass', message: '' },
    ]));
    expect(f.map((x) => x.severity)).toEqual(['error', 'warning', 'warning', 'info']);
  });
});

describe('parseEvalidatorXmlReport', () => {
  it('parses a LORENZ-style XML report (attrs + child message)', async () => {
    const xml = `<?xml version="1.0"?>
<eValidatorReport>
  <validationResults>
    <result severity="Error" number="1734" location="m1/us/us-regional.xml">
      <message>Missing us-regional.xml</message>
    </result>
    <result severity="Warning" number="1038" message="Form should be New"/>
  </validationResults>
</eValidatorReport>`;
    const f = await parseEvalidatorXmlReport(xml);
    expect(f.length).toBe(2);
    expect(f[0]).toMatchObject({ ruleId: '1734', severity: 'error', message: 'Missing us-regional.xml', leafHref: 'm1/us/us-regional.xml' });
    expect(f[1]).toMatchObject({ ruleId: '1038', severity: 'warning', message: 'Form should be New' });
  });
});

describe('parseEvalidatorReport (sniff)', () => {
  it('routes XML vs JSON by leading character', async () => {
    expect((await parseEvalidatorReport('[{"severity":"error","message":"m"}]'))[0].severity).toBe('error');
    expect((await parseEvalidatorReport('<r><x severity="warning" message="m"/></r>'))[0].severity).toBe('warning');
  });
});

describe('adapter configuration + fail-closed helper', () => {
  it('is not configured without EVALIDATOR_BINARY/ENDPOINT', async () => {
    const prev = { b: process.env.EVALIDATOR_BINARY, e: process.env.EVALIDATOR_ENDPOINT };
    delete process.env.EVALIDATOR_BINARY; delete process.env.EVALIDATOR_ENDPOINT;
    try {
      expect(await new LorenzEValidatorAdapter().isConfigured()).toBe(false);
    } finally {
      if (prev.b) process.env.EVALIDATOR_BINARY = prev.b;
      if (prev.e) process.env.EVALIDATOR_ENDPOINT = prev.e;
    }
  });

  it('runExternalValidation returns a fail-closed un-run report when no engine is configured', async () => {
    const prev = { b: process.env.EVALIDATOR_BINARY, e: process.env.EVALIDATOR_ENDPOINT, f: process.env.EVALIDATOR_USE_FDA_CRITERIA_FALLBACK };
    delete process.env.EVALIDATOR_BINARY; delete process.env.EVALIDATOR_ENDPOINT; delete process.env.EVALIDATOR_USE_FDA_CRITERIA_FALLBACK;
    try {
      const r = await runExternalValidation({ packageDir: '/tmp/does-not-matter', region: 'fda' });
      expect(r.ran).toBe(false);   // noop → un-run
      expect(r.passed).toBe(false); // un-run ≠ passed (keeps the dispatch gate fail-closed)
    } finally {
      if (prev.b) process.env.EVALIDATOR_BINARY = prev.b;
      if (prev.e) process.env.EVALIDATOR_ENDPOINT = prev.e;
      if (prev.f) process.env.EVALIDATOR_USE_FDA_CRITERIA_FALLBACK = prev.f;
    }
  });
});
