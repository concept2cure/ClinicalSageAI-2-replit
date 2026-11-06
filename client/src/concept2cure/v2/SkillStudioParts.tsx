import React, { useId, useState } from 'react';
import { I } from './icons';
import { useDialog } from './useDialog';
import { useLiveData } from './dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import {
  SKILL_LIMITS,
  type OrgSkillDto,
  type SkillHistoryEntryDto,
  type SkillSelectionDto,
} from '@shared/ana/skills';
import {
  approvalRuleStatus, DESIGN_WITH_ANA, refusalOf,
  DISCIPLINE_OPTIONS,
  SEGMENT_OPTIONS,
  STATUS_OPTIONS,
  TA_OPTIONS,
  USE_CASE_OPTIONS,
  orgSkillBody,
  RULE_LEVEL_LABELS,
  type OrgEditing,
} from './surfaces/AdminSkillForms';
export { refusalOf } from './surfaces/AdminSkillForms';

/**
 * The parts of the skill studio (SkillStudio.tsx) and of a project's skill
 * dialog (ProjectSkills.tsx): the dialog shell they share, the governed reason
 * field, the skill's fields, and the studio's right column (try a question,
 * read the versions, ask AnA to draft).
 */

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

export function Field({ id, label, desc, children }: {
  id: string; label: string; desc?: string; children: React.ReactNode;
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

export function Select({ id, value, options, onChange, disabled }: {
  id: string; value: string; options: { value: string; label: string; disabled?: boolean }[];
  onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <select id={id} className="c2c-input" value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {options.map(o => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** The governed reason every skill change carries. */
export function ReasonField({ id, value, onChange }: {
  id: string; value: string; onChange: (v: string) => void;
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
  readOnly,
}: {
  id: string;
  label: string;
  desc?: string;
  rows: number;
  value: string;
  onChange: (v: string) => void;
  wide?: boolean;
  readOnly?: boolean;
}) {
  return (
    <Field id={id} label={label} desc={desc}>
      <textarea
        id={id}
        className={wide ? 'c2c-input skill-studio-method' : 'c2c-input'}
        rows={rows}
        value={value}
        readOnly={readOnly}
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
      {(!target.skill?.standingRule || target.skill.standingRule.state === 'active') && <StudioTry target={target} values={values} />}
      {target.skill && <StudioHistory skill={target.skill} />}
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
  readOnly,
  hideStatus,
}: {
  uid: string;
  values: Record<string, string>;
  set: (key: string) => (value: string) => void;
  readOnly?: boolean;
  hideStatus?: boolean;
}) {
  const facets = [
    { key: 'discipline', suffix: 'disc', label: 'Discipline', options: DISCIPLINE_OPTIONS },
    { key: 'useCase', suffix: 'use', label: 'Kind of work', options: USE_CASE_OPTIONS },
    { key: 'segment', suffix: 'seg', label: 'Client segment', options: SEGMENT_OPTIONS },
    { key: 'therapeuticArea', suffix: 'ta', label: 'Therapeutic area', options: TA_OPTIONS },
  ];
  return (
    <>
      <div className="skill-studio-row">
        {facets.map(facet => <Field key={facet.key} id={`${uid}-${facet.suffix}`} label={facet.label}>
          <Select id={`${uid}-${facet.suffix}`} value={values[facet.key]} options={facet.options} onChange={set(facet.key)} disabled={readOnly} />
        </Field>)}
      </div>
      {!hideStatus && <Field id={`${uid}-status`} label="Status" desc="A draft is never loaded; try it here first.">
        <Select
          id={`${uid}-status`}
          value={values.status}
          options={STATUS_OPTIONS}
          onChange={set('status')}
          disabled={readOnly}
        />
      </Field>}
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
  readOnly,
  hideStatus,
}: {
  uid: string;
  values: Record<string, string>;
  set: (key: string) => (value: string) => void;
  extending: boolean;
  projectOnly: boolean;
  readOnly?: boolean;
  hideStatus?: boolean;
}) {
  return (
    <div className="skill-studio-pane">
      <Field id={`${uid}-name`} label="Name">
        <input
          id={`${uid}-name`}
          className="c2c-input"
          value={values.name}
          readOnly={readOnly}
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
        readOnly={readOnly}
      />
      {extending && (
        <Field id={`${uid}-mode`} label="What it does to the library skill">
          {/* A project adds to a library skill; replacing one is the organization's decision. */}
          <Select
            id={`${uid}-mode`}
            value={values.mode}
            onChange={set('mode')}
            options={projectOnly ? MODE_OPTIONS.slice(0, 1) : MODE_OPTIONS}
            disabled={readOnly}
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
        readOnly={readOnly}
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
        readOnly={readOnly}
      />
      <StudioFacets uid={uid} values={values} set={set} readOnly={readOnly} hideStatus={hideStatus} />
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

/** Saved approval rules and their source share the skill's existing audit history. */
function StudioHistory({ skill }: { skill: OrgSkillDto }) {
  const history = useLiveData<{ history: SkillHistoryEntryDto[] }>(
    `/api/ana-skills/organization/${skill.id}/history`,
    [skill.id]
  );
  const rows = history.data?.history ?? [];
  const bindings = skill.policyBindings ?? [];
  const source = rows.find(h => h.auditEventId === skill.sourceAuditEventId);
  return (
    <>
      {skill.standingRule && <StandingRuleLedger skill={skill} />}
      {skill.libraryReceipt && <ReviewedLibraryProvenance receipt={skill.libraryReceipt} />}
      {bindings.length > 0 && (
        <section className="skill-studio-side" aria-label="Mandatory approval rules">
          <h4>Mandatory approval rules · read-only</h4>
          <span className="skill-studio-verdict">
            {approvalRuleStatus(skill)}
          </span>
          <ul className="skill-studio-hist">
            {bindings.map(binding => (
              <li key={binding.toolName}>
                <span>{binding.description}</span>
                <span className="skill-studio-hist-m">Requires approval · {binding.toolName.replace(/_/g, ' ')}</span>
              </li>
            ))}
          </ul>
          {source?.auditEventId ? (
            <a className="skill-studio-verdict" href={`#skill-${skill.id}-audit-${source.auditEventId}`}>Source audit record</a>
          ) : (
            <span className="skill-studio-hist-m">Source audit record: {skill.sourceAuditEventId ?? 'not attached'}</span>
          )}
        </section>
      )}
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
              <li key={h.auditEventId ?? `${h.occurredAt}-${i}`}
                id={h.auditEventId ? `skill-${skill.id}-audit-${h.auditEventId}` : undefined}>
                <span>
                  {h.version !== null ? `Version ${h.version}` : 'Change'} ·{' '}
                  {h.action === 'ana_skill.created' ? 'created' : 'changed'}
                  {h.status ? ` · ${h.status}` : ''}
                  {h.standingRule && ` · ${RULE_LEVEL_LABELS[h.standingRule.level]} · ${h.standingRule.state}`}
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
    </>
  );
}

function ReviewedLibraryProvenance({ receipt }: { receipt: NonNullable<OrgSkillDto['libraryReceipt']> }) {
  return <section className="skill-studio-side" aria-label="Reviewed library provenance">
    <h4>Reviewed library provenance · read-only</h4>
    <p>Installed public guidance. Active use rechecks current approval and contribution permission.</p>
    <dl><dt>Receipt schema</dt><dd>{receipt.schemaVersion}</dd><dt>Immutable library version</dt><dd>{receipt.libraryVersionId}</dd>
      <dt>Artifact SHA-256</dt><dd>{receipt.artifactSha256}</dd><dt>Approval signature SHA-256</dt><dd>{receipt.signatureHash}</dd></dl>
  </section>;
}

function StandingRuleLedger({ skill }: { skill: OrgSkillDto }) {
  const rule = skill.standingRule!;
  const date = Number.isFinite(Date.parse(rule.createdAt)) ? new Date(rule.createdAt).toLocaleString() : 'Not recorded';
  return <section className="skill-studio-side" aria-label="Standing rule ledger">
    <h4>{RULE_LEVEL_LABELS[rule.level]} · {rule.state}</h4>
    <dl className="skill-studio-hist">
      <dt>Scope</dt><dd>{rule.scope === 'project' ? `Project ${skill.projectId}` : 'This organization'}</dd>
      <dt>Version</dt><dd>{skill.version}</dd>
      <dt>Rule topic</dt><dd>{rule.conflictKey}</dd>
      <dt>Recorded</dt><dd>{date}</dd>
      <dt>Source audit event</dt><dd>{rule.sourceAuditEventId}</dd>
      <dt>Source interaction</dt><dd>{rule.sourceInteractionId}</dd>
      {rule.supersedes.length > 0 && <><dt>Replaces</dt><dd>{rule.supersedes.map(ref => `${ref.bundleId} · version ${ref.version}`).join('; ')}</dd></>}
      {rule.revokedAt && <><dt>Revoked</dt><dd>{new Date(rule.revokedAt).toLocaleString()}</dd></>}
    </dl>
    <p className="skill-studio-verdict">{rule.state !== 'active' ? 'This rule no longer applies to future work.' : rule.level === 'hard_gate'
      ? 'Mandatory approval is checked before the action runs. Turning a skill off for prompts does not remove this rule.'
      : 'The reusable method is available to future work in this scope. Its correction source is retained separately.'}</p>
    {rule.state !== 'active' && <p className="skill-studio-verdict">This record is read-only. A replacement needs a new sourced rule.</p>}
  </section>;
}
