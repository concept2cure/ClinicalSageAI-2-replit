// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
vi.mock('../surfaces/CompanyDocumentSettings', () => ({ CompanyDocumentSettings: () => <p>Current company capability controls</p> }));
import { CompanyDocumentsAccountSection } from '../CompanyDocumentsAccountSection';
afterEach(cleanup);
describe('delegated company-document entry in Account', () => {
  it('opens the shared capability-controlled settings without an admin roster read', async () => {
    render(<CompanyDocumentsAccountSection />);
    expect(screen.queryByText('Current company capability controls')).toBeNull();
    const button = screen.getByRole('button', { name: 'Open company documents' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(await screen.findByText('Current company capability controls')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close company documents' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Close company documents' }));
    expect(screen.queryByText('Current company capability controls')).toBeNull();
  });
});
