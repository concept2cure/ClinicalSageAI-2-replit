/**
 * Contract: the Danger PR-template check must be satisfiable by the PR template.
 *
 * ── The defect this pins ──────────────────────────────────────────────────────
 * dangerfile.js asked every PR body for `## Summary`, `## Type of Change` and
 * `## Testing`. The repository shipped TWO competing templates, and NEITHER
 * offered `## Summary`:
 *
 *   .github/PULL_REQUEST_TEMPLATE.md  →  `## Description`, `### Testing`
 *   .github/pull_request_template.md  →  `## Change Summary`, `## Test Evidence`
 *
 * Danger's test is `pr.body.includes(section)`, a plain substring match, so
 * `### Testing` DOES satisfy `## Testing` — the match starts at index 1. What no
 * template could satisfy was `## Summary`: `## Change Summary` does not contain
 * it, and `## Description` contains nothing of the sort. So an author who filled
 * in either template verbatim still got the "PR Template Sections Missing"
 * warning. Every time.
 *
 * A warning that fires on correct behaviour is not a control; it trains people
 * to ignore Danger. Same shape as the `audit:dead-code` gate that could not fail
 * and the drop draft that would have dropped a live table: a control whose
 * output nobody can act on.
 *
 * Two templates was itself part of it — GitHub's template lookup is
 * case-insensitive, so which one an author saw was not determined by anything
 * anyone had decided. They are now one file.
 *
 * Because the substring match is lenient about heading depth, one test below
 * asserts the exact level too: a future edit demoting `## Testing` to
 * `### Testing` would still pass Danger while leaving authors no `##` heading
 * that matches the template's own structure.
 *
 * These tests keep the two in agreement. If someone adds a required section to
 * dangerfile.js, they must add the heading to the template in the same commit,
 * and vice versa for renaming a heading.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATE = path.join(REPO_ROOT, '.github/pull_request_template.md');
const DANGERFILE = path.join(REPO_ROOT, 'dangerfile.js');

const template = fs.readFileSync(TEMPLATE, 'utf8');
const dangerfile = fs.readFileSync(DANGERFILE, 'utf8');

/** The `requiredSections` array literal, read out of dangerfile.js. */
function requiredSectionsFromDangerfile(): string[] {
  const match = dangerfile.match(/const requiredSections = \[([^\]]*)\]/);
  if (!match) throw new Error('dangerfile.js no longer declares `const requiredSections = [...]`');
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

const required = requiredSectionsFromDangerfile();

describe('exactly one PR template exists', () => {
  it('there is no second, competing template', () => {
    // GitHub resolves the template filename case-insensitively, so shipping both
    // PULL_REQUEST_TEMPLATE.md and pull_request_template.md means nobody has
    // decided which one authors see.
    const candidates = [
      '.github/PULL_REQUEST_TEMPLATE.md',
      'PULL_REQUEST_TEMPLATE.md',
      'pull_request_template.md',
      'docs/PULL_REQUEST_TEMPLATE.md',
      'docs/pull_request_template.md',
    ];
    const found = candidates.filter(c => fs.existsSync(path.join(REPO_ROOT, c)));
    expect(found, `competing PR templates: ${found.join(', ')}`).toEqual([]);
    expect(fs.existsSync(TEMPLATE)).toBe(true);
  });
});

describe('Danger asks only for headings the template provides', () => {
  it('declares a non-empty required-section list', () => {
    expect(required.length).toBeGreaterThan(0);
  });

  it.each(required)('the template contains %s', (section) => {
    expect(
      template.includes(section),
      `dangerfile.js requires "${section}" but .github/pull_request_template.md has no such heading. ` +
        `An author who follows the template would still be warned.`,
    ).toBe(true);
  });

  it('matches as a heading at the start of a line, not mid-sentence', () => {
    // `includes()` is what Danger itself uses, so a required string that only
    // appears inside prose would pass the check above while giving authors no
    // heading to fill in.
    for (const section of required) {
      const asHeading = new RegExp(`^${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
      expect(asHeading.test(template), `"${section}" is not a standalone heading line`).toBe(true);
    }
  });

  it('is not defeated by a deeper heading level', () => {
    // The original failure: `### Testing` does not contain `## Testing`. Assert
    // the exact level the template uses, so demoting a heading to `###` fails
    // here instead of quietly re-breaking every PR.
    for (const section of required) {
      const level = section.match(/^#+/)?.[0].length ?? 0;
      const deeper = new RegExp(`^#{${level + 1},}\\s*${section.replace(/^#+\s*/, '')}\\s*$`, 'm');
      expect(
        deeper.test(template) && !new RegExp(`^${section}\\s*$`, 'm').test(template),
        `"${section}" exists only at a deeper heading level`,
      ).toBe(false);
    }
  });
});

describe('the template still carries the regulated-product sections', () => {
  // Consolidating two templates must not quietly drop the Part 11 content, which
  // is the half that exists for this product specifically rather than for
  // generic hygiene.
  it.each([
    '## Part 11 Compliance Check',
    '## Security',
    'docs/SECURITY_REVIEW_CHECKLIST.md',
    'CODEOWNERS',
  ])('retains %s', (needle) => {
    expect(template).toContain(needle);
  });

  it('still names tenant isolation as a security checklist item', () => {
    expect(template).toMatch(/tenant[_ ]isolation/i);
  });
});
