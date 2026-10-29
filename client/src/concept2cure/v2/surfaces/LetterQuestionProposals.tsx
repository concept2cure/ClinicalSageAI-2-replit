/**
 * The questions the agency letter's own text numbers, offered for a person to
 * record (G3; server letter-question-proposals.ts). Nothing here writes: "Record"
 * opens the same Record-a-question form, filled with the agency's number and
 * words, and the person records it with a reason. The text is found without a
 * model (shared/agency/letter-questions.ts) and shown verbatim.
 *
 * A letter with no file in the data room shows nothing. A file whose text the
 * data room has not read, or that is not this project's, says so: never "no
 * questions".
 *
 * @module client/src/concept2cure/v2/surfaces/LetterQuestionProposals
 */
import React from 'react';
import { useLiveData, type DataReadOwner } from '../dataConnect';

export interface LetterQuestionProposal {
  sourceId: number; ref: string; text: string; start: number; end: number; recordedQuestionId: number | null;
}
interface ProposalsPayload {
  sources: Array<{ sourceId: number; title: string | null; state: 'read' | 'no-text' | 'not-found' }>;
  proposals: LetterQuestionProposal[];
}

function isPayload(v: unknown): v is ProposalsPayload {
  const p = v as ProposalsPayload | null;
  return !!p && Array.isArray(p.sources) && Array.isArray(p.proposals);
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function LetterQuestionProposals({ base, version, readOwner, disabled, onRecord }: {
  base: string;
  version: number;
  readOwner: DataReadOwner;
  disabled: boolean;
  onRecord: (p: LetterQuestionProposal) => void;
}) {
  const read = useLiveData<ProposalsPayload>(`${base}/question-proposals`, [base, version], isPayload, readOwner);
  if (read.loading && !read.data) return null;
  if (read.error && !read.data) {
    return <p className="cc-q-note" role="note">The letter's text could not be read for its questions. Record each question by hand.</p>;
  }
  const data = read.data;
  if (!data || data.sources.length === 0) return null;
  const unread = data.sources.filter((s) => s.state !== 'read');
  const open = data.proposals.filter((p) => p.recordedQuestionId === null);
  const readCount = data.sources.length - unread.length;
  return (
    <div className="cc-q-proposals" data-testid="letter-question-proposals">
      {unread.map((s) => (
        <p key={s.sourceId} className="cc-q-note" role="note">
          {s.state === 'no-text'
            ? `The data room has not read the text of ${s.title ?? `source ${s.sourceId}`}, so its questions are not listed. Record them by hand.`
            : `Source ${s.sourceId} is not a file in this project's data room, so it was not read.`}
        </p>
      ))}
      {readCount > 0 && data.proposals.length === 0 && (
        <p className="cc-q-note" role="note">No numbered questions were found in the letter's text. Record each question by hand.</p>
      )}
      {data.proposals.length > 0 && (
        <>
          <p className="cc-q-note">
            In the letter: {data.proposals.length} numbered question{data.proposals.length === 1 ? '' : 's'}, found in its
            text without AI. {open.length === 0 ? 'Each is recorded.' : 'Check each against the letter, then record it with a reason.'}
          </p>
          <ul className="cc-q-proposal-list">
            {data.proposals.map((p) => (
              <li key={`${p.sourceId}:${p.start}`} className="cc-q-proposal">
                <span className="cc-comm-t">{p.ref}</span>{' '}
                <span title={p.text}>{clip(p.text, 220)}</span>{' '}
                {p.recordedQuestionId !== null ? (
                  <span className="cc-q-note">Recorded</span>
                ) : (
                  <button type="button" className="cc-btn sm" disabled={disabled} aria-label={`Record question ${p.ref} from the letter`}
                    onClick={() => onRecord(p)}>
                    Record
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
