// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

// Keep each case's cache empty without adding a production cache-reset API.
// Spies call through to the real parser and sanitizer; cached HTML must still
// meet the same safety contract as newly rendered HTML.
async function observeRenderer() {
  vi.resetModules();
  const { marked } = await import('marked');
  const { default: DOMPurify } = await import('dompurify');
  const { renderSafeMarkdown } = await import('../renderSafeMarkdown');
  return {
    renderSafeMarkdown,
    parse: vi.spyOn(marked, 'parse'),
    sanitize: vi.spyOn(DOMPurify, 'sanitize'),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('AnA markdown cache', () => {
  it('keeps a frequently read answer cached across 600 new streaming prefixes', async () => {
    const { renderSafeMarkdown, parse, sanitize } = await observeRenderer();
    const answer = 'The retained answer has **source-backed context**.';
    const safeAnswer = renderSafeMarkdown(answer);
    expect(safeAnswer).toContain('<strong>source-backed context</strong>');

    for (let index = 0; index < 600; index += 1) {
      renderSafeMarkdown(`Streaming answer prefix ${index}`);
      expect(renderSafeMarkdown(answer)).toBe(safeAnswer);
    }
    expect(renderSafeMarkdown(answer)).toBe(safeAnswer);

    // One real parse/sanitize of the retained answer plus 600 new prefixes.
    expect(parse).toHaveBeenCalledTimes(601);
    expect(sanitize).toHaveBeenCalledTimes(601);
    expect(parse.mock.calls.filter(([content]) => content === answer)).toHaveLength(1);
  });

  it('evicts an unread answer when a 201st distinct entry arrives', async () => {
    const { renderSafeMarkdown, parse, sanitize } = await observeRenderer();
    const oldest = 'An old answer that is not read again';
    const safeOldest = renderSafeMarkdown(oldest);
    for (let index = 0; index < 199; index += 1) {
      renderSafeMarkdown(`Other retained answer ${index}`);
    }
    expect(parse).toHaveBeenCalledTimes(200);
    expect(sanitize).toHaveBeenCalledTimes(200);

    renderSafeMarkdown('The 201st distinct answer');
    expect(renderSafeMarkdown(oldest)).toBe(safeOldest);
    expect(parse).toHaveBeenCalledTimes(202);
    expect(sanitize).toHaveBeenCalledTimes(202);
    expect(parse.mock.calls.filter(([content]) => content === oldest)).toHaveLength(2);
  });

  it('returns sanitized HTML on cache hits for malicious input', async () => {
    const { renderSafeMarkdown, parse, sanitize } = await observeRenderer();
    const malicious =
      '<p onclick="alert(1)">Safe text</p><script>alert(2)</script>' +
      '<img src="https://collector.example/pixel" onerror="alert(3)">' +
      '<a href="javascript:alert(4)">link</a>';
    const safe = renderSafeMarkdown(malicious);
    expect(safe).toContain('<p>Safe text</p>');
    expect(safe).not.toMatch(/<script|<img|onerror|onclick|javascript:|alert\(/i);
    for (let read = 0; read < 10; read += 1) {
      expect(renderSafeMarkdown(malicious)).toBe(safe);
    }
    expect(parse).toHaveBeenCalledTimes(1);
    expect(sanitize).toHaveBeenCalledTimes(1);
  });
});
