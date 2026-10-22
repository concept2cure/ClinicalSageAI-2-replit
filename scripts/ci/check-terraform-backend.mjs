#!/usr/bin/env node
/**
 * The Terraform state backend can be created, and locks without DynamoDB
 * (MR-03 Stage 1: OPS-03, OPS-26).
 *
 * Until 2026-10-21 every backend named the state bucket `c2c-terraform-state`
 * in source, and bootstrap defaulted to the same name. S3 bucket names are
 * global, and that one already belongs to someone else (it answers 403 from
 * eu-west-1), so bootstrap's first apply fails with BucketAlreadyExists and
 * nothing after it can start. Locking used a DynamoDB table, which Terraform
 * deprecated in 1.11 in favour of S3-native lock files.
 *
 * What this refuses, in every `.tf` under terraform/:
 *   - a `backend "s3"` block with a literal `bucket`: the name is the
 *     account's (`c2c-tfstate-<account>-<region>`, terraform/bootstrap), so it
 *     comes from `terraform init -backend-config=backend.hcl`;
 *   - a `backend "s3"` block without `use_lockfile = true`, or with any
 *     DynamoDB locking argument;
 *   - a default for bootstrap's `state_bucket_name` other than null;
 *   - an `aws_dynamodb_table` in bootstrap (nothing locks with it any more);
 *   - the old name, `c2c-terraform-state`, anywhere.
 *
 *   node scripts/ci/check-terraform-backend.mjs              # the repository
 *   node scripts/ci/check-terraform-backend.mjs --self-test  # proves it refuses
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = '[terraform-backend]';
const OLD_STATE_BUCKET = 'c2c-terraform-state';

/** HCL with comments removed (#, // and block comments), string contents kept. */
export function stripComments(src) {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (inString) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i += 1;
    } else if (c === '#' || (c === '/' && next === '/')) {
      while (i < src.length && src[i] !== '\n') i += 1;
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** The body of every `<header> {…}` block matching `headerRe`, brace-matched. */
export function blocks(src, headerRe) {
  const found = [];
  const re = new RegExp(headerRe.source, 'g');
  let m;
  while ((m = re.exec(src)) !== null) {
    const open = src.indexOf('{', m.index + m[0].length - 1);
    let depth = 0;
    for (let j = open; j < src.length; j += 1) {
      if (src[j] === '{') depth += 1;
      else if (src[j] === '}' && --depth === 0) {
        found.push(src.slice(open + 1, j));
        break;
      }
    }
  }
  return found;
}

/** Problems in one file's text; `rel` is its path under the repository root. */
export function problemsIn(rel, text) {
  const out = [];
  const src = stripComments(text);
  for (const body of blocks(src, /backend\s+"s3"\s*\{/)) {
    if (/^\s*bucket\s*=/m.test(body)) {
      out.push(`${rel}: backend "s3" names its bucket in source. Leave it out and pass it with \`terraform init -backend-config=backend.hcl\` (the name is the account's: \`terraform -chdir=terraform/bootstrap output -raw state_bucket\`).`);
    }
    if (!/^\s*use_lockfile\s*=\s*true\s*$/m.test(body)) {
      out.push(`${rel}: backend "s3" does not set \`use_lockfile = true\`, so two applies can write the state at once.`);
    }
    if (/^\s*dynamodb_(table|endpoint)\s*=/m.test(body) || /^\s*dynamodb\s*=/m.test(body)) {
      out.push(`${rel}: backend "s3" locks with DynamoDB, which Terraform deprecated in 1.11; S3-native locking (\`use_lockfile = true\`) replaces it.`);
    }
  }
  if (rel === 'terraform/bootstrap/variables.tf') {
    const [body] = blocks(src, /variable\s+"state_bucket_name"\s*\{/);
    if (body === undefined) out.push(`${rel}: variable "state_bucket_name" is missing.`);
    else if (!/^\s*default\s*=\s*null\s*$/m.test(body)) {
      out.push(`${rel}: state_bucket_name must default to null, so bootstrap names the bucket for the account it runs in.`);
    }
  }
  if (rel.startsWith('terraform/bootstrap/') && /resource\s+"aws_dynamodb_table"/.test(src)) {
    out.push(`${rel}: bootstrap creates a DynamoDB table; state locks with S3 lock files, so nothing would use it.`);
  }
  if (text.includes(OLD_STATE_BUCKET)) {
    out.push(`${rel}: names \`${OLD_STATE_BUCKET}\`, a bucket that belongs to another AWS account.`);
  }
  return out;
}

function tfFiles(dir, root) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.terraform') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tfFiles(full, root));
    else if (entry.name.endsWith('.tf')) out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out;
}

export function problemsInRepo(root) {
  const files = tfFiles(path.join(root, 'terraform'), root);
  const problems = files.flatMap((rel) => problemsIn(rel, fs.readFileSync(path.join(root, rel), 'utf8')));
  const backends = files.filter((rel) => /backend\s+"s3"/.test(stripComments(fs.readFileSync(path.join(root, rel), 'utf8'))));
  if (backends.length === 0) problems.push('no backend "s3" block found under terraform/: nothing was checked.');
  return { problems, backends };
}

// ── Self-test ────────────────────────────────────────────────────────────────

/** The production backend block as it stood before this guard (terraform/environments/production/main.tf). */
const PRE_FIX_ROOT = `
terraform {
  required_version = ">= 1.5"
  backend "s3" {
    bucket         = "c2c-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "c2c-terraform-lock"
    # No \`encrypt = true\`: without a kms_key_id it requests SSE-S3 on every write.
  }
}`;
const FIXED_ROOT = `
terraform {
  backend "s3" {
    # bucket comes from backend.hcl; the old one was "c2c-tfstate-old"
    key          = "production/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
  }
}`;
const BOTH_LOCKS = FIXED_ROOT.replace('use_lockfile = true', 'use_lockfile = true\n    dynamodb_table = "locks"');
const NO_LOCK = FIXED_ROOT.replace('use_lockfile = true', '');
const LITERAL_IN_STRING = FIXED_ROOT.replace('key          = "production/terraform.tfstate"', 'key = "production/terraform.tfstate"\n    bucket = "x # not a comment"');
const BOOTSTRAP_VARS = (def) => `variable "state_bucket_name" {\n  type    = string\n  default = ${def}\n}\n`;
const BOOTSTRAP_LOCK_TABLE = 'resource "aws_dynamodb_table" "tflock" {\n  name = "c2c-tflock"\n}\n';

function selfTest() {
  const cases = [
    ['the pre-fix production backend (literal bucket, DynamoDB, no lock file)', 'terraform/environments/production/main.tf', PRE_FIX_ROOT, 4],
    ['the fixed backend (bucket from backend.hcl, use_lockfile)', 'terraform/environments/production/main.tf', FIXED_ROOT, 0],
    ['use_lockfile beside a DynamoDB table', 'terraform/environments/staging/main.tf', BOTH_LOCKS, 1],
    ['a backend with no locking at all', 'terraform/environments/staging/main.tf', NO_LOCK, 1],
    ['a literal bucket whose value contains a #', 'terraform/environments/staging/main.tf', LITERAL_IN_STRING, 1],
    ['bootstrap defaulting to the taken name', 'terraform/bootstrap/variables.tf', BOOTSTRAP_VARS('"c2c-terraform-state"'), 2],
    ['bootstrap defaulting to another fixed name', 'terraform/bootstrap/variables.tf', BOOTSTRAP_VARS('"c2c-state"'), 1],
    ['bootstrap defaulting to null', 'terraform/bootstrap/variables.tf', BOOTSTRAP_VARS('null'), 0],
    ['bootstrap still creating a lock table', 'terraform/bootstrap/main.tf', BOOTSTRAP_LOCK_TABLE, 1],
  ];
  let ok = true;
  for (const [label, rel, text, want] of cases) {
    const got = problemsIn(rel, text);
    const pass = got.length === want;
    ok &&= pass;
    console.log(`${TAG} self-test ${pass ? 'ok  ' : 'FAIL'} — ${label}: ${got.length} problem(s), expected ${want}`);
    if (!pass) for (const p of got) console.log(`    ${p}`);
  }
  return ok;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { problems, backends } = problemsInRepo(root);
  if (problems.length) {
    for (const p of problems) console.error(`${TAG} FAIL — ${p}`);
    process.exit(1);
  }
  console.log(`${TAG} ok — ${backends.length} S3 backend(s) take the bucket from backend.hcl and lock with S3 lock files; bootstrap names the bucket per account.`);
}
