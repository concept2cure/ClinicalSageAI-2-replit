import React, { useId, useState } from 'react';
import { I } from './icons';
import { apiRequest } from '@/lib/queryClient';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import {
  extendsLibrary,
  orgSkillBody,
  studioDefaults,
  studioTitle,
  type OrgEditing,
} from './surfaces/AdminSkillForms';
import {
  ReasonField,
  SkillDialogShell,
  StudioAside,
  StudioFields,
  refusalOf,
} from './SkillStudioParts';
import './styles/ana-skills.css';

/**
 * The skill studio: where an organization's skill is designed, tried and tuned
 * before it changes what AnA does (docs/design/ANA_SKILLS_2026-10-22.md §9).
 *
 *   Design   the skill's name, when to use it, its method and its trigger
 *            phrases; for a library skill, whether it adds to it or replaces it.
 *   Try      a question, answered with the selection AnA would make with this
 *            draft in force (POST /api/ana-skills/test with `draft`). Nothing
 *            is stored, and the draft is marked in the result.
 *   Tune     the skill's versions: who changed it, when, and why
 *            (GET /api/ana-skills/organization/:id/history, the audit rows).
 *   Save     with a stated reason. The change and its chained audit row commit
 *            together on the server, or nothing does.
 *
 * Used from Admin and access → Skills (the organization's skills) and from a
 * project's Skills card (a skill written for that project).
 */

interface Props {
  target: OrgEditing;
  onClose: () => void;
  /** Told the confirmation to show once the skill is saved. */
  onSaved: (message: string) => void;
  /** Hands a prompt to AnA's conversation (the shell's onAsk), when there is one. */
  onAsk?: (text: string) => void;
}

function saveRequest(target: OrgEditing): { method: 'POST' | 'PUT'; url: string } {
  const project = target.projectId ?? target.skill?.projectId ?? null;
  const base = project
    ? `/api/ana-skills/projects/${encodeURIComponent(String(project))}/skills`
    : '/api/ana-skills/organization';
  return target.skill
    ? { method: 'PUT', url: `${base}/${target.skill.id}` }
    : { method: 'POST', url: base };
}
function studioSub(extending: boolean, mode: string): string {
  if (!extending)
    return 'AnA selects this skill when a question contains one of its trigger phrases, or when someone picks it.';
  return mode === 'replace'
    ? 'AnA follows this method instead of the library method whenever the library skill is selected.'
    : 'AnA follows this after the library method whenever the library skill is selected.';
}

export function SkillStudio({ target, onClose, onSaved, onAsk }: Props) {
  const uid = useId();
  const [v, setV] = useState<Record<string, string>>(() => studioDefaults(target));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: string) => (value: string) => setV(prev => ({ ...prev, [key]: value }));
  const extending = extendsLibrary(target);
  const project = target.projectId ?? target.skill?.projectId ?? null;

  const save = async () => {
    const stated = reason.trim();
    if (stated.length < GOVERNED_REASON_MIN) {
      setError(`A reason of at least ${GOVERNED_REASON_MIN} characters is required.`);
      return;
    }
    setBusy(true);
    setError(null);
    const body = orgSkillBody(target, v, stated);
    const { method, url } = saveRequest(target);
    try {
      await apiRequest(method, url, body);
      onSaved(
        target.skill
          ? `${body.name} saved, version ${target.skill.version + 1}.`
          : `${body.name} created.`
      );
    } catch (e) {
      setError(
        refusalOf(e, target.skill ? 'The skill was not changed.' : 'The skill was not created.')
      );
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
        onClick={() => void save()}
        disabled={busy}
        data-testid="skill-studio-save"
      >
        {busy ? 'Saving…' : target.skill ? 'Save skill' : 'Create skill'}
      </button>
    </>
  );

  return (
    <SkillDialogShell
      eyebrow={project ? 'Skills · this project' : 'Skills · your organization'}
      title={studioTitle(target)}
      sub={studioSub(extending, v.mode)}
      busy={busy}
      onClose={onClose}
      wide
      testId="skill-studio"
      footer={footer}
    >
      <div className="skill-studio-cols">
        <StudioFields
          uid={uid}
          values={v}
          set={set}
          extending={extending}
          projectOnly={project !== null}
        />
        <StudioAside target={target} values={v} onClose={onClose} onAsk={onAsk} />
      </div>
      <ReasonField id={`${uid}-reason`} value={reason} onChange={setReason} />
      <div className="de-gov">
        <span className="ico">{I.lock}</span>
        <span className="de-gov-t">
          Saving changes the method AnA follows for everyone{' '}
          {project ? 'in this project' : 'in this organization'}. The skill before and after, and
          your reason, are recorded in the audit trail.
        </span>
      </div>
      {error && (
        <div className="de-err" role="alert">
          {error}
        </div>
      )}
    </SkillDialogShell>
  );
}
