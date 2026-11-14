// @vitest-environment jsdom
/**
 * The method register offers a signed method what the server admits — for
 * EITHER signed outcome.
 *
 * P-110 made the analytical-method signature record one of two outcomes:
 * `validated` (full ICH Q2(R2)) or `phase-appropriate` (suitable for the stated
 * development phase). The server reads both as signed: an ordinary edit is
 * refused, and retirement with a reason is the one change admitted
 * (services/cmc/signed-record.ts `signedStateOf`, `retireSignedRecord`).
 *
 * The register's row actions knew one word. On a method signed
 * phase-appropriate, Edit was ENABLED — the drawer opened, the person typed,
 * and the save was refused — and there was no Retire at all. The only door the
 * screen showed out of that record was to sign it again as validated. Found by
 * the Part 11 screen audit of 2026-11-12; it is the screen half of the
 * regression docs/evidence/S7/2026-11-09-p110-both-doors-shut/ fixed on the
 * server and in the drawer.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';

import { CmMethodLibrary, methodSignedWord } from '../surfaces/cmcRegisters';

const method = (id: number, status: string) => ({
  id, methodCode: `AM-00${id}`, title: `Method ${id}`, technique: 'HPLC', purpose: 'assay',
  analyte: 'C2C-201', matrix: 'Drug substance', status, validationDate: '2026-11-09T00:00:00.000Z',
});

function stubMethods(rows: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, headers: new Headers(),
    json: async () => ({ success: true, data: rows }),
    text: async () => JSON.stringify({ success: true, data: rows }),
  } as unknown as Response)) as unknown as typeof fetch);
}

/** The table row for a method code. */
const rowOf = (code: string) => screen.getByText(code).closest('tr') as HTMLElement;
const button = (row: HTMLElement, name: string) =>
  within(row).queryByRole('button', { name: new RegExp(`^${name}`) }) as HTMLButtonElement | null;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('the method register and the two signed outcomes', () => {
  it('reads both signed words, in any casing, and nothing else', () => {
    expect(methodSignedWord('validated')).toBe('validated');
    expect(methodSignedWord(' Phase-Appropriate ')).toBe('phase-appropriate');
    expect(methodSignedWord('validation')).toBeNull();
    expect(methodSignedWord(null)).toBeNull();
  });

  it('closes Edit on a phase-appropriate method and says why, as it does on a validated one', async () => {
    stubMethods([method(1, 'validated'), method(2, 'phase-appropriate'), method(3, 'development')]);
    render(<CmMethodLibrary />);
    await waitFor(() => expect(screen.getByText('AM-002')).toBeTruthy());
    for (const code of ['AM-001', 'AM-002']) {
      const edit = button(rowOf(code), 'Edit')!;
      expect(edit.disabled, code).toBe(true);
      expect(edit.title, code).toMatch(/under a recorded signature/);
    }
    expect(button(rowOf('AM-002'), 'Edit')!.title).toMatch(/^Phase-appropriate/);
    expect(button(rowOf('AM-003'), 'Edit')!.disabled).toBe(false);
  });

  // The defect: no Retire on the phase-appropriate row.
  it('offers Retire on either signed outcome, and not on an unsigned method', async () => {
    stubMethods([method(1, 'validated'), method(2, 'phase-appropriate'), method(3, 'development')]);
    render(<CmMethodLibrary />);
    await waitFor(() => expect(screen.getByText('AM-002')).toBeTruthy());
    expect(button(rowOf('AM-001'), 'Retire')).toBeTruthy();
    expect(button(rowOf('AM-002'), 'Retire')).toBeTruthy();
    expect(button(rowOf('AM-003'), 'Retire')).toBeNull();
  });

  /* The step up is the point of a phase-appropriate signature: full validation
     by the pivotal phase. The server allows it and refuses only the step down. */
  it('keeps Validate on a phase-appropriate method and drops it on a validated one', async () => {
    stubMethods([method(1, 'validated'), method(2, 'phase-appropriate')]);
    render(<CmMethodLibrary />);
    await waitFor(() => expect(screen.getByText('AM-002')).toBeTruthy());
    expect(button(rowOf('AM-002'), 'Validate')).toBeTruthy();
    expect(button(rowOf('AM-001'), 'Validate')).toBeNull();
  });

  it('counts the methods signed suitable for their phase beside the validated ones', async () => {
    stubMethods([method(1, 'validated'), method(2, 'phase-appropriate'), method(3, 'development')]);
    render(<CmMethodLibrary />);
    await waitFor(() => expect(screen.getByText('AM-002')).toBeTruthy());
    const line = document.querySelector('.pj-sec-h .sec-sub')?.textContent ?? '';
    expect(line).toContain('1/3 validated');
    expect(line).toContain('1 signed suitable for phase');
  });
});
