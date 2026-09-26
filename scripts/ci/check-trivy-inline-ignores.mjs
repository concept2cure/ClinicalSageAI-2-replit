#!/usr/bin/env node
/**
 * ci:trivy-inline-ignores — every inline `#trivy:ignore:<ID>` sits directly on
 * the block it excepts.
 *
 * Why this exists: Trivy applies an ignore comment that stands on its own line
 * to the line directly below it, and to nothing else. Consecutive ignore lines
 * chain onto the first code line after them. A plain comment or a blank line in
 * between detaches it, and the exception then applies to nothing. The finding
 * it was written for comes back, and nothing says why.
 *
 * That happened on trunk: `abc1c99a5` (security plan P0-15) added the SPA's
 * response-headers policy, with its own comment block, between
 * `#trivy:ignore:AWS-0011` and `aws_cloudfront_distribution.this` in
 * `terraform/modules/cloudfront/main.tf`. The blocking config scan in `ci.yml`
 * then failed on AWS-0011 (no WAF, a founder decision the comment records) for
 * both environments. No local check could catch it, because no Trivy binary
 * runs in the sessions that edit these files. This check reads the tree the
 * way Trivy reads the comment and fails first.
 *
 * Scope: tracked Terraform, Dockerfiles and YAML, the formats the config scan
 * reads inline ignores from. An ignore at the end of a code line applies to
 * that line and is always attached.
 *
 * Exit 1 with every detached ignore listed; exit 0 listing each ignore and the
 * line it attaches to. `--root <dir>` checks another tree (every matching file
 * under it, not `git ls-files`); `--selftest` runs the check against the cases
 * it exists to catch, including the abc1c99a5 shape, and exits non-zero unless
 * every one is caught.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const IAC_FILE = /(\.tf|\.ya?ml|(^|\/)(Dockerfile|Containerfile)[^/]*|\.Dockerfile)$/;
/** A line that is nothing but an ignore comment (Trivy's "start line" rule). */
const IGNORE_ONLY = /^(?:#|\/\/)\s*(?:trivy|tfsec):ignore:([A-Za-z0-9_.-]+)/;
const COMMENT = /^(?:#|\/\/|\/\*|\*)/;

/**
 * @param {string} text file contents
 * @returns {{ attached: {line: number, id: string, target: string, targetLine: number}[], detached: {line: number, id: string, why: string}[] }}
 */
export function checkInlineIgnores(text) {
  const lines = text.split(/\r?\n/);
  const attached = [];
  const detached = [];
  for (let i = 0; i < lines.length; i++) {
    const m = IGNORE_ONLY.exec(lines[i].trim());
    if (!m) continue;
    let j = i + 1;
    while (j < lines.length && IGNORE_ONLY.test(lines[j].trim())) j++;
    const next = j < lines.length ? lines[j].trim() : null;
    if (next === null) {
      detached.push({ line: i + 1, id: m[1], why: 'it is the last thing in the file' });
    } else if (next === '') {
      detached.push({ line: i + 1, id: m[1], why: `line ${j + 1} below it is blank` });
    } else if (COMMENT.test(next)) {
      detached.push({ line: i + 1, id: m[1], why: `line ${j + 1} below it is a comment ("${next.slice(0, 60)}")` });
    } else {
      attached.push({ line: i + 1, id: m[1], target: next.replace(/\s*\{\s*$/, ''), targetLine: j + 1 });
    }
  }
  return { attached, detached };
}

function trackedFiles(root) {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1e8 });
  return out.split('\0').filter((f) => f && IAC_FILE.test(f) && !f.includes('node_modules/'));
}

function walk(root, rel = '') {
  const files = [];
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '.git') files.push(...walk(root, r));
    } else if (IAC_FILE.test(r)) {
      files.push(r);
    }
  }
  return files;
}

function runTree(root, { useGit = true } = {}) {
  const files = useGit ? trackedFiles(root) : walk(root);
  const attached = [];
  const detached = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    if (!/(trivy|tfsec):ignore:/.test(text)) continue;
    const r = checkInlineIgnores(text);
    for (const a of r.attached) attached.push({ file: f, ...a });
    for (const d of r.detached) detached.push({ file: f, ...d });
  }
  if (detached.length) {
    console.error(`[ci:trivy-inline-ignores] FAIL — ${detached.length} inline Trivy exception(s) attached to nothing:`);
    for (const d of detached) console.error(`  - ${d.file}:${d.line} #trivy:ignore:${d.id} — ${d.why}`);
    console.error(
      '\n  Trivy applies an ignore comment to the line directly below it (or, chained, to the first\n' +
        '  code line after a run of ignore lines). Move it so it sits on the resource or attribute it\n' +
        '  excepts, with any explanation ABOVE it, not between it and the block.',
    );
    return 1;
  }
  console.log(`[ci:trivy-inline-ignores] OK — ${attached.length} inline exception(s), each on the block it names:`);
  for (const a of attached) console.log(`  ${a.id} → ${a.target}  (${a.file}:${a.targetLine})`);
  return 0;
}

function selftest() {
  const cases = [
    {
      name: 'directly above the resource: attached',
      text: '# No WAF yet: a founder decision.\n#trivy:ignore:AWS-0011\nresource "aws_cloudfront_distribution" "this" {\n}\n',
      detached: [],
    },
    {
      name: 'the abc1c99a5 shape: another resource and its comments put between the ignore and its block',
      text:
        '# No WAF yet: a founder decision.\n#trivy:ignore:AWS-0011\n# Security headers for the SPA (P0-15).\n' +
        'resource "aws_cloudfront_response_headers_policy" "spa" {\n}\n\nresource "aws_cloudfront_distribution" "this" {\n}\n',
      detached: ['AWS-0011'],
    },
    {
      name: 'a blank line between the ignore and its block',
      text: '#trivy:ignore:AWS-0053\n\nresource "aws_lb" "this" {\n}\n',
      detached: ['AWS-0053'],
    },
    {
      name: 'chained ignores reach the first code line',
      text: '#trivy:ignore:AWS-0086\n#trivy:ignore:AWS-0087\nresource "aws_s3_bucket" "b" {\n}\n',
      detached: [],
    },
    {
      name: 'an indented nested block (the ECS egress rule)',
      text: 'resource "aws_security_group" "t" {\n  # Hosted services.\n  #trivy:ignore:AWS-0104\n  egress {\n  }\n}\n',
      detached: [],
    },
    {
      name: 'a trailing ignore on a code line is always attached',
      text: 'resource "x" "y" {\n  cidr_blocks = ["0.0.0.0/0"] #trivy:ignore:AWS-0104\n}\n',
      detached: [],
    },
    {
      name: 'an ignore at the end of the file',
      text: 'resource "x" "y" {\n}\n#trivy:ignore:AWS-0132',
      detached: ['AWS-0132'],
    },
    {
      name: 'the // comment form and tfsec prefix are read the same way',
      text: '// tfsec:ignore:aws-s3-enable-versioning\n// explanation\nresource "aws_s3_bucket" "b" {\n}\n',
      detached: ['aws-s3-enable-versioning'],
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = checkInlineIgnores(c.text).detached.map((d) => d.id);
    const ok = got.length === c.detached.length && c.detached.every((id) => got.includes(id));
    if (!ok) {
      failed += 1;
      console.error(`  ✗ ${c.name}\n      want detached [${c.detached.join(', ')}], got [${got.join(', ')}]`);
    } else {
      console.log(`  ✓ ${c.name}`);
    }
  }
  // The tree-level entry point must exit non-zero on a tree with a detached ignore.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trivy-inline-selftest-'));
  fs.mkdirSync(path.join(dir, 'modules'));
  fs.writeFileSync(path.join(dir, 'modules', 'main.tf'), cases[1].text);
  const rc = runTree(dir, { useGit: false });
  if (rc !== 1) {
    failed += 1;
    console.error('  ✗ the tree check did not exit 1 on a detached ignore');
  } else {
    console.log('  ✓ the tree check exits 1 on a detached ignore');
  }
  if (failed) {
    console.error(`[ci:trivy-inline-ignores:selftest] FAIL — ${failed} case(s) not caught.`);
    return 1;
  }
  console.log(`[ci:trivy-inline-ignores:selftest] OK — ${cases.length + 1} case(s) caught.`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) process.exit(selftest());
  const rootIdx = args.indexOf('--root');
  process.exit(
    rootIdx >= 0 ? runTree(path.resolve(args[rootIdx + 1]), { useGit: false }) : runTree(process.cwd()),
  );
}
