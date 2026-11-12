/**
 * A failed deploy says which dependency failed (MR-03 Stage 7, OPS-22).
 *
 * In production /readyz answers `{ ready }` alone to the public, and names the
 * dependency that is down only to a caller presenting READYZ_TOKEN
 * (server/startup/readyz.ts). Until 2026-11-11 nothing gave the token to the
 * task or to the deploy's smoke test, so a deployment that was not ready
 * logged `{"ready":false}` and was rolled back, and the reason had to be read
 * out of CloudWatch afterwards.
 *
 * The step runs as written, against stubs of `aws` and `curl`. The token
 * decides only what is printed: the verdict is read from the status and
 * `ready`, the same for every caller.
 */
import { describe, expect, it } from 'vitest';
import { readWorkflow, runShellStep, shellFor, stepNamed } from './workflow-harness';

const wf = readWorkflow('deploy-aws.yml');
const step = stepNamed(wf, 'smoke-test', 'Readiness through the public URL');
const TOKEN = 'r'.repeat(48);
const HOST = 'app.example.com';

/** `aws cloudfront get-distribution` answers the alias. */
const awsStub = `echo "${HOST}"`;
/**
 * `curl`: writes FAKE_BODY where --output says, prints FAKE_STATUS, and records
 * the content of any header file it was given (`--header @file`).
 */
const curlStub = `out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "--output" ]; then out="$a"; fi
  if [ "$prev" = "--header" ]; then
    case "$a" in @*) echo "header-file: $(cat "\${a#@}")" >> "$FAKE_ARGV" ;; esac
  fi
  prev="$a"
done
[ -n "$out" ] && printf '%s' "$FAKE_BODY" > "$out"
printf '%s' "$FAKE_STATUS"`;

const READY_PUBLIC = JSON.stringify({ ready: true });
const READY_DETAIL = JSON.stringify({ ready: true, dependencies: { database: 'ok', storage: 'ok' } });
const DOWN_PUBLIC = JSON.stringify({ ready: false });
const DOWN_DETAIL = JSON.stringify({ ready: false, failed: ['storage'], dependencies: { database: 'ok', storage: 'down' }, storageDetail: 'AccessDenied' });

const run = (env: Record<string, string>) =>
  runShellStep(
    String(step.run),
    { CLOUDFRONT_DISTRIBUTION_ID: 'E2EXAMPLE', ...env },
    { aws: awsStub, curl: curlStub, sleep: ':' },
    shellFor(wf, 'smoke-test', step),
  );
const curls = (argv: string[]) => argv.filter((a) => a.startsWith('curl '));
const headerFiles = (argv: string[]) => argv.filter((a) => a.startsWith('header-file: '));

describe('the smoke test presents the readiness token', () => {
  it("takes it from the environment's READYZ_TOKEN secret", () => {
    expect(wf.jobs['smoke-test']?.env?.READYZ_TOKEN).toBe('${{ secrets.READYZ_TOKEN }}');
  });

  it('sends it in x-readyz-token, from a file, never on the command line', () => {
    const r = run({ READYZ_TOKEN: TOKEN, FAKE_STATUS: '200', FAKE_BODY: READY_DETAIL });
    expect(r.status, r.out).toBe(0);
    expect(headerFiles(r.argv)).toEqual([`header-file: x-readyz-token: ${TOKEN}`]);
    expect(curls(r.argv).length).toBe(1);
    expect(curls(r.argv).join('\n')).not.toContain(TOKEN);
    expect(curls(r.argv)[0]).toContain(`https://${HOST}/readyz`);
  });

  it('prints the dependencies it was shown', () => {
    const r = run({ READYZ_TOKEN: TOKEN, FAKE_STATUS: '200', FAKE_BODY: READY_DETAIL });
    expect(r.out).toMatch(/"storage": "ok"/);
    expect(r.out).not.toMatch(/::warning::/);
  });

  it('a deployment that is not ready fails, and the log names what failed', () => {
    const r = run({ READYZ_TOKEN: TOKEN, FAKE_STATUS: '503', FAKE_BODY: DOWN_DETAIL });
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('"failed":["storage"]');
    expect(r.out).toContain('AccessDenied');
    expect(r.out).toMatch(/::error::https:\/\/app\.example\.com\/readyz did not report ready/);
  });
});

describe('the token decides only what is printed', () => {
  it('without the secret: no header, the verdict is checked the same, and the step says the detail is not shown', () => {
    const r = run({ FAKE_STATUS: '200', FAKE_BODY: READY_PUBLIC });
    expect(r.status, r.out).toBe(0);
    expect(headerFiles(r.argv)).toEqual([]);
    expect(curls(r.argv).join('\n')).not.toMatch(/--header/);
    expect(r.out).toMatch(/::notice::READYZ_TOKEN is not set/);
    expect(r.out).toContain('per-dependency detail not shown');
  });

  it('without the secret: a deployment that is not ready still fails', () => {
    const r = run({ FAKE_STATUS: '503', FAKE_BODY: DOWN_PUBLIC });
    expect(r.status).not.toBe(0);
    expect(curls(r.argv).length).toBe(5);
  });

  it('with the secret: a 200 that is not the verdict (the SPA, an error page) still fails', () => {
    const r = run({ READYZ_TOKEN: TOKEN, FAKE_STATUS: '200', FAKE_BODY: '<!doctype html><html></html>' });
    expect(r.status).not.toBe(0);
    expect(r.out).not.toMatch(/::warning::READYZ_TOKEN was presented/);
  });

  it('a token the deployment does not accept is said, and changes no verdict', () => {
    const ready = run({ READYZ_TOKEN: TOKEN, FAKE_STATUS: '200', FAKE_BODY: READY_PUBLIC });
    expect(ready.status, ready.out).toBe(0);
    expect(ready.out).toMatch(/::warning::READYZ_TOKEN was presented and \/readyz returned no detail/);

    const down = run({ READYZ_TOKEN: TOKEN, FAKE_STATUS: '503', FAKE_BODY: DOWN_PUBLIC });
    expect(down.status).not.toBe(0);
    expect(down.out.match(/::warning::READYZ_TOKEN was presented/g)?.length).toBe(1);
  });
});
