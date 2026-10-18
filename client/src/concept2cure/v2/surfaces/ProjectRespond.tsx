/**
 * Respond: answer the agency (docs/design/FILING_SPINE.md F15).
 *
 * Respond had one card, "Response authoring", which opened the editor with no
 * letter (FILING_SPINE §6 row 17). It is now the three steps of an answer:
 *   1. Add the agency's letter: the data room's own upload (useChatUpload), so
 *      the letter is a project source like any other, AND logged as an agency
 *      communication of this project, linked to that source (2026-10-17).
 *   2. The project's agency inbox: the same list, store and triage action as
 *      Communication (AgencyInbox.tsx). "Draft response with AnA" pins the
 *      communication's letter (window.C2C_SOURCE_PINS, the data room's
 *      handoff), so the turn is grounded on it.
 *   3. Start a response sequence: Submission Center opens on that market's
 *      Sequences tab, with the next sequence's type set to `response`.
 * The response is then reviewed and placed like any other document. AnA
 * invents no question number or due date; the request says so.
 *
 * ── One agency inbox (2026-10-17) ────────────────────────────────────────────
 * The letter used to land in the data room only, and step 2 picked from the
 * data room's sources. Communication kept its own log, so the two screens were
 * two inboxes that never met. The Communication store
 * (concept2cure_agency_communications) is now the record: the upload is logged
 * there through the same writer Communication's "Log communication" uses, and
 * Respond lists what that store holds for the project. A letter logged in
 * Communication shows here; one added here shows there.
 *
 * Replaces ProjectHome's StagePanel for Respond, whose one tool opened the
 * editor with nothing in it (projectRespondStage.test.tsx).
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { I } from '../icons';
import { stashNavParamsForTarget } from '../navParams';
import { useChatUpload, CHAT_UPLOAD_ACCEPT, type ChatAttachment } from '../../hooks/useChatUpload';
import { ComingLater } from './ProjectComingLater';
import { C2CToast, useToast } from '../toast';
import { AgencyInboxList, letterSourceRef, useAgencyInbox, type LogCommunicationBody, type LogResult } from './AgencyInbox';
import type { ProgramMarkets } from './programSequence';

const marketLabel = (m: { title: string; applicationType: string; primaryRegion: string }) =>
  `${m.title} (${m.applicationType.toUpperCase()}, ${m.primaryRegion.toUpperCase()})`;

/**
 * What is known of an uploaded letter, and nothing more: its file name and that
 * it came in as official correspondence. Urgency is the register's required
 * field and starts at medium, as Communication's form does; due date and issues
 * are left for triage, never guessed from a letter nobody has read yet.
 */
export function uploadedLetterCommunication(name: string, sourceId: number): LogCommunicationBody {
  return {
    sourceType: 'uploaded_official_correspondence',
    communicationType: `Agency letter: ${name}`,
    sourceChannel: 'Uploaded in Respond',
    linkedSectionCodes: [],
    linkedArtifactIds: [letterSourceRef(sourceId)],
    urgency: 'medium',
    responseRequired: true,
    extractedIssues: [],
    visibilityTier: 'shared_client_c2c',
  };
}

type LogNote = { name: string; tone: 'ok' | 'error'; text: string; retry?: () => void };

function LetterStep({ pid, log }: { pid: string; log: (b: LogCommunicationBody) => Promise<LogResult> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { attachments, addFiles, uploading, statusMessage } = useChatUpload({ projectId: pid });
  const [notes, setNotes] = useState<LogNote[]>([]);
  // Each upload is logged once; a re-render never logs a second communication.
  const handled = useRef(new Set<string>());

  useEffect(() => {
    const note = (n: LogNote) => setNotes((ns) => [...ns.filter((x) => x.name !== n.name), n]);
    const logOne = async (a: ChatAttachment, sourceId: number) => {
      const r = await log(uploadedLetterCommunication(a.name, sourceId));
      note(r.ok
        ? { name: a.name, tone: 'ok', text: `${a.name} is in the data room and logged in the agency inbox below.` }
        : {
            name: a.name, tone: 'error',
            text: `${a.name} is in the data room, but it was not logged in the agency inbox: ${r.detail}.`,
            retry: () => void logOne(a, sourceId),
          });
    };
    for (const a of attachments) {
      if (a.status !== 'ready' || handled.current.has(a.id)) continue;
      handled.current.add(a.id);
      if (a.sourceId == null) {
        note({ name: a.name, tone: 'error', text: `${a.name} was uploaded, but no data-room source was recorded for it, so it was not logged in the agency inbox.` });
        continue;
      }
      void logOne(a, a.sourceId);
    }
  }, [attachments, log]);

  return (
    <li className="pj-respond-step">
      <h3 className="pj-respond-t">Add the agency's letter</h3>
      <p className="pj-desc">It goes into the project's data room, and is logged in this project's agency inbox, the one Communication shows.</p>
      <input ref={fileRef} type="file" accept={CHAT_UPLOAD_ACCEPT} hidden
        onChange={(e) => { if (e.target.files?.length) addFiles(Array.from(e.target.files)); e.target.value = ''; }} />
      {/* aria-disabled, not disabled: a disabled button drops the focus to the
          page while the upload runs (accessibility review, 2026-10-15). */}
      <button type="button" className="btn ghost" aria-disabled={uploading || undefined}
        onClick={() => { if (!uploading) fileRef.current?.click(); }}>
        {I.upload} {uploading ? 'Adding the letter…' : 'Choose the letter file'}
      </button>
      <div aria-live="polite" className="sr-only">{statusMessage}</div>
      {notes.map((n) => (
        <p key={n.name} className="pj-desc" role={n.tone === 'error' ? 'alert' : 'status'}>
          {n.text}
          {n.retry && <> <button type="button" className="btn ghost" onClick={n.retry}>Log it again</button></>}
        </p>
      ))}
    </li>
  );
}

function InboxStep({ inbox, onAsk, onNav, onAdvance }: {
  inbox: ReturnType<typeof useAgencyInbox>;
  onAsk: (q: string) => void;
  onNav: (id: string) => void;
  onAdvance: (id: string) => void;
}) {
  const open = inbox.comms.filter((c) => c.closureStatus !== 'closed');
  return (
    <li className="pj-respond-step">
      <h3 className="pj-respond-t">The agency's open communications</h3>
      <p className="pj-desc">This project's agency inbox, the same one Communication shows. Draft a response with AnA from a letter, then triage it as the work moves.</p>
      <AgencyInboxList
        hasProject={Boolean(inbox.path)}
        projectId={inbox.path?.split('/')[4]}
        loading={inbox.live.loading}
        error={inbox.live.error}
        rows={open}
        onAdvance={onAdvance}
        onAsk={onAsk}
        onOpenTask={() => onNav('tasks')}
        emptyHint="Nothing open has been logged for this project. Add the agency's letter above, or log a communication in Communication."
      />
      {/* The request tells AnA to use no number or date the letter does not
          state; nothing checks its output, so the person is told to (Part 11
          review, 2026-10-15). */}
      <p className="pj-desc">Check every question number and due date in the draft against the letter before it goes to review.</p>
      <button type="button" className="btn ghost" onClick={() => onNav('communication-center')}>
        Open Communication {I.right}
      </button>
    </li>
  );
}

function SequenceStep({ markets, onNav }: { markets: ProgramMarkets; onNav: (id: string) => void }) {
  const id = useId();
  const rows = markets.list.rows;
  const [chosen, setChosen] = useState<number | null>(null);
  const market = rows.find((m) => m.id === chosen) ?? rows[0] ?? null;
  const open = () => {
    if (!market) return;
    stashNavParamsForTarget('submission-center', { submissionId: String(market.id), ws: 'sequences', followUp: 'response' });
    onNav('submission-center');
  };
  return (
    <li className="pj-respond-step">
      <h3 className="pj-respond-t">Start a response sequence</h3>
      {markets.list.loading ? (
        <p className="pj-desc">Reading this project's submissions…</p>
      ) : markets.list.error ? (
        <p className="pj-desc" role="alert">This project's submissions could not be read, so no market can be chosen.</p>
      ) : rows.length === 0 ? (
        <p className="pj-desc">This project has no submission to respond in yet. Its markets are on the Submit tab.</p>
      ) : rows.length > 1 ? (
        <div className="de-field pj-respond-pick">
          <label className="de-label" htmlFor={`${id}-market`}>The market the letter came from</label>
          <select id={`${id}-market`} className="c2c-input" value={market?.id ?? ''} onChange={(e) => setChosen(Number(e.target.value))}>
            {rows.map((m) => <option key={m.id} value={m.id}>{marketLabel(m)}</option>)}
          </select>
        </div>
      ) : (
        <p className="pj-desc">In {marketLabel(rows[0])}.</p>
      )}
      {/* Submission Center opens with the next sequence's type set to
          response; the person creates it there. */}
      <button type="button" className="btn ghost" disabled={!market} onClick={open}>
        Start a response sequence in Submission Center {I.right}
      </button>
    </li>
  );
}

export function ProjectRespond({ pid, markets, onNav, onAsk }: {
  pid: string;
  markets: ProgramMarkets;
  onNav: (id: string) => void;
  onAsk: (q: string) => void;
}) {
  const [toast, fire] = useToast();
  const inbox = useAgencyInbox(pid, fire);
  return (
    <div className="pj-stagebody">
      <section className="pj-sec" data-testid="pj-respond">
        <div className="pj-sec-h"><h2>Respond</h2><span className="sec-sub">Answer the agency's letter, then place the answer into filing</span></div>
        <ol className="pj-respond">
          <LetterStep pid={pid} log={inbox.log} />
          <InboxStep inbox={inbox} onAsk={onAsk} onNav={onNav} onAdvance={(id) => void inbox.advance(id)} />
          <SequenceStep markets={markets} onNav={onNav} />
        </ol>
      </section>
      <ComingLater stage="respond" />
      <C2CToast msg={toast} />
    </div>
  );
}
