#!/usr/bin/env node
/**
 * CI Guard: synthesised person-identity written into governed columns.
 *
 * ── The rule ──────────────────────────────────────────────────────────────────
 * 21 CFR 11.50(a)(1) requires a signed record to carry the printed name of the
 * signer, and §11.10(e) requires an audit trail that records who acted. Several
 * of those columns are NOT NULL, and that is precisely how this defect arises: a
 * writer with no real name to hand invents one so the INSERT succeeds.
 *
 * Found live in four places: `user-${id}` and `user-${id}@unknown.local` into
 * concept2cure_signatures.signer_name / .signer_email, `''` into the same NOT
 * NULL email from a second writer, and `user-${id}` / `''` into
 * document_audit_trail. An inspector reading those columns cannot tell an
 * invented identity from a real one — which is the entire function of the
 * column. In one writer the §11.200 attribution hash was computed OVER the
 * invented email, so the signature could not be re-derived from the real signer
 * and verification would report a mismatch that reads as tampering.
 *
 * A column that forbids null is not a reason to write something in its place.
 * The remedy is `resolveSignerIdentity` — resolve from the membership record,
 * refuse when it does not resolve.
 *
 * ── What this catches ─────────────────────────────────────────────────────────
 * A string literal or template that manufactures a person-shaped identity from
 * an id, and an empty-string fallback assigned to a signer/user name or email.
 * It does NOT try to judge whether the value reaches a column — that would need
 * dataflow. It judges the manufacture, which is the part that is always wrong.
 *
 * Usage:
 *   node scripts/ci/check-fabricated-identity.mjs                 # fail on new
 *   node scripts/ci/check-fabricated-identity.mjs --list
 *   node scripts/ci/check-fabricated-identity.mjs --write-baseline
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const BASELINE = path.join(ROOT, 'scripts/ci/fabricated-identity-baseline.json');

/** Identity manufactured from an id, or an empty string standing in for a name. */
const PATTERNS = [
  {
    re: /`\s*user-\$\{[^}]*\}\s*(?:@[^`]*)?`/,
    what: 'identity synthesised from a user id',
  },
  {
    re: /@unknown\.local/,
    what: 'placeholder email domain',
  },
  {
    // `${userName}@concept2cure.local`, `${username}@trialsage.ai` — an address
    // manufactured from a display name, a username or a role is an identity
    // nobody owns, and it reads exactly like one somebody does (ledger L142).
    re: /`[^`]*\$\{[^}]+\}[^`]*@[a-z0-9.-]+\.[a-z]+[^`]*`/,
    what: 'email address manufactured from an interpolated value',
  },
  {
    // `signerName: x ?? ''` / `userEmail: y || ""` — an empty string is not a name.
    re: /\b(?:signer|user|owner|actor|changedBy|approver)_?(?:Name|Email|name|email)\s*:\s*[^,;\n]*(?:\?\?|\|\|)\s*['"`]{2}/,
    what: 'empty string as a fallback identity',
  },
  // ── The same defect one level up: the APPLICANT, not the signer ────────────
  // The regional eCTD Module 1 backbone carries the applicant's identity —
  // <name>/<company-name> and <id>/<company-id>/<pmda-applicant-id> — and the
  // agency reads it as the legal entity making the submission. Four assemble
  // paths filled it from the tenant's row id: `Organization 7` as the applicant
  // name, `ORG-7` as the applicant id, and one filled the applicant id with the
  // application NUMBER. `Sponsor` and `Product` were the orchestrator's
  // defaults. None of those say "unassigned"; every one reads as real.
  //
  // regulatory-identifiers.ts states the rule this enforces: never fabricate,
  // and when an identifier is missing build with a value that SAYS it is
  // unassigned. So a fallback here is accepted only when it says so —
  // UNASSIGNED, Unknown, Unspecified or Not Specified. `Sponsor`, `Applicant`
  // and `Organization 7` do not: they read as the entity's actual name.
  {
    re: /\b(?:sponsor|applicant|company)_?(?:Name|Id|name|id)\s*:\s*[^,;\n]*(?:\?\?|\|\|)\s*(?:`(?!UNASSIGNED|Unknown|Unspecified|Not Specified)[^`]+`|'(?!UNASSIGNED|Unknown|Unspecified|Not Specified)[^']+'|"(?!UNASSIGNED|Unknown|Unspecified|Not Specified)[^"]+")/,
    what: 'applicant identity invented as a fallback (must say UNASSIGNED)',
  },
  {
    re: /\b(?:sponsor|applicant|company)_?(?:Name|Id|name|id)\s*:\s*`(?!UNASSIGNED)[^`]*\$\{[^}]*\}[^`]*`/,
    what: 'applicant identity manufactured from an id',
  },
];

function sourceFiles() {
  return execSync("git ls-files 'server/**/*.ts' 'shared/**/*.ts'", {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/__tests__|\.test\.ts$|\.spec\.ts$/.test(f));
}

/** Prose about the defect is not the defect. Blank comments before scanning. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

function findings() {
  const hits = [];
  for (const file of sourceFiles()) {
    const code = stripComments(readFileSync(path.join(ROOT, file), 'utf8'));
    code.split('\n').forEach((line, i) => {
      for (const { re, what } of PATTERNS) {
        if (!re.test(line)) continue;
        hits.push({ key: `${file}::${i + 1}`, file, line: i + 1, what, text: line.trim().slice(0, 120) });
        break;
      }
    });
  }
  return hits.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

const hits = findings();
const mode = process.argv[2];

if (mode === '--list') {
  for (const h of hits) console.log(`${h.file}:${h.line}  [${h.what}]\n    ${h.text}`);
  console.log(`\n[ci:fabricated-identity] ${hits.length} occurrence(s).`);
  process.exit(0);
}
if (mode === '--write-baseline') {
  writeFileSync(BASELINE, JSON.stringify({ occurrences: hits.map((h) => h.key) }, null, 2) + '\n');
  console.log(`[ci:fabricated-identity] baseline written — ${hits.length} occurrence(s).`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).occurrences : [];
const known = new Set(baseline);
const fresh = hits.filter((h) => !known.has(h.key));

if (fresh.length > 0) {
  console.error('\n❌ Identity manufactured for a governed column.\n');
  for (const h of fresh) console.error(`   ${h.file}:${h.line}  [${h.what}]\n     ${h.text}`);

  // Two different defects with two different remedies; print the one that applies.
  if (fresh.some((h) => /applicant identity/.test(h.what))) {
    console.error(`
   APPLICANT IDENTITY — the regional eCTD Module 1 backbone carries the
   applicant's legal identity in <name>/<company-name> and
   <id>/<company-id>/<pmda-applicant-id>, and the agency reads it as the entity
   making the submission. \`Organization 7\`, \`ORG-7\`, \`Sponsor\` and
   \`Applicant\` are indistinguishable from real values once written, which is
   what makes them worse than a gap.

   server/services/ectd/regulatory-identifiers.ts states the rule: never
   fabricate, and when an identifier is missing build with a value that SAYS it
   is unassigned. Pass the recorded identifier through, or fall back to
   \`UNASSIGNED-…\` / \`UNASSIGNED (…)\` — the wording the transmit path in
   submission-ops already uses. Unknown, Unspecified and Not Specified pass too.
`);
  }
  if (fresh.some((h) => !/applicant identity/.test(h.what))) {
    console.error(`
   PERSON IDENTITY — 21 CFR 11.50(a)(1) requires the PRINTED NAME OF THE SIGNER,
   and §11.10(e) an audit trail of who acted. \`user-41\` is not a person's name
   and \`''\` is not an email; both are indistinguishable from a real value once
   written, which is what makes them worse than a refusal.

   A NOT NULL column is not a reason to invent a value. Resolve the identity:

     import { resolveSignerIdentity } from 'server/services/part11/resolve-signer-identity';
     const signer = await resolveSignerIdentity(client, userId, orgId, 'my-action');

   It reads the membership record on YOUR transaction and throws
   SignerNotAttributableError when the signer cannot be attributed — let it throw.
`);
  }
  process.exit(1);
}
console.log(`[ci:fabricated-identity] OK — ${hits.length} baselined occurrence(s), 0 new.`);
