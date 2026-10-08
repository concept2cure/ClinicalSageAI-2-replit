/**
 * The program code the create route derives — baseCodeFrom (project-intake.ts).
 *
 * ── The defect (QA 2026-10-08, journey j1) ───────────────────────────────────
 * A program created through the wizard as "HLV-333 — Investigational New Drug
 * Application (QA-J1)" with product "Helvanta-QA3" was saved with code "H".
 * The derivation took the product name whole, and when it was not exactly an
 * "ABC-123" code it took the initials of its whitespace-separated words — one
 * word, one letter. The code a person had written into the project name was
 * never looked at. The Projects card then read "H · Planning", and the shell
 * and project home carried "H" as the program's identity.
 *
 * ── What must be true now ────────────────────────────────────────────────────
 *   • an "ABC-123" code written in the product name, or failing that in the
 *     project name, is the code;
 *   • a single-word product name gives a readable code, never one letter;
 *   • everything that already worked keeps working ("BX-204" stays "BX-204").
 */
import { describe, expect, it, vi } from 'vitest';

// project-intake also exports the submission-spine helper, which reaches the
// database through the submission service. The code derivation is pure; the
// service is stubbed so importing the module opens no connection.
vi.mock('../../../services/submission-service/submission-service.js', () => ({
  createSubmissionTx: vi.fn(),
}));

import { baseCodeFrom } from '../project-intake';

describe('baseCodeFrom — the program code intake derives', () => {
  it('takes the code written in the project name when the product has none (the QA case)', () => {
    expect(
      baseCodeFrom('Helvanta-QA3', 'HLV-333 — Investigational New Drug Application (QA-J1)'),
    ).toBe('HLV-333');
  });

  it('never derives a one-letter code from a single-word product name', () => {
    const code = baseCodeFrom('Helvanta', 'Investigational New Drug Application');
    expect(code.length).toBeGreaterThan(1);
    expect(code).toBe('HELV');
  });

  it('prefers a code inside the product name over the project name', () => {
    expect(baseCodeFrom('BX-204 CGM', 'Aurora — 510(k)')).toBe('BX-204');
    expect(baseCodeFrom('Vorelinib · BX-512', 'Vorelinib · KIT-mutant GIST (IND)')).toBe('BX-512');
  });

  it('keeps a product name that is itself a code, exactly as before', () => {
    expect(baseCodeFrom('BX-204', 'BX-204 — NDA')).toBe('BX-204');
    expect(baseCodeFrom('bx 204', '')).toBe('BX-204');
    expect(baseCodeFrom('ARD-411', 'Investigational New Drug Application')).toBe('ARD-411');
  });

  it('keeps a multi-part code whole (QA DB, 2026-10-08: product "QA-SS-101" was saved as code "Q")', () => {
    expect(baseCodeFrom('QA-SS-101', 'J9 Selfserve IND')).toBe('QA-SS-101');
  });

  it('keeps initials for a several-word name with no code in it', () => {
    expect(baseCodeFrom('Aurora Continuous Glucose Monitor', '')).toBe('ACGM');
  });

  it('does not read a target or a word as a code', () => {
    // Five letters before the number: not the ABC-123 shape.
    expect(baseCodeFrom('COVID-19 vaccine', '')).toBe('CV');
    // A single digit after the letters is not a program number.
    expect(baseCodeFrom('Helvanta-QA3', 'Investigational New Drug Application')).toBe('HELV');
  });

  it('falls back to PRJ only when there is nothing to derive from', () => {
    expect(baseCodeFrom('', '')).toBe('PRJ');
    expect(baseCodeFrom('—', '·')).toBe('PRJ');
  });
});
