import { describe, it, expect } from 'vitest';
// @ts-expect-error — JS module without type declarations
import { escapeLucenePhrase, luceneField, safeDate } from '../../server/fda_maude_client.js';

describe('fda_maude_client — Lucene query-injection hardening', () => {
  describe('escapeLucenePhrase', () => {
    it('escapes embedded double-quotes so the phrase cannot be terminated', () => {
      expect(escapeLucenePhrase('a"b')).toBe('a\\"b');
    });

    it('escapes backslashes', () => {
      expect(escapeLucenePhrase('a\\b')).toBe('a\\\\b');
    });

    it('leaves benign values untouched', () => {
      expect(escapeLucenePhrase('heart valve')).toBe('heart valve');
    });

    it('coerces non-strings without throwing', () => {
      expect(escapeLucenePhrase(123 as unknown as string)).toBe('123');
    });
  });

  describe('luceneField', () => {
    it('wraps untrusted input in a quoted, escaped phrase', () => {
      expect(luceneField('device.generic_name', 'stent')).toBe('device.generic_name:"stent"');
    });

    it('neutralizes an injection attempt that tries to break out of the phrase', () => {
      // A naive builder would yield: device.generic_name:"x" AND _exists_:_id OR "
      const malicious = 'x" AND _exists_:_id OR "';
      const clause = luceneField('device.generic_name', malicious);
      // Every quote in the payload is escaped, so the clause stays a single phrase.
      expect(clause).toBe('device.generic_name:"x\\" AND _exists_:_id OR \\""');
      // No unescaped quote can terminate the phrase early.
      expect(clause.match(/(?<!\\)"/g)?.length).toBe(2); // only the wrapping quotes
    });
  });

  describe('safeDate', () => {
    it('accepts a valid ISO date', () => {
      expect(safeDate('2025-01-15', null)).toBe('2025-01-15');
    });

    it('rejects malformed / injected dates and returns the fallback', () => {
      expect(safeDate('2025-01-15 TO *]', null)).toBeNull();
      expect(safeDate('*', '1900-01-01')).toBe('1900-01-01');
      expect(safeDate('', null)).toBeNull();
    });
  });
});
