import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { generatePptxBuffer } from '../pptxGenerator';

const require = createRequire(import.meta.url);

describe('text-only PPTX generation', () => {
  it('runs the production export chain and returns a PPTX archive', async () => {
    const output = await generatePptxBuffer('Safety Review', '# Safety Review\n---\n### Findings\n- No new signal');
    expect(Buffer.isBuffer(output)).toBe(true);
    expect(output.subarray(0, 2).toString('ascii')).toBe('PK');
    expect(output.length).toBeGreaterThan(1_000);
    expect(
      Object.keys(require.cache).some(modulePath =>
        modulePath.includes('/node_modules/image-size/')
      )
    ).toBe(false);
  });
});
