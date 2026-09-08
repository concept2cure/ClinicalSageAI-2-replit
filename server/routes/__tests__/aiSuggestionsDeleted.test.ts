/**
 * An endpoint named for AI that contained none, suggesting edits that deleted
 * the author's text.
 *
 * POST /api/authoring/ai/suggestions had no caller. It was mounted — the router
 * goes on '/api/authoring' — so the full path resolved, and the only occurrence
 * of that path anywhere in the repository was its own comment. The "suggestions"
 * matches in the client are the editor's `editor/suggestions` module, the
 * tracked-change marks, which is why a fragment search reports this endpoint as
 * live when nothing calls it.
 *
 * It was six hardcoded regexes returning `confidence: 0.95` / `0.9` — numbers
 * with nothing behind them, because nothing scored anything.
 *
 * Two of its three grammar rules were destructive. The suggestion was built as
 * `match[0].replace(issue.pattern, ' ')`, which replaces the WHOLE match with a
 * single space rather than repairing it, so the fix offered for "the the" was
 * " ": accepting it removed the word. The regex behaviour is asserted below
 * rather than described, so the reason this was deleted stays checkable after
 * the code is gone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(__dirname, '../../..');
const router = fs.readFileSync(path.join(repo, 'server/routes/authoring.router.ts'), 'utf8');

/** Comment bodies explain the deletion; only real code counts as a route. */
const code = router.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('POST /api/authoring/ai/suggestions is gone', () => {
  it('the route is not registered', () => {
    expect(code).not.toMatch(/router\.(post|get|put|patch)\(\s*['"`]\/ai\/suggestions['"`]/);
  });

  it('its handler body went with it', () => {
    // The terminology table was unique to this endpoint.
    expect(code).not.toContain('Use standard regulatory abbreviation');
    // As were the invented confidences.
    expect(code).not.toMatch(/confidence:\s*0\.95/);
  });

  it('the deletion is explained where the route used to be', () => {
    expect(router).toContain('POST /api/authoring/ai/suggestions has been DELETED');
  });

  it('nothing in the repo called it — including now', () => {
    const client = path.join(repo, 'client');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        if (fs.readFileSync(p, 'utf8').includes('ai/suggestions')) hits.push(p);
      }
    };
    walk(client);
    expect(hits).toEqual([]);
  });
});

describe('why it was deleted, kept checkable after the code is gone', () => {
  /* The exact construction the handler used. */
  const suggest = (text: string, pattern: RegExp) =>
    [...text.matchAll(pattern)].map((m) => m[0].replace(pattern, ' '));

  it('the duplicate-word rule deleted the word instead of deduplicating it', () => {
    expect(suggest('the the drug', /\b(\w+)\s+\1\b/gi)).toEqual([' ']);
    // Never the repair a reader would expect.
    expect(suggest('the the drug', /\b(\w+)\s+\1\b/gi)).not.toEqual(['the']);
  });

  it('the punctuation rule replaced an ellipsis with a space', () => {
    expect(suggest('Done...', /[.!?]{2,}/g)).toEqual([' ']);
    expect(suggest('Stop!!', /[.!?]{2,}/g)).toEqual([' ']);
  });

  it('only the multiple-spaces rule was correct', () => {
    expect(suggest('a  b', /\s{2,}/g)).toEqual([' ']);
  });

  it('the terminology rules drew two contradictory edits over one phrase', () => {
    const t = 'A serious adverse event occurred.';
    const broad = [...t.matchAll(/adverse event/gi)].map((m) => m.index);
    const exact = [...t.matchAll(/serious adverse event/gi)].map((m) => m.index);
    expect(broad).toEqual([10]);
    expect(exact).toEqual([2]);
    // Overlapping ranges for the same text: 2..23 contains 10..23.
    expect(broad[0]!).toBeGreaterThan(exact[0]!);
  });
});
