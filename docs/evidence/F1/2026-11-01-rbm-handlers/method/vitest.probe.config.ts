// Runs only the red probe next to this file, with the repo's own vitest setup
// (aliases, tests/setup.ts). The repo's include list does not reach docs/.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../../../../vitest.config';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const probe = mergeConfig(base, defineConfig({ root }));
probe.test!.include = ['docs/evidence/F1/2026-11-01-rbm-handlers/method/*.probe.ts'];
export default probe;
