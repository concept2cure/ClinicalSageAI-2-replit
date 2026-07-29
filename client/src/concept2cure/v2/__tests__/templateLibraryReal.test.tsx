// @vitest-environment jsdom
/**
 * TemplateLibrary real wiring — the extraction preview previously came from a
 * setTimeout with a canned spec, save was in-memory only, and the render
 * buttons had no onClick. This locks in the real paths:
 *   • upload → POST /api/c2c/templates/extract (multipart) → the SERVER's
 *     spec/confidence/warnings render in the preview
 *   • save → POST /from-upload → the SERVER's persisted record (real id) is
 *     adopted into the list
 *   • Render to Word → POST /:id/render {format:'docx', document} → downloads
 *     the returned binary
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));
vi.mock('@/utils/authToken', () => ({ getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }) }));

import { TemplateLibrary } from '../surfaces/TemplateLibrary';

const SPEC = {
  specVersion: 1,
  page: { size: 'Letter', orientation: 'portrait', marginsInches: { top: 1, bottom: 1, left: 1, right: 1 } },
  typography: { bodyFont: 'Calibri', headingFont: 'Calibri', monoFont: 'Consolas', bodySizePt: 11, heading1SizePt: 16, heading2SizePt: 13, heading3SizePt: 12, lineSpacing: 1.15, paragraphSpaceAfterPt: 6 },
  colors: { text: '#111', muted: '#667085', accent: '#0d6efd', tableHeaderBg: '#f2f4f7', tableBorder: '#d0d5dd' },
  brand: { organizationName: 'ACME', confidentialityNotice: 'Confidential', logo: { present: false, placement: 'header-left' } },
  header: { text: 'ACME', showLogo: false, alignment: 'left' },
  footer: { text: '', showPageNumbers: true, pageNumberFormat: 'Page X of Y' },
  table: { headerBold: true, borderSizePt: 0.5 },
  formFields: [], namedStyles: [],
};
const LIST = { data: [{ id: 'tpl-1', name: 'CSR shell', description: '', sourceFileName: 'csr.docx', sourceFileType: 'docx', verified: true, extractionConfidence: 0.92, extractionWarnings: [], docTypes: ['CSR'], updatedAt: 'today', spec: SPEC }] };

const props = () => ({ surface: { id: 'template-library', label: 'Templates' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const realFetch = global.fetch;
afterEach(() => { cleanup(); global.fetch = realFetch; });
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/c2c/templates') return { ok: true, status: 200, json: async () => LIST } as Response;
    if (method === 'POST' && url === '/api/c2c/templates/tpl-1/render') {
      return { ok: true, status: 200, blob: async () => new Blob(['PK-docx-bytes']), json: async () => null } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
  global.fetch = vi.fn(async (url: any) => {
    if (String(url) === '/api/c2c/templates/extract') {
      return { ok: true, status: 200, json: async () => ({ spec: SPEC, confidence: 0.77, warnings: ['Logo image not embedded'] }) } as Response;
    }
    if (String(url) === '/api/c2c/templates/from-upload') {
      return { ok: true, status: 201, json: async () => ({ template: { id: 'tpl-server-9', name: 'uploaded-form', verified: false, extractionConfidence: 0.77, extractionWarnings: [], spec: SPEC, docTypes: [], updatedAt: 'now', sourceFileName: 'uploaded-form.docx', sourceFileType: 'docx', description: '' }, extraction: {} }) } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }) as any;
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

function pickFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['docx-bytes'], 'uploaded-form.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  Object.defineProperty(input, 'files', { value: [file] });
  fireEvent.change(input);
}

describe('TemplateLibrary — real extract/save/render', () => {
  it('extracts via the real multipart endpoint and previews the SERVER result', async () => {
    render(<TemplateLibrary {...props()} />);
    await screen.findAllByText('CSR shell');
    fireEvent.click(screen.getByRole('button', { name: /Upload a form/ }));
    pickFile();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/c2c/templates/extract', expect.objectContaining({ method: 'POST' }));
    });
    // Server confidence (77%) and warning — not the old canned 85% spec.
    expect(await screen.findByText(/Confidence 77%/)).toBeTruthy();
    expect(screen.getByText(/Logo image not embedded/)).toBeTruthy();
  });

  it('saves via /from-upload and adopts the server record (real id)', async () => {
    render(<TemplateLibrary {...props()} />);
    await screen.findAllByText('CSR shell');
    fireEvent.click(screen.getByRole('button', { name: /Upload a form/ }));
    pickFile();
    await screen.findByText(/Confidence 77%/);

    fireEvent.click(screen.getByRole('button', { name: /Save template/ }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/c2c/templates/from-upload', expect.objectContaining({ method: 'POST' }));
    });
    expect(await screen.findByText(/Template saved · uploaded-form/)).toBeTruthy();
  });

  it('renders to Word via POST /:id/render and downloads the returned binary', async () => {
    render(<TemplateLibrary {...props()} />);
    await screen.findAllByText('CSR shell');
    fireEvent.click(screen.getByRole('button', { name: /Render to Word/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/c2c/templates/tpl-1/render');
      expect(call).toBeTruthy();
      expect((call![2] as any).format).toBe('docx');
      expect((call![2] as any).document.metadata.title).toContain('specimen');
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});
