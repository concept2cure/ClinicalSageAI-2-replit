import React, { useId, useMemo, useState } from 'react';
import { I } from './icons';
import { useLiveData, EmptyState } from './dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { C2CToast, useToast } from './toast';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import {
  SKILL_DISCIPLINE_LABELS,
  type AvailableSkillDto,
  type OrgSkillDto,
  type ProjectSkillSettingDto,
  type ProjectSkillState,
  type ProjectSkillsDto,
} from '@shared/ana/skills';
import { SkillStudio } from './SkillStudio';
import { ReasonField, SkillDialogShell, refusalOf } from './SkillStudioParts';
import type { OrgEditing } from './surfaces/AdminSkillForms';
import './styles/ana-skills.css';

/**
 * A project's Skills card (the project page's side column): which skills AnA
 * loads on every turn in this project, which she never loads here, and the
 * skills written for this project
 * (docs/design/ANA_SKILLS_2026-10-22.md §9).
 *
 * Reads GET /api/ana-skills/projects/:project. A change (deploy, turn off,
 * clear, write a skill for the project) needs the project's write admission and
 * a stated reason, and is recorded with its audit row; a person the project
 * admits only to read sees the card without its actions. A failed read says
 * so; it is never shown as a project without skills.
 */

interface Props {
  /** The program id the shell holds for the open project. */
  projectRef: string;
  onAsk?: (text: string) => void;
}

type Change = { state: ProjectSkillState | null; key?: string; name?: string };

/** A project's skills read, whole; anything else is a failed read, never an empty card. */
function isProjectSkills(value: unknown): value is ProjectSkillsDto {
  const v = value as Partial<ProjectSkillsDto> | null;
  return (
    !!v &&
    Array.isArray(v.settings) &&
    Array.isArray(v.skills) &&
    typeof v.alwaysMax === 'number' &&
    typeof v.canChange === 'boolean'
  );
}

/** The list of skills a project can choose from, whole. */
export function isAvailableSkills(value: unknown): value is { skills: AvailableSkillDto[] } {
  return !!value && Array.isArray((value as { skills?: unknown }).skills);
}

const VERB: Record<'always' | 'off' | 'clear', string> = {
  always: 'Deploy to this project',
  off: 'Turn off in this project',
  clear: 'Remove the project’s setting',
};

export function ProjectSkills({ projectRef, onAsk }: Props) {
  const [epoch, setEpoch] = useState(0);
  const reload = () => setEpoch(n => n + 1);
  const path = `/api/ana-skills/projects/${encodeURIComponent(projectRef)}`;
  const read = useLiveData<ProjectSkillsDto>(path, [path, epoch], isProjectSkills);
  const [change, setChange] = useState<Change | null>(null);
  const [studio, setStudio] = useState<OrgEditing | null>(null);
  const [toast, fireToast] = useToast();

  const done = (message: string) => {
    setChange(null);
    setStudio(null);
    fireToast(message);
    reload();
  };

  return (
    <section className="pj-card" aria-labelledby="pj-skills-h">
      <div className="pj-card-h">
        <h3 id="pj-skills-h">Skills</h3>
      </div>
      {read.loading ? (
        <div role="status" className="pj-skills-why">
          Loading the project’s skills…
        </div>
      ) : read.error || !read.data ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the project's skills"
          hint="The read failed. This is not a project without skills."
          retry={reload}
        />
      ) : (
        <ProjectSkillsBody
          data={read.data}
          projectRef={projectRef}
          onChange={setChange}
          onStudio={setStudio}
        />
      )}
      {change && (
        <ProjectSkillDialog
          projectRef={projectRef}
          change={change}
          onClose={() => setChange(null)}
          onDone={done}
        />
      )}
      {studio && (
        <SkillStudio target={studio} onClose={() => setStudio(null)} onSaved={done} onAsk={onAsk} />
      )}
      <C2CToast msg={toast} />
    </section>
  );
}

function ProjectSkillsBody({
  data,
  projectRef,
  onChange,
  onStudio,
}: {
  data: ProjectSkillsDto;
  projectRef: string;
  onChange: (c: Change) => void;
  onStudio: (t: OrgEditing) => void;
}) {
  const always = data.settings.filter(s => s.state === 'always');
  const off = data.settings.filter(s => s.state === 'off');
  const own = data.skills.filter(s => s.status !== 'archived');
  const clear = data.canChange
    ? (s: ProjectSkillSettingDto) => onChange({ state: null, key: s.key, name: s.name ?? s.key })
    : null;
  return (
    <div className="pj-skills">
      <span className="pj-skills-why">
        AnA chooses skills from what is asked. A skill deployed here loads on every AnA turn in this
        project (up to {data.alwaysMax}).
      </span>
      <SettingList
        title="Always on here"
        rows={always}
        empty="No skill is deployed to this project."
        action={clear}
        actionLabel="Remove"
      />
      {off.length > 0 && (
        <SettingList
          title="Off here"
          rows={off}
          empty=""
          action={clear}
          actionLabel="Turn back on"
        />
      )}
      <span className="pj-skills-sub">Written for this project</span>
      {own.length === 0 && (
        <span className="pj-skills-why">No skill has been written for this project.</span>
      )}
      {own.map(s => (
        <div key={s.id} className="pj-skills-item">
          <span className="pj-skills-item-t">
            <span className="pj-skills-name">{s.name}</span>
            <span className="pj-skills-why">
              version {s.version} · {s.status}
            </span>
          </span>
          {data.canChange && (
            <button type="button" className="pj-skills-x" onClick={() => onStudio(editTarget(s))}>
              Tune
            </button>
          )}
        </div>
      ))}
      {data.canChange ? (
        <div className="pj-skills-acts">
          <button
            type="button"
            className="btn small"
            onClick={() => onChange({ state: 'always' })}
            disabled={always.length >= data.alwaysMax}
          >
            {I.plus} Deploy a skill
          </button>
          <button
            type="button"
            className="btn small ghost"
            onClick={() => onChange({ state: 'off' })}
          >
            Turn one off here
          </button>
          <button
            type="button"
            className="btn small ghost"
            onClick={() =>
              onStudio({ kind: 'org', skill: null, base: null, mode: null, projectId: projectRef })
            }
          >
            Write a skill
          </button>
        </div>
      ) : (
        <span className="pj-skills-why">
          Your role on this project can read its skills, not change them.
        </span>
      )}
    </div>
  );
}

function editTarget(s: OrgSkillDto): OrgEditing {
  return { kind: 'org', skill: s, base: null, mode: s.extensionMode, projectId: s.projectId };
}

function SettingList({
  title,
  rows,
  empty,
  action,
  actionLabel,
}: {
  title: string;
  rows: ProjectSkillSettingDto[];
  empty: string;
  action: ((s: ProjectSkillSettingDto) => void) | null;
  actionLabel: string;
}) {
  return (
    <>
      <span className="pj-skills-sub">{title}</span>
      {rows.length === 0 && empty ? <span className="pj-skills-why">{empty}</span> : null}
      {rows.map(s => (
        <div key={s.key} className="pj-skills-item">
          <span className="pj-skills-item-t">
            <span className="pj-skills-name">
              {s.name ?? `${s.key} (no longer on for the organization)`}
            </span>
            <span className="pj-skills-why">{s.reason}</span>
          </span>
          {action && (
            <button
              type="button"
              className="pj-skills-x"
              onClick={() => action(s)}
              aria-label={`${actionLabel}: ${s.name ?? s.key}`}
            >
              {actionLabel}
            </button>
          )}
        </div>
      ))}
    </>
  );
}

function doneMessage(state: ProjectSkillState | null, name: string): string {
  if (state === 'always') return `${name} is deployed: AnA loads it on every turn in this project.`;
  if (state === 'off') return `${name} is off in this project.`;
  return `${name} follows the organization’s setting again in this project.`;
}

function dialogSub(state: ProjectSkillState | null): string {
  if (state === 'always')
    return 'AnA loads the skill on every turn in this project, whatever is asked.';
  if (state === 'off')
    return 'AnA never loads the skill in this project, even when a question calls for it.';
  return 'The project stops overriding the organization’s setting for this skill.';
}

/** The skills a project can deploy or turn off, to choose one from. */
function SkillChoiceList({
  uid,
  projectRef,
  state,
  selected,
  onSelect,
}: {
  uid: string;
  projectRef: string;
  state: ProjectSkillState | null;
  selected: string | null;
  onSelect: (key: string, name: string) => void;
}) {
  const path = `/api/ana-skills/available?project=${encodeURIComponent(projectRef)}`;
  const available = useLiveData<{ skills: AvailableSkillDto[] }>(path, [path], isAvailableSkills);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const options = useMemo(
    () =>
      (available.data?.skills ?? [])
        .filter(s => (state === 'always' ? s.projectState !== 'always' : true))
        .filter(
          s => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
        ),
    [available.data, state, q]
  );
  let list: React.ReactNode;
  if (available.loading)
    list = (
      <div role="status" className="de-desc">
        Loading skills…
      </div>
    );
  else if (available.error)
    list = (
      <div role="alert" className="de-err">
        Couldn&apos;t load the skills. Nothing was changed.
      </div>
    );
  else {
    list = (
      <div className="ct-skills-list" role="radiogroup" aria-label="Skills">
        {options.slice(0, 80).map(s => (
          <label key={s.key} className="ct-skills-opt" data-on={selected === s.key || undefined}>
            <input
              type="radio"
              name={`${uid}-skill`}
              checked={selected === s.key}
              onChange={() => onSelect(s.key, s.name)}
            />
            <span className="ct-skills-opt-t">
              <span className="ct-skills-name">{s.name}</span>
              <span className="ct-skills-meta">
                {s.disciplines.map(d => SKILL_DISCIPLINE_LABELS[d] ?? d).join(', ') ||
                  'Your organization'}
                {s.projectOnly ? ' · this project' : ''}
              </span>
            </span>
          </label>
        ))}
        {options.length === 0 && <span className="ct-skills-note">No skill matches.</span>}
      </div>
    );
  }
  return (
    <div className="de-field">
      <label className="de-label" htmlFor={`${uid}-q`}>
        Skill
      </label>
      <input
        id={`${uid}-q`}
        type="search"
        className="c2c-input"
        placeholder="Search skills"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {list}
    </div>
  );
}

/** Choose a skill (when none is named) and state the reason; then the project's setting changes. */
function ProjectSkillDialog({
  projectRef,
  change,
  onClose,
  onDone,
}: {
  projectRef: string;
  change: Change;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const uid = useId();
  const choosing = !change.key;
  const [key, setKey] = useState<string | null>(change.key ?? null);
  const [chosenName, setChosenName] = useState<string | null>(change.name ?? null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verb = change.state === null ? VERB.clear : VERB[change.state];

  const submit = async () => {
    if (!key) {
      setError('Choose a skill.');
      return;
    }
    const stated = reason.trim();
    if (stated.length < GOVERNED_REASON_MIN) {
      setError(`A reason of at least ${GOVERNED_REASON_MIN} characters is required.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest(
        'PUT',
        `/api/ana-skills/projects/${encodeURIComponent(projectRef)}/settings/${encodeURIComponent(
          key
        )}`,
        {
          state: change.state,
          reason: stated,
        }
      );
      onDone(doneMessage(change.state, chosenName ?? key));
    } catch (e) {
      setError(refusalOf(e, 'The project’s skill was not changed.'));
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <>
      <button className="de-btn ghost" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      <button
        className="de-btn primary"
        onClick={() => void submit()}
        disabled={busy}
        data-testid="project-skill-submit"
      >
        {busy ? 'Saving…' : verb}
      </button>
    </>
  );

  return (
    <SkillDialogShell
      eyebrow="Skills · this project"
      title={chosenName ? `${verb}: ${chosenName}` : verb}
      sub={dialogSub(change.state)}
      busy={busy}
      onClose={onClose}
      testId="project-skill-dialog"
      footer={footer}
    >
      {choosing && (
        <SkillChoiceList
          uid={uid}
          projectRef={projectRef}
          state={change.state}
          selected={key}
          onSelect={(k, name) => {
            setKey(k);
            setChosenName(name);
          }}
        />
      )}
      <ReasonField id={`${uid}-r`} value={reason} onChange={setReason} />
      {error && (
        <div className="de-err" role="alert">
          {error}
        </div>
      )}
    </SkillDialogShell>
  );
}
