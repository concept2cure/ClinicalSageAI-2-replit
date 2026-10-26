// @vitest-environment jsdom
/**
 * Labeling — "Warnings and precautions" says it is not available yet (slice 0).
 *
 * The map's `labeling` row (.design/client-journey/INFORMATION_ARCHITECTURE.md,
 * section 5 and section 8, slice 0): the panel was a permanent "No label
 * warnings yet" over a read that does not exist. server/routes/mdx-labeling.ts
 * serves documents, translations, symbols and coverage only; there is no
 * warnings store or route anywhere. "No label warnings yet" reads as "this
 * label has no warnings", which nothing could have established. The panel now
 * says the warnings are not available here yet.
 *
 * The page header and the panel's sub-heading made the same claim in other
 * words: "Organization-wide labeling register … warnings traced to the ISO
 * 14971 risk file" and "traced to the risk file (ISO 14971)", over a screen
 * that shows no register and reads no warning. They say what the screen holds.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Labeling } from '../surfaces/Labeling';

const DOC = { id: 4, device_name: 'Aurora CGM', doc_kind: 'ifu', version: '3', organization_id: 7, status: 'draft', udi_di: null };
const PROGRAM_ID = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';
const KEYED = `/api/mdx/labeling?program_id=${PROGRAM_ID}`;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, rawPath: unknown) => {
    const path = String(rawPath ?? '');
    const data = path === KEYED ? [DOC] : [];
    return { ok: true, status: 200, json: async () => ({ data }) } as Response;
  });
});
afterEach(() => cleanup());

const mount = (programId?: string) =>
  render(<Labeling {...({ onAsk: () => {}, programId } as unknown as React.ComponentProps<typeof Labeling>)} />);
const text = () => document.body.textContent ?? '';

describe('Labeling — warnings and precautions', () => {
  it('says the panel is not available yet instead of an empty list', async () => {
    mount();
    await waitFor(() => expect(text()).toMatch(/Warnings and precautions/));
    expect(text()).toMatch(/Warnings and precautions are not available yet/);
    expect(text()).not.toMatch(/No label warnings yet/);
  });

  it('says the same with this project’s labeling document on screen', async () => {
    mount(PROGRAM_ID);
    await waitFor(() => expect(text()).toMatch(/Instructions for use v3/));
    expect(text()).toMatch(/Warnings and precautions are not available yet/);
    expect(text()).not.toMatch(/No label warnings yet/);
  });

  for (const programId of [undefined, PROGRAM_ID]) {
    it(`claims no register and no warnings-to-risk-file trace (${programId ? 'with' : 'without'} the project)`, async () => {
      mount(programId);
      await waitFor(() => expect(text()).toMatch(/Warnings and precautions/));
      expect(text()).not.toMatch(/Organization-wide labeling register/);
      expect(text()).not.toMatch(/traced to the (ISO 14971 )?risk file/);
      expect(document.body.querySelector('.ph-sub')?.textContent ?? '').toMatch(
        /^The label and IFU for this project: ISO 15223-1 symbols, UDI placement \(21 CFR 801\.45 \/ GUDID\), and translations with back-translation QC\.$/,
      );
    });
  }
});
