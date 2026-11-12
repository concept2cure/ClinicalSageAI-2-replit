// @vitest-environment jsdom
/**
 * Client administration walk, 2026-11-10 (docs/evidence/F1/2026-11-10-client-admin/, W1-02 and W1-04): sign-up made a
 * person read and accept the Terms of Service, the Privacy Policy and the regulatory acknowledgement, and required a
 * job title. It sent none of them, so nothing recorded that anyone had agreed to anything.
 *
 * The request now carries the three acceptances, the revision of the agreement text that was on the page, and the job
 * title. The revision is pinned to the text: changing a word of an agreement without a new revision fails here.
 */
import React from 'react';
import { createHash } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/components/i18n/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));
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

import { SIGNUP_AGREEMENTS_REVISION, ZenSignup } from '../ZenSignup';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const CONTINUE = /^(signup\.continue|Continue)$/;

/** Walk to the agreements step, as a person does. */
function toAgreements() {
  const { container } = render(<ZenSignup />);
  const set = (id: string, value: string) => fireEvent.change(container.querySelector(`#${id}`)!, { target: { value } });
  set('firstName', 'Avery'); set('lastName', 'Lind'); set('email', 'avery.lind@example.test');
  set('password', 'Harbor-Lantern-77!'); set('confirmPassword', 'Harbor-Lantern-77!'); set('jobTitle', 'Head of Regulatory Affairs');
  fireEvent.click(screen.getByRole('button', { name: CONTINUE }));
  set('organization', 'Northgate Biologics'); set('country', 'Germany');
  fireEvent.change(container.querySelector('#organizationType')!, { target: { value: 'biotech' } });
  fireEvent.change(container.querySelector('#useCase')!, { target: { value: (container.querySelector('#useCase option:nth-child(2)') as HTMLOptionElement).value } });
  fireEvent.click(screen.getByRole('button', { name: CONTINUE }));
  fireEvent.click(screen.getByRole('button', { name: CONTINUE }));
  return container;
}

function acceptAll(container: HTMLElement) {
  for (let pass = 0; pass < 3; pass += 1) {
    for (const box of Array.from(container.querySelectorAll('[class*="overflow-y-auto"]'))) fireEvent.scroll(box);
    for (const cb of Array.from(container.querySelectorAll<HTMLInputElement>('input[type=checkbox]'))) if (!cb.checked && !cb.disabled) fireEvent.click(cb);
  }
}

describe('sign-up sends what the person agreed to', () => {
  it('carries the three acceptances, the revision of the text shown, and the job title', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ success: true, verification: { required: true, email: 'avery.lind@example.test' } }) }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    const container = toAgreements();
    acceptAll(container);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /signup\.createAccount/ })); });
    const call = fetchMock.mock.calls.find(c => String((c as unknown[])[0]).includes('/api/auth/signup')) as unknown as [string, { body: string }];
    expect(call, 'the sign-up was sent').toBeTruthy();
    const body = JSON.parse(call[1].body) as Record<string, unknown>;
    expect(body.agreements).toEqual({ revision: SIGNUP_AGREEMENTS_REVISION, termsOfService: true, privacyPolicy: true, regulatoryAcknowledgement: true });
    expect(body.jobTitle).toBe('Head of Regulatory Affairs');
  });

  it('cannot be sent until each agreement is accepted', () => {
    const container = toAgreements();
    const create = screen.getByRole('button', { name: /signup\.createAccount/ }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    acceptAll(container);
    expect(create.disabled).toBe(false);
  });
});

describe('the revision names one text', () => {
  // The digest of the agreement text on the page, by revision. A changed word needs a new revision and its digest here,
  // so an acceptance on record always points at the text that was read.
  const DIGEST_BY_REVISION: Record<string, string> = {
    '2026-11-10': '02ae40334284f59758001e8b9af10b905550733149d207625cdd7d8f0a40f279',
  };

  it('pins the agreement text to its revision', () => {
    const container = toAgreements();
    // The documents a person scrolls through, and the sentence beside each box they tick.
    const clean = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const documents = Array.from(container.querySelectorAll('[class*="overflow-y-auto"]')).map(clean);
    const acceptances = Array.from(container.querySelectorAll('input[type=checkbox]')).map(cb => clean(cb.closest('label') ?? cb));
    expect(acceptances, 'three acceptances are asked for').toHaveLength(3);
    const text = [...documents, ...acceptances].join('\n---\n');
    expect(text.length, 'the agreements are on the page').toBeGreaterThan(500);
    const digest = createHash('sha256').update(text, 'utf8').digest('hex');
    expect(SIGNUP_AGREEMENTS_REVISION in DIGEST_BY_REVISION, `revision ${SIGNUP_AGREEMENTS_REVISION} has a pinned digest`).toBe(true);
    expect(digest, 'the agreement text changed: give it a new revision in ZenSignup.tsx and pin its digest here').toBe(DIGEST_BY_REVISION[SIGNUP_AGREEMENTS_REVISION]);
  });
});
