// @vitest-environment jsdom
/**
 * <ErrorState> — the one surface a failure is reported on.
 *
 * ── What it replaced ─────────────────────────────────────────────────────────
 * Four parallel implementations that disagreed about the three things that
 * matter: whether a failure is announced to a screen reader, whether it offers
 * a way out, and whether the string it renders is safe to show. The MDX UAT
 * found the consequences of the third — the device-workstream surface rendered
 * a full Drizzle `Failed query: select "id", …` as its page body, and the
 * software-lifecycle panel rendered `relation "software_lifecycle_items" does
 * not exist`, styled as monospace so it read as intended output.
 *
 * ── The property these tests hold ────────────────────────────────────────────
 * The redaction lives IN the component, so "no client-rendered string contains
 * SQL, a table name, a file path, an env var or an API route" is a property of
 * the UI rather than a convention every caller must remember. That is only true
 * if it holds for a string the component is handed DIRECTLY, bypassing the
 * transport layer entirely — which is what the leak cases below do.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

import { ErrorState, EmptyState } from '../dataConnect';

afterEach(cleanup);

describe('ErrorState — announcement and recovery', () => {
  it('announces assertively as an alert', () => {
    render(<ErrorState title="Couldn't load the portfolio" />);
    const el = screen.getByRole('alert');
    expect(el.getAttribute('aria-live')).toBe('assertive');
    expect(el.textContent).toContain("Couldn't load the portfolio");
  });

  it('offers a retry that runs, and reports its busy state', () => {
    const retry = vi.fn();
    const { rerender } = render(<ErrorState title="Failed" retry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);

    // While retrying, the control says so and cannot be double-fired.
    rerender(<ErrorState title="Failed" retry={retry} busy />);
    const btn = screen.getByRole('button', { name: /retrying/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('is dismissible only when a dismiss handler is given', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<ErrorState title="Failed" />);
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();

    rerender(<ErrorState title="Failed" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss this message' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows the correlation id as the support handle', () => {
    render(<ErrorState title="Failed" correlationId="9f2c1ba47d3e40518c6ad0b2e7f45391" />);
    const el = screen.getByRole('alert');
    expect(el.textContent).toMatch(/reference/i);
    expect(el.textContent).toContain('9f2c1ba47d3e40518c6ad0b2e7f45391');
  });
});

describe('ErrorState — nothing internal can be rendered through it', () => {
  /**
   * Every string below was observed on a real screen during the MDX UAT, or is
   * the shape of one. They are passed DIRECTLY as `message`, with no transport
   * layer in between, because that is the guarantee under test: the component
   * is safe regardless of what a caller hands it.
   */
  const LEAKS: Array<[string, string]> = [
    ['a missing relation', 'relation "software_lifecycle_items" does not exist'],
    ['a Drizzle failed query', 'Failed query: select "id", "organization_id" from "device_programs"'],
    ['raw SQL', 'select "id", "name" from "regulatory_programs" where org = $1'],
    ['an API route', 'GET /api/mdx/software returned 500'],
    ['an env var', 'ESTAR_TEMPLATE_DIR is not configured'],
    ['a file path', 'ENOENT: no such file at /home/app/assets/estar-field-map.ts'],
    ['a source location', 'TypeError at server/routes/c2c/projects.ts:812'],
    ['a stack frame', '    at Object.query (/app/node_modules/pg/lib/client.js:526:17)'],
    ['an enum token', 'PENDING_STORE'],
    ['a driver code', 'ECONNREFUSED'],
  ];

  it.each(LEAKS)('does not render %s', (_label, leak) => {
    render(<ErrorState title="Couldn't complete that" message={leak} />);
    const shown = screen.getByRole('alert').textContent ?? '';
    expect(shown).toContain("Couldn't complete that");
    expect(shown).not.toContain(leak);
    // Nothing recognisably internal survives, in any form.
    expect(shown).not.toMatch(/relation "|Failed query|select "|\/api\/|_DIR\b|node_modules|\.ts:\d/i);
  });

  it('still renders a legitimate server sentence', () => {
    // The filter must not swallow the message that tells a user what to fix.
    render(<ErrorState title="Couldn't save" message="Name is required." />);
    expect(screen.getByRole('alert').textContent).toContain('Name is required.');
  });
});

describe('EmptyState tone="error" delegates rather than rendering its own panel', () => {
  /**
   * 139 call sites pass `tone="error"`. They converge by delegation rather than
   * by rewrite, so all of them inherit the filter and the assertive
   * announcement without being touched.
   */
  it('renders the shared ErrorState, filter included', () => {
    render(
      <EmptyState
        tone="error"
        title="Couldn't load the software lifecycle"
        hint='relation "software_lifecycle_items" does not exist'
        retry={() => {}}
      />,
    );
    const el = screen.getByRole('alert');
    expect(el.getAttribute('aria-live')).toBe('assertive');
    expect(el.className).toContain('c2c-error-state');
    expect(el.textContent).not.toContain('software_lifecycle_items');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('leaves the idle tone a polite status, not an alert', () => {
    render(<EmptyState title="No programs yet" hint="Create one to get started." />);
    const el = screen.getByRole('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/* The founder, 2026-11-05: not licensed, not relevant, missing evidence and unavailable to this user are
   never one generic failure. 117 screens rendered every failed read as "X could not be read" with Try
   again, a plan without the feature included. Handed the failed read (`read`), the one panel words a
   refusal through the one read classifier and offers no retry; a failure to answer keeps the caller's
   words and its retry. */
describe('ErrorState — a refused read is said as the refusal it is', () => {
  const refusals = [
    { name: 'a plan without the feature', read: { status: 403, code: 'MODULE_NOT_LICENSED' }, title: 'Not enabled for your organization', words: /not enabled for your organization, so the task board was not read/ },
    { name: 'a part not in this release', read: { status: 403, code: 'LAUNCH_SCOPE' }, title: 'Not in this release', words: /not in this release, so the task board was not read/ },
    { name: 'a role', read: { status: 403, code: 'FORBIDDEN' }, title: 'Your role cannot do this', words: /Your role cannot do this/ },
    { name: 'an unconfirmed organization', read: { status: 403, code: 'TENANT_REQUIRED' }, title: 'Your organization could not be confirmed', words: /could not be confirmed/ },
    { name: 'a record not in this organization', read: { status: 404, code: 'PROJECT_NOT_FOUND' }, title: 'Not found in your organization', words: /not found in your organization/ },
    { name: 'an expired session', read: { status: 401 }, title: 'Your session has expired', words: /Sign in again to read the task board/ },
  ];

  it.each(refusals)('$name: its own title and words, and no retry', ({ read, title, words }) => {
    const retry = vi.fn();
    render(<ErrorState title="The task board could not be read" message="Module access denied" retry={retry} read={read} readWhat="the task board" />);
    expect(screen.getByRole('alert').textContent).toContain(title);
    expect(screen.getByRole('alert').textContent).toMatch(words);
    expect(screen.queryByText('The task board could not be read')).toBeNull();
    expect(screen.queryByText('Module access denied')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it.each(refusals)('EmptyState tone="error" passes the read through: $name', ({ read, title }) => {
    render(<EmptyState tone="error" title="The task board could not be read" hint="Module access denied" retry={vi.fn()} read={read} readWhat="the task board" />);
    expect(screen.getByRole('alert').textContent).toContain(title);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it.each([
    { name: 'a server failure', read: { status: 500 } },
    { name: 'no response at all', read: { status: 0 } },
    { name: 'no read given', read: undefined },
  ])('$name keeps the caller\'s words and its retry', ({ read }) => {
    const retry = vi.fn();
    render(<ErrorState title="The task board could not be read" message="The server did not answer." retry={retry} read={read} readWhat="the task board" />);
    expect(screen.getByText('The task board could not be read')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  /* Quality review, 2026-11-10: a record's 404 said "This project was not found", the classifier's default subject,
     so Quality overrode it locally twice. The panel takes the subject instead. */
  it('names the record that was not found when given its subject, and keeps the project as the default', () => {
    render(<ErrorState title="The action items could not be read" retry={vi.fn()} read={{ status: 404 }} readWhat="its action list" readSubject="this CAPA" />);
    expect(screen.getByRole('alert').textContent).toContain('This CAPA was not found in your organization, so its action list was not read.');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    cleanup();
    render(<EmptyState tone="error" title="The register could not be read" read={{ status: 404 }} readWhat="the register" readSubject="this register" />);
    expect(screen.getByRole('alert').textContent).toContain('This register was not found in your organization, so the register was not read.');
    cleanup();
    render(<ErrorState title="The task board could not be read" read={{ status: 404 }} readWhat="the task board" />);
    expect(screen.getByRole('alert').textContent).toContain('This project was not found in your organization, so the task board was not read.');
  });

  it('an unavailable ownership check keeps a retry, with the classifier\'s words', () => {
    const retry = vi.fn();
    render(<ErrorState title="The task board could not be read" retry={retry} read={{ status: 503, code: 'VERIFICATION_UNAVAILABLE' }} readWhat="the task board" />);
    expect(screen.getByRole('alert').textContent).toContain('The ownership check was unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
