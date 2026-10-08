// @vitest-environment jsdom
/**
 * The New Project wizard records the name the person gave, and its review
 * shows exactly what will be saved.
 *
 * ── The defect (QA 2026-10-08, journey j1) ───────────────────────────────────
 * With Project name left blank the wizard went on to Review, which read
 * "Project name (unnamed)" and "Product —", and Create was enabled. The create
 * call then sent `name: name || selTpl.label`, so the program was saved as
 * "Investigational New Drug Application" — the filing type's label — and its
 * product as that label too. Two programs in the QA organisation carried that
 * same generic name. The review and the payload disagreed, and the server's
 * own "name is required" check never ran, because the client had filled the
 * name in for it.
 *
 * ── What must be true now ────────────────────────────────────────────────────
 *   • the project name is required: Configure cannot continue without one,
 *     and says so;
 *   • a name of spaces is no name;
 *   • the review shows the name and the product exactly as they will be
 *     saved, and the create call sends exactly those values — never the
 *     filing type's label.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

/* The registry picker is stubbed to one choice: these tests are about the
   configure and review steps, not the registry loader. */
vi.mock('../surfaces/AnaVerbs', () => ({
  RegistryPicker: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange('us_ind')}>
      Pick IND
    </button>
  ),
}));
vi.mock('../surfaces/RegistryBridge', () => ({
  getSubmissionTypeContext: () => ({
    id: 'us_ind',
    displayName: 'Investigational New Drug Application',
    pathwayKey: 'ind',
    agency: 'FDA',
    region: 'US',
    submissionFormat: 'eCTD',
  }),
}));

import { NewProjectWizard } from '../surfaces/Projects';

const LABEL = 'Investigational New Drug Application';

function toConfigure() {
  render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /pick ind/i }));
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
}
const nameInput = () => screen.getByRole('textbox', { name: /project name/i }) as HTMLInputElement;
const productInput = () => screen.getByRole('textbox', { name: /product name/i }) as HTMLInputElement;
const continueBtn = () => screen.getByRole('button', { name: /^continue$/i }) as HTMLButtonElement;
const reviewValue = (term: string) =>
  Array.from(document.querySelectorAll('.npw-review-row'))
    .find((r) => r.querySelector('dt')?.textContent === term)
    ?.querySelector('dd')?.textContent ?? null;

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('New Project wizard — the project name', () => {
  it('cannot continue past Configure without a project name, and says it is required', () => {
    toConfigure();
    expect(nameInput().value).toBe('');
    expect(continueBtn().disabled, 'Continue was enabled with no project name').toBe(true);
    expect(nameInput().required || nameInput().getAttribute('aria-required') === 'true').toBe(true);
    expect(document.querySelector('.npw-form')?.textContent).toMatch(/required/i);
  });

  it('treats a name of spaces as no name', () => {
    toConfigure();
    fireEvent.change(nameInput(), { target: { value: '   ' } });
    expect(continueBtn().disabled).toBe(true);
  });

  it('never reaches a review that reads "(unnamed)"', () => {
    toConfigure();
    fireEvent.click(continueBtn()); // disabled: nothing happens
    expect(screen.queryByText('(unnamed)')).toBeNull();
    expect(screen.queryByRole('button', { name: /create project/i })).toBeNull();
  });
});

describe('New Project wizard — the review is what is saved', () => {
  async function createWith(name: string, product: string) {
    apiRequest.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05', title: name.trim(), code: 'HLV-334' }, meta: {} }),
    });
    toConfigure();
    fireEvent.change(nameInput(), { target: { value: name } });
    fireEvent.change(productInput(), { target: { value: product } });
    // An IND's drug / biologic class is stated before Continue (P-21; see
    // newProjectWizardRegulatedChoices.test.tsx).
    fireEvent.change(screen.getByRole('combobox', { name: /product type/i }), { target: { value: 'drug' } });
    fireEvent.click(continueBtn());
    const shown = { name: reviewValue('Project name'), product: reviewValue('Product') };
    fireEvent.click(await screen.findByRole('button', { name: /create project/i }));
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const body = apiRequest.mock.calls[0][2] as { name: string; productName: string };
    return { shown, body };
  }

  it('sends the typed name and product, trimmed, exactly as the review showed them', async () => {
    const { shown, body } = await createWith('  HLV-334 — IND (QA)  ', ' Helvanta ');
    expect(shown.name).toBe('HLV-334 — IND (QA)');
    expect(body.name).toBe('HLV-334 — IND (QA)');
    expect(shown.product).toBe('Helvanta');
    expect(body.productName).toBe('Helvanta');
  });

  it('with no product name, the review says the project name will be recorded as the product', async () => {
    const { shown, body } = await createWith('HLV-334 — IND (QA)', '');
    // The server records product_name = name when none is given; the review
    // says so instead of showing a dash over a value that will be written.
    expect(body.productName).toBe('HLV-334 — IND (QA)');
    expect(shown.product).toContain('HLV-334 — IND (QA)');
    expect(shown.product).toMatch(/same as the project name/i);
  });

  it('never sends the filing type label as the name or the product', async () => {
    const { body } = await createWith('HLV-334 — IND (QA)', '');
    expect(body.name).not.toBe(LABEL);
    expect(body.productName).not.toBe(LABEL);
  });
});
