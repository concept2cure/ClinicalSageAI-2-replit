/**
 * The launch-demo seed's documentation names the identity it needs.
 * 2026-10-15.
 *
 * scripts/demo/launch-demo/lib.mjs refuses to run without DEMO_SEED_TOKEN,
 * --email or DEMO_SEED_EMAIL (no identity is built in), but seed.mjs's header
 * still said the email defaulted to "the founder", and both walkthroughs gave
 * the seed command with no identity, so following them as written refused.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('launch-demo documentation', () => {
  it('seed.mjs says DEMO_SEED_EMAIL is required and no identity is built in', () => {
    const header = read('scripts/demo/launch-demo/seed.mjs').split('*/')[0];
    expect(header).not.toMatch(/default: the founder/);
    expect(header).toContain('DEMO_SEED_EMAIL (required; no identity is built in)');
  });

  it.each(['docs/demo/biotech-walkthrough.md', 'docs/demo/mdx-walkthrough.md'])(
    '%s names the identity on every seed command',
    (doc) => {
      const commands = [...read(doc).matchAll(/`([^`]*launch-demo\/seed\.mjs[^`]*)`/g)].map((m) => m[1]);
      expect(commands.length).toBeGreaterThan(0);
      for (const command of commands) expect(command).toMatch(/^DEMO_SEED_(EMAIL|TOKEN)=/);
    },
  );
});
