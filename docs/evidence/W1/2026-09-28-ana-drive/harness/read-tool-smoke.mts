// Call every READ tool AnA is offered, through its real handler, against the
// local database — the sweep behind ../tool-honesty.txt.
//
//   node battery.mjs            # a run first, to capture the tool schemas
//   npx tsx read-tool-smoke.mts [toolName ...]
//
// Only tools the register classes `read` are called: running a write, command
// or confirm tool is a governed act, not a smoke test. Required arguments are
// filled from each tool's own schema — an enum takes its first value, a
// program argument the seeded program, a document argument the seeded doc.
// Each result is written to smoke-results.json for sorting afterwards.
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.HARNESS_OUT || path.join(process.env.TMPDIR || '/tmp', 'ana-read-tool-smoke');
fs.mkdirSync(OUT, { recursive: true });
const REQ_DIR = process.env.FAKE_REQ_DIR || path.join(process.env.TMPDIR || '/tmp', 'ana-drive-stand-in', 'requests');
const REPO = process.env.REPO_ROOT || '/home/user/ClinicalSageAI-2-replit';
/** The seeded program and document the filled arguments point at. */
const PROGRAM = { id: process.env.SMOKE_PROGRAM_ID || '', code: process.env.SMOKE_PROGRAM_CODE || 'BX-301' };
const DOC = process.env.SMOKE_DOC_ID || '';

const { getToolHandler } = await import(`${REPO}/server/services/ana/AnaToolExecutor.ts`);
const { TOOL_REGISTER } = await import(`${REPO}/server/services/ana/tool-authorization.ts`);

/** The tool schemas AnA actually sent, read from a battery run's saved requests. */
function schemasFromRequests(): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fs.readdirSync(REQ_DIR).filter(n => n.endsWith('.json'))) {
    const body = JSON.parse(fs.readFileSync(path.join(REQ_DIR, f), 'utf8')).body;
    for (const t of body?.tools ?? []) out[t.name] ??= t.input_schema ?? {};
  }
  return out;
}

function valueFor(name: string, spec: any): unknown {
  const n = name.toLowerCase();
  if (spec?.enum?.length) return spec.enum[0];
  const t = Array.isArray(spec?.type) ? spec.type[0] : spec?.type;
  if (t === 'boolean') return false;
  if (t === 'integer' || t === 'number') return spec.minimum ?? 1;
  if (t === 'array') return spec.items?.type === 'string' ? ['stability'] : [];
  if (t === 'object') return {};
  if (/program|project/.test(n)) return /id$/.test(n) ? PROGRAM.id : PROGRAM.code;
  if (/doc(ument)?_?id|documentid/.test(n)) return DOC;
  return 'stability';
}

const schemas = schemasFromRequests();
const only = process.argv.slice(2);
const names = Object.keys(schemas).filter(n => (only.length ? only.includes(n) : true)).sort();
const results: any[] = [];

for (const name of names) {
  const cls = TOOL_REGISTER[name]?.class ?? 'unregistered';
  if (cls !== 'read') { results.push({ name, cls, skipped: true }); continue; }
  const schema = schemas[name] ?? {};
  const input: Record<string, unknown> = {};
  for (const r of schema.required ?? []) input[r] = valueFor(r, schema.properties?.[r]);
  const handler = getToolHandler(name);
  if (!handler) { results.push({ name, cls, result: 'NO HANDLER' }); continue; }
  const started = Date.now();
  let result: string;
  try {
    const raw = await Promise.race([
      handler(input, { organizationId: 1, userId: 1, projectId: PROGRAM.id, projectRef: PROGRAM.code } as any),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT 25s')), 25_000)),
    ]);
    result = typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch (e: any) {
    result = `THREW ${e?.name ?? ''}: ${e?.message ?? e}`;
  }
  const ms = Date.now() - started;
  results.push({ name, cls, ms, input, result: result.slice(0, 400) });
  console.info(`${name} (${ms} ms): ${result.slice(0, 160).replace(/\n/g, ' ')}`);
}

fs.writeFileSync(path.join(OUT, 'smoke-results.json'), JSON.stringify(results, null, 1));
console.info(`done: ${results.length} tools, ${results.filter(r => !r.skipped).length} read tools called`);
process.exit(0);
