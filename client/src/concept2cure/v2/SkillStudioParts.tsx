import React, { useId, useState } from 'react';
import { I } from './icons';
import { useDialog } from './useDialog';
import { useLiveData } from './dataConnect';
import { apiRequest, ApiRequestError, serverMessage } from '@/lib/queryClient';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import {
  SKILL_LIMITS,
  type SkillHistoryEntryDto,
  type SkillSelectionDto,
} from '@shared/ana/skills';
import {
  DISCIPLINE_OPTIONS,
  SEGMENT_OPTIONS,
  STATUS_OPTIONS,
  TA_OPTIONS,
  USE_CASE_OPTIONS,
  orgSkillBody,
  type OrgEditing,
} from './surfaces/AdminSkillForms';

/**
 * The parts of the skill studio (SkillStudio.tsx) and of a project's skill
 * dialog (ProjectSkills.tsx): the dialog shell they share, the governed reason
 * field, the skill's fields, and the studio's right column (try a question,
 * read the versions, ask AnA to draft).
 */

/** One fixed request to AnA: nothing stored by a member is spliced into it. */
const DESIGN_WITH_ANA =
  'Help me design an AnA skill for this organization. Ask me what work it is for, then draft its name, one or two sentences on when to use it, trigger phrases as people type them, and its method under a "## Method" heading: numbered steps, naming the platform tool in backticks wherever a figure, verdict, date or citation is needed.';

export function refusalOf(e: unknown, fallback: string): string {
  return (e instanceof ApiRequestError ? serverMessage(e.payload) : null) ?? fallback;
}

/** The dialog both skill dialogs open in: a titled drawer with a close button and a footer. */
export function SkillDialogShell({
  eyebrow,
  title,
  sub,
  busy,
  onClose,
  wide,
  testId,
  footer,
  children,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  busy: boolean;
  onClose: () => void;
  wide?: boolean;
  testId: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useDialog(onClose);
  const uid = useId();
  return (
    <div
      className="de-bd"
      onMouseDown={e => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className={wide ? 'de skill-studio' : 'de'}
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        data-testid={testId}
      >
        <div className="de-h">
          <div>
            <div className="de-h-eye">{eyebrow}</div>
            <div className="de-h-t" id={`${uid}-title`}>
              {title}
            </div>
            <div className="de-h-s">{sub}</div>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Close" disabled={busy}>
            {I.close}
          </button>
        </div>
        <div className="de-body">{children}</div>
        <div className="de-f">{footer}</div>
      </div>
    </div>
  );
}

export function Field({
  id,
  label,
  desc,
  children,
}: {
  id: string;
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="de-field">
      <label className="de-label" htmlFor={id}>
        {label}
      </label>
      {desc && <div className="de-desc">{desc}</div>}
      {children}
    </div>
  );
}

export function Select({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select id={id} className="c2c-input" value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** The governed reason every skill change carries. */
export function ReasonField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="de-field">
      <label className="de-label" htmlFor={id}>
        Reason for change<span className="req">*</span>
      </label>
      <div className="de-desc">
        Recorded with the change in the audit trail. At least {GOVERNED_REASON_MIN} characters.
      </div>
      <textarea
        id={id}
        className="c2c-input"
        rows={2}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

function TextField({
  id,
  label,
  desc,
  rows,
  value,
  onChange,
  wide,
}: {
  id: string;
  label: string;
  desc?: string;
  rows: number;
  value: string;
  onChange: (v: string) => void;
  wide?: boolean;
}) {
  return (
    <Field id={id} label={label} desc={desc}>
      <textarea
        id={id}
        className={wide ? 'c2c-input skill-studio-method' : 'c2c-input'}
        rows={rows}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </Field>
  );
}

/** The studio's right column: try a question, read the versions, or ask AnA to draft. */
export function StudioAside({
  target,
  values,
  onClose,
  onAsk,
}: {
  target: OrgEditing;
  values: Record<string, string>;
  onClose: () => void;
  onAsk?: (text: string) => void;
}) {
  return (
    <div className="skill-studio-pane">
      <StudioTry target={target} values={values} />
      {target.skill && <StudioHistory skillId={target.skill.id} />}
      {onAsk && (
        <div className="skill-studio-side">
          <h4>Design it with AnA</h4>
          <span className="skill-studio-verdict">
            AnA asks what the work is and drafts the skill in this format. Bring her draft back here
            to try it and save it.
          </span>
          <button
            type="button"
            className="de-btn ghost"
            onClick={() => {
              onClose();
              onAsk(DESIGN_WITH_ANA);
            }}
          >
            Ask AnA to draft a skill
          </button>
        </div>
      )}
    </div>
  );
}

/** The skill's facets and status. */
function StudioFacets({
  uid,
  values,
  set,
}: {
  uid: string;
  values: Record<string, string>;
  set: (key: string) => (value: string) => void;
}) {
  return (
    <>
      <div className="skill-studio-row">
        <Field id={`${uid}-disc`} label="Discipline">
          <Select
            id={`${uid}-disc`}
            value={values.discipline}
            options={DISCIPLINE_OPTIONS}
            onChange={set('discipline')}
          />
        </Field>
        <Field id={`${uid}-use`} label="Kind of work">
          <Select
            id={`${uid}-use`}
            value={values.useCase}
            options={USE_CASE_OPTIONS}
            onChange={set('useCase')}
          />
        </Field>
        <Field id={`${uid}-seg`} label="Client segment">
          <Select
            id={`${uid}-seg`}
            value={values.segment}
            options={SEGMENT_OPTIONS}
            onChange={set('segment')}
          />
        </Field>
        <Field id={`${uid}-ta`} label="Therapeutic area">
          <Select
            id={`${uid}-ta`}
            value={values.therapeuticArea}
            options={TA_OPTIONS}
            onChange={set('therapeuticArea')}
          />
        </Field>
      </div>
      <Field id={`${uid}-status`} label="Status" desc="A draft is never loaded; try it here first.">
        <Select
          id={`${uid}-status`}
          value={values.status}
          options={STATUS_OPTIONS}
          onChange={set('status')}
        />
      </Field>
    </>
  );
}

const MODE_OPTIONS = [
  { value: 'addendum', label: 'Adds to it' },
  { value: 'replace', label: 'Replaces it' },
];

/** What the skill is: its name, when to use it, its method, its triggers and facets. */
export function StudioFields({
  uid,
  values,
  set,
  extending,
  projectOnly,
}: {
  uid: string;
  values: Record<string, string>;
  set: (key: string) => (value: string) => void;
  extending: boolean;
  projectOnly: boolean;
}) {
  return (
    <div className="skill-studio-pane">
      <Field id={`${uid}-name`} label="Name">
        <input
          id={`${uid}-name`}
          className="c2c-input"
          value={values.name}
          maxLength={SKILL_LIMITS.nameMax}
          onChange={e => set('name')(e.target.value)}
        />
      </Field>
      <TextField
        id={`${uid}-desc`}
        label="When to use it"
        desc={`One or two sentences, ${SKILL_LIMITS.descriptionMin}–${SKILL_LIMITS.descriptionMax} characters.`}
        rows={2}
        value={values.description}
        onChange={set('description')}
      />
      {extending && (
        <Field id={`${uid}-mode`} label="What it does to the library skill">
          {/* A project adds to a library skill; replacing one is the organization's decision. */}
          <Select
            id={`${uid}-mode`}
            value={values.mode}
            onChange={set('mode')}
            options={projectOnly ? MODE_OPTIONS.slice(0, 1) : MODE_OPTIONS}
          />
        </Field>
      )}
      <TextField
        id={`${uid}-method`}
        label="Method"
        desc="What AnA follows, in Markdown, under a “## Method” heading. Name a platform tool in backticks wherever a figure, verdict, date or citation is needed: a skill never supplies one itself."
        rows={12}
        value={values.instructions}
        onChange={set('instructions')}
        wide
      />
      <TextField
        id={`${uid}-triggers`}
        label="Trigger phrases"
        desc={
          extending
            ? 'Optional: more phrases that should select it, one per line.'
            : 'One per line, as people type them. Without one, the skill loads only when someone picks it or deploys it to a project.'
        }
        rows={4}
        value={values.triggers}
        onChange={set('triggers')}
      />
      <StudioFacets uid={uid} values={values} set={set} />
    </div>
  );
}

/** Try a question against the draft: the selection AnA would make with it in force. */
function StudioTry({ target, values }: { target: OrgEditing; values: Record<string, string> }) {
  const uid = useId();
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<{
    selection: SkillSelectionDto;
    draftKey: string | null;
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const project = target.projectId ?? target.skill?.projectId ?? null;
  // The library key the draft loads under when it adds to or replaces a library skill.
  const baseKey = target.base?.key ?? target.skill?.extendsSkillKey ?? null;

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setFailure(null);
    try {
      const draft = orgSkillBody(target, values, null);
      const res = await apiRequest('POST', '/api/ana-skills/test', {
        message: question,
        draft,
        draftOf: target.skill?.id ?? null,
        project,
      });
      setResult((await res.json()) as { selection: SkillSelectionDto; draftKey: string | null });
    } catch (err) {
      setResult(null);
      setFailure(refusalOf(err, 'The question could not be tried. Nothing was changed.'));
    } finally {
      setBusy(false);
    }
  };

  const isDraft = (key: string, attached: { key: string }[]) =>
    key === result?.draftKey ||
    (baseKey !== null && key === baseKey) ||
    attached.some(a => a.key === result?.draftKey);
  const loaded = result ? result.selection.selected.some(s => isDraft(s.key, s.attached)) : false;

  return (
    <form className="skill-studio-side" onSubmit={e => void run(e)}>
      <h4>Try a question</h4>
      <label className="de-desc" htmlFor={`${uid}-q`}>
        Type a question the way your team would. AnA’s selection is shown with this draft in force;
        nothing is saved.
      </label>
      <textarea
        id={`${uid}-q`}
        className="c2c-input"
        rows={2}
        value={question}
        onChange={e => setQuestion(e.target.value)}
      />
      <button type="submit" className="de-btn ghost" disabled={busy || !question.trim()}>
        {busy ? 'Trying…' : 'Try it'}
      </button>
      {failure && (
        <span className="de-err" role="alert">
          {failure}
        </span>
      )}
      {result && (
        <div role="status" className="skill-studio-pane">
          <span className="skill-studio-verdict">
            {loaded
              ? 'This skill would load for that question.'
              : 'This skill would not load for that question. Add a trigger phrase that appears in it, or pick the skill in the conversation.'}
          </span>
          {result.selection.selected.map(s => (
            <span
              key={s.key}
              className="skill-studio-hit"
              data-draft={isDraft(s.key, s.attached) || undefined}
            >
              <span className="skill-studio-hit-n">{s.name}</span>
              <span className="skill-studio-hit-w">Because {s.reasons.join('; ')}</span>
            </span>
          ))}
          {result.selection.selected.length === 0 && (
            <span className="skill-studio-verdict">No skill would load for that question.</span>
          )}
        </div>
      )}
    </form>
  );
}

/** The skill's versions, from its audit rows. */
function StudioHistory({ skillId }: { skillId: number }) {
  const history = useLiveData<{ history: SkillHistoryEntryDto[] }>(
    `/api/ana-skills/organization/${skillId}/history`,
    [skillId]
  );
  const rows = history.data?.history ?? [];
  return (
    <div className="skill-studio-side">
      <h4>Versions</h4>
      {history.loading ? (
        <span role="status" className="skill-studio-verdict">
          Loading the versions…
        </span>
      ) : history.error ? (
        <span role="alert" className="de-err">
          Couldn&apos;t load the versions. This is not a skill without history.
        </span>
      ) : rows.length === 0 ? (
        <span className="skill-studio-verdict">
          No change to this skill is on the audit trail yet.
        </span>
      ) : (
        <ol className="skill-studio-hist">
          {rows.map((h, i) => (
            <li key={`${h.occurredAt}-${i}`}>
              <span>
                {h.version !== null ? `Version ${h.version}` : 'Change'} ·{' '}
                {h.action === 'ana_skill.created' ? 'created' : 'changed'}
                {h.status ? ` · ${h.status}` : ''}
              </span>
              <span className="skill-studio-hist-m">
                {new Date(h.occurredAt).toLocaleString()} · {h.actorName ?? 'a member'}
                {h.reason ? ` — ${h.reason}` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
