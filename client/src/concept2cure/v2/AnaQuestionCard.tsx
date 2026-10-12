/**
 * The question AnA asks, as positions a person can take — and one they can
 * write themselves (founder's directive, 2026-10-12).
 *
 * The server has run a question engine since the interview flows landed: 20-odd
 * flows over devices, IVDs, drugs and biologics, each question a node with
 * fields, listed positions, branching and Part 11 issue checks. It emits every
 * question over the stream as `intelligence_question`, and `useAnaChat` stores
 * it on the message. Nothing drew it. So the person saw AnA's prose and typed
 * an answer back, and the positions she had resolved for them — the whole point
 * of the engine — never reached the screen.
 *
 * This draws it: the question, what each position commits the programme to, the
 * authority behind it where the flow states one, and a row for a position the
 * list does not hold, which AnA records as the person's own words rather than
 * as one of hers. The answer goes back by the path the server already has
 * (`[INTELLIGENCE_ANSWER]`), so nothing on the wire changes.
 *
 * It never invents a position: every option is drawn from the question the
 * server sent, and a field with no listed positions is drawn as the input it is.
 *
 * Nor does it ever remove one. Where the server has marked a position the
 * programme's own answers speak against, this draws the caution on the row and
 * leaves the row selectable: the person keeps the choice and AnA records the
 * basis they took it on (shared/types PositionAvailability). A position that
 * simply vanished would be the question lying by omission, and the engine has
 * been bitten by hidden options once already.
 */
import React, { useMemo, useState } from 'react';

import {
  OTHER_POSITION,
  OWN_POSITION_MAX_CHARS,
  otherFieldId,
  type IntelligenceQuestionEvent,
  type PositionCaution,
  type QuestionField,
  type QuestionOption,
} from '@shared/types/intelligence-questions';

type Answers = Record<string, unknown>;

export interface AnaQuestionCardProps {
  question: IntelligenceQuestionEvent;
  sessionId?: string | null;
  flowState?: unknown;
  /** Submits the answer by the server's existing fast path. */
  onAnswer: (payload: Record<string, unknown>) => void;
  busy?: boolean;
}

/**
 * A field the person picks from, rather than types into.
 *
 * `agency_select` and `country_select` are here because the engine has always
 * declared them and no renderer ever implemented them: they fell through to a
 * text input, so the agency — the answer that decides the Module 1 backbone,
 * the validation profile and the gateway — was typed prose. A field of either
 * type still draws as an input where the question carries no positions, which
 * is what `country_select` does today: the platform holds a governed agency
 * vocabulary and no governed country one.
 */
const PICKED: ReadonlySet<QuestionField['type']> = new Set([
  'select',
  'radio',
  'multi_select',
  'checkbox',
  'yes_no',
  'agency_select',
  'country_select',
]);

const YES_NO: QuestionOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

function optionsOf(field: QuestionField): QuestionOption[] {
  if (field.type === 'yes_no') return field.options?.length ? field.options : YES_NO;
  return field.options ?? [];
}

const isMulti = (field: QuestionField) => field.type === 'multi_select' || field.type === 'checkbox';

/** Whether this answer is the person taking a position the list does not hold. */
function tookOwnPosition(field: QuestionField, answers: Answers): boolean {
  const value = answers[field.id];
  return value === OTHER_POSITION || (Array.isArray(value) && value.includes(OTHER_POSITION));
}

/** Nothing to send yet: a required answer is missing, or an own position has no words. */
function notReady(fields: readonly QuestionField[], answers: Answers): boolean {
  return fields.some(field => {
    if (tookOwnPosition(field, answers) && field.allowOther?.required !== false) {
      const words = answers[otherFieldId(field.id)];
      return typeof words !== 'string' || !words.trim();
    }
    if (!field.required) return false;
    const value = answers[field.id];
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  });
}

/** How a marked position reads. The reason itself names the answer that marks it. */
const CAUTION_LEAD: Readonly<Record<PositionCaution['availability'], string>> = {
  inapplicable: 'Your own answers contradict this',
  needs_basis: 'This position needs a basis',
};

const CAUTION_CLASS: Readonly<Record<PositionCaution['availability'], string>> = {
  inapplicable: 'is-inapplicable',
  needs_basis: 'is-needs-basis',
};

/** Why the programme's own answers speak against this position — not a refusal of it. */
function Caution({ caution, taken }: { caution: PositionCaution; taken: boolean }) {
  return (
    <span className={`ana-q-position-caution ${CAUTION_CLASS[caution.availability]}`}>
      <span className="ana-q-caution-lead">{CAUTION_LEAD[caution.availability]}.</span> {caution.reason}
      <span className="ana-q-caution-authority">{caution.authority}</span>
      {taken ? (
        <span className="ana-q-caution-taken">
          AnA keeps this position open and records the basis you take it on.
        </span>
      ) : null}
    </span>
  );
}

/** One position, with what it commits you to and what makes it one. */
function Position({
  field,
  option,
  checked,
  onPick,
}: {
  field: QuestionField;
  option: QuestionOption;
  checked: boolean;
  onPick: () => void;
}) {
  const multi = isMulti(field);
  const marked = option.caution ? ` ${CAUTION_CLASS[option.caution.availability]}` : '';
  return (
    <label className={`ana-q-position${checked ? ' is-picked' : ''}${marked}`}>
      <input
        type={multi ? 'checkbox' : 'radio'}
        name={field.id}
        value={option.value}
        checked={checked}
        onChange={onPick}
      />
      <span className="ana-q-position-body">
        <span className="ana-q-position-label">{option.label}</span>
        {option.commits ? <span className="ana-q-position-commits">{option.commits}</span> : null}
        {option.description && option.description !== option.commits ? (
          <span className="ana-q-position-desc">{option.description}</span>
        ) : null}
        {option.authority ? <span className="ana-q-position-authority">{option.authority}</span> : null}
        {option.caution ? <Caution caution={option.caution} taken={checked} /> : null}
      </span>
    </label>
  );
}

/** The box for a position AnA did not offer, in the person's own words. */
function OwnWords({
  field,
  value,
  onChange,
}: {
  field: QuestionField;
  value: unknown;
  onChange: (words: string) => void;
}) {
  return (
    <div className="ana-q-own">
      <label className="ana-q-own-label" htmlFor={`ana-q-own-${field.id}`}>
        {field.allowOther?.prompt ?? 'Which position are you taking?'}
      </label>
      <textarea
        id={`ana-q-own-${field.id}`}
        className="ana-q-input"
        rows={2}
        maxLength={OWN_POSITION_MAX_CHARS}
        value={typeof value === 'string' ? value : ''}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

/** A field with no listed positions: the input the flow asked for. */
function PlainField({
  field,
  value,
  onChange,
}: {
  field: QuestionField;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const common = {
    id: `ana-q-${field.id}`,
    className: 'ana-q-input',
    placeholder: field.placeholder ?? '',
    value: value === undefined || value === null ? '' : String(value),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
  };
  if (field.type === 'textarea') return <textarea {...common} rows={4} />;
  if (field.type === 'number') return <input {...common} type="number" />;
  if (field.type === 'date') return <input {...common} type="date" />;
  return <input {...common} type="text" />;
}

/** One field: its label, help, and either its positions or the input it asked for. */
function QuestionFieldRow({
  field,
  answers,
  onPick,
  onSet,
}: {
  field: QuestionField;
  answers: Answers;
  onPick: (field: QuestionField, value: string) => void;
  onSet: (fieldId: string, value: unknown) => void;
}) {
  const options = optionsOf(field);
  const picked = PICKED.has(field.type) && options.length > 0;
  /* A question whose catalogue holds nothing for this programme — AnA has no
     routes to market for PMDA, and says so in the help text rather than
     drawing an empty select. Their words ARE the answer, so the box is drawn
     on its own and the answer still records as a position AnA did not offer
     rather than as one of hers. */
  const ownOnly = !picked && PICKED.has(field.type) && Boolean(field.allowOther);
  const own = tookOwnPosition(field, answers);
  const chosen = (value: string) =>
    isMulti(field)
      ? Array.isArray(answers[field.id]) && (answers[field.id] as string[]).includes(value)
      : answers[field.id] === value;
  return (
    <fieldset className="ana-q-field">
      <legend className="ana-q-label">
        {field.label}
        {field.required ? <span className="ana-q-required"> (required)</span> : null}
      </legend>
      {field.helpText ? <p className="ana-q-help">{field.helpText}</p> : null}
      {picked ? (
        <div className="ana-q-positions" role={isMulti(field) ? 'group' : 'radiogroup'} aria-label={field.label}>
          {options.map(option => (
            <Position
              key={option.value}
              field={field}
              option={option}
              checked={chosen(option.value)}
              onPick={() => onPick(field, option.value)}
            />
          ))}
          {field.allowOther ? (
            <>
              <Position
                field={field}
                option={{
                  value: OTHER_POSITION,
                  label: field.allowOther.label ?? 'Something else',
                  commits: 'AnA records this in your words, and does not treat it as one of the positions above.',
                }}
                checked={own}
                onPick={() => onPick(field, OTHER_POSITION)}
              />
              {own ? (
                <OwnWords
                  field={field}
                  value={answers[otherFieldId(field.id)]}
                  onChange={words => onSet(otherFieldId(field.id), words)}
                />
              ) : null}
            </>
          ) : null}
        </div>
      ) : ownOnly ? (
        <OwnWords
          field={field}
          value={answers[otherFieldId(field.id)]}
          onChange={words => {
            onPick(field, OTHER_POSITION);
            onSet(otherFieldId(field.id), words);
          }}
        />
      ) : (
        <PlainField field={field} value={answers[field.id]} onChange={next => onSet(field.id, next)} />
      )}
    </fieldset>
  );
}

export function AnaQuestionCard({ question, sessionId, flowState, onAnswer, busy }: AnaQuestionCardProps) {
  const node = question.node;
  const [answers, setAnswers] = useState<Answers>(() => {
    const seed: Answers = {};
    for (const field of node.fields) if (field.defaultValue !== undefined) seed[field.id] = field.defaultValue;
    return seed;
  });

  const set = (fieldId: string, value: unknown) => setAnswers(prev => ({ ...prev, [fieldId]: value }));

  const pick = (field: QuestionField, value: string) => {
    if (!isMulti(field)) {
      set(field.id, value);
      return;
    }
    const current = Array.isArray(answers[field.id]) ? (answers[field.id] as string[]) : [];
    set(field.id, current.includes(value) ? current.filter(v => v !== value) : [...current, value]);
  };

  /* The validator is the server's, and it is the one that decides. This only
     keeps the person from submitting what it is certain to refuse. */
  const blocked = useMemo(() => notReady(node.fields, answers), [answers, node.fields]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked || busy) return;
    onAnswer({
      node_id: node.id,
      answers,
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(sessionId ? {} : { flow_state: flowState }),
    });
  };

  const issues = question.newIssues ?? [];

  return (
    <form className="ana-q-card" onSubmit={submit} aria-labelledby={`ana-q-${node.id}-title`}>
      <div className="ana-q-head">
        <span className="ana-q-section">{node.section}</span>
        <span className="ana-q-progress">
          {question.progress.completedNodes} of {question.progress.totalNodes}
        </span>
      </div>
      <h3 className="ana-q-title" id={`ana-q-${node.id}-title`}>
        {node.question}
      </h3>
      {node.guidance ? <p className="ana-q-guidance">{node.guidance}</p> : null}

      {issues.length > 0 ? (
        <ul className="ana-q-issues" role="note">
          {issues.map(issue => (
            <li key={issue.checkId} className={`ana-q-issue is-${issue.severity}`}>
              <span className="ana-q-issue-title">{issue.title}</span> {issue.message}
              {issue.reference ? <span className="ana-q-issue-ref">{issue.reference}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {node.fields.map(field => (
        <QuestionFieldRow key={field.id} field={field} answers={answers} onPick={pick} onSet={set} />
      ))}

      <div className="ana-q-foot">
        <button type="submit" className="ana-q-submit" disabled={blocked || busy}>
          {question.isLast ? 'Finish' : 'Continue'}
        </button>
        {blocked ? <span className="ana-q-foot-note">Every required answer, and a position in your words where you chose one.</span> : null}
      </div>
    </form>
  );
}
