/**
 * Veeva Vault connector — VQL builder.
 *
 * The document search interpolates user values into a VQL query. These tests
 * lock the escaping contract (a single quote must be doubled, not left to
 * break or inject the query) and the clause/limit assembly.
 */

import { describe, it, expect } from 'vitest';
import { buildDocumentVql, escapeVqlLiteral } from '../veeva-vault';

describe('escapeVqlLiteral', () => {
  it('doubles single quotes', () => {
    expect(escapeVqlLiteral("Crohn's")).toBe("Crohn''s");
    expect(escapeVqlLiteral("a'b'c")).toBe("a''b''c");
  });
  it('leaves quote-free values untouched', () => {
    expect(escapeVqlLiteral('oncology')).toBe('oncology');
  });
});

describe('buildDocumentVql', () => {
  it('escapes an indication containing an apostrophe (no broken/injected VQL)', () => {
    const vql = buildDocumentVql({ indication: "Crohn's disease" });
    expect(vql).toContain("product__v CONTAINS 'Crohn''s disease'");
    // The raw, unescaped form must not appear.
    expect(vql).not.toContain("'Crohn's disease'");
  });

  it('neutralizes an injection attempt by escaping the closing quote', () => {
    const vql = buildDocumentVql({ indication: "x' OR '1'='1" });
    // Every quote in the payload is doubled, so it stays one string literal.
    expect(vql).toContain("product__v CONTAINS 'x'' OR ''1''=''1'");
  });

  it('ANDs indication and therapeutic area', () => {
    const vql = buildDocumentVql({ indication: 'nsclc', therapeuticArea: 'oncology' });
    expect(vql).toContain(
      "WHERE product__v CONTAINS 'nsclc' AND therapeutic_area__c CONTAINS 'oncology'",
    );
  });

  it('builds an escaped OR group for keywords and drops blanks', () => {
    const vql = buildDocumentVql({ keywords: ["O'Brien", '  ', 'protocol'] });
    expect(vql).toContain("(name__v CONTAINS 'O''Brien' OR name__v CONTAINS 'protocol')");
  });

  it('omits WHERE when there are no conditions', () => {
    const vql = buildDocumentVql({});
    expect(vql).toContain('FROM documents ORDER BY');
    expect(vql).not.toContain('WHERE');
  });

  it('coerces the limit to a positive integer (default 20)', () => {
    expect(buildDocumentVql({})).toContain('LIMIT 20');
    expect(buildDocumentVql({ limit: 0 })).toContain('LIMIT 20');
    expect(buildDocumentVql({ limit: -5 })).toContain('LIMIT 20');
    expect(buildDocumentVql({ limit: 33.9 })).toContain('LIMIT 33');
  });
});
