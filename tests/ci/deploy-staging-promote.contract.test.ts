/**
 * Staging builds once; production runs only the image staging verified, copied
 * by digest (MR-03 Stage 4, OPS-10).
 *
 * deploy-aws.yml deployed production only, and built the image on every
 * production deploy: what production ran had never run anywhere else. Now an
 * rc-* tag (or a staging dispatch) builds, deploys and smoke-tests on staging,
 * and marks that image staging-verified-<sha12>. A v* tag (or a production
 * dispatch) builds nothing: it copies that exact image into production's
 * repository and deploys its digest. A commit staging never verified stops at
 * promote, before anything migrates.
 *
 * The target is resolved by the workflow's own resolve job (its shell, run
 * here), job conditions go through the runner simulator, and the steps that
 * act run as shell against stubs of aws and skopeo that record their calls.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { interpolate } from './workflow-expression';
import {
  RC_PUSH,
  ROOT,
  TAG_PUSH,
  TRUNK_PUSH,
  contexts,
  deployJobs,
  dispatch,
  readWorkflow,
  resolveOutputs,
  runShellStep,
  shellFor,
  simulateSteps,
  stepNamed,
  type Scenario,
} from './workflow-harness';

const wf = readWorkflow('deploy-aws.yml');
const TARGETS = JSON.parse(fs.readFileSync(path.join(ROOT, '.github/deploy-targets.json'), 'utf8')) as Record<string, Record<string, string>>;
const STAGING: Scenario[] = [RC_PUSH, dispatch({ target: 'staging', deploy_api: 'true', deploy_frontend: 'true' })];
const PRODUCTION: Scenario[] = [TAG_PUSH, dispatch({ target: 'production', deploy_api: 'true', deploy_frontend: 'true' })];
const SHA12 = 'c'.repeat(12);
const DIGEST = `sha256:${'d'.repeat(64)}`;

describe('the target', () => {
  for (const [s, target] of [
    [RC_PUSH, 'staging'],
    [TAG_PUSH, 'production'],
    [dispatch({ target: 'staging' }), 'staging'],
    [dispatch({ target: 'production' }), 'production'],
  ] as const) {
    it(`${s.label} → ${target}, with that entry of deploy-targets.json as its names`, () => {
      const out = resolveOutputs(wf, s);
      expect(out.target).toBe(target);
      expect(JSON.parse(out.names)).toEqual(TARGETS[target]);
      expect(out.image_tag).toBe(`sha-${SHA12}`);
    });
  }

  it.each([
    ['a push to the trunk', TRUNK_PUSH],
    ['a dispatch naming no known target', dispatch({ target: 'qa' })],
  ])('refuses %s: no target, so nothing deploys', (_label, s) => {
    expect(resolveOutputs(wf, s)).toEqual({});
    const jobs = deployJobs(wf, s);
    expect(['build-push', 'promote', 'migrate', 'deploy-api', 'deploy-frontend', 'smoke-test'].filter((j) => jobs[j] !== 'skipped')).toEqual([]);
  });

  it('deploy-targets.json names staging and production, and nothing else', () => {
    expect(Object.keys(TARGETS).sort()).toEqual(['production', 'staging']);
  });

  for (const s of [...STAGING, ...PRODUCTION]) {
    it(`${s.label}: the concurrency group is the same environment`, () => {
      const group = String((wf as unknown as { concurrency: { group: string } }).concurrency.group);
      expect(interpolate(group, contexts(wf, 'resolve', s, {}))).toBe(`deploy-${resolveOutputs(wf, s).target}`);
    });
  }
});

describe('production never builds', () => {
  const builds = (job: string) => (wf.jobs[job]?.steps ?? []).some((st) => /\bdocker build\b/.test(st.run ?? ''));

  for (const s of PRODUCTION) {
    it(`${s.label}: promote runs, build-push does not, and no job that runs builds an image`, () => {
      const jobs = deployJobs(wf, s);
      expect(jobs.promote).toBe('success');
      expect(jobs['build-push']).toBe('skipped');
      expect(Object.keys(jobs).filter((j) => jobs[j] !== 'skipped' && builds(j))).toEqual([]);
    });
  }

  for (const s of STAGING) {
    it(`${s.label}: build-push runs, promote does not`, () => {
      const jobs = deployJobs(wf, s);
      expect(jobs['build-push']).toBe('success');
      expect(jobs.promote).toBe('skipped');
    });
  }

  it('every job that rolls or migrates an image reads its digest from build-push or promote, and from nothing else', () => {
    for (const job of ['migrate', 'deploy-api']) {
      const digests = (wf.jobs[job]?.steps ?? []).map((st) => st.env?.IMAGE_DIGEST).filter(Boolean);
      expect(digests, job).toEqual(['${{ needs.build-push.outputs.api_digest || needs.promote.outputs.api_digest }}']);
    }
  });
});

const BASE = { AWS_REGION: 'us-east-1', ...TARGETS.production, GITHUB_WORKSPACE: ROOT, GITHUB_SHA: 'c'.repeat(40) };

describe('production runs only what staging verified', () => {
  const find = stepNamed(wf, 'promote', 'Find the image staging verified');
  // A stub aws that knows one tag in staging's repository, when FAKE_VERIFIED is set.
  const awsVerified = `case "$*" in
  *"--registry-id 444455556666"*"--repository-name ${TARGETS.staging.ECR_API_REPO}"*"imageTag=staging-verified-${SHA12}"*) echo "\${FAKE_VERIFIED:-None}" ;;
  *) echo None ;;
esac`;
  const runFind = (env: Record<string, string>) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-find-'));
    const out = path.join(dir, 'out');
    fs.writeFileSync(out, '');
    const r = runShellStep(String(find.run), { ...BASE, VERIFIED_TAG: `staging-verified-${SHA12}`, GITHUB_OUTPUT: out, ...env }, { aws: awsVerified }, shellFor(wf, 'promote', find));
    const written = fs.readFileSync(out, 'utf8');
    fs.rmSync(dir, { recursive: true, force: true });
    return { ...r, written };
  };

  it("hands on the digest staging's smoke test marked", () => {
    const r = runFind({ STAGING_ACCOUNT_ID: '444455556666', FAKE_VERIFIED: DIGEST });
    expect(r.status, r.out).toBe(0);
    expect(r.written).toContain(`digest=${DIGEST}\n`);
    expect(r.written).toContain(`source=444455556666.dkr.ecr.us-east-1.amazonaws.com/${TARGETS.staging.ECR_API_REPO}\n`);
  });

  it('refuses a commit staging never verified, and hands on nothing', () => {
    const r = runFind({ STAGING_ACCOUNT_ID: '444455556666' });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/Staging never verified this commit/);
    expect(r.written).toBe('');
  });

  it.each(['', 'staging', '4444-5555-6666'])('refuses when STAGING_ACCOUNT_ID is %j: production promotes only from staging', (id) => {
    const r = runFind({ STAGING_ACCOUNT_ID: id, FAKE_VERIFIED: DIGEST });
    expect(r.status).not.toBe(0);
    expect(r.written).toBe('');
  });

  const copy = stepNamed(wf, 'promote', "Copy it into production's repository");
  const runCopy = (env: Record<string, string>) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-copy-'));
    const out = path.join(dir, 'out');
    fs.writeFileSync(out, '');
    const state = path.join(dir, 'copied');
    const fakes = {
      aws: `case "$*" in
  *"sts get-caller-identity"*) echo 999988887777 ;;
  *"ecr get-login-password"*) echo token ;;
  *"ecr describe-images"*"imageDigest=${DIGEST}"*) if [ -f "${state}" ] || [ -n "$FAKE_PRESENT" ]; then echo ${DIGEST}; else echo None; fi ;;
  *) echo None ;;
esac`,
      skopeo: `[ -n "$FAKE_COPY_FAILS" ] || touch "${state}"`,
    };
    const r = runShellStep(
      String(copy.run),
      { ...BASE, DIGEST, SOURCE: `444455556666.dkr.ecr.us-east-1.amazonaws.com/${TARGETS.staging.ECR_API_REPO}`, IMAGE_TAG: `sha-${SHA12}`, GITHUB_OUTPUT: out, ...env },
      fakes,
      shellFor(wf, 'promote', copy),
    );
    const written = fs.readFileSync(out, 'utf8');
    fs.rmSync(dir, { recursive: true, force: true });
    return { ...r, written };
  };

  it('copies the image by digest, preserving it, and hands on that digest', () => {
    const r = runCopy({});
    expect(r.status, r.out).toBe(0);
    const call = r.argv.find((a) => a.startsWith('skopeo copy'));
    expect(call).toContain('--preserve-digests');
    expect(call).toContain(`docker://444455556666.dkr.ecr.us-east-1.amazonaws.com/${TARGETS.staging.ECR_API_REPO}@${DIGEST}`);
    expect(call).toContain(`docker://999988887777.dkr.ecr.us-east-1.amazonaws.com/${TARGETS.production.ECR_API_REPO}:sha-${SHA12}`);
    expect(r.written).toBe(`digest=${DIGEST}\n`);
  });

  it('copies nothing on a re-run that finds the digest already there', () => {
    const r = runCopy({ FAKE_PRESENT: '1' });
    expect(r.status, r.out).toBe(0);
    expect(r.argv.some((a) => a.startsWith('skopeo'))).toBe(false);
    expect(r.written).toBe(`digest=${DIGEST}\n`);
  });

  it("fails, handing on nothing, when production's repository does not hold the digest after the copy", () => {
    const r = runCopy({ FAKE_COPY_FAILS: '1' });
    expect(r.status).not.toBe(0);
    expect(r.written).toBe('');
  });
});

describe('staging marks only the image its smoke test passed', () => {
  const smoke = wf.jobs['smoke-test']?.steps ?? [];
  const readiness = smoke.find((st) => (st.name ?? '').startsWith('Readiness through the public URL'));
  const mark = smoke.find((st) => (st.name ?? '').startsWith('Mark the image staging verified'));
  const needsFor = (s: Scenario, digest: string) => ({ resolve: { result: 'success', outputs: resolveOutputs(wf, s) }, 'build-push': { result: 'success', outputs: { api_digest: digest } } });

  it('marks after the readiness check, on staging, for the image this run built', () => {
    expect(readiness && mark).toBeTruthy();
    expect(smoke.indexOf(mark!)).toBeGreaterThan(smoke.indexOf(readiness!));
    for (const s of STAGING) expect(simulateSteps(wf, 'smoke-test', s, undefined, needsFor(s, DIGEST)).ran, s.label).toContain(mark);
  });

  it('does not mark when readiness failed, on production, or when this run built nothing', () => {
    const s = STAGING[0];
    expect(simulateSteps(wf, 'smoke-test', s, readiness, needsFor(s, DIGEST)).ran).not.toContain(mark);
    for (const p of PRODUCTION) expect(simulateSteps(wf, 'smoke-test', p, undefined, needsFor(p, DIGEST)).ran, p.label).not.toContain(mark);
    expect(simulateSteps(wf, 'smoke-test', s, undefined, needsFor(s, '')).ran).not.toContain(mark);
  });

  const runMark = (tagged: string) =>
    runShellStep(
      String(mark?.run),
      { ...TARGETS.staging, DIGEST, VERIFIED_TAG: `staging-verified-${SHA12}`, FAKE_TAGGED: tagged },
      {
        aws: `case "$*" in
  *"ecr describe-images"*) echo "$FAKE_TAGGED" ;;
  *"ecr batch-get-image"*) echo '{"images":[{"imageManifest":"{\\"schemaVersion\\":2}","imageManifestMediaType":"application/vnd.oci.image.index.v1+json"}]}' ;;
esac`,
      },
      shellFor(wf, 'smoke-test', mark!),
    );

  it('puts the tag on the same manifest', () => {
    const r = runMark('None');
    expect(r.status, r.out).toBe(0);
    const put = r.argv.find((a) => a.startsWith('aws ecr put-image'));
    expect(put).toContain(`--image-tag staging-verified-${SHA12}`);
    expect(put).toContain('--image-manifest-media-type application/vnd.oci.image.index.v1+json');
    expect(r.argv.find((a) => a.startsWith('aws ecr batch-get-image'))).toContain(`imageDigest=${DIGEST}`);
  });

  it('does nothing when the tag already marks this image', () => {
    const r = runMark(DIGEST);
    expect(r.status, r.out).toBe(0);
    expect(r.argv.some((a) => a.startsWith('aws ecr put-image'))).toBe(false);
  });

  it('fails when the tag already marks another image (tags are immutable)', () => {
    const r = runMark(`sha256:${'e'.repeat(64)}`);
    expect(r.status).not.toBe(0);
    expect(r.argv.some((a) => a.startsWith('aws ecr put-image'))).toBe(false);
  });
});

describe('each environment is its own', () => {
  it('no job names an environment literally; each deploys to the resolved target', () => {
    const named = Object.entries(wf.jobs).filter(([, j]) => j.environment !== undefined);
    expect(named.length).toBeGreaterThan(0);
    for (const [name, job] of named) expect(job.environment, name).toBe('${{ needs.resolve.outputs.target }}');
  });

  it('provision-database.yml takes its names from deploy-targets.json, for the target it is given', () => {
    const prov = readWorkflow('provision-database.yml');
    const job = Object.values(prov.jobs)[0];
    expect(job.environment).toBe('${{ github.event.inputs.target }}');
    expect((job.steps ?? []).some((st) => /\.github\/deploy-targets\.json/.test(st.run ?? ''))).toBe(true);
  });

  it('the frontend bucket versions, so a bad publish can be reverted (OPS-21)', () => {
    expect(fs.readFileSync(path.join(ROOT, 'terraform/modules/cloudfront/main.tf'), 'utf8')).toMatch(/resource "aws_s3_bucket_versioning" "frontend"/);
  });
});
