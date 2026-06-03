import { describe, it, expect, vi } from 'vitest';
import {
  isAllowedUpload,
  makeUploadFileFilter,
  extensionOf,
} from '../uploadAllowlist';

describe('extensionOf', () => {
  it('extracts a lowercase extension', () => {
    expect(extensionOf('Report.PDF')).toBe('pdf');
    expect(extensionOf('a.b.docx')).toBe('docx');
    expect(extensionOf('noext')).toBe('');
  });
});

describe('isAllowedUpload', () => {
  it('allows regulatory document types', () => {
    expect(isAllowedUpload('cer.pdf', 'application/pdf')).toBe(true);
    expect(isAllowedUpload('m2.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    expect(isAllowedUpload('data.csv', 'text/csv')).toBe(true);
    expect(isAllowedUpload('figure.png', 'image/png')).toBe(true);
  });

  it('rejects executables/scripts even if MIME is spoofed to a document type', () => {
    expect(isAllowedUpload('malware.exe', 'application/pdf')).toBe(false);
    expect(isAllowedUpload('payload.sh', 'text/plain')).toBe(false);
    expect(isAllowedUpload('x.js', 'application/json')).toBe(false);
  });

  it('rejects unknown types and extensionless files', () => {
    expect(isAllowedUpload('archive.zip', 'application/zip')).toBe(false);
    expect(isAllowedUpload('noext', 'application/pdf')).toBe(false);
  });

  it('honours a custom allowlist', () => {
    expect(isAllowedUpload('a.pdf', 'application/pdf', { extensions: ['docx'] })).toBe(false);
    expect(isAllowedUpload('a.docx', 'application/octet-stream', { extensions: ['docx'] })).toBe(true);
  });
});

describe('makeUploadFileFilter', () => {
  it('accepts an allowed file and rejects a blocked one', () => {
    const filter = makeUploadFileFilter();
    const ok = vi.fn();
    filter({} as any, { originalname: 'cer.pdf', mimetype: 'application/pdf' }, ok);
    expect(ok).toHaveBeenCalledWith(null, true);

    const bad = vi.fn();
    filter({} as any, { originalname: 'x.exe', mimetype: 'application/pdf' }, bad);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(bad.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
