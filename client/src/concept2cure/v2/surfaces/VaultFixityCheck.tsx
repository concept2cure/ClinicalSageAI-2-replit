/**
 * Check stored files: re-prove every stored version of this project's Vault
 * against the SHA-256 recorded when it was received (plan critique 15, D5).
 *
 * POST /api/c2c/project-vault/:id/fixity reads each version through the same
 * verifier a download uses and writes each verdict to the audit chain
 * (vault-fixity.ts). The answer here is the server's: how many were checked,
 * how many were proven intact, and every version that was not, by name. A
 * check that did not finish is said not to have finished; it never reads as
 * "all intact".
 */
import React, { useState } from 'react';
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';

type Verdict = 'verified' | 'altered' | 'missing' | 'unreadable' | 'unverifiable';

export interface FixityShape {
  checkedAt: string;
  checked: number;
  counts: Record<Verdict, number>;
  findings: Array<{ documentId: string; title: string | null; version: string | null; verdict: Exclude<Verdict, 'verified'> }>;
  truncated: boolean;
}

const VERDICT_TEXT: Record<Exclude<Verdict, 'verified'>, string> = {
  altered: 'its stored file no longer matches the SHA-256 recorded for it',
  missing: 'its stored file could not be found',
  unreadable: 'the store it was saved in cannot be opened from this server',
  unverifiable: 'no SHA-256 was recorded for it, so it cannot be proven',
};

const NOT_CHECKED = 'The check did not run.';
const UNKNOWN = 'The connection dropped, so it is not known how far the check got. Each verdict it recorded is in that document’s history.';

/** The run in one sentence. */
export function fixitySummary(d: FixityShape): string {
  const at = d.checkedAt.slice(0, 16).replace('T', ' ');
  const failed = d.checked - d.counts.verified;
  const base = failed === 0
    ? `Checked ${d.checked} stored version${d.checked === 1 ? '' : 's'} at ${at} UTC: every one matches its recorded SHA-256.`
    : `Checked ${d.checked} stored version${d.checked === 1 ? '' : 's'} at ${at} UTC: ${d.counts.verified === 1 ? '1 matches its' : `${d.counts.verified} match their`} recorded SHA-256, ${failed} could not be proven.`;
  return d.truncated ? `${base} This project has more versions than one check covers; run it again for the rest.` : base;
}

async function runCheck(projectId: string): Promise<FixityShape> {
  let res: Response;
  try {
    res = await apiRequest('POST', `/api/c2c/project-vault/${encodeURIComponent(projectId)}/fixity`, {});
  } catch (e) {
    if (e instanceof ApiRequestError) throw new Error(`${NOT_CHECKED} ${redactInternals(serverMessage(e.payload), e.message)}`, { cause: e });
    throw new Error(UNKNOWN, { cause: e });
  }
  const body = (await res.json().catch(() => null)) as { data?: FixityShape } | null;
  if (!res.ok) throw new Error(`${NOT_CHECKED} ${redactInternals(serverMessage(body), `The Vault refused it (HTTP ${res.status}).`)}`);
  if (!body?.data || typeof body.data.checked !== 'number') throw new Error(UNKNOWN);
  return body.data;
}

export function VaultFixityCheck({ projectId }: { projectId: string | null }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FixityShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!projectId) return null;
  const check = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await runCheck(projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : UNKNOWN);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="vd-fix" data-testid="vault-fixity">
      <div className="vd-dr-head">
        <span className="vd-dr-title">{I.shieldCheck} Stored files</span>
        <span className="vd-dr-meta">Re-reads every stored version and checks it against the SHA-256 recorded when it was received. Each result is recorded.</span>
        <button className="sp-ask" onClick={() => void check()} disabled={busy}>
          {busy ? 'Checking…' : 'Check stored files'}
        </button>
      </div>
      {error ? <div className="vd-dr-err" role="alert">{I.alertTriangle} {error}</div> : null}
      {result ? (
        <div className="vd-dr-file-result" role="status">
          <span className={result.findings.length ? 'vd-dr-file-partial' : 'vd-dr-meta'}>{fixitySummary(result)}</span>
          {result.findings.length ? (
            <ul>
              {result.findings.map((f) => (
                <li key={f.documentId} className="vd-dr-file-refused">
                  <b>{f.title ?? 'Untitled'}{f.version ? ` v${f.version}` : ''}</b>: {VERDICT_TEXT[f.verdict]}.
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
