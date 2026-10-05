/**
 * One QMSR crosswalk (shared/regulatory/qmsr-crosswalk.ts) and the QMS clause
 * list served by the AnA tool `assess_qms` and GET /device/qms/structure
 * (server/services/market-specs/quality-system.ts).
 *
 * The QMSR has been in force since 2026-02-02 (currency fact `us-qmsr`). It
 * removed the QSR sections 820.20 to 820.250, so a clause mapped only to one of
 * them points the client at a section that no longer exists, and "QMSR retains
 * the Device Master Record concept" is false: the QMSR does not use that term.
 *
 * The crosswalk is imported dynamically so each quality-system assertion fails
 * on its own on the pre-change code instead of the whole file failing at load.
 */
import { describe, it, expect } from 'vitest';
import { QMS_CLAUSES, getQmsClause, FDA_QMSR_NOTE } from '../../market-specs/quality-system';
import { REGULATORY_FACTS } from '../../regulatory-currency/currency-registry';
import { basisProblems } from '../../../../shared/regulatory/regulatory-basis';

/** Every QSR section the QMSR removed (820.20 to 820.250), as cited in this repository. */
const REMOVED_QSR =
  /\b820\.(20|22|25|30|40|50|60|65|70|72|75|80|86|90|100|120|130|140|150|160|170|180|181|184|186|198|200|250)\b/;
/** A current QMSR section. `\b` keeps 820.3 from matching inside 820.30. */
const QMSR_SECTION = /\b820\.(1|3|7|10|15|35|45)\b/;

const crosswalk = () => import('../../../../shared/regulatory/qmsr-crosswalk');

type Clause = (typeof QMS_CLAUSES)[number] & { qmsrBasis?: string; legacyQsr?: string };

describe('assess_qms clause list (quality-system.ts)', () => {
  it('no longer says the QMSR retains the Device Master Record', () => {
    const text = JSON.stringify(QMS_CLAUSES);
    expect(text).not.toContain('retains the Device Master Record');
    expect(text).not.toMatch(/DMR equivalent/);
  });

  it('gives every clause a current QMSR basis that cites no removed section', () => {
    for (const c of QMS_CLAUSES as Clause[]) {
      expect(c.qmsrBasis, c.id).toMatch(QMSR_SECTION);
      expect(c.qmsrBasis, c.id).not.toMatch(REMOVED_QSR);
      expect(c.legacyQsr, c.id).toMatch(REMOVED_QSR);
    }
  });

  it('leads every fdaMapping with the QMSR and names a removed section only as "formerly"', () => {
    for (const c of QMS_CLAUSES) {
      const [current, ...former] = c.fdaMapping.split('formerly');
      expect(current, c.id).toMatch(QMSR_SECTION);
      expect(current, c.id).not.toMatch(REMOVED_QSR);
      expect(former.join(''), c.id).toMatch(/\(QSR, until 2026-02-01\)/);
    }
  });

  it('names the ISO 13485 medical device file and design and development file as ISO clauses, not FDA terms', () => {
    const general = JSON.stringify(getQmsClause('qms_general'));
    expect(general).toMatch(/§4\.2\.3/);
    expect(general).toMatch(/[Mm]edical [Dd]evice [Ff]ile/);
    expect(general).toMatch(/§7\.3\.10/);
    expect(general).toMatch(/ISO clauses, not FDA terms/);
  });

  it('builds FDA_QMSR_NOTE from the crosswalk and states the QMSR as in force', async () => {
    const { qmsrTransitionNote } = await crosswalk();
    expect(FDA_QMSR_NOTE).toBe(qmsrTransitionNote());
    expect(FDA_QMSR_NOTE).toMatch(/2026-02-02/);
    expect(FDA_QMSR_NOTE).toMatch(/ISO 13485:2016/);
    expect(FDA_QMSR_NOTE).toMatch(/820\.10/);
    expect(FDA_QMSR_NOTE).toMatch(/820\.35/);
    expect(FDA_QMSR_NOTE).toMatch(/820\.45/);
    expect(FDA_QMSR_NOTE).not.toMatch(/Before that date, 21 CFR 820 \(QSR\) applies/);
  });

  it('takes each clause basis from the crosswalk row of the same id', async () => {
    const { QMSR_CROSSWALK, citeQms, QMSR_EFFECTIVE } = await crosswalk();
    for (const c of QMS_CLAUSES as Clause[]) {
      const row = QMSR_CROSSWALK.find((r) => r.id === c.id);
      expect(row, c.id).toBeDefined();
      expect(c.qmsrBasis).toBe(row?.qmsrBasis);
      expect(c.legacyQsr).toBe(row?.legacyQsr);
      expect(c.fdaMapping.startsWith(citeQms(c.id as never, QMSR_EFFECTIVE)), c.id).toBe(true);
    }
  });
});

describe('the QMSR crosswalk (shared/regulatory/qmsr-crosswalk.ts)', () => {
  it('reads its effective date from the us-qmsr currency fact', async () => {
    const { QMSR_EFFECTIVE, QMSR_FACT_ID } = await crosswalk();
    const fact = REGULATORY_FACTS.find((f) => f.id === QMSR_FACT_ID);
    expect(QMSR_FACT_ID).toBe('us-qmsr');
    expect(fact?.status).toBe('in_force');
    expect(QMSR_EFFECTIVE).toBe(fact?.effectiveDate);
  });

  it('cites the QMSR with the QSR section as "formerly" on and after the effective date', async () => {
    const { citeQms } = await crosswalk();
    expect(citeQms('designInputs', '2026-10-04')).toBe(
      '21 CFR 820.10(c) → ISO 13485:2016 §7.3.3; formerly 21 CFR 820.30(c) (QSR, until 2026-02-01)',
    );
    expect(citeQms('designInputs', '2026-02-02')).toMatch(/^21 CFR 820\.10\(c\)/);
  });

  it('cites the QSR section alone before the effective date', async () => {
    const { citeQms } = await crosswalk();
    expect(citeQms('designInputs', '2026-02-01')).toBe('21 CFR 820.30(c)');
    expect(citeQms('capa', '2025-06-30')).toBe('21 CFR 820.100');
  });

  it('fails closed on a date that is not YYYY-MM-DD and on an unknown id', async () => {
    const { citeQms } = await crosswalk();
    expect(() => citeQms('designInputs', 'today')).toThrow(/YYYY-MM-DD/);
    expect(() => citeQms('designInputs', '2026-02-30')).toThrow(/YYYY-MM-DD/);
    expect(() => citeQms('nope' as never, '2026-10-04')).toThrow(/no QMSR crosswalk row/);
  });

  it('carries the nine design-control elements, ISO 13485:2016 §7.3.2 to §7.3.10 against 820.30(b) to (j)', async () => {
    const { QMSR_CROSSWALK } = await crosswalk();
    const expected: Array<[string, string, string]> = [
      ['designPlan', '7.3.2', 'b'],
      ['designInputs', '7.3.3', 'c'],
      ['designOutputs', '7.3.4', 'd'],
      ['designReviews', '7.3.5', 'e'],
      ['designVerification', '7.3.6', 'f'],
      ['designValidation', '7.3.7', 'g'],
      ['designTransfer', '7.3.8', 'h'],
      ['designChanges', '7.3.9', 'i'],
      ['traceability', '7.3.10', 'j'],
    ];
    for (const [id, clause, para] of expected) {
      const row = QMSR_CROSSWALK.find((r) => r.id === id);
      expect(row?.iso13485Clause, id).toBe(clause);
      expect(row?.qmsrBasis, id).toBe(`21 CFR 820.10(c) → ISO 13485:2016 §${clause}`);
      expect(row?.legacyQsr, id).toBe(`21 CFR 820.30(${para})`);
    }
  });

  it('gives every row a well-formed basis tied to the us-qmsr fact, with unique ids', async () => {
    const { QMSR_CROSSWALK } = await crosswalk();
    expect(new Set(QMSR_CROSSWALK.map((r) => r.id)).size).toBe(QMSR_CROSSWALK.length);
    for (const r of QMSR_CROSSWALK) {
      expect(basisProblems(r.basis), r.id).toEqual([]);
      expect(r.basis.factId, r.id).toBe('us-qmsr');
      expect(r.qmsrBasis, r.id).not.toMatch(REMOVED_QSR);
      if (r.basis.confidence === 'regulator-text') expect(r.basis.url, r.id).toMatch(/^https:\/\/www\.ecfr\.gov\//);
      else expect(r.basis.confidence, r.id).toBe('recall');
    }
  });
});
