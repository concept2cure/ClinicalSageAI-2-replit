// @vitest-environment jsdom
/**
 * Client administration walk, 2026-11-10 (docs/evidence/F1/2026-11-10-client-admin/, findings W1-01, A11Y-01,
 * A11Y-02, W1-03): sign-up could not be typed into. Its text field and its select were components declared inside the
 * page component, so each key press made a new component type, React remounted the field, and focus fell to the page.
 * "Avery" left "A". Pasting and a password manager's autofill worked, which is how earlier walks and this folder's
 * other tests (they set the value in one event) passed over it.
 *
 * These tests type as a person does, one key at a time. They also hold what a keyboard and a screen-reader user need
 * from the same fields (the refusal is tied to its field), and that the page offers no privacy switch that is
 * connected to nothing.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/components/i18n/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));
// The steps' animations wait on timers jsdom does not run. Each motion tag is ONE component, as in the library: a new
// function per render would itself remount everything beneath it, and these tests would then fail for the mock's reason.
vi.mock('framer-motion', () => {
  const strip = ({ initial, animate, exit, transition, layout, ...rest }: Record<string, unknown>) => rest;
  const made = new Map<string, (p: Record<string, unknown>) => React.ReactElement>();
  const tag = (t: string) => {
    if (!made.has(t)) made.set(t, (p: Record<string, unknown>) => React.createElement(t, strip(p)));
    return made.get(t)!;
  };
  return { motion: new Proxy({}, { get: (_o, t: string) => tag(t) }), AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});
vi.mock('wouter', () => ({ useLocation: () => ['/concept2cure/signup', vi.fn()] }));

import { ZenSignup } from '../ZenSignup';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const CONTINUE = /^(signup\.continue|Continue)$/;

describe('sign-up can be typed into', () => {
  it('keeps the whole of what is typed in a text field, and keeps focus in it', async () => {
    const user = userEvent.setup();
    const { container } = render(<ZenSignup />);
    const first = container.querySelector<HTMLInputElement>('#firstName')!;
    await user.click(first);
    await user.keyboard('Avery');
    const after = container.querySelector<HTMLInputElement>('#firstName')!;
    expect(after.value, 'every key press reaches the field').toBe('Avery');
    expect(after, 'the field is the same element after typing: it was not remounted').toBe(first);
    expect(document.activeElement, 'focus stays in the field').toBe(after);
  });

  it('lets a person tab from one field to the next while typing', async () => {
    const user = userEvent.setup();
    const { container } = render(<ZenSignup />);
    await user.click(container.querySelector('#firstName')!);
    await user.keyboard('Avery');
    await user.tab();
    await user.keyboard('Lind');
    await user.tab();
    await user.keyboard('avery.lind@example.test');
    expect(container.querySelector<HTMLInputElement>('#lastName')!.value).toBe('Lind');
    expect(container.querySelector<HTMLInputElement>('#email')!.value).toBe('avery.lind@example.test');
  });

  it('keeps focus in the second step, where a select sits between two text fields', async () => {
    const user = userEvent.setup();
    const { container } = render(<ZenSignup />);
    const set = (id: string, value: string) => fireEvent.change(container.querySelector(`#${id}`)!, { target: { value } });
    set('firstName', 'Avery'); set('lastName', 'Lind'); set('email', 'avery.lind@example.test');
    set('password', 'Harbor-Lantern-77!'); set('confirmPassword', 'Harbor-Lantern-77!'); set('jobTitle', 'Regulatory Affairs Manager');
    fireEvent.click(screen.getByRole('button', { name: CONTINUE }));
    const org = container.querySelector<HTMLInputElement>('#organization')!;
    await user.click(org);
    await user.keyboard('Northgate Biologics');
    expect(container.querySelector<HTMLInputElement>('#organization')!.value).toBe('Northgate Biologics');
    await user.selectOptions(container.querySelector<HTMLSelectElement>('#organizationType')!, 'biotech');
    const type = container.querySelector<HTMLSelectElement>('#organizationType')!;
    expect(type.value).toBe('biotech');
    expect(container.querySelector('#organization'), 'choosing a type does not remount the text field').toBe(org);
  });
});

describe('a refused sign-up field says so to everyone', () => {
  it('ties the refusal to its field and marks the field invalid', () => {
    const { container } = render(<ZenSignup />);
    fireEvent.click(screen.getByRole('button', { name: CONTINUE }));
    const first = container.querySelector<HTMLInputElement>('#firstName')!;
    expect(first.getAttribute('aria-invalid')).toBe('true');
    const describedBy = first.getAttribute('aria-describedby');
    expect(describedBy, 'the field names the element that holds its refusal').toBeTruthy();
    const refusal = container.querySelector(`#${describedBy}`);
    expect(refusal?.textContent).toBe('signup.errors.firstNameRequired');
  });

  it('marks no field invalid before anything is refused', () => {
    const { container } = render(<ZenSignup />);
    for (const el of Array.from(container.querySelectorAll('input'))) {
      expect(el.getAttribute('aria-invalid'), el.id).not.toBe('true');
      expect(el.getAttribute('aria-describedby'), el.id).toBeNull();
    }
  });

  it('shows a visible focus indicator on a field: the outline is not removed with nothing in its place', () => {
    const { container } = render(<ZenSignup />);
    const cls = container.querySelector('#firstName')!.className;
    expect(cls, 'a focus ring is drawn').toMatch(/focus-visible:ring-2/);
    expect(cls, 'the ring is not switched off').not.toMatch(/focus:ring-0/);
  });
});

describe('sign-up offers only choices the product keeps', () => {
  it('has no "AI Model Improvement" switch: nothing stored it and nothing read it', () => {
    const { container } = render(<ZenSignup />);
    const set = (id: string, value: string) => fireEvent.change(container.querySelector(`#${id}`)!, { target: { value } });
    set('firstName', 'Avery'); set('lastName', 'Lind'); set('email', 'avery.lind@example.test');
    set('password', 'Harbor-Lantern-77!'); set('confirmPassword', 'Harbor-Lantern-77!'); set('jobTitle', 'Regulatory Affairs Manager');
    fireEvent.click(screen.getByRole('button', { name: CONTINUE }));
    set('organization', 'Northgate Biologics'); set('country', 'Germany');
    fireEvent.change(container.querySelector('#organizationType')!, { target: { value: 'biotech' } });
    fireEvent.change(container.querySelector('#useCase')!, { target: { value: (container.querySelector('#useCase option:nth-child(2)') as HTMLOptionElement).value } });
    fireEvent.click(screen.getByRole('button', { name: CONTINUE }));
    fireEvent.click(screen.getByRole('button', { name: CONTINUE }));
    expect(container.querySelectorAll('input[type=checkbox]').length, 'the agreements step is shown').toBeGreaterThan(0);
    const text = document.body.textContent ?? '';
    expect(text, 'the switch and its title are gone').not.toContain('AI Model Improvement');
    expect(text, 'no promise of a setting that does not exist').not.toContain('you can change this anytime in Settings');
  });
});
