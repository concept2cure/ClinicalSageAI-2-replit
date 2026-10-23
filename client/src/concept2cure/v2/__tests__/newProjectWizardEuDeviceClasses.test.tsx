// @vitest-environment jsdom
import React from 'react';
import { intakeFixtureRequest, waitForIntakeWorkspace } from './projectIntakeFixture';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: (...args: unknown[]) => intakeFixtureRequest(apiRequest, args),
}));
const filings = vi.hoisted(() => ({
  mdr: { id: 'eu_mdr_techdoc', displayName: 'EU MDR technical documentation', pathwayKey: 'mdr', agency: 'EU / Notified Body', region: 'EU' },
  ivdr: { id: 'eu_ivdr', displayName: 'EU IVDR technical documentation', pathwayKey: 'ivdr', agency: 'EU / Notified Body', region: 'EU' },
  fda: { id: 'us_510k', displayName: '510(k)', pathwayKey: '510k', agency: 'FDA', region: 'US' },
  mdrIII: { id: 'eu_mdr_class_iii', displayName: 'EU MDR class III', pathwayKey: 'mdr', agency: 'EU / Notified Body', region: 'EU' },
  mdrI: { id: 'eu_mdr_class_i', displayName: 'EU MDR class I', pathwayKey: 'mdr', agency: 'EU / Notified Body', region: 'EU' },
  ivdrA: { id: 'eu_ivdr_class_a', displayName: 'EU IVDR class A', pathwayKey: 'ivdr', agency: 'EU / Notified Body', region: 'EU' },
  ivdrCD: { id: 'eu_ivdr_class_cd', displayName: 'EU IVDR class C or D', pathwayKey: 'ivdr', agency: 'EU / Notified Body', region: 'EU' },
}));
vi.mock('../surfaces/AnaVerbs', () => ({
  RegistryPicker: ({ onChange }: { onChange: (id: string) => void }) => <>
    {Object.entries(filings).map(([key, f]) => <button key={key} onClick={() => onChange(f.id)}>Pick {key}</button>)}
  </>,
}));
vi.mock('../surfaces/RegistryBridge', () => ({
  getSubmissionTypeContext: (id: string) => Object.values(filings).find(f => f.id === id),
}));
import { NewProjectWizard } from '../surfaces/Projects';

const proceed = () => fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
async function configure(which: keyof typeof filings) {
  render(<NewProjectWizard segment="medtech" onClose={() => {}} onNav={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: `Pick ${which}` }));
  proceed();
  await waitForIntakeWorkspace();
  fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'Regional device study' } });
}
async function create() {
  await waitForIntakeWorkspace();
  proceed();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /create project/i })); });
  const calls = () => apiRequest.mock.calls.filter(c => c[0] === 'POST' && c[1] === '/api/c2c/projects');
  await vi.waitFor(() => expect(calls()).toHaveLength(1));
  return calls()[0][2] as Record<string, unknown>;
}
beforeEach(() => apiRequest.mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' } }) }));
afterEach(() => { cleanup(); apiRequest.mockReset(); });

describe('existing EU classification vocabulary reaches project initialization', () => {
  it.each([
    { filing: 'mdrIII', label: 'EU MDR class', choices: ['III'] },
    { filing: 'mdrI', label: 'EU MDR class', choices: ['I', 'Is', 'Im', 'Ir'] },
    { filing: 'ivdrA', label: 'EU IVDR class', choices: ['A'] },
    { filing: 'ivdrCD', label: 'EU IVDR class', choices: ['C', 'D'] },
  ] as const)('$filing offers only its exact declared-class scope, without choosing one', async ({ filing, label, choices }) => {
    await configure(filing); await act(async () => {});
    const select = screen.getByRole('combobox', { name: label }) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(within(select).getAllByRole('option').slice(1).map(o => (o as HTMLOptionElement).value)).toEqual(choices);
  });

  it('leaves a class-specific filing unconfirmed when the sponsor has not stated its class', async () => {
    await configure('mdrIII'); const body = await create(); expect(body.euMdrClass).toBeNull();
  });

  it.each([
    ['mdr', 'EU MDR class', ['I', 'Is', 'Im', 'Ir', 'IIa', 'IIb', 'III']],
    ['ivdr', 'EU IVDR class', ['A', 'B', 'C', 'D']],
  ] as const)('%s asks its regional class, initially unstated', async (filing, label, choices) => {
    await configure(filing);
    await act(async () => {});
    const select = screen.getByRole('combobox', { name: label }) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(within(select).getAllByRole('option').slice(1).map(o => (o as HTMLOptionElement).value)).toEqual(choices);
    expect(screen.queryByRole('textbox', { name: /^product code/i })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /^review panel/i })).toBeNull();
    expect(screen.queryAllByRole('textbox', { name: /predicate/i })).toHaveLength(0);
    expect(screen.queryByPlaceholderText(/FDA Form 3881/)).toBeNull();
    expect(screen.queryByText('CLIA-waived (IVD)')).toBeNull();
  });

  it.each([
    ['mdr', 'EU MDR class', 'IIa', 'euMdrClass', 'euIvdrClass'],
    ['ivdr', 'EU IVDR class', 'D', 'euIvdrClass', 'euMdrClass'],
  ] as const)('%s sends and reviews only the stated regional classification', async (filing, label, value, field, other) => {
    await configure(filing);
    fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value } });
    const body = await create();
    expect(screen.getByText(`EU ${filing.toUpperCase()} Class ${value}`)).toBeDefined();
    expect(screen.queryByText('Predicate')).toBeNull();
    expect(body[field]).toBe(value);
    expect(body[other] ?? null).toBeNull();
    expect(body.deviceClassification).toEqual({ intendedUse: '' });
  });

  it('an unstated IVDR class sends null, never an FDA class', async () => {
    await configure('ivdr');
    const body = await create();
    expect(body.euIvdrClass).toBeNull();
    expect(body.deviceClassification).toEqual({ intendedUse: '' });
  });

  it('changing from FDA to IVDR retires hidden FDA facts and does not restore them on return', async () => {
    await configure('fda');
    fireEvent.change(screen.getByRole('textbox', { name: /^product code/i }), { target: { value: 'BZH' } });
    fireEvent.change(screen.getByRole('textbox', { name: /predicate 510/i }), { target: { value: 'K181234' } });
    fireEvent.change(screen.getByRole('textbox', { name: /predicate device name/i }), { target: { value: 'Prior meter' } });
    fireEvent.change(screen.getByRole('combobox', { name: /^device class/i }), { target: { value: 'II' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /software \/ AI-ML/i }));
    fireEvent.click(screen.getByRole('button', { name: /step 1.*choose filing type/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick ivdr' }));
    proceed();
    expect(screen.queryAllByRole('textbox', { name: /predicate/i })).toHaveLength(0);
    fireEvent.change(screen.getByRole('combobox', { name: 'EU IVDR class' }), { target: { value: 'D' } });
    fireEvent.click(screen.getByRole('button', { name: /step 1.*choose filing type/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick fda' }));
    proceed();
    expect((screen.getByRole('textbox', { name: /^product code/i }) as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('combobox', { name: /^device class/i }) as HTMLSelectElement).value).toBe('');
    expect((screen.getByRole('checkbox', { name: /software \/ AI-ML/i }) as HTMLInputElement).checked).toBe(false);
    const body = await create();
    expect(body.euMdrClass).toBeUndefined();
    expect(body.euIvdrClass).toBeUndefined();
    expect(body.deviceClassification).toMatchObject({ productCode: '', predicateK: '', predicateName: '', deviceClass: '' });
  });

  it('changing MDR to IVDR and back retires both earlier regional classifications', async () => {
    await configure('mdr');
    fireEvent.change(screen.getByRole('combobox', { name: 'EU MDR class' }), { target: { value: 'IIa' } });
    fireEvent.click(screen.getByRole('button', { name: /step 1.*choose filing type/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick ivdr' })); proceed();
    expect((screen.getByRole('combobox', { name: 'EU IVDR class' }) as HTMLSelectElement).value).toBe('');
    fireEvent.change(screen.getByRole('combobox', { name: 'EU IVDR class' }), { target: { value: 'D' } });
    fireEvent.click(screen.getByRole('button', { name: /step 1.*choose filing type/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick mdr' })); proceed();
    expect((screen.getByRole('combobox', { name: 'EU MDR class' }) as HTMLSelectElement).value).toBe('');
    const body = await create();
    expect(body.euMdrClass).toBeNull(); expect(body.euIvdrClass).toBeUndefined();
  });
});
