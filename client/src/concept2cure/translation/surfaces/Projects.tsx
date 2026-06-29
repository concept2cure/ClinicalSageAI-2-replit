// Translation projects dashboard — lists translation projects with their
// source→target language pair, workflow status, per-project approved/total
// segment progress, and a submission-readiness badge. Selecting a project
// routes to the segment workspace. A governed create-project dialog seeds the
// project with ordered source segments.
//
// Reads come from GET /api/translation/projects via useTranslationProjects;
// creation POSTs to /api/translation/projects via useCreateProject. Loading /
// error / empty states and the status-chip + class conventions are reused from
// the labeling surface family (state.tsx), so the surface either renders inside
// the labeling shell CSS or alongside the same app.css.

import * as React from 'react';
import {
  useTranslationProjects,
  useCreateProject,
} from '../hooks/useTranslation';
import { LabelingIcon } from '../../labeling/icons';
import { LabelingDialog } from '../../labeling/surfaces/LabelingDialog';
import {
  Loading,
  ErrorState,
  Empty,
  NoProject,
  StatusChip,
  transStatusTone,
} from '../../labeling/surfaces/state';
import { LANGUAGES } from '@/i18n/languages';
import type {
  TranslationProject,
  TranslationStatus,
  CreateProjectRequest,
  SourceLanguage,
  TargetLanguage,
} from '@shared/types/translation';

interface ProjectsProps {
  /** Canonical shell project id (string); not used to scope reads here — the
   *  translation projects list is tenant-scoped server-side — but threaded for
   *  parity with the other surfaces and to gate rendering. */
  projectId: string | null;
  /** Routes to the segment workspace for the chosen translation project. */
  onOpenProject: (translationProjectId: number) => void;
  onAskAna: (t: string) => void;
}

// ── Display helpers ──────────────────────────────────────────────────────────

const LANG_LABEL: Record<string, string> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l.label]),
);

function langLabel(code: string): string {
  return LANG_LABEL[code] ?? code.toUpperCase();
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Sum of every segment across statuses. */
function totalSegments(counts: Partial<Record<TranslationStatus, number>> | undefined): number {
  if (!counts) return 0;
  return Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
}

function approvedSegments(counts: Partial<Record<TranslationStatus, number>> | undefined): number {
  return counts?.approved ?? 0;
}

/** Submission readiness: a project is submission-ready only when it has at least
 *  one segment and every segment is approved. Anything else is in progress. The
 *  server remains the source of truth; this is the UI affordance. */
function readiness(project: TranslationProject): {
  ready: boolean;
  tone: 'ok' | 'review';
  label: string;
} {
  const total = totalSegments(project.segmentCounts);
  const approved = approvedSegments(project.segmentCounts);
  const ready = total > 0 && approved === total;
  return ready
    ? { ready: true, tone: 'ok', label: 'Submission ready' }
    : { ready: false, tone: 'review', label: 'In progress' };
}

/** Accessible approved/total progress: a labelled meter paired with text so the
 *  state is never conveyed by the bar fill alone. */
function SegmentProgress({ project }: { project: TranslationProject }) {
  const total = totalSegments(project.segmentCounts);
  const approved = approvedSegments(project.segmentCounts);
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
  const label = total > 0 ? `${approved} of ${total} segments approved` : 'No segments yet';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
      <span className="lb-mut" style={{ fontSize: 12 }}>{label}</span>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`Approved segments: ${pct} percent`}
        style={{
          height: 6,
          borderRadius: 999,
          background: 'var(--bg-100)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--accent-main-100)',
          }}
        />
      </div>
    </div>
  );
}

// ── Create-project dialog ─────────────────────────────────────────────────────

const SOURCE_LANGS = LANGUAGES.filter((l) => l.code === 'en');
const TARGET_LANGS = LANGUAGES.filter((l) => l.code !== 'en');

interface CreateFormState {
  name: string;
  sourceLang: SourceLanguage;
  targetLang: TargetLanguage;
  sourceText: string;
}

/** One source segment per non-empty line, in order. */
function toSegments(sourceText: string): CreateProjectRequest['segments'] {
  return sourceText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, i) => ({ ordinal: i, sourceText: line }));
}

function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateProject();
  const [form, setForm] = React.useState<CreateFormState>({
    name: '',
    sourceLang: 'en',
    targetLang: 'de',
    sourceText: '',
  });
  const errId = React.useId();
  const hintId = React.useId();

  const set = <K extends keyof CreateFormState>(k: K, v: CreateFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const segments = React.useMemo(() => toSegments(form.sourceText), [form.sourceText]);
  const valid = form.name.trim().length >= 2 && segments.length > 0;
  const pending = create.isPending;
  const error = create.error as Error | null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const body: CreateProjectRequest = {
      name: form.name.trim(),
      sourceLang: form.sourceLang,
      targetLang: form.targetLang,
      segments,
    };
    await create.mutateAsync(body);
    onClose();
  };

  const formId = 'tr-create-project-form';

  return (
    <LabelingDialog
      open
      busy={pending}
      title="New translation project"
      subtitle="One source document or section rendered into one target language"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? 'Creating…' : 'Create project'}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="lb-form"
        onSubmit={onSubmit}
        aria-describedby={error ? errId : undefined}
      >
        <div className="lb-field">
          <label htmlFor="tr-name">
            Project name<span className="lb-req" aria-hidden="true">*</span>
          </label>
          <input
            id="tr-name"
            required
            minLength={2}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. IFU section 4 — German"
          />
        </div>

        <div className="lb-field-row">
          <div className="lb-field">
            <label htmlFor="tr-source">Source language</label>
            <select
              id="tr-source"
              value={form.sourceLang}
              onChange={(e) => set('sourceLang', e.target.value as SourceLanguage)}
            >
              {SOURCE_LANGS.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
          <div className="lb-field">
            <label htmlFor="tr-target">
              Target language<span className="lb-req" aria-hidden="true">*</span>
            </label>
            <select
              id="tr-target"
              value={form.targetLang}
              onChange={(e) => set('targetLang', e.target.value as TargetLanguage)}
            >
              {TARGET_LANGS.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="lb-field">
          <label htmlFor="tr-segments">
            Source segments<span className="lb-req" aria-hidden="true">*</span>
          </label>
          <textarea
            id="tr-segments"
            required
            rows={6}
            value={form.sourceText}
            onChange={(e) => set('sourceText', e.target.value)}
            aria-describedby={hintId}
            placeholder={'One segment per line, in order.\nEach line becomes a translatable unit.'}
            style={{
              fontSize: 13,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              resize: 'vertical',
              background: 'var(--bg-000)',
              color: 'var(--text-100)',
            }}
          />
          <span id={hintId} className="lb-mut" style={{ fontSize: 12 }}>
            {segments.length === 0
              ? 'Enter at least one segment. Each line is one unit.'
              : `${segments.length} ${segments.length === 1 ? 'segment' : 'segments'} will be created. Drafts start unverified and require human post-edit and back-translation before approval.`}
          </span>
        </div>

        {error && (
          <div id={errId} className="lb-form-error" role="alert">
            <LabelingIcon name="alertCircle" size={14} />
            Could not create the project. {error.message}
          </div>
        )}
      </form>
    </LabelingDialog>
  );
}

// ── Surface ──────────────────────────────────────────────────────────────────

export function TranslationProjects({ projectId, onOpenProject, onAskAna }: ProjectsProps) {
  const projects = useTranslationProjects();
  const rows = projects.data ?? [];
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Translation</div>
          <h1 className="bp-title">Projects</h1>
          <div className="bp-meta">
            Per-project approved/total progress and submission readiness
          </div>
        </div>
        <div className="bp-page-actions">
          <button
            className="bp-btn-tert"
            type="button"
            onClick={() => setCreateOpen(true)}
          >
            <LabelingIcon name="plus" /> New project
          </button>
          <button
            className="bp-btn-primary"
            type="button"
            onClick={() => onAskAna('List translation projects with segments still awaiting approval')}
          >
            Ask AnA
          </button>
        </div>
      </div>

      {!projectId ? (
        <div className="bp-card"><NoProject /></div>
      ) : (
        <div className="bp-card">
          <div className="bp-card-head">
            <span>Translation projects</span>
            <span className="bp-meta">{rows.length}</span>
          </div>
          {projects.isLoading ? (
            <Loading label="Loading translation projects…" />
          ) : projects.isError ? (
            <ErrorState message="Could not load translation projects." />
          ) : rows.length === 0 ? (
            <Empty>No translation projects yet. Create one to begin.</Empty>
          ) : (
            <table className="bp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Languages</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Readiness</th>
                  <th><span className="lb-sr-only">Open project</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p: TranslationProject) => {
                  const ready = readiness(p);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td className="lb-mut">
                        {langLabel(p.sourceLang)} → {langLabel(p.targetLang)}
                      </td>
                      <td><SegmentProgress project={p} /></td>
                      <td>
                        <StatusChip tone={transStatusTone(p.status)} label={statusLabel(p.status)} />
                      </td>
                      <td>
                        <StatusChip tone={ready.tone} label={ready.label} />
                      </td>
                      <td>
                        <button
                          className="bp-btn-tert"
                          type="button"
                          onClick={() => onOpenProject(p.id)}
                          aria-label={`Open workspace for ${p.name}`}
                        >
                          Open <LabelingIcon name="arrowRight" size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {createOpen && <CreateProjectDialog onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
