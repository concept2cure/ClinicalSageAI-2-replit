/**
 * An XML eValidator report this product cannot read is refused, never read as
 * clean — the rule the JSON parser has followed since 2026-09-23.
 *
 * Until 2026-10-15 the XML parser mapped any severity it did not know to 'info'
 * (normalizeSeverity, whose error list also lacked 'fatal' and 'failed'), and a
 * report in which no element carried a severity attribute parsed to [] — the
 * adapter then reported "ran, 0 errors, passed:true". A FATAL finding, an error
 * word it did not know, or a layout it did not recognise cleared the external
 * validation gate.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseEvalidatorXmlReport, LorenzEValidatorAdapter } from '../lorenz-adapter';
import { runExternalValidation } from '../index';

const report = (rows: string) => `<?xml version="1.0"?>
<eValidatorReport><validationResults>${rows}</validationResults></eValidatorReport>`;

describe('parseEvalidatorXmlReport reads severities as the JSON parser does', () => {
  it('counts a Fatal or Failed row as an error, not as info', async () => {
    const f = await parseEvalidatorXmlReport(report(
      '<result severity="Fatal" number="1001" message="backbone unreadable"/><result severity="Failed" number="1002" message="x"/>',
    ));
    expect(f.map((x) => x.severity)).toEqual(['error', 'error']);
  });

  it('refuses a row whose severity it does not map, naming it', async () => {
    await expect(parseEvalidatorXmlReport(report('<result severity="Blocker" number="1734" message="x"/>')))
      .rejects.toThrow(/severity "Blocker"/);
  });

  it('refuses a report in which no element carries a severity, instead of reading it as clean', async () => {
    const xml = '<?xml version="1.0"?><report><issue><code>1734</code><grade>High</grade><text>STF missing</text></issue></report>';
    await expect(parseEvalidatorXmlReport(xml)).rejects.toThrow(/not an eValidator report this product reads/);
  });
});

describe('the adapter does not report an unreadable XML report as passed', () => {
  const saved = { b: process.env.EVALIDATOR_BINARY, e: process.env.EVALIDATOR_ENDPOINT };
  afterEach(() => {
    vi.unstubAllGlobals();
    if (saved.b === undefined) delete process.env.EVALIDATOR_BINARY; else process.env.EVALIDATOR_BINARY = saved.b;
    if (saved.e === undefined) delete process.env.EVALIDATOR_ENDPOINT; else process.env.EVALIDATOR_ENDPOINT = saved.e;
  });

  it('runExternalValidation answers ran:false, passed:false for an XML layout it does not recognise', async () => {
    delete process.env.EVALIDATOR_BINARY;
    process.env.EVALIDATOR_ENDPOINT = 'https://evalidator.invalid/validate';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<?xml version="1.0"?><report><issue><code>1734</code><grade>High</grade></issue></report>',
      { status: 200 },
    )));
    expect(await new LorenzEValidatorAdapter().isConfigured()).toBe(true);
    const r = await runExternalValidation({ packageDir: '/tmp/pkg', region: 'fda' });
    expect(r.passed).toBe(false);
    expect(r.ran).toBe(false);
  });
});
