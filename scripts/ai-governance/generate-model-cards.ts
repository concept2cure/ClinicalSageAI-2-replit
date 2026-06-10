/**
 * Generate docs/ai-governance/MODEL_CARDS.md from the gateway model registry +
 * the approved-models lockfile.
 *
 * Usage: tsx scripts/ai-governance/generate-model-cards.ts
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_MODELS } from '../../server/services/ai-gateway/gateway';
import { APPROVED_MODELS } from '../../server/services/ai-governance/approved-models';
import { buildModelCardsDocument } from '../../server/services/ai-governance/model-cards';

const outDir = join(process.cwd(), 'docs', 'ai-governance');
const outFile = join(outDir, 'MODEL_CARDS.md');

mkdirSync(outDir, { recursive: true });
const doc = buildModelCardsDocument(DEFAULT_MODELS, APPROVED_MODELS);
writeFileSync(outFile, `${doc.trimEnd()}\n`, 'utf8');

console.info(`Wrote ${outFile} (${DEFAULT_MODELS.length} model cards).`);
