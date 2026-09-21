/**
 * Measures the AnA system prompt as stream.ts assembles it (orchestrate()),
 * part by part, plus the two other AnA prompt stacks (cortex-unified via
 * BASE_SYSTEM_PROMPT, ana-cortex via ANA_COMPACT_PROMPT).
 *
 * Run: npx tsx docs/evidence/WJ/2026-09-21/measure-prompt.ts [label]
 * Token estimate = ceil(bytes / 4) — a heuristic, not a tokenizer.
 */
import { orchestrate } from '../../../../server/services/ana-ri/orchestrator.js';
import { buildAnaRISystemPrompt, getCorePrompt } from '../../../../server/services/ana-ri/persona.js';
import { ANA_PERSONALITY_CORE } from '../../../../server/services/ana-ri/personality-core.js';
import { BASE_SYSTEM_PROMPT } from '../../../../server/services/lumen-context/base-system-prompt.js';
import { ANA_SYSTEM_PROMPT, ANA_COMPACT_PROMPT } from '../../../../server/services/ana-personality.js';
import { buildCommandContextForPrompt } from '../../../../server/services/ana-ri/command-executor.js';

const label = process.argv[2] ?? 'unlabelled';
const bytes = (s: string) => Buffer.byteLength(s, 'utf8');
const tok = (s: string) => Math.ceil(bytes(s) / 4);
const row = (name: string, s: string) =>
  console.log(`${name.padEnd(58)} ${String(bytes(s)).padStart(7)} B  ~${String(tok(s)).padStart(6)} tok`);

console.log(`# AnA prompt measurement — ${label}\n`);
console.log('## Stream-path parts (server/routes/ana-ri/stream.ts -> orchestrate())');
const core = getCorePrompt();
row('persona.ts ANA_RI_CORE_PROMPT', core);
row('personality-core.ts ANA_PERSONALITY_CORE', ANA_PERSONALITY_CORE);
const persona = buildAnaRISystemPrompt({ userRole: 'general' });
row('buildAnaRISystemPrompt({general}) (core+personality+role)', persona);
const plain = orchestrate({ message: 'What is the identification threshold under ICH Q3A?' });
row('orchestrate() plain chat turn, no project context', plain.systemPrompt);
row('  of which orchestrator.ts static additions', plain.systemPrompt.slice(persona.length));
const hi = orchestrate({ message: 'hi' });
row('orchestrate() first-turn greeting "hi"', hi.systemPrompt);

console.log('\n## orchestrator.ts static additions, by block');
const cmd = buildCommandContextForPrompt();
const orchRest = plain.systemPrompt.slice(persona.length).replace(cmd, '');
for (const sec of orchRest.split(/\n(?=## )/)) {
  if (sec.trim()) row(`  ${sec.trim().split('\n')[0].replace(/^## /, '').slice(0, 56)}`, sec);
}
row('  buildCommandContextForPrompt() (command catalog)', cmd);

console.log('\n## Other AnA prompt stacks (not on the stream path)');
row('base-system-prompt.ts BASE_SYSTEM_PROMPT (cortex-unified)', BASE_SYSTEM_PROMPT);
row('ana-personality.ts ANA_SYSTEM_PROMPT', ANA_SYSTEM_PROMPT);
row('ana-personality.ts ANA_COMPACT_PROMPT (ana-cortex)', ANA_COMPACT_PROMPT);

console.log('\n## persona.ts core sections (## headers)');
const parts = core.split(/\n(?=## )/);
for (const p of parts) {
  const title = p.split('\n')[0].replace(/^## /, '').slice(0, 56);
  row(`  ${title}`, p);
}
process.exit(0);
