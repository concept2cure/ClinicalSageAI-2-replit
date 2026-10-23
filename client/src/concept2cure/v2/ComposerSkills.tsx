import React, { useEffect, useId, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import type { SkillMentionSource } from './appMentions';
import {
  SKILL_DISCIPLINE_LABELS,
  SKILL_TURN_BUDGET,
  type AvailableSkillDto,
} from '@shared/ana/skills';
import './styles/ana-skills.css';

/**
 * The Skills menu in AnA's composer, beside the engine. AnA chooses skills on
 * her own from what is asked and what is open; here a person can pick skills to
 * use on every turn of this conversation, up to the turn's allowance. With none
 * picked the pill says AnA chooses.
 *
 * The list is GET /api/ana-skills/available: what is on for the organization
 * and, in a project, not turned off there. A failed read says so; it is never
 * shown as an empty list. A skill deployed to the project is marked: it loads
 * on every turn there whether or not it is picked.
 */

interface Props {
  /** The project the conversation is in (the program id the shell holds, or its number), or null. */
  projectId: string | number | null;
  chosen: string[];
  onChange: (keys: string[]) => void;
}

function disciplineOf(s: AvailableSkillDto): string {
  return s.disciplines.map(d => SKILL_DISCIPLINE_LABELS[d] ?? d).join(', ') || 'Your organization';
}

function matches(s: AvailableSkillDto, q: string): boolean {
  if (!q) return true;
  return (
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    disciplineOf(s).toLowerCase().includes(q)
  );
}

function metaOf(s: AvailableSkillDto): string {
  return [
    disciplineOf(s),
    s.regions?.length ? s.regions.join(', ') : null,
    s.source === 'organization' ? 'your organization' : null,
    s.projectOnly ? 'this project' : null,
    s.projectState === 'always' ? 'always on in this project' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function pillLabel(chosen: string[], byKey: ReadonlyMap<string, AvailableSkillDto>): string {
  if (chosen.length === 0) return 'AnA chooses';
  if (chosen.length > 1) return `${chosen.length} chosen`;
  return byKey.get(chosen[0])?.name ?? '1 chosen';
}

function availablePath(
  open: boolean,
  chosen: string[],
  projectId: Props['projectId']
): string | null {
  // Read when the menu opens, or when something is picked (the pill names it).
  if (!open && chosen.length === 0) return null;
  const project = projectId != null ? String(projectId).trim() : '';
  return `/api/ana-skills/available${project ? `?project=${encodeURIComponent(project)}` : ''}`;
}

interface AvailableRead {
  data: { skills: AvailableSkillDto[] } | null;
  loading: boolean;
  error?: string;
}

/**
 * The skills a person can pick, read when `path` is set. A payload without its
 * list is a failed read, never an empty one. Read with apiRequest rather than
 * the surface data hook: the composer sits in every conversation host.
 */
function useAvailableSkills(path: string | null): AvailableRead {
  const [read, setRead] = useState<AvailableRead>({ data: null, loading: false });
  useEffect(() => {
    if (!path) return;
    let live = true;
    setRead(r => ({ data: r.data, loading: true }));
    apiRequest('GET', path)
      .then(res => res.json())
      .then((body: unknown) => {
        if (!live) return;
        const skills = (body as { skills?: unknown } | null)?.skills;
        setRead(
          Array.isArray(skills)
            ? { data: { skills: skills as AvailableSkillDto[] }, loading: false }
            : { data: null, loading: false, error: 'unreadable' }
        );
      })
      .catch(() => {
        if (live) setRead({ data: null, loading: false, error: 'failed' });
      });
    return () => {
      live = false;
    };
  }, [path]);
  return read;
}

/**
 * The skills a composer's `/` menu offers (appMentions.tsx): what the Skills
 * menu would list, matching what is typed after the `/`, leaving out what is
 * already picked. Read only once the draft starts with `/`; nothing is offered
 * while the read is in flight or when the allowance is full. Picking adds the
 * skill to the conversation's picks, exactly as the Skills menu does.
 */
export function useSkillMentionSource(
  projectId: Props['projectId'],
  draft: string,
  chosen: string[],
  onChange: (keys: string[]) => void
): SkillMentionSource {
  const wanted = draft.startsWith('/');
  const path = availablePath(wanted, [], projectId);
  const available = useAvailableSkills(path);
  return useMemo(() => {
    const skills = available.data?.skills ?? [];
    const full = chosen.length >= SKILL_TURN_BUDGET.maxChosen;
    return {
      search: (query: string) =>
        full
          ? []
          : skills.filter(s => !chosen.includes(s.key) && matches(s, query.trim().toLowerCase())),
      pick: (key: string) => {
        if (!chosen.includes(key) && !full) onChange([...chosen, key]);
      },
    };
  }, [available.data, chosen, onChange]);
}

export function ComposerSkills({ projectId, chosen, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const path = availablePath(open, chosen, projectId);
  const available = useAvailableSkills(path);
  const skills = useMemo(() => available.data?.skills ?? [], [available.data]);
  const byKey = useMemo(() => new Map(skills.map(s => [s.key, s])), [skills]);

  return (
    <span className="ct-engine">
      <button
        type="button"
        className="ct-engine-pill"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false);
        }}
        data-testid="ct-skills-pill"
      >
        Skills: {pillLabel(chosen, byKey)}
      </button>
      {open && (
        <span
          className="ct-engine-menu ct-skills-menu"
          id={menuId}
          role="dialog"
          aria-label="Choose skills for this conversation"
          onKeyDown={e => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <SkillsMenu
            available={available}
            skills={skills}
            byKey={byKey}
            chosen={chosen}
            onChange={onChange}
          />
        </span>
      )}
    </span>
  );
}

function SkillsMenu({
  available,
  skills,
  byKey,
  chosen,
  onChange,
}: {
  available: { loading: boolean; error?: string };
  skills: AvailableSkillDto[];
  byKey: ReadonlyMap<string, AvailableSkillDto>;
  chosen: string[];
  onChange: (keys: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const listed = useMemo(() => {
    const rest = skills.filter(s => !chosen.includes(s.key) && matches(s, q));
    return [
      ...chosen.map(k => byKey.get(k)).filter((s): s is AvailableSkillDto => Boolean(s)),
      ...rest,
    ];
  }, [skills, chosen, byKey, q]);
  const full = chosen.length >= SKILL_TURN_BUDGET.maxChosen;
  const toggle = (key: string) =>
    onChange(chosen.includes(key) ? chosen.filter(k => k !== key) : [...chosen, key]);

  let body: React.ReactNode;
  if (available.loading)
    body = (
      <span role="status" className="ct-skills-note">
        Loading skills…
      </span>
    );
  else if (available.error)
    body = (
      <span role="alert" className="ct-skills-note">
        Couldn&apos;t load the skills. Nothing was changed; AnA still chooses on her own.
      </span>
    );
  else if (listed.length === 0)
    body = (
      <span className="ct-skills-note">
        {q ? 'No skill matches.' : 'No skills are on for this organization.'}
      </span>
    );
  else {
    body = (
      <span className="ct-skills-list" role="group" aria-label="Skills">
        {listed.map(s => {
          const on = chosen.includes(s.key);
          return (
            <label key={s.key} className="ct-skills-opt" data-on={on || undefined}>
              <input
                type="checkbox"
                checked={on}
                disabled={!on && full}
                onChange={() => toggle(s.key)}
              />
              <span className="ct-skills-opt-t">
                <span className="ct-skills-name">{s.name}</span>
                <span className="ct-skills-meta">{metaOf(s)}</span>
              </span>
            </label>
          );
        })}
      </span>
    );
  }

  return (
    <>
      <span className="ct-skills-help">
        AnA chooses skills from what you ask and what is open. Pick up to{' '}
        {SKILL_TURN_BUDGET.maxChosen} to use on every turn of this conversation.
      </span>
      <input
        type="search"
        className="c2c-input ct-skills-search"
        aria-label="Search skills"
        placeholder="Search skills"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {body}
      {full && (
        <span className="ct-skills-note">
          {SKILL_TURN_BUDGET.maxChosen} skills picked. Remove one to pick another.
        </span>
      )}
      {chosen.length > 0 && (
        <button type="button" className="ct-skills-clear" onClick={() => onChange([])}>
          Let AnA choose
        </button>
      )}
    </>
  );
}

const HOW: Record<'picked' | 'deployed', string> = { picked: 'you picked', deployed: 'project' };

/**
 * The skills AnA followed for one answer, and why each loaded: picked in this
 * conversation, deployed to the project, or chosen by her from the question
 * and what was open. The reasons are the selector's own, from the turn's
 * context_used event.
 */
export function TurnSkillsUsed({
  skills,
}: {
  skills: Array<{
    key: string;
    name: string;
    reasons: string[];
    chosen: 'picked' | 'deployed' | null;
  }>;
}) {
  return (
    <div className="ct-ground" data-testid="ct-skills-used">
      <span className="ct-ground-l">Skills</span>
      {skills.map(s => (
        <span key={s.key} className="ct-ground-chip ct-skill-chip" title={s.reasons.join('; ')}>
          {s.name}
          <span className="ct-skill-how">{s.chosen ? HOW[s.chosen] : 'AnA chose'}</span>
        </span>
      ))}
    </div>
  );
}
