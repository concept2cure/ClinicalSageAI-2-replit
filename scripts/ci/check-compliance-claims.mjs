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
const CLAIMS = [
  {
    id: 'soc2-attestation',
    // "SOC 2 Type II", "SOC 2 certified", "SOC 2 compliant", "SOC2-audited".
    // NOT bare "SOC 2", which legitimately appears when describing the control
    // mapping we ship for the customer's own program.
    re: /SOC\s?2\b[^.\n]{0,24}\b(Type\s?(?:I{1,2}|1|2)|certified|certification|attested|attestation|compliant|audited)\b/i,
    why: 'Concept2Cure holds no SOC 2 report of any type. The shipped TSC mapping is a reference framework for the customer\'s GRC program, not an attestation of this platform.',
  },
  {
    id: 'part11-compliant-product',
    // The ADJECTIVE form only — "a Part 11-compliant PDF", "our Part 11
    // compliant signature" — which asserts that a thing we ship IS compliant.
    //
    // Deliberately NOT the noun form. "The Platform supports 21 CFR Part 11
    // compliance" (client/src/concept2cure/auth/ZenSignup.tsx) and "audit trail
    // for 21 CFR Part 11 compliance" state a PURPOSE, which is both true and
    // the hedged wording the team already settled on. Flagging those would bury
    // the real violations in noise and get this gate muted — the precision is
    // what makes it worth having.
    //
    // Part 11 compliance is a property of a VALIDATED INSTALLATION — IQ/OQ/PQ,
    // SOPs, training — which a vendor cannot assert on a customer's behalf.
    re: /(?:21\s?CFR\s?)?\bPart[-\s]?11[-\s]compliant\b|\b(?:is|are|fully|100%)\s+(?:\w+\s+){0,2}(?:21\s?CFR\s?)?Part[-\s]?11[-\s]complian/i,
    why: 'Part 11 compliance is a property of a validated installation (IQ/OQ/PQ, SOPs, training), not of shipped software. Describe the control instead — "Part 11 audit trail", "Part 11 e-signature", or "supports Part 11 compliance".',
  },
  {
    id: 'hipaa-compliant',
    // "HIPAA compliant" vs the hedged "HIPAA-ready" the team already uses.
    re: /HIPAA[- ]?compliant\b/i,
    why: 'Use "HIPAA-ready". HIPAA compliance depends on a BAA and the customer\'s own administrative and physical safeguards.',
  },
  {
    id: 'blanket-encryption-at-rest',
    // "all data encrypted at rest", "everything encrypted at rest", and the
    // bare "encrypted at rest" badge that implies blanket coverage.
    re: /\b(?:all|every|complete(?:ly)?|full(?:y)?)\s+(?:\w+\s+){0,2}encrypt(?:ed|ion)\b[^.\n]{0,32}\bat[- ]rest\b/i,
    why: 'Encryption at rest is field-level over specific secrets. Whole-database encryption is a property of the deployment, not of this application.',
  },
  {
    id: 'mfa-enforced-everywhere',
    re: /\bMFA\b[^.\n]{0,40}\benforced\b[^.\n]{0,40}\b(?:every|all)\b/i,
    why: 'TOTP MFA is per-user opt-in; it cannot currently be enforced org-wide.',
  },
];

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

    for (const claim of CLAIMS) {
      const m = line.match(claim.re);
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
