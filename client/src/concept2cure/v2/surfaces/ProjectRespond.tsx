/**
 * Respond: answer the agency (docs/design/FILING_SPINE.md F15).
 *
 * Respond had one card, "Response authoring", which opened the editor with no
 * letter (FILING_SPINE §6 row 17). It is now the three steps of an answer:
 *   1. Add the agency's letter: the data room's own upload (useChatUpload), so
 *      the letter is a project source like any other.
 *   2. Draft the response with AnA: the letter chosen is pinned
 *      (window.C2C_SOURCE_PINS, the data room's handoff), so the turn is
 *      grounded on it. Only a source whose text can ground a draft is offered.
 *   3. Start a response sequence: Submission Center opens on that market's
 *      Sequences tab, with the follow-up type `response`.
 * The response is then reviewed and placed like any other document. AnA
 * invents no question number or due date; the request says so.
 *
 * Replaces ProjectHome's StagePanel for Respond, whose one tool opened the
 * editor with nothing in it; drafting now reaches the editor through AnA's
 * canvas with the letter in hand (projectRespondStage.test.tsx).
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { I } from '../icons';
import { useLiveData } from '../dataConnect';
import { stashNavParamsForTarget } from '../navParams';
import { useChatUpload, CHAT_UPLOAD_ACCEPT } from '../../hooks/useChatUpload';
import { isSourcesPage, sourceCanGround, sourcesUrl, type SourcesPage } from './projectSources';
import { ComingLater } from './ProjectComingLater';
import type { ProgramMarkets } from './programSequence';

const marketLabel = (m: { title: string; applicationType: string; primaryRegion: string }) =>
  `${m.title} (${m.applicationType.toUpperCase()}, ${m.primaryRegion.toUpperCase()})`;

function LetterStep({ pid, onAsk }: { pid: string; onAsk: (q: string) => void }) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reload, setReload] = useState(0);
  const { attachments, addFiles, uploading, statusMessage } = useChatUpload({ projectId: pid });
  const settled = attachments.length > 0 && attachments.every((a) => a.status !== 'uploading');
  useEffect(() => { if (settled) setReload((k) => k + 1); }, [settled]);

  const read = useLiveData<SourcesPage>(sourcesUrl(pid, '', 0), [pid, reload], isSourcesPage);
  const letters = (read.data?.sources ?? []).filter(sourceCanGround);
  const [chosen, setChosen] = useState<number | null>(null);
  const letter = letters.find((s) => s.id === chosen) ?? letters[0] ?? null;

  const draft = () => {
    if (!letter) return;
    window.C2C_SOURCE_PINS = [String(letter.id)];
    onAsk(
      `Draft a response to the agency's letter "${letter.title ?? `source ${letter.id}`}" in this project's data room. ` +
      'Answer each question it asks, quoting the question. Use no question number or due date the letter does not state.',
    );
  };

  return (
    <>
      <li className="pj-respond-step">
        <h3 className="pj-respond-t">Add the agency's letter</h3>
        <p className="pj-desc">It goes into the project's data room, read like any other source.</p>
        <input ref={fileRef} type="file" accept={CHAT_UPLOAD_ACCEPT} hidden
          onChange={(e) => { if (e.target.files?.length) addFiles(Array.from(e.target.files)); e.target.value = ''; }} />
        {/* aria-disabled, not disabled: a disabled button drops the focus to the
            page while the upload runs (accessibility review, 2026-10-15). */}
        <button type="button" className="btn ghost" aria-disabled={uploading || undefined}
          onClick={() => { if (!uploading) fileRef.current?.click(); }}>
          {I.upload} {uploading ? 'Adding the letter…' : 'Choose the letter file'}
        </button>
        <div aria-live="polite" className="sr-only">{statusMessage}</div>
      </li>
      <li className="pj-respond-step">
        <h3 className="pj-respond-t">Draft the response with AnA</h3>
        {read.loading ? (
          <p className="pj-desc">Reading the data room…</p>
        ) : read.error || !read.data ? (
          <p className="pj-desc" role="alert">The data room could not be read, so no letter can be chosen.</p>
        ) : letters.length === 0 ? (
          <p className="pj-desc">No letter in the data room has readable text yet. Add the letter, or wait until it has been read.</p>
        ) : (
          <div className="de-field pj-respond-pick">
            <label className="de-label" htmlFor={`${id}-letter`}>The agency's letter</label>
            <select id={`${id}-letter`} className="c2c-input" value={letter?.id ?? ''} onChange={(e) => setChosen(Number(e.target.value))}>
              {letters.map((s) => <option key={s.id} value={s.id}>{s.title ?? `Source ${s.id}`}</option>)}
            </select>
          </div>
        )}
        <button type="button" className="btn ghost" disabled={!letter} onClick={draft}>
          {I.sparkles} Draft the response with AnA
        </button>
        {/* The request tells AnA to use no number or date the letter does not
            state; nothing checks its output, so the person is told to (Part 11
            review, 2026-10-15). */}
        <p className="pj-desc">Check every question number and due date in the draft against the letter before it goes to review.</p>
      </li>
    </>
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
      <button type="button" className="btn ghost" disabled={!market} onClick={open}>
        Start a response sequence {I.right}
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
  return (
    <div className="pj-stagebody">
      <section className="pj-sec" data-testid="pj-respond">
        <div className="pj-sec-h"><h2>Respond</h2><span className="sec-sub">Answer the agency's letter, then place the answer into filing</span></div>
        <ol className="pj-respond">
          <LetterStep pid={pid} onAsk={onAsk} />
          <SequenceStep markets={markets} onNav={onNav} />
        </ol>
      </section>
      <ComingLater stage="respond" />
    </div>
  );
}
