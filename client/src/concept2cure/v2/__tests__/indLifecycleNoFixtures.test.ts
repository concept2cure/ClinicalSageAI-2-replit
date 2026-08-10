/**
 * Nothing the product puts in the user's mouth may name an invented programme.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * ind-lifecycle-data.ts defined INDL_PROGRAM — an invented drug programme, code
 * and drugName 'BX-301', productName 'BX-301 (anti-BCMA mAb)', indication
 * 'Relapsed/refractory multiple myeloma', sponsor 'Concept2Cure' — and
 * concatenated it into two deliverable `ask` strings at module load:
 *
 *   "Assemble the IND cover letter (m1.2) for the BX-301 IND."
 *   "Assemble the Pre-IND briefing book for BX-301 (anti-BCMA mAb)."
 *
 * Those are not labels on a card. IndLifecycle.tsx:551 hands `d.ask` to the
 * shell's onAsk, which pushes it into the AnA conversation as a USER message
 * and renders it in the rail. Clicking "Assemble" put an invented product,
 * indication and modality into the customer's own words, addressed to the
 * assistant, in a workspace whose next output is a submission document.
 *
 * ── Why a data test rather than a render test ─────────────────────────────────
 * The strings are built at module load by concatenation, so they are wrong
 * before anything renders, and a render test would additionally depend on the
 * shell wiring. The defect is in the constant; the constant is what is pinned.
 *
 * RETIRED is the same canary list the ten *NoFixtures.test.tsx files use.
 */

import { describe, it, expect } from 'vitest';
import { INDL_DELIVERABLES } from '../fixtures/ind-lifecycle-data';

/** Fixture identifiers that must never reach a user-visible or user-attributed string. */
const RETIRED = [
  'BX-301',
  'BX-204',
  'BX-099',
  'Bextrelimab',
  'anti-BCMA',
  'Relapsed/refractory multiple myeloma',
];

describe('IND lifecycle deliverables carry no invented programme', () => {
  it('every deliverable defines an ask', () => {
    // Guards the sweep below: an empty or renamed list would make it vacuous.
    expect(INDL_DELIVERABLES.length).toBeGreaterThan(0);
    for (const d of INDL_DELIVERABLES) {
      expect(d.ask, `${d.id} has no ask string`).toBeTruthy();
    }
  });

  it('no ask string names a fixture programme', () => {
    const offenders = INDL_DELIVERABLES.flatMap((d) =>
      RETIRED.filter((r) => d.ask.includes(r)).map((r) => `${d.id}: "${d.ask}" contains ${r}`),
    );
    expect(
      offenders,
      'a deliverable would send an invented programme name to AnA as the user',
    ).toEqual([]);
  });

  it('the two previously-broken deliverables are generic', () => {
    // Named explicitly, because the sweep above would also pass if these two
    // entries were simply deleted — which would be a regression, not a fix.
    const byId = Object.fromEntries(INDL_DELIVERABLES.map((d) => [d.id, d]));
    expect(byId['cover-letter'], 'the IND cover letter deliverable vanished').toBeTruthy();
    expect(byId['briefing-book'], 'the Pre-IND briefing book deliverable vanished').toBeTruthy();
    expect(byId['cover-letter'].ask).toBe('Assemble the IND cover letter (m1.2) for this IND.');
    expect(byId['briefing-book'].ask).toBe('Assemble the Pre-IND briefing book for this program.');
  });

  it('INDL_PROGRAM is not re-exported', async () => {
    // The constant existed only to be concatenated into the two asks above.
    // If it comes back, the concatenation usually comes back with it.
    const mod = await import('../fixtures/ind-lifecycle-data');
    expect(
      Object.keys(mod).includes('INDL_PROGRAM'),
      'INDL_PROGRAM is back — check whether an ask string names it again',
    ).toBe(false);
  });
});
