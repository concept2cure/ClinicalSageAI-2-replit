// @vitest-environment jsdom
/**
 * Require PDF/A, in admin Setup (D7, the PDF/A rule decided 2026-10-01;
 * evidence docs/evidence/D7/2026-10-01-pdfa-rule/).
 *
 *  - It reads the organisation's stored setting: off unless it is literally true.
 *  - A read that fails says so; it never shows "Not required".
 *  - Turning it on takes a reason and sends { settings: { submission: { requirePdfA: true } }, reason },
 *    then reads the setting again.
 *  - A refused change says it was not changed.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getJwtOrgId: () => '42',
}));

import { ApiRequestError } from '@/lib/queryClient';
import { PdfARequirementSetting } from '../surfaces/PdfARequirementSetting';

const PATH = '/api/organizations/42/settings';
let stored: unknown;
let readFails: boolean;
let writeStatus: number;
const patches: unknown[] = [];
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  stored = undefined;
  readFails = false;
  writeStatus = 200;
  patches.length = 0;
  apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
    if (url !== PATH) throw new Error(`unexpected ${method} ${url}`);
    if (method === 'GET') {
      if (readFails) throw new ApiRequestError('boom', 500);
      return res({ success: true, settings: { translation: {}, ...(stored === undefined ? {} : { submission: { requirePdfA: stored } }) } });
    }
    patches.push(body);
    if (writeStatus >= 400) throw new ApiRequestError('refused', writeStatus);
    stored = body.settings.submission.requirePdfA;
    return res({ success: true });
  });
});
afterEach(() => cleanup());

const row = () => screen.getByTestId('pdfa-requirement-setting');

describe('Require PDF/A in Setup', () => {
  it('is off unless the stored value is literally true', async () => {
    stored = 'true';
    render(<PdfARequirementSetting />);
    await waitFor(() => expect(row().textContent).toContain('Not required'));
  });

  it('a read that fails says so and never shows "Not required"', async () => {
    readFails = true;
    render(<PdfARequirementSetting />);
    await waitFor(() => expect(row().textContent).toContain('Could not be read'));
    expect(row().textContent).not.toContain('Not required');
  });

  it('turning it on takes a reason, sends it with the setting, and reads it again', async () => {
    render(<PdfARequirementSetting />);
    await waitFor(() => expect(row().textContent).toContain('Not required'));
    fireEvent.click(screen.getByLabelText('Require PDF/A for production submissions'));
    const confirm = screen.getByRole('button', { name: 'Require PDF/A' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'Our SOP-QA-014 requires PDF/A' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(row().textContent).toContain('Required'));
    expect(patches).toEqual([{ settings: { submission: { requirePdfA: true } }, reason: 'Our SOP-QA-014 requires PDF/A' }]);
    expect(row().textContent).toContain('Saved and recorded in the audit trail.');
  });

  it('a refused change says it was not changed', async () => {
    writeStatus = 403;
    render(<PdfARequirementSetting />);
    await waitFor(() => expect(row().textContent).toContain('Not required'));
    fireEvent.click(screen.getByLabelText('Require PDF/A for production submissions'));
    fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'Trying without admin rights' } });
    fireEvent.click(screen.getByRole('button', { name: 'Require PDF/A' }));
    await waitFor(() => expect(row().textContent).toContain("Not changed: only the organisation's administrator can change this."));
    expect(row().textContent).toContain('Not required');
  });
});
