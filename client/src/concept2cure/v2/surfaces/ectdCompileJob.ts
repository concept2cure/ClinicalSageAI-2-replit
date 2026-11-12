/**
 * Following a compile job: split out of EctdCompile.tsx (MR-03 Stage 6 step 6, OPS-17).
 *
 * A compile behind CloudFront and the ALB is cut at 60 s, and a 200-leaf IND
 * compiled in about a minute (docs/evidence/D1/2026-11-12-edge-timeouts/). So
 * the compile asks to be answered at once (Prefer: respond-async): the server
 * answers 202 with a job and goes on, and this polls the job every 2 s until it
 * ends. A server that answers synchronously is handled as before. The screen
 * hands in its own request reader and refusal wording, so there is one of each.
 */

export const COMPILE_ASYNC = { Prefer: 'respond-async' };
export const COMPILE_POLL_MS = 2000;

export interface CompileJobAccepted<R> { jobId: string; status: 'running'; result?: R }
type CompileJob<R> =
  | { status: 'running' }
  | { status: 'completed'; result: R }
  | { status: 'failed'; error: string };

type ReadJson = <T>(method: 'GET' | 'POST', path: string, body?: unknown, headers?: Record<string, string>) =>
  Promise<{ ok: boolean; status: number; body: T | null }>;

/** Poll a compile job until it ends; an unreadable poll is an error, never an empty result. */
export async function awaitCompileJob<R>(
  identPath: string,
  jobId: string,
  stillWanted: () => boolean,
  onElapsed: (seconds: number) => void,
  readJson: ReadJson,
): Promise<{ result: R } | { error: string } | null> {
  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, COMPILE_POLL_MS));
    if (!stillWanted()) return null;
    onElapsed(Math.round((Date.now() - started) / 1000));
    const { ok, status, body } = await readJson<CompileJob<R>>('GET', `/api/ectd-compile/${identPath}/jobs/${encodeURIComponent(jobId)}`);
    if (!stillWanted()) return null;
    if (!ok || !body) {
      return { error: `The compile's progress could not be read (HTTP ${status || 'no answer'}). It may still finish: its result will be in the compilation history.` };
    }
    if (body.status === 'completed') return { result: body.result };
    if (body.status === 'failed') return { error: body.error };
  }
}

/**
 * What a compile request came to: the result, answered at once or by its job;
 * an error to say; or null when the person moved on before it ended.
 */
export async function compileOutcome<R>(
  answered: { ok: boolean; status: number; body: R | CompileJobAccepted<R> | null },
  identPath: string,
  stillWanted: () => boolean,
  onElapsed: (seconds: number) => void,
  screen: { readJson: ReadJson; failureWords: (status: number, body: unknown) => string },
): Promise<{ result: R } | { error: string; fromJob: boolean } | null> {
  if (!answered.ok || !answered.body) return { error: screen.failureWords(answered.status, answered.body), fromJob: false };
  const body = answered.body as R | CompileJobAccepted<R>;
  if (answered.status !== 202 || typeof body !== 'object' || body === null || !('jobId' in body)) return { result: body as R };
  onElapsed(0);
  const ended = await awaitCompileJob<R>(identPath, (body as CompileJobAccepted<R>).jobId, stillWanted, onElapsed, screen.readJson);
  if (!ended) return null;
  return 'error' in ended ? { error: ended.error, fromJob: true } : ended;
}
