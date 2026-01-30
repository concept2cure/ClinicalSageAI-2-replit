import { describe, it, expect } from 'vitest';
import { generateDocxBuffer } from '../../services/docxGenerator';

describe('docx generator', () => {
  it('creates a docx buffer with PK magic bytes', async () => {
    const buf = await generateDocxBuffer('Test Title', 'Hello world\n\nSecond paragraph');
    // DOCX is a zip file starting with PK
    expect(buf.slice(0, 2).toString()).toBe('PK');
    expect(buf.length).toBeGreaterThan(1000);
  });
});
