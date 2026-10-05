/**
 * One provenance type for every regulatory fact (D2, 2026-10-05, step
 * g-basis-type; docs/design/ANA_REGULATORY_RECORD.md §5, invariant 3).
 *
 * Before this step the only typed provenance was `E3Basis`, declared inside
 * server/services/ind/ctd/types.ts: unusable from `shared/` (the IVD corpus's
 * `Citation` could not say whether a pin-cite was checked against the
 * regulator's text), and with no rule for what makes a `regulator-text` claim
 * well formed. This pins:
 *   - one type, in shared/regulatory/regulatory-basis.ts, importing nothing;
 *   - `basisProblems`: regulator-text needs a checked ISO date and either a URL
 *     on a regulator host or a vendored repo path;
 *   - `basisLabel`: recall and platform convention are never rendered as
 *     regulator text, and neither is a malformed regulator-text claim;
 *   - E3Basis / E3Confidence are aliases of it (no second declaration), and
 *     every basis constant the CSR record already ships is well formed under it;
 *   - the IVD `Citation` carries confidence and checked from the same type.
 */
import { describe, it, expect, expectTypeOf } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  REGULATOR_HOSTS,
  basisLabel,
  basisProblems,
  type RegulatoryBasis,
  type RegulatoryConfidence,
} from '../../shared/regulatory/regulatory-basis';
import type { E3Basis, E3Confidence } from '../../server/services/ind/ctd/types';
import type { Citation } from '../../shared/ivd/types';
import * as csrE3Basis from '../../server/services/ind/ctd/csr-e3-basis';

const ROOT = path.resolve(__dirname, '../..');
const src = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

const FDA_E3_URL = 'https://www.fda.gov/media/71271/download';

describe('shared/regulatory/regulatory-basis.ts is the one provenance type', () => {
  it('imports nothing, so client and server can both use it', () => {
    const text = src('shared/regulatory/regulatory-basis.ts');
    expect(text).not.toMatch(/^\s*import\s/m);
    expect(text).not.toMatch(/\brequire\(/);
    expect(text).not.toMatch(/^\s*export\s+(\*|\{[^}]*\})\s+from\s/m);
  });

  it('lists exactly the regulator hosts the record accepts', () => {
    expect([...REGULATOR_HOSTS].sort()).toEqual(
      [
        'fda.gov',
        'ecfr.gov',
        'federalregister.gov',
        'hhs.gov',
        'ema.europa.eu',
        'esubmission.ema.europa.eu',
        'eur-lex.europa.eu',
        'health.ec.europa.eu',
        'pmda.go.jp',
        'mhlw.go.jp',
        'ich.org',
        'database.ich.org',
      ].sort(),
    );
    expect(Object.isFrozen(REGULATOR_HOSTS)).toBe(true);
  });
});

describe('basisProblems', () => {
  const ok: RegulatoryBasis = { ref: 'ICH E3 §12.2.4', confidence: 'regulator-text', url: FDA_E3_URL, checked: '2026-10-04' };

  it('accepts regulator-text with a regulator URL (subdomains included) and a checked date', () => {
    expect(basisProblems(ok)).toEqual([]);
    expect(basisProblems({ ...ok, url: 'https://fda.gov/media/71271/download' })).toEqual([]);
    expect(basisProblems({ ...ok, url: 'https://www.ecfr.gov/current/title-21/section-314.50' })).toEqual([]);
    expect(basisProblems({ ...ok, url: 'https://health.ec.europa.eu/document/download/x' })).toEqual([]);
  });

  it('accepts regulator-text read from a vendored regulator artifact with a checked date', () => {
    expect(
      basisProblems({
        ref: 'FDA eCTD v4.0 controlled vocabulary',
        confidence: 'regulator-text',
        vendored: 'server/services/ectd/controlled-vocab/cv-v4-data.ts',
        checked: '2026-10-05',
      }),
    ).toEqual([]);
  });

  it('refuses regulator-text without a checked date', () => {
    const noDate: RegulatoryBasis = { ref: ok.ref, confidence: ok.confidence, url: ok.url };
    expect(basisProblems(noDate).join(' ')).toMatch(/checked/);
  });

  it('refuses regulator-text with neither a URL nor a vendored artifact', () => {
    expect(basisProblems({ ref: 'ICH E3', confidence: 'regulator-text', checked: '2026-10-04' }).length).toBeGreaterThan(0);
  });

  it('refuses regulator-text whose URL is not on a regulator host, including look-alikes', () => {
    for (const url of [
      'https://www.raps.org/news/e3',
      'https://fda.gov.example.com/media/71271',
      'https://notfda.gov/media/71271',
      'https://www.tuvsud.com/en/ivdr',
    ]) {
      expect(basisProblems({ ...ok, url }), url).not.toEqual([]);
    }
  });

  it('refuses a URL that does not parse or is not http(s)', () => {
    expect(basisProblems({ ...ok, url: 'fda.gov/media/71271' })).not.toEqual([]);
    expect(basisProblems({ ...ok, url: 'ftp://www.fda.gov/x' })).not.toEqual([]);
  });

  it('refuses a checked value that is not a real ISO calendar date', () => {
    for (const checked of ['2026-13-01', '2026-02-30', '04/10/2026', '2026-10-04T10:00:00Z', '']) {
      expect(basisProblems({ ...ok, checked }), checked).not.toEqual([]);
    }
  });

  it('refuses a vendored path that is absolute or leaves the repository', () => {
    const v = { ref: 'x', confidence: 'regulator-text' as const, checked: '2026-10-05' };
    expect(basisProblems({ ...v, vendored: '/etc/passwd' })).not.toEqual([]);
    expect(basisProblems({ ...v, vendored: '../outside/cv.ts' })).not.toEqual([]);
    expect(basisProblems({ ...v, vendored: 'server/../../cv.ts' })).not.toEqual([]);
    expect(basisProblems({ ...v, vendored: '' })).not.toEqual([]);
  });

  it('refuses an empty ref and an unknown confidence', () => {
    expect(basisProblems({ ...ok, ref: '  ' })).not.toEqual([]);
    expect(basisProblems({ ...ok, confidence: 'verified' as unknown as RegulatoryConfidence })).not.toEqual([]);
  });

  it('accepts recall and platform convention with no URL or date, and with a secondary-source URL', () => {
    expect(basisProblems({ ref: 'IVDR Art 48(7)', confidence: 'recall' })).toEqual([]);
    expect(basisProblems({ ref: 'IVDR Art 48', confidence: 'recall', url: 'https://www.tuvsud.com/en/ivdr', note: 'search extract' })).toEqual([]);
    expect(basisProblems({ ref: 'ADSL feeds 14.1', confidence: 'platform-convention' })).toEqual([]);
  });
});

describe('basisLabel', () => {
  it('says a recalled fact was not checked against the regulator text', () => {
    expect(basisLabel({ ref: 'IVDR Art 48(7)', confidence: 'recall' })).toBe(
      "IVDR Art 48(7) (recall — not checked against the regulator's text)",
    );
  });

  it('says a platform convention is not a regulatory requirement', () => {
    const label = basisLabel({ ref: 'ADSL feeds 14.1', confidence: 'platform-convention' });
    expect(label.startsWith('ADSL feeds 14.1 (')).toBe(true);
    expect(label).toMatch(/platform convention/);
    expect(label).toMatch(/not a regulatory requirement/);
  });

  it('gives the checked date for well-formed regulator text', () => {
    expect(basisLabel({ ref: 'ICH E3 §12.2.4', confidence: 'regulator-text', url: FDA_E3_URL, checked: '2026-10-04' })).toBe(
      "ICH E3 §12.2.4 (checked against the regulator's text on 2026-10-04)",
    );
  });

  it('never presents a malformed regulator-text claim as checked', () => {
    const label = basisLabel({ ref: 'IVDR Art 48', confidence: 'regulator-text', url: 'https://www.tuvsud.com/en/ivdr', checked: '2026-10-05' });
    expect(label).not.toMatch(/checked against the regulator's text on/);
    expect(label).toMatch(/not checked against the regulator's text/);
  });
});

describe('E3Basis is an alias, not a second declaration', () => {
  it('ind/ctd/types.ts declares no provenance type of its own', () => {
    const text = src('server/services/ind/ctd/types.ts');
    expect(text).not.toMatch(/export\s+interface\s+E3Basis\b/);
    expect(text).not.toMatch(/export\s+type\s+E3Confidence\s*=\s*'/);
    expect(text).toMatch(/shared\/regulatory\/regulatory-basis/);
  });

  it('the types are identical', () => {
    expectTypeOf<E3Basis>().toEqualTypeOf<RegulatoryBasis>();
    expectTypeOf<E3Confidence>().toEqualTypeOf<RegulatoryConfidence>();
  });

  it('every basis constant the CSR record ships is well formed under the shared rules', () => {
    const bases = Object.values(csrE3Basis).filter(
      (v): v is RegulatoryBasis => typeof v === 'object' && v !== null && 'ref' in v && 'confidence' in v,
    );
    expect(bases.length).toBeGreaterThan(5);
    for (const b of bases) expect(basisProblems(b), b.ref).toEqual([]);
    expect(basisProblems(csrE3Basis.e3SectionBasis('12.2.4'))).toEqual([]);
  });
});

describe('the IVD Citation carries provenance from the same type', () => {
  it('confidence and checked are typed from shared/regulatory/regulatory-basis', () => {
    expectTypeOf<Citation['confidence']>().toEqualTypeOf<RegulatoryConfidence | undefined>();
    expectTypeOf<Citation['checked']>().toEqualTypeOf<RegulatoryBasis['checked']>();
    const text = src('shared/ivd/types.ts');
    expect(text).toMatch(/from '\.\.\/regulatory\/regulatory-basis'/);
    expect(text).not.toMatch(/'regulator-text'\s*\|\s*'recall'/);
  });
});
