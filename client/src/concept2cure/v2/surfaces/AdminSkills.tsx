import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { apiRequest, ApiRequestError, serverMessage } from '@/lib/queryClient';
import { C2CForm } from '../C2CForm';
import { C2CToast, useToast } from '../toast';
import {
  SKILL_DISCIPLINE_LABELS,
  SKILL_SEGMENT_LABELS,
  type LibrarySkillDetailDto,
  type LibrarySkillSummaryDto,
  type OrgSkillDto,
  type SkillSelectionDto,
  type SkillUsageDto,
} from '@shared/ana/skills';
import {
  DISCIPLINE_OPTIONS,
  MARKET_OPTIONS,
  REASON_REQUIRED,
  SEGMENT_OPTIONS,
  reasonOf,
  toggleForm,
  type Editing,
} from './AdminSkillForms';
import { SkillStudio } from '../SkillStudio';

/**
 * Skills — the Admin and access tab where an administrator decides which
 * methods AnA follows for this organization (docs/design/ANA_SKILLS_2026-10-22.md).
 *
 *   Skill library      the platform's skills, filtered by client segment and
 *                      discipline; each one readable whole, turned off or on
 *                      with a reason, added to or replaced by the
 *                      organization's own text.
 *   Your skills        the organization's own skills, designed, tried and
 *                      tuned in the skill studio (SkillStudio.tsx), saved
 *                      with a reason.
 *   Test a question    which skills AnA would load for a question, and why.
 *
 * Every change goes to /api/ana-skills, which takes the stated reason and
 * writes the change with its chained audit row, or writes nothing. A failed
 * read says so; it is never shown as an empty library.
 */

interface LibraryPayload {
  skills: LibrarySkillSummaryDto[];
  withheld: string[];
}

const TEST_SUBMISSION_OPTIONS = ['', 'US_IND', 'US_NDA', 'US_BLA', 'US_ANDA', 'US_510K', 'US_DE_NOVO', 'US_PMA', 'EU_MAA', 'EU_IVDR'];

function segmentsLabel(segments: string[]): string {
  if (segments.length === 0) return 'Every segment';
  return segments.map((s) => SKILL_SEGMENT_LABELS[s as keyof typeof SKILL_SEGMENT_LABELS] ?? s).join(', ');
}

/** What the server said, or a sentence that says only what did not happen. */
function refusalOf(e: unknown, fallback: string): string {
  return (e instanceof ApiRequestError ? serverMessage(e.payload) : null) ?? fallback;
}

interface LibraryFilters {
  q: string;
  segment: string;
  discipline: string;
  /** A market the skill is written for; a skill for every market is not "written for" one. */
  market: string;
  /** 'used' or 'unused' in the usage window; '' for either. */
  use: string;
}

type UsageRow = SkillUsageDto['skills'][number];

function matchesFilters(s: LibrarySkillSummaryDto, f: LibraryFilters, used: ReadonlyMap<string, UsageRow> | null): boolean {
  if (f.segment && s.segments.length > 0 && !s.segments.includes(f.segment as never)) return false;
  if (f.discipline && !s.disciplines.includes(f.discipline as never)) return false;
  if (f.market && !s.regions.includes(f.market as never)) return false;
  if (f.use && used && (f.use === 'used') !== used.has(s.key)) return false;
  return !f.q || s.name.toLowerCase().includes(f.q) || s.key.includes(f.q) || s.description.toLowerCase().includes(f.q);
}

/** A usage read, whole; anything else is a failed read, never "unused". */
function isUsage(value: unknown): value is SkillUsageDto {
  const v = value as Partial<SkillUsageDto> | null;
  return !!v && typeof v.days === 'number' && typeof v.turnsRead === 'number' && Array.isArray(v.skills);
}

const USAGE_DAYS = 30;

function usesLabel(row: UsageRow | undefined): string {
  if (!row) return 'not used';
  return row.turns === 1 ? 'used once' : `used ${row.turns}×`;
}

function orgStatusPill(status: OrgSkillDto['status']): string {
  if (status === 'active' || status === 'locked') return 'active';
  return status === 'draft' ? 'draft' : 'idle';
}

export function AdminSkills({ onAsk }: { onAsk?: (text: string) => void } = {}) {
  const [epoch, setEpoch] = useState(0);
  const reload = () => setEpoch((n) => n + 1);
  const library = useLiveData<LibraryPayload>('/api/ana-skills/library', ['/api/ana-skills/library', epoch]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [toast, fireToast] = useToast();

  const send = async (method: 'PUT' | 'POST', url: string, body: unknown, done: string, failed: string) => {
    try {
      await apiRequest(method, url, body);
      fireToast(done);
      reload();
    } catch (e) {
      fireToast(refusalOf(e, failed), 'error');
    }
  };

  const submitToggle = async (skill: LibrarySkillSummaryDto, v: Record<string, string>) => {
    const reason = reasonOf(v);
    if (!reason) {
      fireToast(REASON_REQUIRED, 'error');
      return;
    }
    setEditing(null);
    await send(
      'PUT',
      `/api/ana-skills/library/${encodeURIComponent(skill.key)}/enabled`,
      { enabled: !skill.enabled, reason },
      skill.enabled ? `${skill.name} is off for this organization.` : `${skill.name} is on for this organization.`,
      'The skill was not changed.',
    );
  };

  const savedOrgSkill = (message: string) => {
    setEditing(null);
    fireToast(message);
    reload();
  };

  return (
    <>
      <SkillLibrary
        library={library}
        epoch={epoch}
        reload={reload}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        onEdit={setEditing}
      />
      <OrgSkills epoch={epoch} reload={reload} onEdit={setEditing} />
      <SkillTest />

      {editing?.kind === 'toggle' && (
        <C2CForm config={toggleForm(editing.skill)} onCancel={() => setEditing(null)} onSubmit={(v) => void submitToggle(editing.skill, v)} />
      )}
      {editing?.kind === 'org' && (
        <SkillStudio target={editing} onClose={() => setEditing(null)} onSaved={savedOrgSkill} onAsk={onAsk} />
      )}
      <C2CToast msg={toast} />
    </>
  );
}

interface LiveRead<T> {
  data: T | null | undefined;
  loading: boolean;
  error?: unknown;
}

/** The platform library: filters, the list, and the selected skill's drawer. */
function SkillLibrary({
  library,
  epoch,
  reload,
  selectedKey,
  onSelect,
  onEdit,
}: {
  library: LiveRead<LibraryPayload>;
  epoch: number;
  reload: () => void;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onEdit: (e: Editing) => void;
}) {
  const [filters, setFilters] = useState<LibraryFilters>({ q: '', segment: '', discipline: '', market: '', use: '' });
  const usage = useLiveData<SkillUsageDto>(`/api/ana-skills/usage?days=${USAGE_DAYS}`, [epoch], isUsage);
  const used = useMemo(() => (usage.data ? new Map(usage.data.skills.map((r) => [r.key, r])) : null), [usage.data]);
  const skills = useMemo(() => library.data?.skills ?? [], [library.data]);
  const visible = useMemo(() => {
    const f = { ...filters, q: filters.q.trim().toLowerCase() };
    return skills.filter((s) => matchesFilters(s, f, used));
  }, [skills, filters, used]);
  const onCount = skills.filter((s) => s.enabled).length;
  const reviewedCount = skills.filter((s) => s.review.state === 'reviewed').length;

  return (
    <>
      <section className="section">
        <div className="section-head">
          <h2>Skill library</h2>
          <span className="section-sub">
            {library.data ? `${skills.length} skills · ${onCount} on for this organization · ${reviewedCount} reviewed by a named reviewer` : ''}
          </span>
        </div>
        <LibraryToolbar filters={filters} onChange={setFilters} usageRead={Boolean(usage.data)} />
        <UsageSummary usage={usage} />
      </section>

      {library.loading ? (
        <div role="status" className="adm-empty">Loading the skill library…</div>
      ) : library.error ? (
        <div className="adm-facet-error">
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load the skill library"
            hint="The read failed, so no skills are shown. This is not an empty library."
            retry={reload}
          />
        </div>
      ) : (
        <div className="adm-members-layout">
          <section className="section">
            {(library.data?.withheld.length ?? 0) > 0 && (
              <div className="adm-empty" role="note">
                {library.data!.withheld.length} skill(s) failed the library's checks in this build and are not served: {library.data!.withheld.join(', ')}.
              </div>
            )}
            {visible.length === 0 ? (
              <div className="adm-empty">No skill matches these filters.</div>
            ) : (
              <LibraryRows skills={visible} selectedKey={selectedKey} onSelect={onSelect} used={used} />
            )}
          </section>

          {selectedKey && (
            <SkillDrawer skillKey={selectedKey} epoch={epoch} reload={reload} onEdit={onEdit} usage={used ? (used.get(selectedKey) ?? null) : undefined} />
          )}
        </div>
      )}
    </>
  );
}

/** Search and the filters: segment, discipline, the market a skill is written for, and use. */
function LibraryToolbar({
  filters,
  onChange,
  usageRead,
}: {
  filters: LibraryFilters;
  onChange: (f: LibraryFilters) => void;
  /** The use filter needs the use read; without it, it is not offered. */
  usageRead: boolean;
}) {
  const set = (key: keyof LibraryFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...filters, [key]: e.target.value });
  return (
    <div className="adm-skills-toolbar">
      <input type="search" className="adm-skills-search" aria-label="Search skills" placeholder="Search skills" value={filters.q} onChange={set('q')} />
      <select aria-label="Client segment" className="adm-skills-filter" value={filters.segment} onChange={set('segment')}>
        {SEGMENT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select aria-label="Discipline" className="adm-skills-filter" value={filters.discipline} onChange={set('discipline')}>
        <option value="">Every discipline</option>
        {DISCIPLINE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select aria-label="Written for a market" className="adm-skills-filter" value={filters.market} onChange={set('market')}>
        {MARKET_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select aria-label="Use" className="adm-skills-filter" value={filters.use} onChange={set('use')} disabled={!usageRead}>
        <option value="">Any use</option>
        <option value="used">Used by AnA in the last {USAGE_DAYS} days</option>
        <option value="unused">Not used in the last {USAGE_DAYS} days</option>
      </select>
    </div>
  );
}

/** How much AnA used the library in the window, or why that cannot be said. */
function UsageSummary({ usage }: { usage: { data: SkillUsageDto | null; loading: boolean; error?: string } }) {
  if (usage.loading) return null;
  if (usage.error || !usage.data) {
    return (
      <p className="adm-sub" role="status">
        Couldn&apos;t read how often AnA used each skill. The library below is complete; only its use is not shown.
      </p>
    );
  }
  const u = usage.data;
  const scope = u.capped ? `the latest ${u.turnsRead} turns of the last ${u.days} days` : `the last ${u.days} days`;
  return (
    <p className="adm-sub" data-testid="skills-usage-summary">
      In {scope}, AnA answered {u.turnsRead} turn{u.turnsRead === 1 ? '' : 's'}; {u.turnsWithSkills} followed at least one skill, and{' '}
      {u.skills.length} different skill{u.skills.length === 1 ? ' was' : 's were'} used.
    </p>
  );
}

function usageSentence(row: UsageRow | null): string {
  if (!row) return `Not loaded by AnA in the last ${USAGE_DAYS} days.`;
  const chosen = [row.picked ? `${row.picked} picked in a conversation` : null, row.deployed ? `${row.deployed} deployed to a project` : null]
    .filter(Boolean)
    .join(', ');
  const last = row.lastUsedAt ? ` Last used ${new Date(row.lastUsedAt).toLocaleDateString()}.` : '';
  return `Loaded in ${row.turns} turn${row.turns === 1 ? '' : 's'} in the last ${USAGE_DAYS} days${chosen ? ` (${chosen}; the rest chosen by AnA)` : ', each chosen by AnA'}.${last}`;
}

/** The library skills that pass the filters, one button each. */
function LibraryRows({
  skills,
  selectedKey,
  onSelect,
  used,
}: {
  skills: LibrarySkillSummaryDto[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Use in the window, by key; null while unread or unreadable (then nothing is said about use). */
  used: ReadonlyMap<string, UsageRow> | null;
}) {
  return (
    <div className="ctable" aria-label="Skill library">
      {skills.map((s) => (
        <button
          key={s.key}
          className="ctable-row adm-skill-row"
          data-on={selectedKey === s.key || undefined}
          aria-current={selectedKey === s.key || undefined}
          onClick={() => onSelect(s.key)}
        >
          <span className="adm-skill-name" data-depth={s.key.split('.').length - 1}>
            <span className="ctable-strong">{s.name}</span>
            <span className="mono tiny adm-muted">{s.key}</span>
          </span>
          <span className="adm-sub">
            {segmentsLabel(s.segments)}
            {used && <span className="adm-muted"> · {usesLabel(used.get(s.key))}</span>}
          </span>
          <span>
            <span className={`status-pill ${s.enabled ? 'active' : 'idle'}`}>{s.enabled ? 'On' : 'Off'}</span>
          </span>
          <span>
            {s.extendedBy.length > 0 && <span className="adm-scope">{s.extendedBy.length} of yours</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/** One library skill, whole: what selects it, what it cites, its method, and what to do with it. */
function SkillDrawer({
  skillKey,
  epoch,
  reload,
  onEdit,
  usage,
}: {
  skillKey: string;
  epoch: number;
  reload: () => void;
  onEdit: (e: Editing) => void;
  /** The skill's use in the window: a row, null for not used, undefined when use could not be read. */
  usage?: UsageRow | null;
}) {
  const detail = useLiveData<{ skill: LibrarySkillDetailDto }>(`/api/ana-skills/library/${encodeURIComponent(skillKey)}`, [skillKey, epoch]);
  const sel = detail.data?.skill ?? null;
  if (detail.loading) {
    return (
      <aside className="adm-drawer" aria-label="Skill">
        <div role="status" className="adm-sub">Loading the skill…</div>
      </aside>
    );
  }
  if (detail.error || !sel) {
    return (
      <aside className="adm-drawer" aria-label="Skill">
        <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load this skill" hint="The read failed; nothing about the skill is shown." retry={reload} />
      </aside>
    );
  }
  const customize = (mode: 'addendum' | 'replace') => onEdit({ kind: 'org', skill: null, base: sel, mode });
  return (
    <aside className="adm-drawer" aria-label="Skill">
      <div className="adm-drawer-head">
        <div>
          <div className="adm-drawer-name">{sel.name}</div>
          <div className="adm-drawer-email mono">{sel.key} · version {sel.version} · {sel.contentHash}</div>
        </div>
      </div>
      <p className="adm-role-desc">{sel.description}</p>
      <div className="drawer-meta">
        <div><div className="k">Status</div><div className="v">{sel.enabled ? 'On' : `Off${sel.disabledReason ? ` — ${sel.disabledReason}` : ''}`}</div></div>
        <div><div className="k">Review</div><div className="v">{sel.review.state === 'reviewed' ? 'Reviewed' : 'Not yet reviewed'}</div></div>
        <div><div className="k">Segments</div><div className="v">{segmentsLabel(sel.segments)}</div></div>
        <div><div className="k">Discipline</div><div className="v">{sel.disciplines.map((d) => SKILL_DISCIPLINE_LABELS[d]).join(', ')}</div></div>
      </div>
      <p className="adm-sub">{sel.review.note}</p>
      {usage !== undefined && <p className="adm-sub" data-testid="skill-usage">{usageSentence(usage)}</p>}
      <div className="drawer-section-lbl">Loaded when a question mentions</div>
      <div className="adm-scopes">
        {sel.triggers.length === 0 ? <span className="adm-sub">No phrases: loaded on its screen or document only.</span> : sel.triggers.map((t) => <span key={t} className="adm-scope mono tiny">{t}</span>)}
      </div>
      {sel.tools.length > 0 && (
        <>
          <div className="drawer-section-lbl">Engines it routes to</div>
          <div className="adm-scopes">{sel.tools.map((t) => <span key={t} className="adm-scope mono tiny">{t}</span>)}</div>
        </>
      )}
      {sel.references.length > 0 && (
        <>
          <div className="drawer-section-lbl">Cites</div>
          <ul className="adm-skill-refs">{sel.references.map((r) => <li key={`${r.kind}:${r.id}`}>{r.label}</li>)}</ul>
        </>
      )}
      <div className="drawer-section-lbl">Method</div>
      <pre className="adm-skill-method" tabIndex={0} aria-label={`Method of ${sel.name}`}>{sel.instructions}</pre>
      {sel.extendedBy.length > 0 && (
        <>
          <div className="drawer-section-lbl">Your skills on it</div>
          <div className="adm-scopes">{sel.extendedBy.map((x) => <span key={x.bundleId} className="adm-scope">{x.name} · {x.mode === 'replace' ? 'replaces it' : 'adds to it'} · {x.status}</span>)}</div>
        </>
      )}
      <div className="drawer-actions">
        <button className="btn small" onClick={() => onEdit({ kind: 'toggle', skill: sel })}>{sel.enabled ? 'Turn off' : 'Turn on'}</button>
        <button className="btn small ghost" onClick={() => customize('addendum')}>{I.plus} Add to it</button>
        <button className="btn small ghost" onClick={() => customize('replace')}>Replace with ours</button>
      </div>
    </aside>
  );
}

/** The organization's own skills. */
function OrgSkills({ epoch, reload, onEdit }: { epoch: number; reload: () => void; onEdit: (e: Editing) => void }) {
  const orgSkills = useLiveData<{ skills: OrgSkillDto[] }>('/api/ana-skills/organization?archived=1', ['/api/ana-skills/organization', epoch]);
  const rows = orgSkills.data?.skills ?? [];
  return (
    <>
      <section className="section">
        <div className="section-head">
          <h2>Your skills</h2>
          <span className="section-sub">Written by this organization's administrators</span>
          <button className="btn small primary adm-key-create" onClick={() => onEdit({ kind: 'org', skill: null, base: null, mode: null })}>{I.plus} New skill</button>
        </div>
      </section>
      {orgSkills.loading ? (
        <div role="status" className="adm-empty">Loading your skills…</div>
      ) : orgSkills.error ? (
        <div className="adm-facet-error">
          <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load your skills" hint="The read failed. This is not an organization without skills." retry={reload} />
        </div>
      ) : rows.length === 0 ? (
        <div className="adm-empty">This organization has no skills of its own yet. Add to a library skill, replace one, or write a new one.</div>
      ) : (
        <div className="ctable" aria-label="Your skills">
          {rows.map((s) => (
            <button key={s.id} className="ctable-row adm-skill-row" onClick={() => onEdit({ kind: 'org', skill: s, base: null, mode: s.extensionMode })}>
              <span className="adm-skill-name">
                <span className="ctable-strong">{s.name}</span>
                <span className="mono tiny adm-muted">{s.extendsSkillKey ? `${s.extensionMode === 'replace' ? 'replaces' : 'adds to'} ${s.extendsSkillKey}` : 'stands alone'}</span>
              </span>
              <span className="adm-sub">version {s.version}</span>
              <span><span className={`status-pill ${orgStatusPill(s.status)}`}>{s.status}</span></span>
              <span className="adm-sub">{s.triggers.length} trigger(s)</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Which skills AnA would load for a question, and why: a dry run that records nothing. */
function SkillTest() {
  const [message, setMessage] = useState('');
  const [submissionType, setSubmissionType] = useState('');
  const [result, setResult] = useState<SkillSelectionDto | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setFailure(null);
    try {
      const res = await apiRequest('POST', '/api/ana-skills/test', { message, submissionType: submissionType || null });
      const body = (await res.json()) as { selection: SkillSelectionDto };
      setResult(body.selection);
    } catch (err) {
      setResult(null);
      setFailure(refusalOf(err, 'The question could not be tested.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <div className="section-head">
        <h2>Test a question</h2>
        <span className="section-sub">Which skills AnA would load, and why. Nothing is recorded.</span>
      </div>
      <form className="adm-skills-test" onSubmit={(e) => void run(e)}>
        <label className="adm-sub" htmlFor="adm-skills-test-q">Question</label>
        <textarea
          id="adm-skills-test-q"
          className="adm-skills-question"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How do we justify a 24-month shelf life from our registration batches?"
        />
        <div className="adm-skills-toolbar">
          <select aria-label="Submission type" className="adm-skills-filter" value={submissionType} onChange={(e) => setSubmissionType(e.target.value)}>
            {TEST_SUBMISSION_OPTIONS.map((t) => (
              <option key={t} value={t}>{t ? t : 'No submission type'}</option>
            ))}
          </select>
          <button type="submit" className="btn small primary" disabled={busy || !message.trim()}>{busy ? 'Testing…' : 'Test'}</button>
        </div>
      </form>
      {failure && <div className="adm-empty" role="alert">{failure}</div>}
      {result && (
        <div className="adm-skills-result" aria-live="polite">
          {result.selected.length === 0 ? (
            <div className="adm-empty">No skill would load for this question ({result.considered} considered).</div>
          ) : (
            <ol className="adm-skill-refs">
              {result.selected.map((s) => (
                <li key={s.key}>
                  <span className="ctable-strong">{s.name}</span> <span className="mono tiny adm-muted">{s.key} · version {s.version}</span>
                  <div className="adm-sub">Because {s.reasons.join('; ')}.</div>
                  {s.attached.map((a) => (
                    <div key={a.key} className="adm-sub">With your skill {a.name} ({a.mode === 'replace' ? 'in its place' : 'added'}).</div>
                  ))}
                </li>
              ))}
            </ol>
          )}
          {result.passedOver.length > 0 && (
            <div className="adm-sub">Also matched, not loaded: {result.passedOver.map((p) => `${p.name} (${p.why})`).join('; ')}.</div>
          )}
        </div>
      )}
    </section>
  );
}
