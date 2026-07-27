/**
 * AI-gateway prompt-directory resolution guard.
 *
 * The server ships as a single esbuild bundle (dist/index.js). Resolving the
 * prompt library from a module's own location pointed at <appRoot>/ai-gateway/
 * prompts in the bundle — a path that does not exist — so AI generation would
 * ENOENT the moment it loaded a prompt, invisibly to the build and unit suites.
 * PROMPTS_DIR now resolves from the working directory to the shipped source
 * tree (server/services/ai-gateway/prompts), which is correct for dev (tsx),
 * the prod bundle (Dockerfile copies server/ next to dist/), and the test
 * runner. This guard fails if that resolution stops landing on the real
 * prompts the services load.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PROMPTS_DIR } from '../../server/services/ai-gateway/prompts-dir';

// Prompts concretely loaded by the services (task → the file each reads).
const REQUIRED_PROMPTS = [
  'consistency-check/v1.0.md', // truth-engine-service
  'section-generation/v1.0.md', // section-generation-service
  'shadow-review/v1.0.md', // shadow-review-service
  'fcoi-completeness-review/v1.0.md', // financial-disclosures route
  'document-extract/v1.0.md', // ingestion-service
  'submission-plan/v1.0.md', // submission-ai-service
];

describe('ai-gateway PROMPTS_DIR resolution', () => {
  it('resolves to an absolute directory that exists', () => {
    expect(path.isAbsolute(PROMPTS_DIR)).toBe(true);
    expect(fs.existsSync(PROMPTS_DIR)).toBe(true);
    expect(fs.statSync(PROMPTS_DIR).isDirectory()).toBe(true);
  });

  it('contains every prompt the services load at runtime', () => {
    const missing = REQUIRED_PROMPTS.filter(
      (rel) => !fs.existsSync(path.join(PROMPTS_DIR, rel)),
    );
    expect(
      missing,
      missing.length
        ? `Prompts missing under ${PROMPTS_DIR}: ${missing.join(', ')} — AI generation would ENOENT in this build.`
        : undefined,
    ).toEqual([]);
  });
});
