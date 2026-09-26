// An inspector's check of an exported AnA turn record, with nothing from the
// server but the package: Node's crypto and the file. No product code.
//
//   node verify-turn-export.mjs <export.json>
//
// It checks what the package's howToVerify lists: the record's hash, every
// text the record references, and that the chain row carries the record's hash
// and still hashes to the payload hash its chain link was computed over. The
// tenant-wide chain walk is the server's statement; re-run it against the
// database with `npm run ops:verify-audit-chain`.
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const pkg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

check('record text hashes to the record hash', sha256(pkg.record.recordText) === pkg.record.recordSha256, pkg.record.recordSha256);

// Every { sha256, chars } in the record is a text reference.
const refs = new Set();
(function walk(v) {
  if (Array.isArray(v)) return v.forEach(walk);
  if (v && typeof v === 'object') {
    if (typeof v.sha256 === 'string' && typeof v.chars === 'number') refs.add(v.sha256);
    Object.values(v).forEach(walk);
  }
})(JSON.parse(pkg.record.recordText));
const missing = [...refs].filter((h) => !(h in pkg.texts));
const altered = [...refs].filter((h) => h in pkg.texts && sha256(pkg.texts[h]) !== h);
check(`every referenced text is present (${refs.size})`, missing.length === 0, missing.join(', '));
check('every text hashes to its reference', altered.length === 0, altered.join(', '));

check('the chain row carries the record hash', pkg.chain?.details?.recordSha256 === pkg.record.recordSha256);
check('the chain row still hashes to its payload hash', pkg.chain && sha256(JSON.stringify(pkg.chain.details)) === pkg.chain.payloadHash, pkg.chain?.payloadHash);

for (const r of results) console.info(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : ` — ${r.detail}`}`);
console.info(`server's walk of the tenant chain at export: ${JSON.stringify(pkg.tenantChain)}`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
