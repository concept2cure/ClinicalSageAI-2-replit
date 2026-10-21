/**
 * Health authority questions: the agency letters on this project that ask for
 * a response, each with its questions and a response to each.
 *
 * ── One record (2026-10-18) ──────────────────────────────────────────────────
 * This screen used to read and write its own store: /api/haq-manager, a JSON
 * feature store over project_memory_entries, attached to whichever project the
 * organisation listed first. Its "Approve" set a status with no signature,
 * reason or role check (P-32 kept the screen locked for that), its package was
 * built from those flags, and no endpoint could record a letter, so the store
 * could only ever be empty. That store and its router are deleted.
 *
 * The questions on an agency letter are now agency_communication_questions on
 * the project's agency inbox (concept2cure_agency_communications), worked
 * through AgencyInbox / AgencyResponses: the same cards Communication and
 * Project home's Respond tab show. A response is approved by a Part 11
 * signature over its exact text, by someone other than its author; the letter
 * closes and the package assembles only when every response is signed. This
 * screen is a view of that record, filtered to the letters that ask for a
 * response and are not closed. It owns no data and decides nothing.
 *
 * The surface stays outside the launch catalog (shared/constants/
 * launch-scope.ts): the capability ships in Communication and Respond, and
 * giving it a second home is a catalog decision (P-32, P-36).
 */
import React, { useMemo } from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/commcenter-v2.css';
import { C2CToast, useToast } from '../toast';
import { AgencyInboxList, useAgencyInbox } from './AgencyInbox';

/** The open project, read the way Communication reads it (window.C2C_PROJECT). */
function currentProjectId(): string | null {
  try {
    const p = (window as unknown as { C2C_PROJECT?: { id?: string | number } }).C2C_PROJECT;
    const id = p && p.id != null ? String(p.id).trim() : '';
    return id || null;
  } catch {
    return null;
  }
}

export function HaqManager({ onAsk, onNav }: SurfaceViewProps) {
  const projectId = currentProjectId();
  const [toast, fire] = useToast();
  const inbox = useAgencyInbox(projectId, fire);
  const awaiting = inbox.comms.filter((c) => c.responseRequired && c.closureStatus !== 'closed');

  /* What AnA sees: counts and dates the inbox read returned, and the state of
     that read. Question text is not published here; the cards hold it. */
  const anaContext = useMemo(
    () => ({
      summary: !projectId
        ? 'Health authority questions: no project is open, so no agency letters are shown.'
        : inbox.live.loading
          ? 'Health authority questions: the agency inbox is still loading.'
          : inbox.live.error
            ? 'Health authority questions: the agency inbox could not be read; letters are unavailable, not absent.'
            : `Health authority questions: ${awaiting.length} letter(s) awaiting a response on this project.`,
      facts: {
        inboxState: !projectId ? 'no-project' : inbox.live.loading ? 'loading' : inbox.live.error ? 'error' : 'ready',
        lettersAwaitingResponse: awaiting.length,
        dueDates: awaiting.filter((c) => c.dueDate).map((c) => ({ letter: c.communicationType, due: c.dueDate })),
      },
      availableActions: [
        'Draft a response to a letter with AnA, grounded on the letter',
        'Explain which letters are due first',
      ],
    }),
    [projectId, inbox.live.loading, inbox.live.error, awaiting],
  );
  usePublishSurfaceContext('haq-manager', anaContext);

  return (
    <div className="cv-body">
      <div className="cc-inbox-head">
        <div>
          <div className="reg-eyebrow">PROJECT — AGENCY LETTERS</div>
          <h1 className="haq-title">Health authority questions</h1>
          <p className="haq-sub">
            Letters on this project that ask for a response. Record each question as the agency worded it, write the
            response, and have someone other than its author approve it by signature. The response package is assembled
            from the approved answers.
          </p>
        </div>
      </div>
      {projectId && !inbox.live.loading && !inbox.live.error && awaiting.length === 0 && inbox.comms.length > 0 ? (
        <EmptyState
          icon={I.fileText}
          title="No letter on this project is awaiting a response"
          hint="Every letter that asked for a response has been closed. The full inbox is in Communication."
        />
      ) : (
        <AgencyInboxList
          hasProject={Boolean(projectId)}
          loading={inbox.live.loading}
          error={inbox.live.error}
          rows={awaiting}
          onAdvance={(id) => void inbox.advance(id)}
          onAsk={onAsk}
          onOpenTask={onNav ? () => onNav('tasks') : undefined}
          responses={projectId ? { projectId, fire } : undefined}
          emptyHint="No agency letter has been logged for this project. Log one in Communication, or add it in Respond."
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}
