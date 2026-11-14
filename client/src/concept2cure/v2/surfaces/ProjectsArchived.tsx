/**
 * Archived projects, on Projects: open retained records or restore a project (P-122 §3.5).
 *
 * Archive is governed in Project settings (465bc23a8): a reason and a typed word,
 * then POST /api/c2c/projects/:id/archive, after which the project leaves the
 * list. Its counterpart, POST /api/c2c/projects/:id/unarchive, had no caller, so
 * nothing brought an archived project back. This lists the archived projects the
 * person can open (the portfolio read with includeArchived=true, under the same
 * client, client type and pathway filters) and restores one with the archive's
 * own confirmation. The route takes the reason as optional; it is asked here as
 * the archive asks it, so a restore is always explained in the audit trail.
 *
 * Split out of Projects.tsx, which is at the 100 kB file ceiling.
 */
import React, { useRef, useState } from 'react';
import { useAuthUser } from '@/services/portal/authService';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { projectIntakeId } from '@shared/project-intake-workspace';
import { GovernedConfirmDialog } from '../../_shared/components/GovernedConfirmDialog';
import { EmptyState, useLiveRows } from '../dataConnect';
import { I } from '../icons';
import { requestProjectUnarchive } from './projectSettingsRequest';

/** What an archived row needs from the portfolio read (GET /api/c2c/projects). */
export interface ArchivedRow {
  id: string;
  title: string;
  code: string;
  ws?: string;
  status: string;
  activity: string | null;
  client_workspace_id?: number | null;
}

/** The portfolio read, with archived projects and the largest page the route serves. */
export function archivedProjectsUrl(portfolioUrl: string): string {
  return `${portfolioUrl}${portfolioUrl.includes('?') ? '&' : '?'}includeArchived=true&limit=200`;
}

/** The foot of the active list: its own note, then the quiet way to the archived projects. None while they are shown. */
export function ArchivedProjectsLink({ shown, onOpen, children }: { shown: boolean; onOpen: () => void; children?: React.ReactNode }) {
  if (shown) return null;
  return <>{children}<button type="button" className="pj-archived-link" onClick={onOpen}>Archived projects</button></>;
}

export function ArchivedProjects({ portfolioUrl, needle, onBack, onRestored, onOpenProject }: {
  portfolioUrl: string;
  /** The page's search, lower-cased: it narrows these as it narrows the active list. */
  needle: string;
  onBack: () => void;
  /** Open the actual admitted row without changing its archived status. */
  onOpenProject: (project: ArchivedRow) => void;
  /** A project was restored: the portfolio is read again. */
  onRestored: () => void;
}) {
  const user = useAuthUser();
  const actorUserId = projectIntakeId(user?.id);
  const organizationId = projectIntakeId(user?.organizationId);
  const actorKey = `${actorUserId}:${organizationId}`;
  const current = useRef(actorKey);
  current.current = actorKey;
  const [nonce, setNonce] = useState(0);
  const url = archivedProjectsUrl(portfolioUrl);
  const read = useLiveRows<ArchivedRow>(url, [url, nonce]);
  const [restoring, setRestoring] = useState<ArchivedRow | null>(null);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const rows = read.rows.filter((p) => p.status === 'archived'
    && (!needle || p.title.toLowerCase().includes(needle) || p.code.toLowerCase().includes(needle)));
  const truncated = read.meta?.hasMore === true;

  const confirm = async ({ reason }: { reason: string }) => {
    const project = restoring;
    if (!project || !actorUserId || !organizationId) return;
    const capturedKey = actorKey;
    const answer = await requestProjectUnarchive({ programId: project.id, actorUserId, organizationId,
      clientWorkspaceId: project.client_workspace_id ?? null }, () => current.current === capturedKey, reason.trim());
    // As the archive does (ProjectSettings ArchiveControl): the dialog closes on any answer, which is said beside the list.
    setRestoring(null);
    if (answer.kind !== 'restored') { setNote({ error: true, text: answer.message }); return; }
    setNote({ error: false, text: `${project.title} was restored. It is active again, and the restore is recorded in the project’s audit trail.` });
    setNonce((n) => n + 1);
    onRestored();
  };

  return (
    <section className="pj-archived" aria-labelledby="pj-archived-h">
      <div className="pj-archived-head">
        <h2 id="pj-archived-h" className="pj-archived-h">Archived projects</h2>
        <button type="button" className="btn ghost" onClick={onBack}>Back to projects</button>
      </div>
      {note && <p className="pj-archived-note" role={note.error ? 'alert' : 'status'}>{note.text}</p>}
      {read.loading ? (
        <div role="status" className="scaf-note">Loading archived projects…</div>
      ) : read.error ? (
        <EmptyState tone="error" icon={I.alertTriangle} title="The archived projects could not be read"
          hint="This is a failed read, not an empty list." retry={() => setNonce((n) => n + 1)} />
      ) : rows.length === 0 ? (
        <p className="pj-archived-note">{needle ? 'No archived project matches the search.' : 'No archived projects.'}</p>
      ) : (
        <ul className="pj-archived-list">
          {rows.map((p) => (
            <li key={p.id} className="pj-archived-row">
              <span className="pj-archived-t">{p.title}</span>
              <span className="pj-archived-m">{[p.code && p.code !== '—' ? p.code : null, 'Archived', p.activity].filter(Boolean).join(' · ')}</span>
              <button type="button" className="btn ghost" aria-label={`Open ${p.title}`}
                onClick={() => onOpenProject(p)}>Open</button>
              <button type="button" className="btn ghost" aria-label={`Restore ${p.title}`}
                disabled={!actorUserId || !organizationId}
                onClick={() => { setNote(null); setRestoring(p); }}>Restore</button>
            </li>
          ))}
        </ul>
      )}
      {truncated && !read.loading && !read.error && (
        <p className="pj-archived-note" role="status">Showing the archived projects among the first 200 projects. Narrow the filters to see others.</p>
      )}
      <GovernedConfirmDialog open={restoring !== null} action="Restore project"
        target={restoring ? `${restoring.title} · returns to active, records kept` : ''}
        minReason={GOVERNED_REASON_MIN} confirmWord="restore"
        onCancel={() => setRestoring(null)} onConfirm={confirm} />
    </section>
  );
}
