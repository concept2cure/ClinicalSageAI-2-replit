import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isReviewedDocumentationRenderer, REVIEWED_DOCUMENTATION_RENDERERS } from '../lib/reviewed-documentation-renderers.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

test('only the reviewed repository-study files with their original bytes are classified as documentation', () => {
  for (const relativePath of REVIEWED_DOCUMENTATION_RENDERERS.keys()) {
    assert.equal(isReviewedDocumentationRenderer(repoRoot, relativePath), true, relativePath);
  }
});

test('a changed reviewed renderer fails rather than approving new executable code', () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'docx-documentation-review-'));
  try {
    for (const relativePath of REVIEWED_DOCUMENTATION_RENDERERS.keys()) {
      const target = path.join(tempRoot, relativePath);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(path.join(repoRoot, relativePath)));
      assert.equal(isReviewedDocumentationRenderer(tempRoot, relativePath), true);
      writeFileSync(target, '\n# changed executable documentation tool\n', { flag: 'a' });
      assert.equal(isReviewedDocumentationRenderer(tempRoot, relativePath), false);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('new documentation paths, application paths and missing files are never approved', () => {
  for (const relativePath of ['docs/publications/new-renderer.py', 'server/new-renderer.py', '../render_study.py']) {
    assert.equal(isReviewedDocumentationRenderer(repoRoot, relativePath), false);
  }
  assert.equal(isReviewedDocumentationRenderer(tmpdir(), [...REVIEWED_DOCUMENTATION_RENDERERS.keys()][0]), false);
});
