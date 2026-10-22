import React from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { EmptyState, useLiveData } from '../dataConnect';
import { cmcProjectId } from './cmcShared';

const LINK_EVENT = 'c2c:cmc-register-linkage';
const FAILED_LINK = 'Saved to the register, but its Module 3 link is incomplete. Retry the link before compiling.';
interface LinkReceipt { warning: string | null; label: string }
interface LinkRow { register: string; recordId: string; label: string; state: 'linked' | 'missing' | 'outdated' | 'unfiled'; retryable: boolean }
interface LinkRead { links: LinkRow[] }

/** Consume the receipt separately from success/data, and ask the durable
 * register read to refresh. A success status alone says nothing about linkage. */
export function reportCmcLinkage(json: unknown, label: string): string | null {
  const value = json as { module3Linked?: unknown; module3Warning?: unknown } | null;
  if (typeof value?.module3Linked !== 'boolean') return null;
  const warning = value.module3Linked ? null : typeof value.module3Warning === 'string' && value.module3Warning.trim() ? value.module3Warning : FAILED_LINK;
  window.dispatchEvent(new CustomEvent<LinkReceipt>(LINK_EVENT, { detail: { warning, label } }));
  return warning;
}

function isLinkRead(value: unknown): value is LinkRead {
  const links = (value as Partial<LinkRead> | null)?.links;
  return Array.isArray(links) && links.every((row) => row && typeof row.register === 'string' && typeof row.recordId === 'string' && typeof row.label === 'string' && typeof row.retryable === 'boolean' && ['linked', 'missing', 'outdated', 'unfiled'].includes(row.state));
}

function showLinks(projectId: string | undefined, receipt: LinkReceipt | null, error: unknown, pending: LinkRow[], note: string | null): boolean {
  return Boolean(projectId || receipt?.warning) && Boolean(receipt?.warning || error || pending.length || note);
}

/** Kept above the tabs: pending links survive both tab switches and reloads.
 * The server derives them from the saved register and canonical hashes. */
export function CmcRegisterLinks({ onRecovered }: { onRecovered?: () => void }) {
  const projectId = cmcProjectId();
  const [revision, setRevision] = React.useState(0);
  const [receipt, setReceipt] = React.useState<LinkReceipt | null>(null);
  const [retrying, setRetrying] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const path = projectId ? `/api/cmc/module3-os/register-links/${encodeURIComponent(projectId)}` : null;
  const read = useLiveData<LinkRead>(path, [path, revision], isLinkRead);
  React.useEffect(() => {
    const changed = (event: Event) => {
      setReceipt((event as CustomEvent<LinkReceipt>).detail);
      setRevision((n) => n + 1);
    };
    window.addEventListener(LINK_EVENT, changed);
    return () => window.removeEventListener(LINK_EVENT, changed);
  }, []);
  React.useEffect(() => { setReceipt(null); setNote(null); }, [projectId]);
  const pending = read.data?.links.filter((row) => row.state !== 'linked') ?? [];

  const retry = async (row: LinkRow) => {
    if (!path || retrying) return;
    const identity = `${row.register}:${row.recordId}`;
    setRetrying(identity); setNote(null);
    try {
      const response = await apiRequest('POST', `${path}/${encodeURIComponent(row.register)}/${encodeURIComponent(row.recordId)}/retry`, {});
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(serverMessage(json) ?? 'The server refused the retry.');
      if (json?.module3Linked !== true) {
        setNote(typeof json?.module3Warning === 'string' ? json.module3Warning : FAILED_LINK);
        return;
      }
      setReceipt(null); setRevision((n) => n + 1);
      setNote(`${row.label} now feeds Module 3. Recompile its affected sections before approval or export.`);
      onRecovered?.();
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'The Module 3 link could not be retried.');
    } finally { setRetrying(null); }
  };

  if (!showLinks(projectId, receipt, read.error, pending, note)) return null;
  return (
    <section className="pj-card" style={{ margin: '12px 24px' }} aria-label="Module 3 register links">
      <div className="pj-card-h"><span className="t">Module 3 register links</span><span className="s">saved records and dossier sources</span></div>
      <div className="pj-card-b">
        {receipt?.warning && <div role="alert">{receipt.label}: {receipt.warning}</div>}
        {read.error && <EmptyState tone="error" icon={null} title="Couldn’t verify the saved records’ Module 3 links" hint="The link record could not be read. Register saves remain recorded; dossier linkage is unknown until this check succeeds." retry={() => setRevision((n) => n + 1)} />}
        {pending.length > 0 && <ul style={{ margin: 0, paddingLeft: 20 }}>
          {pending.map((row) => <li key={`${row.register}:${row.recordId}`} style={{ marginBottom: 8 }}>
            <b>{row.label}</b> — {row.state === 'unfiled' ? 'no program recorded; edit the record to file it under its program' : row.state === 'outdated' ? 'the dossier source is older than the saved record' : 'the saved record has no dossier source'}.
            {row.retryable && <button type="button" className="nda-open" style={{ marginLeft: 8 }} disabled={retrying !== null} onClick={() => void retry(row)}>{retrying === `${row.register}:${row.recordId}` ? 'Retrying…' : 'Retry Module 3 link'}</button>}
          </li>)}
        </ul>}
        {note && <div role="status" style={{ marginTop: 8 }}>{note}</div>}
      </div>
    </section>
  );
}
