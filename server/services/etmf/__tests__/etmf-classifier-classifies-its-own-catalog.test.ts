/**
 * The TMF classifier classifies its own catalog.
 *
 * ── What the code did (found 2026-10-30, slice E1 of docs/design/ETMF_CONVERGENCE_2026-10-30.md) ──
 * `classifyArtifact` (etmf-logic.ts) matched a name against eleven keyword rules
 * and never against the DIA TMF Reference Model catalog that the same service
 * seeds and assesses. Of the catalog's 41 artifact names, 10 came back
 * 'unclassified' ("Trial Master File Plan", "Monitoring Plan", "Investigator's
 * Brochure", "Financial disclosure form", …) and 4 landed in another zone
 * ("Sample Case Report Form" → 10, "Sample Informed Consent Form" → 4, "Safety
 * report submissions to IRB/IEC" → 4, "Randomization plan" → 6). Vault filing
 * uses the same classifier for a CRO's service view, so an uploaded Monitoring
 * Plan got no folder at all.
 *
 * The zone-5 '1572' keyword could never fire: the zone-3 rule above it matched
 * 'form fda 1572|1572|fda' first, so Form FDA 1572 — a Site Management record —
 * was filed under Regulatory.
 *
 * What stays true: a name that is neither a catalog artifact nor a keyword
 * match is 'unclassified', with no zone. Nothing is default-filed.
 */
import { describe, it, expect } from 'vitest';

import { classifyArtifact } from '../etmf-logic';
import { TMF_REFERENCE_MODEL } from '../tmf-completeness';
import { classifyForFiling } from '../../vault/vault-filing.service';

const CATALOG = TMF_REFERENCE_MODEL.flatMap((z) =>
  z.artifacts.map((a) => ({ zone: z.number, code: a.code, name: a.name })),
);

/** What the classifier says about a name, in the terms this test compares. */
function said(input: string): { zone: number | null; code: string | null } {
  const c = classifyArtifact(input);
  return { zone: c.zone, code: c.confidence === 'matched' ? c.code ?? null : null };
}

describe('the classifier and the catalog are the same 41 artifacts', () => {
  it('the catalog it is checked against is the full one (11 zones, 41 artifacts)', () => {
    expect(TMF_REFERENCE_MODEL).toHaveLength(11);
    expect(CATALOG).toHaveLength(41);
  });

  it('every catalog artifact name classifies to its own zone', () => {
    const wrong = CATALOG.flatMap((a) => {
      const z = said(a.name).zone;
      return z === a.zone ? [] : [`${a.code} "${a.name}": ${z === null ? 'unclassified' : `zone ${z}`}, catalog zone ${a.zone}`];
    });
    expect(wrong).toEqual([]);
  });

  it('every catalog artifact name classifies to its own code', () => {
    const wrong = CATALOG.flatMap((a) => {
      const c = said(a.name).code;
      return c === a.code ? [] : [`"${a.name}": code ${c ?? 'none'}, catalog code ${a.code}`];
    });
    expect(wrong).toEqual([]);
  });

  it('every catalog code classifies to its own artifact and zone', () => {
    const wrong = CATALOG.flatMap((a) => {
      const s = said(a.code);
      return s.code === a.code && s.zone === a.zone ? [] : [`${a.code}: ${JSON.stringify(s)}, catalog zone ${a.zone}`];
    });
    expect(wrong).toEqual([]);
  });

  it('a catalog name inside a file name identifies the artifact (case, punctuation and version suffix aside)', () => {
    expect(said('Monitoring Plan v3.pdf')).toEqual({ zone: 1, code: 'monitoring_plan' });
    expect(said('trial master file plan v2.docx')).toEqual({ zone: 1, code: 'tmf_plan' });
    expect(said('Investigators Brochure ed 7')).toEqual({ zone: 2, code: 'investigators_brochure' });
    expect(said('SAMPLE-INFORMED-CONSENT-FORM')).toEqual({ zone: 2, code: 'sample_icf' });
  });

  it('a keyword match names a zone but no artifact: the code is not guessed', () => {
    expect(said('Monitoring Visit Report - Site 101')).toEqual({ zone: 5, code: null });
    expect(said('Informed Consent Form v2')).toEqual({ zone: 4, code: null });
  });

  it('part of a catalog name identifies nothing, and an unmatched name is still unclassified', () => {
    expect(classifyArtifact('Plan')).toEqual({ zone: null, zoneName: null, section: null, confidence: 'unclassified' });
    expect(classifyArtifact('quarterly-board-deck.pdf')).toEqual({ zone: null, zoneName: null, section: null, confidence: 'unclassified' });
  });
});

describe('the 1572 rule fires', () => {
  it('Form FDA 1572 is a Site Management (zone 5) record, however it is written', () => {
    const names = ['Form FDA 1572', 'FDA-1572 Dr Patel', '1572 signed', 'form fda 1572.pdf'];
    expect(names.map((n) => `${n} → zone ${said(n).zone}`)).toEqual(names.map((n) => `${n} → zone 5`));
  });

  it('the zone-3 rule still takes what is regulatory', () => {
    expect(said('IND annual report').zone).toBe(3);
    expect(said('FDA correspondence log').zone).toBe(3);
  });
});

describe('vault filing (service view) files catalog artifacts by their zone', () => {
  /* Form FDA 1572 is not asserted here: Vault filing's own "FDA administrative
     form" rule (vault-filing.service.ts FILING_RULES) files it, with 1571, 3674,
     3454 and 356h, into the service view's z03 before the TMF classifier runs. */
  it('a CRO uploading its Monitoring Plan and its financial disclosure form gets the zone folder', () => {
    const expected: Record<string, string> = {
      'Monitoring-Plan-v2.pdf': 'z01',
      'Trial-Master-File-Plan.docx': 'z01',
      'Financial-disclosure-form-PI.pdf': 'z05',
      'Statistical-report-final.pdf': 'z11',
    };
    const filed = Object.fromEntries(
      Object.keys(expected).map((fileName) => [fileName, classifyForFiling({ fileName, view: 'service' }).folderId]),
    );
    expect(filed).toEqual(expected);
  });
});
