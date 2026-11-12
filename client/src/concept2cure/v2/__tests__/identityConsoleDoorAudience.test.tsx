// @vitest-environment jsdom
/**
 * The Admin console's SSO tab offers the Identity console only to someone who can use it.
 *
 * GA walk, 2026-11-12 (docs/evidence/DESIGN/P-122/ga-walk/README.md): the tab's "Open Identity console" button
 * took a customer's administrator to a page whose every read needs a platform administrator, so it showed a
 * refusal and nothing else, naming internal role names. The door now says who sets up single sign-on, and
 * the refusal says it in plain words.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IdentityConsoleDoor } from '../surfaces/AdminSettings';

afterEach(cleanup);

describe('the Identity console door on the SSO tab', () => {
  it('offers the console to a platform administrator', () => {
    const onNav = vi.fn();
    render(<IdentityConsoleDoor onNav={onNav} platformAdmin />);
    fireEvent.click(screen.getByRole('button', { name: /Open Identity console/ }));
    expect(onNav).toHaveBeenCalledWith('identity-console');
  });

  it("gives a customer's administrator no door to a page they cannot use, and says who sets it up", () => {
    render(<IdentityConsoleDoor onNav={vi.fn()} platformAdmin={false} />);
    expect(screen.queryByRole('button', { name: /Open Identity console/ })).toBeNull();
    expect(screen.getByText(/set up for your organisation by Concept2Cure/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/super_admin|platform_admin/);
  });
});
