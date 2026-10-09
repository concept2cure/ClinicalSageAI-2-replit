/**
 * OCR language codes become file names under the traineddata directory and the
 * cache, and they reach the OCR service from a tool argument (the model's).
 * `../../x` walked out of both (INJ-PATH-002). A code that is not the shape of a
 * Tesseract language code is refused before any worker starts.
 */
import { describe, it, expect } from 'vitest';
import { tesseractOcrService } from '../tesseractOcrService';

describe('OCR language codes', () => {
  it.each([['../../etc/passwd'], ['eng/../../x'], ['/abs'], ['eng\0'], [''], ['ENGLISH']])(
    'refuses %j before opening anything',
    async code => {
      await expect(tesseractOcrService.recognizeImage(Buffer.from([]), { languages: [code] })).rejects.toThrow(
        /Tesseract language codes/,
      );
    },
  );
});
