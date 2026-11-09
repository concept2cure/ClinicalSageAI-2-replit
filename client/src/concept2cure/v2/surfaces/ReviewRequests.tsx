/**
 * Artifact reviews you were named for, on the Review screen beside your threads (ReviewThreads.tsx).
 *
 * P-95 (review before approval) is applied to an AnA artifact through its own review: its author names
 * reviewers from the artifact's card in the conversation (ConversationArtifactReview.tsx). The named
 * reviewer is someone else, and a conversation is its owner's, so the card is not where they can decide.
 * The server already lists a person's pending artifact reviews, and no screen read it:
 *
 *   GET /api/concept2cure/reviews/pending                                 the reviews waiting on you
 *   GET /api/concept2cure/projects/:p/artifacts/:a/versions                the text of the version under review
 *
 * Opening a request shows that version's text and the artifact's review step, where a named reviewer
 * decides (POST …/reviews/submit). Found by walking the running app on 2026-11-09: the reviewer's queue
 * (`/reviews/my-queue`) and Home listed nothing for an assignment `/reviews/pending` returned.
 */
import React, { useState } from 'react';
import { EmptyState, useLiveData } from '../dataConnect';
import { I } from '../icons';
import type { FireToast } from '../toast';
import { ConversationArtifactReview } from './ConversationArtifactReview';

export interface PendingReview {
  assignmentId: string;
  artifactId: string;
  artifactTitle: string | null;
  artifactVersion: number | null;
  projectId: number;
  reviewRound: number;
  notes: string | null;
  dueDate: string | null;
}
interface PendingPayload { totalPending: number; assignments: PendingReview[] }
interface VersionsPayload { versions: Array<{ version: number; content: string | null }> }

function VersionUnderReview({ request }: { request: PendingReview }) {
  const path = `/api/concept2cure/projects/${encodeURIComponent(String(request.projectId))}`
    + `/artifacts/${encodeURIComponent(request.artifactId)}/versions`;
  const versions = useLiveData<VersionsPayload>(path, ['rr-versions', path]);
  if (versions.loading) return <div role="status" className="scaf-note">Reading the version under review…</div>;
  if (versions.error) return <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't read the text under review" hint={versions.error} />;
  const wanted = request.artifactVersion;
  const shown = versions.data?.versions.find(v => v.version === wanted);
  if (!shown) return <div className="scaf-note">Version {wanted ?? '—'} is not in this artifact&apos;s history, so there is no text to review.</div>;
  return (
    <div>
      <div className="dr-seclbl" style={{ padding: '8px 0 4px' }}>Version {shown.version}</div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-caption)', color: 'var(--text-200)' }}>{shown.content || ''}</div>
    </div>
  );
}

export function ReviewRequests({ onNotice }: { onNotice: FireToast }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const pending = useLiveData<PendingPayload>('/api/concept2cure/reviews/pending', ['rr-pending', refreshKey]);
  const requests = pending.data?.assignments ?? [];
  if (pending.loading) return <div role="status" className="scaf-note" style={{ padding: '10px 4px' }}>Reading your review requests…</div>;
  if (pending.error) {
    return <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't read your review requests" hint={pending.error} />;
  }
  if (!requests.length) return null;
  const selected = requests.find(r => r.assignmentId === open) ?? null;
  return (
    <section aria-label="Reviews you were named for" style={{ marginTop: 20 }}>
      <div className="dr-seclbl" style={{ padding: '0 0 8px' }}>
        Reviews you were named for · {requests.length}
      </div>
      <div className="split">
        <div className="split-list">
          {requests.map(r => (
            <button key={r.assignmentId} className="lrow" data-on={open === r.assignmentId || undefined}
              onClick={() => setOpen(open === r.assignmentId ? null : r.assignmentId)}>
              <div className="lrow-top"><span className="mono">round {r.reviewRound}</span></div>
              <div className="lrow-title">{r.artifactTitle || 'AnA artifact'}</div>
              {r.notes && <div className="lrow-meta"><span>{r.notes}</span></div>}
            </button>
          ))}
        </div>
        {selected && (
          <div>
            <VersionUnderReview request={selected} />
            <ConversationArtifactReview projectId={selected.projectId} artifactId={selected.artifactId}
              title={selected.artifactTitle || 'AnA artifact'} fireToast={onNotice} canName={false} />
            <button className="btn ghost" style={{ height: 26, marginTop: 8 }} onClick={() => setRefreshKey(k => k + 1)}>
              Refresh your review requests
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
