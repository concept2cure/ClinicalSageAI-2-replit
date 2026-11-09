/**
 * The project's objective of record, in the project's "About this project"
 * card (S1; founder decisions P-80, P-82).
 *
 * It reads and records the charter's objectives section
 * (GET/PUT /api/charters/by-project/:programId/objectives,
 * server/services/c2c/charter-objectives.ts): the objective, its success
 * criteria and where it was taken from (the protocol, the trial registry, the
 * sponsor's release or publication). Every version is kept, each with its
 * reason, and the history opens on demand. AnA proposes the objective from the
 * protocol and the public record in the conversation; a person records it here,
 * with a reason. No new screen: a quiet section of the project page.
 *
 * @module client/src/concept2cure/v2/surfaces/ProjectObjective
 */
import React from 'react';
import { apiRequest, assertApiResponseOk } from '@/lib/queryClient';
import { C2CForm } from '../C2CForm';
import { useLiveData } from '../dataConnect';
import { C2CToast, useToast } from '../toast';

type SourceKind = 'protocol' | 'registry' | 'publication' | 'press_release' | 'data_room' | 'other';
interface ObjectiveSource { kind: SourceKind; title: string; url?: string; locator?: string }
interface ObjectiveContent { objective: string; successCriteria: string | null; sources: ObjectiveSource[] }
interface ObjectiveRecord {
  charterId: number | null;
  current: { content: ObjectiveContent; version: number; updatedAt: string } | null;
  history: Array<{ version: number | null; eventType: string; occurredAt: string; reason: string | null }>;
}

const isRecord = (v: unknown): v is ObjectiveRecord => !!v && typeof v === 'object' && Array.isArray((v as ObjectiveRecord).history);

const SOURCE_KINDS: Array<{ value: SourceKind; label: string }> = [
  { value: 'protocol', label: 'The protocol' },
  { value: 'registry', label: 'A trial registry entry' },
  { value: 'publication', label: 'A publication' },
  { value: 'press_release', label: "The sponsor's release" },
  { value: 'data_room', label: 'A data room file' },
  { value: 'other', label: 'Other' },
];
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** The AnA request that proposes the objective from what the project and the public record hold. */
export const PROPOSE_OBJECTIVE_ASK =
  "Propose this study's objective of record. Read the protocol in the project's data room and the public record " +
  "(the trial's registry entries, the sponsor's releases and publications). Give the objective, its primary and key " +
  'secondary success criteria, and the source of each, with section or link. Say where the sources disagree.';

/** The first source as the form states it: an http(s) address is its link, anything else its locator. */
function sourceFrom(v: Record<string, string>): ObjectiveSource | null {
  const title = v.sourceTitle?.trim();
  if (!title) return null;
  const link = v.sourceLink?.trim() ?? '';
  const isUrl = /^https?:\/\//i.test(link);
  return { kind: (v.sourceKind || 'other') as SourceKind, title, ...(link && isUrl ? { url: link } : {}), ...(link && !isUrl ? { locator: link } : {}) };
}

/** The recorded objective: its words, criteria and sources, and its versions on demand. Under the project's
 *  description, as Claude states what a project is for (D3-1, D3.md §4.3): no box, no tint. */
function ObjectiveView({ record }: { record: ObjectiveRecord }) {
  const current = record.current;
  if (!current) return <p className="pj-objective-s">No objective is recorded for this project yet.</p>;
  return (
    <>
      <p className="pj-objective-t">{current.content.objective}</p>
      {current.content.successCriteria && <p className="pj-objective-t">{current.content.successCriteria}</p>}
      {current.content.sources.length > 0 && (
        <ul className="pj-objective-s">
          {current.content.sources.map((s, i) => (
            <li key={i}>From {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}{s.locator ? `, ${s.locator}` : ''}</li>
          ))}
        </ul>
      )}
      <details className="pj-more">
        <summary>Version {current.version}, {dayOf(current.updatedAt)}</summary>
        <ol className="pj-objective-s">
          {record.history.map((h, i) => (
            <li key={i}>{h.version != null ? `Version ${h.version}` : 'Charter started'}, {dayOf(h.occurredAt)}{h.reason ? `: ${h.reason}` : ''}</li>
          ))}
        </ol>
      </details>
    </>
  );
}

/** The governed form that records a version of the objective, with its reason. */
function ObjectiveForm({ current, onCancel, onSubmit }: {
  current: ObjectiveRecord['current'];
  onCancel: () => void;
  onSubmit: (v: Record<string, string>) => void;
}) {
  const first = current?.content.sources[0];
  return (
    <C2CForm
      config={{
        eyebrow: 'Project · objective',
        title: current ? 'Record a new version of the objective' : "Record the project's objective",
        sub: 'What the project sets out to achieve, as its source states it. Every version is kept with its reason.',
        governed: 'Recorded with your reason in the audit trail.',
        submitLabel: 'Record objective',
        fields: [
          { key: 'objective', label: 'Objective', type: 'textarea', required: true, default: current?.content.objective ?? '' },
          { key: 'successCriteria', label: 'Success criteria (optional)', type: 'textarea', default: current?.content.successCriteria ?? '',
            placeholder: 'e.g. The primary endpoint met at one-sided alpha 0.025' },
          { key: 'sourceKind', label: 'Taken from', type: 'select', options: SOURCE_KINDS, half: true, default: first?.kind ?? 'protocol' },
          { key: 'sourceTitle', label: 'Source', type: 'text', half: true, default: first?.title ?? '', placeholder: 'e.g. Protocol C2C-101-201' },
          { key: 'sourceLink', label: 'Section or link (optional)', type: 'text', default: first?.url ?? first?.locator ?? '',
            placeholder: 'e.g. Section 2.1, or https://clinicaltrials.gov/…' },
          { key: 'reason', label: 'Reason', type: 'text', required: true, placeholder: 'e.g. Taken from the final protocol, version 3.0' },
        ],
      }}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  );
}

export function ProjectObjective({ programId, canEdit, onAsk }: {
  programId: string;
  canEdit: boolean;
  onAsk?: (text: string) => void;
}) {
  const [toast, notify] = useToast();
  const path = `/api/charters/by-project/${encodeURIComponent(programId)}/objectives`;
  const [version, setVersion] = React.useState(0);
  const read = useLiveData<ObjectiveRecord>(path, [path, version], isRecord);
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Nothing is shown while it loads; a failed or unreadable read says so and never takes the page down.
  if (!read.data) return read.loading ? null : <p className="pj-objective pj-objective-s" role="note">The project's objective could not be read.</p>;
  const record = read.data;
  const current = record.current;

  const save = async (v: Record<string, string>) => {
    setBusy(true);
    try {
      const edited = sourceFrom(v);
      const sources = [...(edited ? [edited] : []), ...(current?.content.sources.slice(1) ?? [])];
      const res = await apiRequest('PUT', path, { objective: v.objective, successCriteria: v.successCriteria || undefined, sources, reason: v.reason });
      if (!res.ok) await assertApiResponseOk(res);
      notify(current ? "The project's objective is recorded as a new version." : "The project's objective is recorded.");
      setEditing(false);
      setVersion((n) => n + 1);
    } catch (e) {
      notify(`The objective was not recorded: ${e instanceof Error ? e.message : 'the save failed'}. Nothing was changed.`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pj-objective" aria-labelledby={`pj-objective-${programId}`}>
      <div className="pj-objective-k">
        <h2 id={`pj-objective-${programId}`}>Objective</h2>
        <span className="pj-objective-acts">
          {onAsk && <button type="button" className="btn ghost small" onClick={() => onAsk(PROPOSE_OBJECTIVE_ASK)}>Ask AnA to propose it</button>}
          {canEdit && <button type="button" className="btn ghost small" disabled={busy} onClick={() => setEditing(true)}>{current ? 'Edit' : 'Set the objective'}</button>}
        </span>
      </div>
      <ObjectiveView record={record} />
      {editing && <ObjectiveForm current={current} onCancel={() => setEditing(false)} onSubmit={(v) => void save(v)} />}
      <C2CToast msg={toast} />
    </section>
  );
}

/** New project's objective field (optional): recorded as the charter's objective once the project exists (S1). Moved
 *  here from Projects.tsx (2026-11-05), beside the card that shows it, to keep Projects.tsx under the 100 kB ceiling. */
export function NewProjectObjectiveField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="npw-field npw-field-wide">
      <label className="npw-field-l" htmlFor="npw-objective">Objective (optional)</label>
      {/* The server's limit (charter-objectives.ts objectivesBodySchema, checked by POST /api/c2c/projects). */}
      <textarea id="npw-objective" className="c2c-input" rows={3} value={value} maxLength={4000} aria-describedby="npw-objective-help"
        onChange={e => onChange(e.target.value)}
        /* For every filing type: a device 510(k) has no study endpoint to state (human test J1, 2026-11-06). */
        placeholder="What this project must achieve, e.g. study-may-proceed on the IND, or 510(k) clearance, and by when." />
      <span className="npw-field-help" id="npw-objective-help">
        Recorded as the project's objective, with its history. You can add its sources on the project page, or ask AnA to propose it from the protocol and the public record.
      </span>
    </div>
  );
}

/** The objective's row in New project's review step. */
export function NewProjectObjectiveReview({ value }: { value: string }) {
  return (
    <div className="npw-review-row">
      <dt>Objective</dt>
      <dd>{value.trim() || 'Not stated'}</dd>
    </div>
  );
}
