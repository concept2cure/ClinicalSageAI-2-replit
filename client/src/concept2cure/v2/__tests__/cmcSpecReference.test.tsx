// @vitest-environment jsdom
/**
 * What ICH Q6A or Q6B expects in a specification is shown beside the specifications register (P-122 inventory,
 * row B5). The reference existed on the server and no CMC screen read it.
 *
 * What must be true: the tests are the server's, by guideline and dosage form; the project's own modality chooses
 * the guideline it opens on; a biologic is not offered the two forms Q6B has no test set for; it is called a
 * reference and gives no verdict on the project's specifications; a failed or refused read is said, never shown as
 * an empty list.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A' } }),
}));

import { CmSpecReference } from '../surfaces/cmcSpecReference';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
const CAVEAT = 'Acceptance criteria are product-specific and justified case-by-case per the ICH Q6A/Q6B decision trees; this lists the expected TEST set, not numeric limits.';
const res = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;
const test = (id: string, title: string, citation = 'ICH Q6A') => ({ id, title, citation });
const Q6A = [test('description', 'Description (appearance)'), test('identification', 'Identification'), test('assay', 'Assay'), test('impurities', 'Impurities')];
const SOLID = [test('dissolution', 'Dissolution'), test('uniformity_of_dosage_units', 'Uniformity of dosage units')];
const Q6B = [test('appearance', 'Appearance and description', 'ICH Q6B'), test('potency', 'Potency (biological activity)', 'ICH Q6B')];

/** The route's answers, by the path asked. */
function serve() {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === '/api/global-ri/cmc/specifications/small_molecule') return res({ productType: 'small_molecule', dosageForm: null, universalTests: Q6A, dosageFormTests: [], citation: 'ICH Q6A', notes: [CAVEAT] });
    if (url === '/api/global-ri/cmc/specifications/small_molecule?dosageForm=solid_oral') return res({ productType: 'small_molecule', dosageForm: 'solid_oral', universalTests: Q6A, dosageFormTests: SOLID, citation: 'ICH Q6A', notes: [CAVEAT] });
    if (url === '/api/global-ri/cmc/specifications/biologic') return res({ productType: 'biologic', dosageForm: null, universalTests: Q6B, dosageFormTests: [], citation: 'ICH Q6B', notes: [CAVEAT] });
    throw new Error(`unexpected read: ${url}`);
  });
}
const openProject = (productType?: string) => { (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT, productType }; };
const card = () => screen.getByTestId('cm-spec-reference');
/** The paths read, in order. */
const asked = () => apiRequest.mock.calls.map((call) => String(call[1]));

beforeEach(() => { apiRequest.mockReset(); serve(); openProject('drug'); });
afterEach(() => { cleanup(); delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT; });

describe('the Q6 reference beside the specifications', () => {
  it('lists the tests ICH Q6A expects in every specification, as the server gives them, with the engine’s caveat', async () => {
    render(<CmSpecReference />);
    expect(await screen.findByText('Assay')).toBeTruthy();
    const list = within(card()).getByRole('list', { name: 'In every specification' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(Q6A.map((t) => t.title));
    expect(within(card()).getByText('What ICH Q6A expects in a specification')).toBeTruthy();
    expect(within(card()).getByText(CAVEAT)).toBeTruthy();
  });

  it('is called a reference, and gives no verdict on the project’s own specifications', async () => {
    render(<CmSpecReference />);
    await screen.findByText('Assay');
    expect(within(card()).getByText('a reference, not a check of the specifications above')).toBeTruthy();
    expect(card().textContent).not.toMatch(/missing|not covered|complete|incomplete|✓|✗/i);
  });

  it('adds the tests of a dosage form when one is chosen', async () => {
    render(<CmSpecReference />);
    await screen.findByText('Assay');
    fireEvent.click(within(card()).getByRole('button', { name: 'Solid oral' }));
    const list = await within(card()).findByRole('list', { name: 'Also for a solid oral product' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(SOLID.map((t) => t.title));
    expect(asked()).toContain('/api/global-ri/cmc/specifications/small_molecule?dosageForm=solid_oral');
  });

  it('opens on ICH Q6B for a biologic project, and does not offer the forms Q6B has no test set for', async () => {
    openProject('biologic');
    render(<CmSpecReference />);
    expect(await screen.findByText('Potency (biological activity)')).toBeTruthy();
    expect(within(card()).getByText('What ICH Q6B expects in a specification')).toBeTruthy();
    const forms = within(within(card()).getByRole('group', { name: 'Dosage form' })).getAllByRole('button').map((b) => b.textContent);
    expect(forms).toEqual(['Any form', 'Parenteral']);
  });

  it('a form chosen under Q6A is not carried to Q6B when it is not one of Q6B’s', async () => {
    render(<CmSpecReference />);
    await screen.findByText('Assay');
    fireEvent.click(within(card()).getByRole('button', { name: 'Solid oral' }));
    await within(card()).findByRole('list', { name: 'Also for a solid oral product' });
    fireEvent.click(within(card()).getByRole('button', { name: 'Biologic (ICH Q6B)' }));
    expect(await screen.findByText('Potency (biological activity)')).toBeTruthy();
    expect(asked().at(-1)).toBe('/api/global-ri/cmc/specifications/biologic');
  });

  /* Found in the running app, 2026-11-12: a biologic project opened by a link (the shell then knows its id alone)
     was shown ICH Q6A, because an unknown product type was read as a small molecule. */
  it('a project whose product type the shell does not know has no guideline chosen for it, and nothing is read', async () => {
    openProject(undefined);
    render(<CmSpecReference />);
    expect(within(card()).getByText('What ICH Q6A or Q6B expects in a specification')).toBeTruthy();
    expect(within(card()).getByTestId('cm-spec-reference-choose').textContent).toMatch(/Choose the guideline for this product/);
    for (const name of ['Small molecule (ICH Q6A)', 'Biologic (ICH Q6B)']) {
      expect(within(card()).getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false');
    }
    expect(within(card()).queryByRole('list')).toBeNull();
    expect(within(card()).queryByRole('group', { name: 'Dosage form' })).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
    fireEvent.click(within(card()).getByRole('button', { name: 'Biologic (ICH Q6B)' }));
    expect(await screen.findByText('Potency (biological activity)')).toBeTruthy();
    expect(asked()).toEqual(['/api/global-ri/cmc/specifications/biologic']);
  });

  it('a device project, which has no Q6 guideline of its own, is not given one either', () => {
    openProject('device');
    render(<CmSpecReference />);
    expect(within(card()).getByTestId('cm-spec-reference-choose')).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('honest states', () => {
  it('a failed read says so and lists nothing', async () => {
    apiRequest.mockRejectedValue(Object.assign(new Error('boom'), { name: 'ApiRequestError', status: 500 }));
    render(<CmSpecReference />);
    expect(await screen.findByText('Couldn’t load the ICH Q6A reference')).toBeTruthy();
    expect(within(card()).queryByRole('list')).toBeNull();
  });

  it('a reply that is not the reference is a failed read, not an empty list', async () => {
    apiRequest.mockResolvedValue(res({ success: true, data: [] }));
    render(<CmSpecReference />);
    expect(await screen.findByText('Couldn’t load the ICH Q6A reference')).toBeTruthy();
    expect(within(card()).queryByRole('list')).toBeNull();
  });
});
