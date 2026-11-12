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
 * Each proposed passage also says what the deficiency parser read in it (P-122, 2026-11-10; server
 * issue-parser.ts, keyword rules, no model): its topic and a suggested severity, CTD section and discipline that
 * "Record" puts in the form for the person to check. A letter that numbers no question has its deficiencies
 * itemized by the same rules, each recorded the same way with the number the person gives.
 *
 * The commitments the letter imposes are proposed the same way
 * (LetterCommitmentProposals, P-81 "extract commitments", P-84): found without a
 * model (shared/agency/letter-commitments.ts), recorded by a person with a reason.
 *
 * @module client/src/concept2cure/v2/surfaces/LetterQuestionProposals
 */
import React from 'react';
import { utcDayText } from '@shared/utils/utc-day';
import { useLiveData, type DataReadOwner } from '../dataConnect';

/** What the deficiency parser read in a passage (server letter-question-proposals.ts, P-122): keyword rules, no model. */
export interface ProposalClassification {
  topics: Array<{ label: string; severity: string; sections: string[] }>;
  suggested: { severity: 'minor' | 'major' | 'critical'; ctdSection: string | null; discipline: string | null };
}
export interface LetterQuestionProposal {
  sourceId: number; ref: string; text: string; start: number; end: number; recordedQuestionId: number | null;
  /** Absent from an older server, and null where the parser is switched off. */
  classification?: ProposalClassification | null;
}
/** A deficiency the parser itemized in a letter that numbers no question. */
export interface LetterDeficiency { sourceId: number; text: string; start: number; end: number; classification: ProposalClassification }
interface ProposalsPayload {
  sources: Array<{ sourceId: number; title: string | null; state: 'read' | 'no-text' | 'not-found' }>;
  proposals: LetterQuestionProposal[];
  deficiencies?: LetterDeficiency[];
}

/** The rules' reading, in one quiet line: what was found and what is suggested, or that nothing was. */
function ParserReading({ c }: { c: ProposalClassification | null | undefined }) {
  if (!c) return null;
  const found = c.topics.filter((t) => t.label !== 'Not classified').map((t) => t.label);
  const said = found.length === 0
    ? 'no topic found; classify it yourself'
    : [found.join(', '), c.suggested.severity, c.suggested.ctdSection].filter(Boolean).join(' · ');
  return <span className="cc-q-note">Keyword rules, no AI: {said}</span>;
}

function isPayload(v: unknown): v is ProposalsPayload {
  const p = v as ProposalsPayload | null;
  return !!p && Array.isArray(p.sources) && Array.isArray(p.proposals);
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The deficiencies the parser itemized in a letter that numbers no question, each recordable as a question. */
function LetterDeficiencies({ items, asks, disabled, onRecord }: {
  items: LetterDeficiency[];
  /** False for a letter that asks nothing (an approval letter): it is not itemized; its commitments are proposed below. */
  asks: boolean;
  disabled: boolean;
  onRecord: (p: { ref: string; text: string; classification?: ProposalClassification | null }) => void;
}) {
  if (!asks || items.length === 0) return null;
  return (
    <>
      <p className="cc-q-note">
        The keyword rules itemized {items.length} deficienc{items.length === 1 ? 'y' : 'ies'} in
        the letter's text, without AI. Check each against the letter; record it as a question with the agency's number.
      </p>
      <ul className="cc-q-proposal-list" data-testid="letter-deficiencies">
        {items.map((d, i) => (
          <li key={`${d.sourceId}:${d.start}`} className="cc-q-proposal">
            <span title={d.text}>{clip(d.text, 220)}</span>{' '}
            <ParserReading c={d.classification} />{' '}
            <button type="button" className="cc-btn sm" disabled={disabled}
              aria-label={`Record deficiency ${i + 1} from the letter as a question`}
              onClick={() => onRecord({ ref: '', text: d.text, classification: d.classification })}>
              Record
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function LetterQuestionProposals({ base, version, readOwner, disabled, onRecord, responseRequired = true }: {
  base: string;
  version: number;
  readOwner: DataReadOwner;
  disabled: boolean;
  /** A numbered question, or an itemized deficiency (no `ref`: the person gives the number). */
  onRecord: (p: { ref: string; text: string; classification?: ProposalClassification | null }) => void;
  /** False for a letter that asks nothing (an approval letter): it is not told to record its questions by hand. */
  responseRequired?: boolean;
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
        <p className="cc-q-note" role="note">
          No numbered questions were found in the letter's text.{responseRequired ? ' Record each question by hand.' : ''}
        </p>
      )}
      <LetterDeficiencies items={data.deficiencies ?? []} asks={responseRequired} disabled={disabled} onRecord={onRecord} />
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
                <ParserReading c={p.classification} />{' '}
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

/** A commitment the letter's text imposes, proposed (server readLetterCommitmentProposals, P-81, P-84). */
export interface LetterCommitmentProposal {
  sourceId: number; ref: string; commitmentType: 'pmr' | 'pmc'; basis: string; recordBasis: string;
  text: string; start: number; end: number;
  milestones: Array<{ label: string; when: string; date: string | null }>;
  dueDate: string | null; recordedCommitmentId: number | null;
}
interface CommitmentProposalsPayload { sources: ProposalsPayload['sources']; proposals: LetterCommitmentProposal[] }

function isCommitmentPayload(v: unknown): v is CommitmentProposalsPayload {
  const p = v as CommitmentProposalsPayload | null;
  return !!p && Array.isArray(p.sources) && Array.isArray(p.proposals);
}

const KIND = { pmr: 'Postmarketing requirement', pmc: 'Postmarketing commitment' } as const;

/**
 * The commitments the letter's own text imposes (an approval letter's PMRs and
 * PMCs), offered for a person to record: "Record" opens the Record-a-commitment
 * form filled from the letter, and the person records it with a reason. Found
 * without a model (shared/agency/letter-commitments.ts), shown verbatim. A
 * letter that imposes none shows nothing; the questions list above already
 * says when the letter's file was not read.
 */
export function LetterCommitmentProposals({ base, version, readOwner, disabled, onRecord }: {
  base: string;
  version: number;
  readOwner: DataReadOwner;
  disabled: boolean;
  onRecord: (p: LetterCommitmentProposal) => void;
}) {
  const read = useLiveData<CommitmentProposalsPayload>(`${base}/commitment-proposals`, [base, version], isCommitmentPayload, readOwner);
  if (read.loading && !read.data) return null;
  if (read.error && !read.data) {
    return <p className="cc-q-note" role="note">The letter's text could not be read for its commitments. Record each commitment by hand.</p>;
  }
  const proposals = read.data?.proposals ?? [];
  if (proposals.length === 0) return null;
  const open = proposals.filter((p) => p.recordedCommitmentId === null);
  return (
    <div className="cc-q-proposals" data-testid="letter-commitment-proposals">
      <p className="cc-q-note">
        The letter imposes {proposals.length} commitment{proposals.length === 1 ? '' : 's'}, found in its text without AI.{' '}
        {open.length === 0 ? 'Each is recorded.' : 'Check each against the letter, then record it with a reason. It is then tracked with its due date.'}
      </p>
      <ul className="cc-q-proposal-list">
        {proposals.map((p) => (
          <li key={`${p.sourceId}:${p.start}`} className="cc-q-proposal">
            <span className="cc-comm-t">{p.ref}</span>{' '}
            <span className="cc-q-note">{KIND[p.commitmentType]}, {p.basis}{p.dueDate ? `, due ${utcDayText(p.dueDate) ?? p.dueDate}` : ''}.</span>{' '}
            <span title={p.text}>{clip(p.text.replace(/\s+/g, ' '), 220)}</span>{' '}
            {p.recordedCommitmentId !== null ? (
              <span className="cc-q-note">Recorded</span>
            ) : (
              <button type="button" className="cc-btn sm" disabled={disabled} aria-label={`Record commitment ${p.ref} from the letter`}
                onClick={() => onRecord(p)}>
                Record
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
