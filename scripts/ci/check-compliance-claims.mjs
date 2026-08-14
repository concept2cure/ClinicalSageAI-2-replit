#!/usr/bin/env node
/**
 * CI Guard: no unsupported compliance claims in customer-facing copy.
 *
 * THE INCIDENT. The signup screen (`client/src/concept2cure/v2/surfaces/AuthFlow.tsx`)
 * told every prospect, at the moment of conversion, that the platform had
 * "SOC 2 Type II", that data was "encrypted in transit & at rest", and that
 * "MFA & SSO" were "enforced on every production environment". SECURITY.md
 * repeated the SOC 2 claim and added "21 CFR Part 11 compliant audit trails".
 *
 * None of the three survived the 2026-07 audit:
 *   - There is no SOC 2 report of any type. The platform ships a Trust
 *     Services Criteria control mapping as a REFERENCE for the customer's own
 *     GRC program, and `/api/part11/soc2/controls` says so in its own response
 *     body — the product contradicted itself between its API and its landing
 *     copy.
 *   - Encryption at rest is field-level over specific secrets (TOTP secrets,
 *     integration credentials). The general-purpose PII/PHI helper at
 *     `server/services/security/field-encryption.ts` has no callers at all.
 *   - TOTP MFA is per-user opt-in and SSO is configured per domain. Neither is
 *     enforced anywhere by default.
 *
 * These are sold to regulated-industry buyers whose procurement teams audit
 * exactly these claims, so the failure mode is not embarrassment — it is a
 * security questionnaire answered wrongly, in writing, before a contract.
 *
 * Copy drifts back. A one-time edit does not hold; a gate does. This is that
 * gate: it fails when an assertive compliance claim appears in customer-facing
 * copy without an explicit, reasoned exemption.
 *
 * ESCAPE HATCH. Deliberate, audited uses annotate the line, matching the
 * repo's existing `// security-allow:` convention:
 *
 *   // compliance-claim-allow: describes the customer's own GRC program
 *   <p>Map your SOC 2 evidence to Part 11 controls</p>
 *
 * In Markdown, use an HTML comment on the line or the line before:
 *
 *   <!-- compliance-claim-allow: stating the ABSENCE of a report -->
 *
 * The annotation is the point. It forces whoever reintroduces a claim to say,
 * on the line, why it is true — and leaves that reasoning in the diff for a
 * reviewer.
 *
 * Exit 0 — every compliance claim is supportable or explicitly exempted.
 * Exit 1 — at least one unsupported claim in customer-facing copy.
 *
 * Usage:
 *   node scripts/ci/check-compliance-claims.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLAIMS } from './compliance-claims.rules.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const ALLOW = 'compliance-claim-allow';

// ─────────────────────────────────────────────────────────────────────────────
// What counts as an unsupported claim.
//
// Deliberately narrow. This gate exists to stop the specific claims the audit
// disproved from returning — not to police every use of the word "compliance",
// which would produce noise, get muted, and protect nothing.

// ─────────────────────────────────────────────────────────────────────────────
// Where to look.
//
// Customer-facing copy only: the UI a prospect or user reads, and the
// repository-root policy documents a procurement team will be sent. Server code
// and internal docs are out of scope — a control-mapping constant naming
// "SOC 2 Type II" as a certification TARGET is honest, and flagging it would
// train everyone to ignore this gate.
// ─────────────────────────────────────────────────────────────────────────────
const SCAN_ROOTS = [path.join(repoRoot, 'client', 'src')];
const SCAN_FILES = ['SECURITY.md', 'README.md'].map((f) => path.join(repoRoot, f));

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.md', '.mdx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '_deprecated']);

function isTestPath(rel) {
  return (
    rel.includes('/__tests__/') ||
    rel.includes('/__mocks__/') ||
    /\.(test|spec|stories)\.(ts|tsx|js|jsx)$/.test(rel)
  );
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (CODE_EXT.has(path.extname(e.name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The prose a reader actually sees on a line, with JSX interpolations blanked.
 *
 * Every rule here bounds its match with `[^.\n]{0,N}` — "within the same
 * sentence" — because a claim is only a claim when its parts belong to one
 * statement. A JSX expression defeats that: `{I.dot}` renders as a separator
 * glyph, but its member-access period reads to the regex as a full stop, so
 * `Deterministic validation {I.dot} 100%` looked like two sentences and no
 * rule could span it. The claim was invisible to the gate while being the
 * most prominent text on the badge.
 *
 * Blanking `{...}` restores the sentence without widening any rule. It also
 * fixes the same blind spot for the four original rules, which have carried
 * it since they were written.
 */
function proseOf(line) {
  return line.replace(/\{[^{}]*\}/g, ' ');
}

/**
 * Is this line a code comment rather than copy a user reads?
 *
 * This gate's scope is "the UI a prospect or user reads". A JSDoc block in a
 * utility module is not that, and treating it as such produces exactly the
 * noise the SOC 2 rule's comment warns will get the gate muted: the first run
 * of the absolute-guarantee rule flagged `authToken.ts` for "what guarantees
 * no stale bearer survives logout" — a true statement about deterministic
 * code, in a file no customer opens.
 *
 * Code files only. Markdown is left alone, because there the prose IS the
 * content and a leading `*` is a bullet, not a comment.
 */
function isCommentLine(rel, line) {
  if (/\.(md|mdx)$/.test(rel)) return false;
  return /^\s*(?:\/\/|\/\*|\*(?!\/)|\*\/)/.test(line);
}

const files = [
  ...SCAN_ROOTS.flatMap((r) => walk(r)),
  ...SCAN_FILES.filter((f) => fs.existsSync(f)),
];

const violations = [];

for (const file of files) {
  const rel = path.relative(repoRoot, file);
  if (isTestPath(rel)) continue;

  let lines;
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n');
  } catch {
    continue;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // The annotation is honored on the offending line or the line immediately
    // above it, so a long JSX line can carry its exemption on its own comment.
    const exempt = line.includes(ALLOW) || (i > 0 && lines[i - 1].includes(ALLOW));
    if (exempt) continue;

    if (isCommentLine(rel, line)) continue;

    // Match against the rendered prose, not the source line — see proseOf.
    // The exemption above is checked on the RAW line, because the annotation
    // lives in a comment rather than in what the reader sees.
    const prose = proseOf(line);

    for (const claim of CLAIMS) {
      const m = prose.match(claim.re);
      if (m) {
        violations.push({
          file: rel,
          line: i + 1,
          id: claim.id,
          why: claim.why,
          text: m[0].trim().slice(0, 90),
        });
      }
    }
  }
}

if (violations.length === 0) {
  console.log(
    `[ci:compliance-claims] OK — scanned ${files.length} customer-facing files, no unsupported claims.`
  );
  process.exit(0);
}

console.error(
  `[ci:compliance-claims] FAIL — ${violations.length} unsupported compliance claim(s) in customer-facing copy.\n`
);

const byId = new Map();
for (const v of violations) {
  if (!byId.has(v.id)) byId.set(v.id, []);
  byId.get(v.id).push(v);
}

for (const [id, vs] of byId) {
  console.error(`  ${id}`);
  console.error(`    ${vs[0].why}`);
  for (const v of vs) {
    console.error(`      ${v.file}:${v.line}  —  "${v.text}"`);
  }
  console.error('');
}

console.error('  Fix the copy, or — if the claim is genuinely supportable — annotate the line:');
console.error(`      // ${ALLOW}: <why this specific claim is true>`);
console.error(`      <!-- ${ALLOW}: <why this specific claim is true> -->   (Markdown)`);
console.error('');
console.error('  See SECURITY.md for what this platform can and cannot claim today.');

process.exit(1);
