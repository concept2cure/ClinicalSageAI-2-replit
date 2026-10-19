// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const upload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiUpload: upload }));
import { As2ReceiptUpload } from '../surfaces/As2ReceiptUpload';

beforeEach(() => { upload.mockReset(); });
afterEach(cleanup);
function select(file = new File(['original signed agency bytes'], 'agency.mdn')) {
  fireEvent.click(screen.getByRole('button', { name: 'Record agency MDN' }));
  fireEvent.change(screen.getByLabelText('Signed agency MDN'), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText('Agency response Content-Type'), { target: { value: 'multipart/signed; boundary="agency-boundary"' } });
  return file;
}

describe('verified agency receipt upload', () => {
  it('does not claim verification from a successful response that omitted the verified recording result', async () => {
    upload.mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    render(<As2ReceiptUpload transmittalId={41} onRecorded={async () => undefined} />);
    select(); fireEvent.click(screen.getByRole('button', { name: 'Verify and record receipt' }));
    expect((await screen.findByRole('alert')).textContent).toContain('verification result was not returned');
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('uploads the original file and exact response header to the named transmittal, then refreshes it', async () => {
    const recorded = vi.fn(async () => undefined);
    upload.mockResolvedValue({ ok: true, json: async () => ({ data: { verified: true, recorded: true, status: 'received' } }) });
    render(<As2ReceiptUpload transmittalId={41} onRecorded={recorded} />);
    const file = select();
    fireEvent.click(screen.getByRole('button', { name: 'Verify and record receipt' }));
    await waitFor(() => expect(recorded).toHaveBeenCalledTimes(1));
    const [method, path, form] = upload.mock.calls[0];
    expect([method, path]).toEqual(['POST', '/api/mdx/gateways/transmittals/41/as2-receipt']);
    expect(form.get('receipt')).toBe(file);
    expect(form.get('contentType')).toBe('multipart/signed; boundary="agency-boundary"');
    expect(screen.getByRole('status').textContent).toContain('FDA center acceptance is a separate acknowledgement');
  });

  it('preserves the server refusal and makes no claim of verified receipt', async () => {
    const recorded = vi.fn(async () => undefined);
    upload.mockResolvedValue({ ok: false, json: async () => ({ error: 'The receipt names a different transmission.' }) });
    render(<As2ReceiptUpload transmittalId={41} onRecorded={recorded} />);
    select(); fireEvent.click(screen.getByRole('button', { name: 'Verify and record receipt' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The receipt names a different transmission');
    expect(recorded).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('reports a verified legacy or stale receipt without claiming its sequence was reconciled', async () => {
    upload.mockResolvedValue({ ok: true, json: async () => ({ data: { verified: true, recorded: true, status: 'received', sequenceResolution: 'unreconciled' } }) });
    render(<As2ReceiptUpload transmittalId={41} onRecorded={async () => undefined} />);
    select(); fireEvent.click(screen.getByRole('button', { name: 'Verify and record receipt' }));
    expect((await screen.findByRole('alert')).textContent).toContain('did not reconcile a sequence attempt');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('reports a signed agency refusal and a missing sequence reconciliation independently', async () => {
    upload.mockResolvedValue({ ok: true, json: async () => ({ data: { verified: true, recorded: true, status: 'rejected', sequenceResolution: 'unreconciled' } }) });
    render(<As2ReceiptUpload transmittalId={41} onRecorded={async () => undefined} />);
    select(); fireEvent.click(screen.getByRole('button', { name: 'Verify and record receipt' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('FDA transport rejected the submission');
    expect(alert.textContent).toContain('did not reconcile a sequence attempt');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps an unknown request outcome honest and tells the user to check status before retrying', async () => {
    upload.mockRejectedValue(new Error('network lost'));
    render(<As2ReceiptUpload transmittalId={41} onRecorded={async () => undefined} />);
    select(); fireEvent.click(screen.getByRole('button', { name: 'Verify and record receipt' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Refresh the transmittal status before retrying');
  });

  it('refuses an oversized receipt before opening a request', async () => {
    render(<As2ReceiptUpload transmittalId={41} onRecorded={async () => undefined} />);
    const file = new File(['x'], 'agency.mdn'); Object.defineProperty(file, 'size', { value: 8 * 1024 * 1024 + 1 });
    select(file); fireEvent.click(screen.getByRole('button', { name: 'Verify and record receipt' }));
    expect((await screen.findByRole('alert')).textContent).toContain('8 MB or smaller');
    expect(upload).not.toHaveBeenCalled();
  });
});
