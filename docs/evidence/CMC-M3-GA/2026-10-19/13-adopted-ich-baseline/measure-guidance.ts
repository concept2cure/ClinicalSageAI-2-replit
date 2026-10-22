/**
 * How many of a client's CMC questions does each knowledge tool answer?
 *
 * Run from the repo root:
 *   npx tsx docs/evidence/CMC-M3-GA/2026-10-19/13-adopted-ich-baseline/measure-guidance.ts
 */
import { findCmcGuidance, findCmcRequirements } from '../../../../../server/services/cmc/knowledge/index';

const AUTHORITIES = ['FDA', 'EMA', 'MHRA', 'PMDA', 'NMPA', 'Health Canada', 'TGA', 'ANVISA', 'Swissmedic', 'HSA', 'MFDS', 'CDSCO', 'WHO'];
const TOPICS = ['stability', 'specification', 'process validation', 'impurities', 'GMP', 'batch release', 'container closure'];

let answeredDocs = 0;
let answeredReqs = 0;
let total = 0;
const silent: string[] = [];
for (const authority of AUTHORITIES) {
  for (const topic of TOPICS) {
    total += 1;
    if (findCmcGuidance(topic, authority, 3).total > 0) answeredDocs += 1;
    else silent.push(`${authority} / ${topic}`);
    if (findCmcRequirements({ authority, topic }, 1).total > 0) answeredReqs += 1;
  }
}
console.info(`${total} questions (${AUTHORITIES.length} authorities × ${TOPICS.length} topics)`);
console.info(`  get_cmc_requirements answers   ${answeredReqs}/${total}`);
console.info(`  find_cmc_guidance answers      ${answeredDocs}/${total}`);
console.info('');
console.info(`${silent.length} question(s) for which the document search finds nothing:`);
for (const q of silent) console.info('  ·', q);
