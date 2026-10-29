/**
 * The fields a review request is made of, in one module (RR1b of
 * docs/design/REVIEW_ROUTING_2026-10-23.md, §2.6: "The field components are
 * extracted from SendForReviewDialog.tsx (TaskFields) into one shared module.
 * They are not copied.").
 *
 * Two forms ask for people to review a document: Authoring's Send for review
 * (SendForReviewDialog.tsx, its reviewers through ReviewerChecklist in
 * AssignReviewDialog.tsx) and the Vault's named review route
 * (surfaces/VaultReviewRoute.tsx). Both take their reason, their due date and
 * their list of people from here:
 *
 *   - ReasonField: a governed reason, required, described by its rule;
 *   - DueDateField: a calendar date, said with what it means;
 *   - PeoplePicker: a searchable list of people, one or many, each with a
 *     note (why they cannot be chosen, or what choosing them does). A person
 *     who cannot be chosen is shown disabled with the reason, never dropped
 *     silently. Each row is at least 44 px tall (the touch target).
 */
import React, { useId, useState } from 'react';
import { GOVERNED_REASON_MAX, GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';

/** What is wrong with a governed reason, before a click: what the server would refuse; null when it would not. */
export function reviewReasonProblem(reason: string): string | null {
  const n = reason.trim().length;
  if (n < GOVERNED_REASON_MIN) return `A reason of at least ${GOVERNED_REASON_MIN} characters is required.`;
  if (n > GOVERNED_REASON_MAX) return `A reason is at most ${GOVERNED_REASON_MAX} characters.`;
  return null;
}

/** The reason field: required, recorded on the audit trail, described by its rule. */
export function ReasonField({ id, label, note, value, onChange, placeholder, testId }: {
  id: string;
  label: string;
  note: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testId?: string;
}) {
  return (
    <div className="de-field">
      <label className="de-label" htmlFor={id}>{label}<span className="req">*</span></label>
      <div className="de-desc" id={`${id}-note`}>{note}</div>
      <textarea
        id={id}
        className="c2c-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-required="true"
        aria-describedby={`${id}-note`}
        placeholder={placeholder}
        style={{ width: '100%', minHeight: 64, resize: 'vertical', fontSize: 13 }}
        data-testid={testId}
      />
    </div>
  );
}

/** A due date: a calendar day, and (when given) what the day means. */
export function DueDateField({ id, label, value, onChange, note, required, min, half, testId }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  note?: string;
  required?: boolean;
  /** The earliest day offered (YYYY-MM-DD). */
  min?: string;
  half?: boolean;
  testId?: string;
}) {
  return (
    <div className={half ? 'de-field half' : 'de-field'}>
      <label className="de-label" htmlFor={id}>{label}{required ? <span className="req">*</span> : null}</label>
      {note ? <div className="de-desc" id={`${id}-note`}>{note}</div> : null}
      <input
        id={id}
        className="c2c-input"
        type="date"
        value={value}
        min={min}
        onChange={e => onChange(e.target.value)}
        aria-required={required ? 'true' : undefined}
        aria-describedby={note ? `${id}-note` : undefined}
        data-testid={testId}
      />
    </div>
  );
}

export interface PickerOption {
  id: string;
  label: string;
  /** Said under the person: why they cannot be chosen, or what choosing them does. */
  note?: string;
  disabled?: boolean;
}

/**
 * A searchable list of people. `multiple` gives checkboxes, else radios. The
 * search filters by name; a person filtered out keeps their choice, and the
 * count of the chosen is said, so a hidden choice is never a silent one.
 */
export function PeoplePicker({ name, options, selected, onChange, multiple, searchLabel, testIdPrefix, noteIdPrefix, maxHeight = 220 }: {
  /** The radio group's name, and the search box's id stem. */
  name: string;
  options: PickerOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  multiple: boolean;
  searchLabel: string;
  /** Each option's control is `${testIdPrefix}-${id}`. */
  testIdPrefix: string;
  /** Each option's note is `${noteIdPrefix}-${id}` (its id and test id). */
  noteIdPrefix?: string;
  maxHeight?: number;
}) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
  const toggle = (id: string) => {
    if (!multiple) return onChange([id]);
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };
  const hiddenChosen = selected.filter(id => !shown.some(o => o.id === id)).length;
  return (
    <div className="rf-picker">
      <input
        id={searchId}
        className="c2c-input rf-search"
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        aria-label={searchLabel}
        placeholder={searchLabel}
        data-testid={`${testIdPrefix}-search`}
      />
      <div className="rf-opts" style={{ maxHeight }} role="group" aria-label={searchLabel}>
        {shown.length === 0 ? <div className="de-desc" role="status">No one matches “{query.trim()}”.</div> : shown.map(o => {
          const noteId = o.note ? `${noteIdPrefix ?? `${testIdPrefix}-note`}-${o.id}` : undefined;
          return (
            <div key={o.id}>
              <label className={o.disabled ? 'rf-opt is-disabled' : 'rf-opt'}>
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  name={multiple ? undefined : name}
                  checked={!o.disabled && selected.includes(o.id)}
                  disabled={o.disabled}
                  onChange={() => toggle(o.id)}
                  aria-describedby={noteId}
                  data-testid={`${testIdPrefix}-${o.id}`}
                />
                <span>{o.label}</span>
              </label>
              {o.note && <div className="de-desc rf-note" id={noteId} data-testid={noteId}>{o.note}</div>}
            </div>
          );
        })}
      </div>
      {hiddenChosen > 0 && (
        <div className="de-desc" role="status">{hiddenChosen === 1 ? 'One person chosen is' : `${hiddenChosen} people chosen are`} not shown by this search.</div>
      )}
    </div>
  );
}
