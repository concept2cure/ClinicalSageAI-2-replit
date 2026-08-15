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
