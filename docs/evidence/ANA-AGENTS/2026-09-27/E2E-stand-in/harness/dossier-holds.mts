// SUPPLEMENTARY, not end to end: the lineage dossier's own reader
// (server/services/ana/lineage-dossier-holds.ts policyHoldsOf, from the SNAPSHOT)
// applied to the assistant row a Manual turn saved. The dossier is
// document-scoped and the captured conversation made no document, so the
// dossier itself was not rendered.
//   cd "$SNAP" && SNAP="$SNAP" DATABASE_URL=... npx tsx <this folder>/harness/dossier-holds.mts <thread_id>
// Takes the thread's first assistant row (turn 1), as the Manual scenario had one turn.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SNAP = process.env.SNAP;
const DB = process.env.DATABASE_URL;
const thread = process.argv[2];
if (!SNAP || !DB || !thread) throw new Error('SNAP, DATABASE_URL and a thread id are required');
const { policyHoldsOf } = await import(pathToFileURL(path.join(SNAP, 'server/services/ana/lineage-dossier-holds.ts')).href);

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const raw = execFileSync('psql', [DB, '-At', '-c',
  `SELECT id || E'\\t' || metadata::text FROM chat_messages WHERE thread_id = ${q(thread)} AND role = 'assistant' ORDER BY id LIMIT 1`]).toString().trim();
if (!raw) throw new Error(`no assistant row in thread ${thread}`);
const tab = raw.indexOf('\t');
const id = raw.slice(0, tab);
const meta = JSON.parse(raw.slice(tab + 1));
console.info(`# chat_messages.id ${id} (thread ${thread})`);
console.info(JSON.stringify(policyHoldsOf(meta, 1), null, 1));
