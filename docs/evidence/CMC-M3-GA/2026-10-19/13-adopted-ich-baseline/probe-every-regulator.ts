/**
 * Can the knowledge layer answer the CMC questions a client asks, for every
 * regulator it claims to cover — the authority's own requirement where it has
 * one, the ICH baseline it adopts otherwise, each tied to a cited source?
 *
 * Run from the repo root:
 *   npx tsx docs/evidence/CMC-M3-GA/2026-10-19/13-adopted-ich-baseline/probe-every-regulator.ts
 */
import {
  CMC_RECORD, findCmcGuidance, findCmcPathways, findCmcRequirements, resolveAuthorities,
} from '../../../../../server/services/cmc/knowledge/index';

const AUTHORITIES = ['FDA', 'EMA', 'MHRA', 'PMDA', 'NMPA', 'Health Canada', 'TGA', 'ANVISA', 'Swissmedic', 'HSA', 'MFDS', 'CDSCO', 'WHO'];
const TOPICS = ['stability', 'specification', 'process validation', 'impurities', 'GMP', 'batch release', 'container closure'];
/** The names a client types, as against the names the record files under. */
const ASKED_AS = ['Japan', 'China', 'UK', 'Australia', 'Canada', 'Brazil', 'Singapore', 'Korea', 'India', 'EU', 'Atlantis Medicines Agency'];

console.info(
  `record as of ${CMC_RECORD.asOf} — ${CMC_RECORD.sources.length} sources, ` +
    `${CMC_RECORD.requirements.length} requirements, ${CMC_RECORD.pathways.length} pathways`,
);
console.info('');
console.info('— the names a client types —');
for (const asked of ASKED_AS) {
  const resolved = resolveAuthorities(asked);
  console.info(
    '  ' + asked.padEnd(28),
    resolved && resolved.length > 0 ? resolved.join(', ') : '(not an authority in the record — refused by name)',
  );
}
console.info('');
console.info('— every authority × every topic —');
console.info('  ' + 'authority'.padEnd(15) + 'topic'.padEnd(19) + 'reqs docs  first requirement');
let dead = 0;
for (const authority of AUTHORITIES) {
  for (const topic of TOPICS) {
    const reqs = findCmcRequirements({ authority, topic }, 1);
    const docs = findCmcGuidance(topic, authority, 1);
    if (reqs.total === 0) dead += 1;
    const first = reqs.matches[0];
    console.info(
      '  ' + authority.padEnd(15) + topic.padEnd(19) +
        String(reqs.total).padStart(4) + String(docs.total).padStart(5) + '  ' +
        (first ? `${first.id} ${first.statement.slice(0, 60)}` : '— NOTHING —'),
    );
  }
}
console.info('');
console.info(`${AUTHORITIES.length * TOPICS.length} questions; ${dead} with no requirement at all`);
console.info('');
console.info('— how each authority receives the quality dossier —');
for (const authority of AUTHORITIES) {
  const paths = findCmcPathways(authority);
  console.info('  ' + authority.padEnd(15), paths.map((p) => p.applicationName).join(' | ').slice(0, 96) || '— none —');
}
