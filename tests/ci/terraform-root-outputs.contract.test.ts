/**
 * What the first apply tells the operator to read, both roots export (D1; MR-03 Stage 5).
 *
 * `terraform output` is run in an environment root
 * (terraform/environments/{staging,production}), and a root shows only what it
 * re-exports from terraform/stack. Until 2026-11-11:
 *   - the staging root exported neither deploy role nor the distribution id,
 *     though the first-apply checklist sets the GitHub `staging` environment's
 *     AWS_DEPLOY_ROLE_ARN, AWS_BUILD_ROLE_ARN and CLOUDFRONT_DISTRIBUTION_ID
 *     "from terraform output", and staging is applied first;
 *   - neither root exported first_run_setup, which says where the token for
 *     the deployment's first administrator is, nor the RDS engine version the
 *     IQ record asks for.
 * The stack had each of them; the operator could not read them where they
 * stood. Nothing is applied here: the files are read as text.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** `output "name" { … value = <expr> … }` → name → the value expression. */
export function outputsOf(source: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const m of source.matchAll(/^output\s+"([a-z0-9_]+)"\s*\{([\s\S]*?)^\}/gm)) {
    const value = /^\s*value\s*=\s*(.+)$/m.exec(m[2]);
    found.set(m[1], value ? value[1].trim() : '');
  }
  return found;
}

/** Every `terraform output [-raw|-json] <name>` an instruction file tells someone to run. */
export function outputsRead(source: string): string[] {
  return [...source.matchAll(/terraform(?:\s+-chdir=\S+)?\s+output(?:\s+-(?:raw|json))?\s+([a-z][a-z0-9_]*)/g)].map((m) => m[1]);
}

const ENVIRONMENTS = ['staging', 'production'] as const;
const stack = outputsOf(read('terraform/stack/outputs.tf'));
const bootstrap = outputsOf(read('terraform/bootstrap/main.tf'));
const roots = Object.fromEntries(ENVIRONMENTS.map((env) => [env, outputsOf(read(`terraform/environments/${env}/main.tf`))]));

/**
 * The outputs the first apply and first boot read, and who reads each
 * (docs/work-orders/MR-03-first-deploy-staging-to-production.md, founder
 * checklist steps 6 to 8; terraform.tfvars.example).
 */
const OPERATOR_OUTPUTS: Record<string, string> = {
  cloudfront_domain: 'the DNS alias points at it',
  frontend_bucket: "the GitHub environment's FRONTEND_BUCKET variable",
  github_deploy_role_arn: "the GitHub environment's AWS_DEPLOY_ROLE_ARN secret",
  github_build_role_arn: "the GitHub environment's AWS_BUILD_ROLE_ARN secret",
  cloudfront_distribution_id: "the GitHub environment's CLOUDFRONT_DISTRIBUTION_ID secret",
  first_run_setup: 'where the first administrator\'s setup token is, and the one call that uses it',
  readyz_detail: "where /readyz's detail token is, and the GitHub environment's READYZ_TOKEN secret",
  engine_version_actual: 'the PostgreSQL version RDS runs, for the IQ record',
  api_task_boot_contract: 'reviewed before apply',
};

describe.each(ENVIRONMENTS)('the %s root', (env) => {
  const outputs = roots[env];

  it.each(Object.entries(OPERATOR_OUTPUTS))('exports %s (%s)', (name) => {
    expect([...outputs.keys()]).toContain(name);
  });

  it('exports only what the stack declares, each under its own name', () => {
    const wrong = [...outputs].filter(([name, value]) => value !== `module.stack.${name}` || !stack.has(name));
    expect(wrong).toEqual([]);
  });

  it('exports every output its own terraform.tfvars.example tells the operator to read', () => {
    const named = outputsRead(read(`terraform/environments/${env}/terraform.tfvars.example`));
    expect(named.filter((n) => !outputs.has(n))).toEqual([]);
  });
});

describe('staging and production', () => {
  it('export the same outputs: staging is applied first, from the same instructions', () => {
    expect([...roots.staging.keys()].sort()).toEqual([...roots.production.keys()].sort());
  });

  it('both examples say which output feeds each GitHub value', () => {
    for (const env of ENVIRONMENTS) {
      const named = outputsRead(read(`terraform/environments/${env}/terraform.tfvars.example`));
      expect(named, env).toEqual(expect.arrayContaining(['github_deploy_role_arn', 'github_build_role_arn', 'cloudfront_distribution_id', 'frontend_bucket', 'readyz_detail']));
    }
  });
});

describe('the instructions read outputs that exist', () => {
  it.each([
    'terraform/README.md',
    'docs/work-orders/MR-03-first-deploy-staging-to-production.md',
  ])('%s', (file) => {
    const missing = outputsRead(read(file)).filter(
      (n) => !bootstrap.has(n) && !ENVIRONMENTS.every((env) => roots[env].has(n)),
    );
    expect(missing).toEqual([]);
  });
});

describe('the readers', () => {
  it('read an output block and its value', () => {
    const got = outputsOf('output "a" {\n  description = "x"\n  value       = module.stack.a\n}\n\noutput "b" {\n  value = {\n    c = 1\n  }\n}\n');
    expect([...got]).toEqual([['a', 'module.stack.a'], ['b', '{']]);
  });

  it('read the names an instruction runs, with -raw, -json and -chdir', () => {
    expect(outputsRead('terraform output -raw a; terraform -chdir=terraform/bootstrap output -raw b\nterraform output c\n`terraform output`; terraform output -json d')).toEqual(['a', 'b', 'c', 'd']);
  });
});
