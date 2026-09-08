/**
 * The normal vitest config with one extra setup file that moves "now" forward.
 * See tests/clock-shift-setup.ts for what this is for and how to read a run.
 *
 * Not part of `npm test`: it is a diagnostic you run deliberately, because a
 * clean run proves a negative that the ordinary suite cannot.
 */
import { defineConfig } from 'vitest/config';
import base from './vitest.config';

const baseTest = (base as { test?: Record<string, unknown> }).test ?? {};

export default defineConfig({
  ...base,
  test: {
    ...baseTest,
    setupFiles: ['./tests/setup.ts', './tests/clock-shift-setup.ts'],
  },
});
