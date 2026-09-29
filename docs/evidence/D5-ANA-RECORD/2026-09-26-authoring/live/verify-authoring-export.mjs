// An inspector's check of an exported authoring record, with nothing from the
// server but the package: Node's crypto and the file. No product code — the
// canonical JSON rule (keys sorted, no whitespace, undefined members dropped)
// is re-implemented here from the package's own howToVerify.
//
//   node verify-authoring-export.mjs <export.json>
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const canon = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
};

const pkg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let checked = 0;
let unchained = 0;
const failures = [];
for (const e of pkg.events) {
  const c = pkg.chain[e.id];
  if (!c) {
    unchained += 1;
    continue;
  }
  checked += 1;
  const d = c.details;
  const want = (name, ok) => { if (!ok) failures.push(`${e.id} ${e.operation_type}: ${name}`); };
  want('trailId', d.trailId === e.id);
  want('before_content', (e.before_content ? sha256(e.before_content) : null) === (d.contentHashBefore ?? null));
  want('after_content', (e.after_content ? sha256(e.after_content) : null) === (d.contentHashAfter ?? null));
  want('metadata', sha256(canon(e.metadata ?? {})) === d.metadataSha256);
  want('change_reason', (e.change_reason ?? null) === (d.changeReason ?? null));
  want('operation_type', e.operation_type === d.operationType);
  want('chain payload', sha256(JSON.stringify(d)) === c.payloadHash);
  // A comment's quote is the one its metadata hash covers, and its own hash matches it.
  if (e.metadata && typeof e.metadata.quote === 'string') want('quote hash', sha256(e.metadata.quote) === e.metadata.quoteSha256);
  // A tracked change's proposed text matches its own hash.
  for (const ch of [e.metadata, ...(Array.isArray(e.metadata?.changes) ? e.metadata.changes : [])]) {
    if (ch && typeof ch.text === 'string' && ch.textSha256) want(`text hash ${ch.changeId ?? ''}`, sha256(ch.text) === ch.textSha256);
  }
}
console.info(`events: ${pkg.events.length}; checked against the chain: ${checked}; with no chain entry: ${unchained}`);
for (const f of failures) console.info(`FAIL  ${f}`);
console.info(failures.length === 0 ? 'PASS  every chained event matches its chain entry' : `${failures.length} check(s) failed`);
console.info(`server's walk of the tenant chain at export: ${JSON.stringify(pkg.tenantChain)}`);
process.exitCode = failures.length === 0 && checked > 0 ? 0 : 1;
