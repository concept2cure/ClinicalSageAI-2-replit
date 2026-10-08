// @vitest-environment jsdom
/**
 * The New Project wizard records only the regulated facts the person stated
 * (P-21, docs/LAUNCH_DEFINITION_OF_DONE.md: regulated choices start unstated).
 *
 * ── The defect (QA 2026-10-08, second walk: j1, j7) ──────────────────────────
 * Step 2 had a "Therapeutic area" dropdown that started on "Oncology (general)",
 * and its label was sent as the program's `indication`. Form 1571 reads the
 * program's indication, so "QA-W2 Tolvexa · idiopathic pulmonary fibrosis" was
 * filed with the indication "COPD / asthma", and a program whose select nobody
 * touched with "Oncology (general)". The review also said "Recorded as IND ·
 * biologic" for an inhaled small molecule: nobody chose drug or biologic; the
 * wizard took it from the workstream tab (the shared vocabulary mapped every
 * IND to 'biologic').
 *
 * ── What must be true now ────────────────────────────────────────────────────
 *   • a therapeutic area is not an indication: there is no therapeutic-area
 *     default, and the indication is free text the person types, or nothing;
 *   • a blank indication sends no indication;
 *   • an IND's product type starts on "Not stated — choose", offers drug and
 *     biologic, and the wizard cannot go on until one is chosen; what was
 *     chosen is what is sent and what the review shows;
 *   • a filing type that fixes the class (an NDA is a drug application) asks
 *     nothing and records that class.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

const reg = vi.hoisted(() => ({
  ctx: {
    id: 'us_ind',
    displayName: 'Investigational New Drug Application',
    pathwayKey: 'ind',
    agency: 'FDA',
    region: 'US',
    submissionFormat: 'eCTD',
  } as Record<string, string>,
}));
vi.mock('../surfaces/AnaVerbs', () => ({
  RegistryPicker: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange(reg.ctx.id)}>
      Pick filing
    </button>
  ),
}));
vi.mock('../surfaces/RegistryBridge', () => ({
  getSubmissionTypeContext: () => reg.ctx,
}));

import { NewProjectWizard } from '../surfaces/Projects';

const IND = { ...reg.ctx };
const NDA = {
  id: 'us_nda',
  displayName: 'New Drug Application',
  pathwayKey: 'nda',
  agency: 'FDA',
  region: 'US',
  submissionFormat: 'eCTD',
};

function toConfigure(ctx: Record<string, string> = IND) {
  reg.ctx = ctx;
  render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /pick filing/i }));
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
  fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), {
    target: { value: 'QA-W2 Tolvexa · idiopathic pulmonary fibrosis (IND)' },
  });
}
const continueBtn = () => screen.getByRole('button', { name: /^continue$/i }) as HTMLButtonElement;
const productTypeSelect = () => screen.queryByRole('combobox', { name: /product type/i }) as HTMLSelectElement | null;
const indicationInput = () => screen.queryByRole('textbox', { name: /^indication/i }) as HTMLInputElement | null;
const reviewValue = (term: string) =>
  Array.from(document.querySelectorAll('.npw-review-row'))
    .find((r) => r.querySelector('dt')?.textContent === term)
    ?.querySelector('dd')?.textContent ?? null;

async function create(): Promise<Record<string, unknown>> {
  apiRequest.mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ data: { id: '8a11b987-ac2d-4748-9e9c-5dc40c082662', title: 'x', code: 'TOLV' }, meta: {} }),
  });
  fireEvent.click(await screen.findByRole('button', { name: /create project/i }));
  await vi.waitFor(() => expect(apiRequest).toHaveBeenCalled());
  return apiRequest.mock.calls[0][2] as Record<string, unknown>;
}

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('New Project wizard — the indication is stated, never a therapeutic-area default', () => {
  it('offers no therapeutic area and no pre-chosen indication: the indication is an empty text field', () => {
    toConfigure();
    expect(screen.queryByText(/therapeutic area/i), 'a therapeutic-area control is still offered').toBeNull();
    expect(screen.queryByText('Oncology (general)')).toBeNull();
    const input = indicationInput();
    expect(input, 'no free-text indication field').not.toBeNull();
    expect(input!.value).toBe('');
  });

  it('sends no indication when none was typed, and the review says it is not stated', async () => {
    toConfigure();
    fireEvent.change(productTypeSelect()!, { target: { value: 'drug' } });
    fireEvent.click(continueBtn());
    expect(reviewValue('Indication')).toMatch(/not stated/i);
    const body = await create();
    expect(body.indication ?? null, 'an indication nobody stated was sent').toBeNull();
  });

  it('sends exactly the indication the person typed', async () => {
    toConfigure();
    fireEvent.change(indicationInput()!, { target: { value: '  idiopathic pulmonary fibrosis ' } });
    fireEvent.change(productTypeSelect()!, { target: { value: 'drug' } });
    fireEvent.click(continueBtn());
    expect(reviewValue('Indication')).toBe('idiopathic pulmonary fibrosis');
    const body = await create();
    expect(body.indication).toBe('idiopathic pulmonary fibrosis');
  });
});

describe('New Project wizard — an IND’s product type is chosen, not taken from the tab', () => {
  it('starts on "Not stated — choose" and offers only drug and biologic', () => {
    toConfigure();
    const select = productTypeSelect();
    expect(select, 'no product-type question for an IND').not.toBeNull();
    expect(select!.value).toBe('');
    const options = Array.from(select!.options).map((o) => o.textContent);
    expect(options[0]).toBe('Not stated — choose');
    expect(Array.from(select!.options).slice(1).map((o) => o.value)).toEqual(['drug', 'biologic']);
  });

  it('cannot continue until the product type is chosen', () => {
    toConfigure();
    expect(continueBtn().disabled, 'Continue was enabled with no product type').toBe(true);
    fireEvent.change(productTypeSelect()!, { target: { value: 'biologic' } });
    expect(continueBtn().disabled).toBe(false);
  });

  it('records the class that was chosen, and the review shows it', async () => {
    toConfigure();
    fireEvent.change(productTypeSelect()!, { target: { value: 'drug' } });
    fireEvent.click(continueBtn());
    expect(reviewValue('Recorded as')).toBe('IND · drug');
    const body = await create();
    expect(body.productType).toBe('drug');
  });
});

describe('New Project wizard — a filing type that fixes the class asks nothing', () => {
  it('an NDA is recorded as a drug with no product-type question', async () => {
    toConfigure(NDA);
    expect(productTypeSelect()).toBeNull();
    expect(continueBtn().disabled).toBe(false);
    fireEvent.click(continueBtn());
    expect(reviewValue('Recorded as')).toBe('NDA · drug');
    const body = await create();
    expect(body.productType).toBe('drug');
  });
});
