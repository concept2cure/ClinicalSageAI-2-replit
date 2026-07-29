/**
 * Generate global-ri.openapi.json (repo root) from the capability catalog.
 * Run: npx tsx scripts/global-ri/generate-openapi.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildGlobalRiOpenApi } from '../../server/services/global-ri/openapi-builder';

const doc = buildGlobalRiOpenApi();
const out = resolve(process.cwd(), 'global-ri.openapi.json');
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n', 'utf8');
const paths = Object.keys((doc as any).paths).length;
console.log(`Wrote ${out} (${paths} paths)`);
