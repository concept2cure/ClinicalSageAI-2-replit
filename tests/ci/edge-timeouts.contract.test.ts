/**
 * The three timeouts at the edge hold in one order (MR-03 Stage 6 step 3, OPS-17).
 *
 *   CloudFront origin_read_timeout  =  ALB idle_timeout  <  keepAliveTimeout  <  headersTimeout
 *   (terraform/modules/cloudfront)     (terraform/modules/alb)   (server/index.ts)
 *
 * - A server that closes an idle connection before the ALB does leaves the ALB
 *   holding a dead socket, and the next request on it is a 502.
 * - An ALB that idles for less than CloudFront waits cuts a slow response
 *   CloudFront would still have delivered; one that idles longer than the
 *   server's keep-alive brings the 502 back.
 * - A headersTimeout at or under keepAliveTimeout truncates the keep-alive
 *   window.
 *
 * The ALB's own value is pinned by terraform/modules/alb/tests/alb_timeouts.tftest.hcl
 * and CloudFront's by modules/cloudfront/tests/alb_origin.tftest.hcl. Nothing
 * held the three to each other: each lives in a different file and is changed
 * by a different lane. The rule is a function, so it is shown refusing each
 * way the order can break, not only passing on today's tree.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

export interface EdgeSources {
  serverIndex: string;
  albModule: string;
  cloudfrontModule: string;
  /** Every Terraform file that can set the API task's environment. */
  taskEnvironment: string;
}

const one = (source: string, re: RegExp, what: string): number => {
  const matches = [...source.matchAll(re)];
  if (matches.length !== 1) throw new Error(`expected exactly one ${what}, found ${matches.length}`);
  return Number(matches[0][1].replace(/_/g, ''));
};

/** The ways the edge's timeouts disagree; empty when they hold. */
export function edgeTimeoutProblems(src: EdgeSources): string[] {
  const keepAliveMs = one(src.serverIndex, /httpServer\.keepAliveTimeout = Number\(process\.env\.HTTP_KEEP_ALIVE_TIMEOUT_MS \|\| ([0-9_]+)\)/g, 'keepAliveTimeout default in server/index.ts');
  const headersMs = one(src.serverIndex, /httpServer\.headersTimeout = Number\(process\.env\.HTTP_HEADERS_TIMEOUT_MS \|\| ([0-9_]+)\)/g, 'headersTimeout default in server/index.ts');
  const albIdleS = one(src.albModule, /^\s*idle_timeout\s*=\s*([0-9]+)\s*$/gm, 'idle_timeout in terraform/modules/alb/main.tf');
  const originReadS = one(src.cloudfrontModule, /^\s*origin_read_timeout\s*=\s*([0-9]+)\s*$/gm, 'origin_read_timeout in terraform/modules/cloudfront/main.tf');

  const problems: string[] = [];
  if (originReadS !== albIdleS) {
    problems.push(`CloudFront waits ${originReadS} s for the origin and the ALB idles for ${albIdleS} s: they must be equal`);
  }
  if (keepAliveMs <= albIdleS * 1000) {
    problems.push(`the server's keepAliveTimeout (${keepAliveMs} ms) is not above the ALB's idle_timeout (${albIdleS} s): the ALB reuses connections the server has closed (502)`);
  }
  if (headersMs <= keepAliveMs) {
    problems.push(`headersTimeout (${headersMs} ms) is not above keepAliveTimeout (${keepAliveMs} ms)`);
  }
  // The defaults are what a deployment runs only while the task does not override them.
  for (const name of ['HTTP_KEEP_ALIVE_TIMEOUT_MS', 'HTTP_HEADERS_TIMEOUT_MS']) {
    if (src.taskEnvironment.includes(name)) {
      problems.push(`terraform sets ${name}: the task would run a value this check does not read`);
    }
  }
  return problems;
}

const tfFiles = (dir: string): string =>
  fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.tf')).map((f) => read(path.join(dir, f))).join('\n');

const tree = (): EdgeSources => ({
  serverIndex: read('server/index.ts'),
  albModule: read('terraform/modules/alb/main.tf'),
  cloudfrontModule: read('terraform/modules/cloudfront/main.tf'),
  taskEnvironment: [tfFiles('terraform/stack'), tfFiles('terraform/modules/ecs-fargate')].join('\n'),
});

describe('the edge timeouts on this tree', () => {
  it('CloudFront = ALB < keepAliveTimeout < headersTimeout, and the task overrides neither server value', () => {
    expect(edgeTimeoutProblems(tree())).toEqual([]);
  });
});

describe('the rule refuses each way the order breaks', () => {
  const base = tree();

  it('an ALB that idles longer than the server keeps connections alive', () => {
    const problems = edgeTimeoutProblems({ ...base, albModule: base.albModule.replace(/idle_timeout = 60/, 'idle_timeout = 120'), cloudfrontModule: base.cloudfrontModule.replace(/origin_read_timeout = 60/, 'origin_read_timeout = 120') });
    expect(problems).toEqual([expect.stringMatching(/keepAliveTimeout \(65000 ms\) is not above the ALB's idle_timeout \(120 s\)/)]);
  });

  it('an ALB and a CloudFront that disagree', () => {
    const problems = edgeTimeoutProblems({ ...base, albModule: base.albModule.replace(/idle_timeout = 60/, 'idle_timeout = 59') });
    expect(problems).toEqual([expect.stringMatching(/CloudFront waits 60 s for the origin and the ALB idles for 59 s/)]);
  });

  it('a server keep-alive at the ALB idle timeout', () => {
    const problems = edgeTimeoutProblems({ ...base, serverIndex: base.serverIndex.replace('HTTP_KEEP_ALIVE_TIMEOUT_MS || 65_000', 'HTTP_KEEP_ALIVE_TIMEOUT_MS || 60_000') });
    expect(problems).toEqual([expect.stringMatching(/keepAliveTimeout \(60000 ms\) is not above/)]);
  });

  it('a headersTimeout under the keep-alive', () => {
    const problems = edgeTimeoutProblems({ ...base, serverIndex: base.serverIndex.replace('HTTP_HEADERS_TIMEOUT_MS || 66_000', 'HTTP_HEADERS_TIMEOUT_MS || 65_000') });
    expect(problems).toEqual([expect.stringMatching(/headersTimeout \(65000 ms\) is not above keepAliveTimeout/)]);
  });

  it('a task definition that overrides the server value', () => {
    const problems = edgeTimeoutProblems({ ...base, taskEnvironment: `${base.taskEnvironment}\n{ name = "HTTP_KEEP_ALIVE_TIMEOUT_MS", value = "5000" },` });
    expect(problems).toEqual([expect.stringMatching(/terraform sets HTTP_KEEP_ALIVE_TIMEOUT_MS/)]);
  });

  it('a source it can no longer read is an error, not a pass', () => {
    expect(() => edgeTimeoutProblems({ ...base, albModule: base.albModule.replace(/idle_timeout = 60/, '') })).toThrow(/expected exactly one idle_timeout/);
  });
});
