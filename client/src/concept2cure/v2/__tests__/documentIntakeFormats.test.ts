// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CHAT_UPLOAD_ACCEPT, CHAT_UPLOAD_MAX_BYTES, validateUploadFile } from '../../hooks/useChatUpload';
import { VAULT_UPLOAD_ACCEPT } from '../useVaultUpload';
import { DOCUMENT_INTAKE_FORMATS, VAULT_UPLOAD_EXTENSIONS, VAULT_UPLOAD_MAX_BYTES } from '@shared/constants/document-intake-formats';

describe('project/chat intake admits canonical scientific source formats', () => {
  it.each([
    ['enrollment.csv', 'text/csv'],
    ['enrollment.tsv', 'text/tab-separated-values'],
    ['enrollment.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['resource.json', 'application/json'],
    ['define.xml', 'application/xml'],
    ['notes.md', 'text/markdown'],
  ])('allows %s through the picker and client validation', (name, type) => {
    const extension = name.slice(name.lastIndexOf('.'));
    expect(CHAT_UPLOAD_ACCEPT.split(',')).toContain(extension);
    expect(validateUploadFile(new File(['source bytes'], name, { type }))).toBeNull();
  });

  // 50 MB since 2026-10-08: one cap with the Vault (Data Room catalog S3).
  it('preserves empty, unsupported, and 50 MB refusal boundaries', () => {
    expect(CHAT_UPLOAD_MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(CHAT_UPLOAD_MAX_BYTES).toBe(VAULT_UPLOAD_MAX_BYTES);
    expect(validateUploadFile(new File([], 'empty.csv'))).toBe('File is empty');
    expect(validateUploadFile(new File(['source'], 'subjects.xpt'))).toMatch(/Unsupported/);
    const file = new File(['source'], 'enrollment.CSV');
    Object.defineProperty(file, 'size', { value: CHAT_UPLOAD_MAX_BYTES, configurable: true });
    expect(validateUploadFile(file)).toBeNull();
    Object.defineProperty(file, 'size', { value: CHAT_UPLOAD_MAX_BYTES + 1 });
    expect(validateUploadFile(file)).toMatch(/max 50 MB/);
  });

  it('shares Vault picker candidates with its receiver while keeping limits and legacy truth explicit', () => {
    expect(VAULT_UPLOAD_ACCEPT.split(',')).toEqual(VAULT_UPLOAD_EXTENSIONS);
    expect(VAULT_UPLOAD_MAX_BYTES).toBe(50 * 1024 * 1024);
    for (const extension of ['.csv', '.tsv', '.xlsx', '.json', '.xml', '.png', '.jpg', '.jpeg', '.gif']) {
      expect(CHAT_UPLOAD_ACCEPT.split(',')).toContain(extension);
      expect(VAULT_UPLOAD_EXTENSIONS).toContain(extension);
    }
    for (const extension of ['.doc', '.xls']) {
      expect(DOCUMENT_INTAKE_FORMATS.find(format => format.extension === extension))
        .toMatchObject({ vault: true, textExtraction: 'none' });
    }
    expect(VAULT_UPLOAD_EXTENSIONS).toContain('.rtf');
    expect(DOCUMENT_INTAKE_FORMATS.find(format => format.extension === '.webp'))
      .toMatchObject({ chat: true, vault: false, byteCheckSupported: false });
  });
});
