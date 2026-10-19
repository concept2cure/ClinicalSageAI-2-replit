/**
 * §3.2.P.8.1 states whether the shelf life it prints was signed for.
 *
 * ## Why
 *
 * `shelf_life` is the dossier's proposed storage period. Until 2026-10-19 it
 * was set by an ordinary PUT, so every claim was unsigned and there was nothing
 * to distinguish. The governed close-out (URS-CMC-028) made the terminal status
 * a 21 CFR Part 11 signature — and left a composed section that printed
 *
 *     A shelf life of 36 months at 25°C/60% RH is proposed, subject to
 *     review of the 3 recorded result(s)…
 *
 * identically whether a signer had accepted the claim or a scientist had typed
 * it onto a study still running. A reader of the dossier could not tell a
 * claim the organisation stands behind from a working note.
 *
 * The sentence is deterministic: the signature is on the row or it is not. The
 * engine states the fact; it does not grade the claim — whether *this* period
 * is supported by *that* coverage is the ICH Q1E verdict (URS-CMC-024), which
 * the compliance report answers separately.
 */
import { describe, expect, it } from 'vitest';
import { composeModule3FromCanonicalSources, type CanonicalSource } from '../module3Composer';
import { mapStabilityPayload } from '../cmc-write-through';

let seq = 0;
function src(sourceType: string, payload: Record<string, unknown>): CanonicalSource {
  seq += 1;
  return {
    sourceType,
    sourceKey: `${sourceType}:${seq}`,
    sourcePayload: payload,
    sourceHash: `h${seq}`,
  } as unknown as CanonicalSource;
}

/** A drug-product long-term study with three pulled results and a claim. */
function study(over: Record<string, unknown> = {}) {
  return mapStabilityPayload({
    scope: 'DP',
    studyName: 'LT-01',
    studyType: 'long_term',
    storageConditions: ['25C/60%RH'],
    duration: 24,
    timePoints: ['0', '12', '24'],
    testParameters: ['assay'],
    batchNumber: 'B-1',
    status: 'ACTIVE',
    shelfLife: '24 months at 25C/60%RH',
    stabilityData: [
      { timePoint: '0', parameter: 'assay', result: '99.8' },
      { timePoint: '12', parameter: 'assay', result: '99.4' },
      { timePoint: '24', parameter: 'assay', result: '99.1' },
    ],
    ...over,
  });
}

const dp = () => src('drug_product', { name: 'BX-701 tablets', dosageForm: 'tablet' });
const narrative = (sources: CanonicalSource[]) =>
  composeModule3FromCanonicalSources(sources).find((s) => s.sectionKey === '3.2.P.8')?.narrativeDraft ?? '';

describe('mapStabilityPayload carries the close-out signature', () => {
  it('reports a closed-out study’s claim as accepted', () => {
    const payload = study({ status: 'COMPLETED', shelfLifeSignedBy: 3, shelfLifeSignedAt: '2026-10-19T03:31:02.000Z' });
    expect(payload.shelfLifeAccepted).toBe(true);
    expect(payload.shelfLifeSignedAt).toBe('2026-10-19T03:31:02.000Z');
  });

  it('reads the snake_case row the raw writers hand it', () => {
    const payload = study({ shelf_life_signed_by: 3, shelf_life_signed_at: '2026-10-19T03:31:02.000Z' });
    expect(payload.shelfLifeAccepted).toBe(true);
  });

  it('reports a running study’s claim as not accepted', () => {
    expect(study().shelfLifeAccepted).toBe(false);
    expect(study().shelfLifeSignedAt).toBeNull();
  });

  it('does not carry the signer’s id into the dossier payload', () => {
    /* The section states the provenance of the claim, not who made it. The
       person is named by the audit trail and the §11.50 row, both of which a
       reader can ask; a name in the composed payload would be a second place
       for one fact and could drift from the signature. */
    const payload = study({ shelfLifeSignedBy: 3 });
    expect('shelfLifeSignedBy' in payload).toBe(false);
    expect(Object.values(payload)).not.toContain(3);
  });
});

describe('the composed §3.2.P.8 states the claim’s provenance', () => {
  it('says a claim was accepted on a signed close-out', () => {
    const text = narrative([dp(), src('stability', study({ status: 'COMPLETED', shelfLifeSignedBy: 3 }))]);
    expect(text).toMatch(/A shelf life of 24 months at 25C\/60%RH is proposed/);
    expect(text).toMatch(/accepted on a signed study close-out/);
  });

  it('says a claim on a running study has not been signed for', () => {
    /* The sentence a reader must be able to act on: this is the dossier
       stating a period nobody has accepted. */
    const text = narrative([dp(), src('stability', study())]);
    expect(text).toMatch(/A shelf life of 24 months at 25C\/60%RH is proposed/);
    expect(text).toMatch(/recorded on a study that has not been closed out under signature/);
    expect(text).not.toMatch(/accepted on a signed study close-out/);
  });

  it('still names the data the claim is subject to review of', () => {
    for (const over of [{}, { status: 'COMPLETED', shelfLifeSignedBy: 3 }]) {
      const text = narrative([dp(), src('stability', study(over))]);
      expect(text, JSON.stringify(over)).toMatch(/subject to review of the 3 recorded result\(s\)/);
    }
  });

  it('claims no provenance when there is no claim to make one about', () => {
    const text = narrative([dp(), src('stability', study({ shelfLife: '' }))]);
    expect(text).toMatch(/The proposed shelf life is subject to review of/);
    expect(text).not.toMatch(/accepted on a signed study close-out/);
    expect(text).not.toMatch(/has not been closed out under signature/);
  });

  it('is not fooled by a signature on a study whose claim is blank', () => {
    /* A signed study with no shelf life cannot lend its signature to another
       study's claim: the claim and the signature are on the same row, and the
       section would otherwise read as accepted on the strength of a signature
       that accepted nothing. */
    const text = narrative([
      dp(),
      src('stability', study({ shelfLife: '', status: 'COMPLETED', shelfLifeSignedBy: 3 })),
      src('stability', study({ studyName: 'LT-02' })),
    ]);
    expect(text).toMatch(/recorded on a study that has not been closed out under signature/);
    expect(text).not.toMatch(/accepted on a signed study close-out/);
  });

  it('reads a drug-substance study’s signature for its own side only', () => {
    /* `mapStabilityPayload` nulls `drugProductShelfLifeClaim` for a DS study,
       so a signed DS close-out must not make the PRODUCT's claim read as
       accepted — the defect the scope split exists to prevent. */
    const text = narrative([
      dp(),
      src('stability', study({ scope: 'DS', status: 'COMPLETED', shelfLifeSignedBy: 3 })),
      src('stability', study({ studyName: 'LT-DP' })),
    ]);
    expect(text).not.toMatch(/accepted on a signed study close-out/);
  });
});
