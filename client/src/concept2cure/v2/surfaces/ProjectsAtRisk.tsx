/**
 * "Which projects are at risk this week?" on Projects (P-122 §3.2, 2026-11-10).
 *
 * D2-1 (78842ee08) removed the header button that sent this question to AnA,
 * which had no risk data to answer from. The engines that can answer it run on
 * the server, and 280035bd9 admitted their reads for Projects, each limited to
 * the projects the person can open:
 *   GET /api/sentinel/findings      Sentinel's analyzers (deadline risk,
 *                                   cross-project conflicts, quality drift…),
 *                                   open findings, most severe first;
 *   GET /api/submission-ops/blockers the open blockers in the submission
 *                                   operations register;
 *   GET /api/submission-ops/due-soon the work items due within 7 days, or overdue.
 * This lists what each returns, in its order, and computes nothing (Rule 2). An
 * empty answer names what was looked at ("No blockers recorded"), never "no
 * risk", and a failed read is said as one. Nothing is read until the person asks.
 *
 * Each row names its project and opens it (F1, 2026-11-12 and -13). Every row
 * of the three reads carries the project it was recorded on and that project's
 * filing project, the one a card on Projects carries, with the program the card
 * opens (`project`; a finding about several projects carries `projects`). The
 * server resolves them, and names a filing project only when the person can
 * open it. So:
 *   - a row ends with its filing project's name as a link that opens it;
 *   - a row recorded on a work area inside a project says the work area too;
 *   - a project the person cannot open, or one with no program to open, is
 *     named in plain words with no link; a row with no project says nothing.
 * The names are the server's, read with the rows. The browser matches nothing.
 *
 * Split out of Projects.tsx, which is at the 100 kB file ceiling.
 */
import React from 'react';
import { useLiveData, type DataState } from '../dataConnect';
import { I } from '../icons';
import { enumWords } from './projectWords';

/** The project a row was recorded on, and its filing project when the person can open it (the server's shape). */
interface NamedProject { id: number; name: string; root: { id: number; name: string; programId: string | null } | null }
interface Finding {
  finding_id: string; analyzer_type: string; severity: string; title: string; summary?: string | null; created_at?: string | null;
  project?: unknown; projects?: unknown;
}
interface Findings { findings: Finding[]; total: number }
interface Blocker { blockerId: string; severity: string; title: string; nextAction?: string | null; ownerName?: string | null; dueAt?: string | null; project?: unknown }
interface DueWork { work_item_id: string; title: string; owner_name?: string | null; due_at?: string | null; project?: unknown }
interface DueSoon { data: { canonicalTasks: DueWork[] } }

/** A filing project as Projects opens one: the program's id and the project's name. */
export interface RiskProject { id: string; title: string }

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFindings = (v: unknown): v is Findings => object(v) && Array.isArray(v.findings) && typeof v.total === 'number';
const isBlockers = (v: unknown): v is Blocker[] => Array.isArray(v);
const isDueSoon = (v: unknown): v is DueSoon => object(v) && object(v.data) && Array.isArray(v.data.canonicalTasks);

export const FINDINGS_URL = '/api/sentinel/findings?status=open&limit=20';
export const BLOCKERS_URL = '/api/submission-ops/blockers';
export const DUE_SOON_URL = '/api/submission-ops/due-soon';

/** A stored date as the reader reads it ("Nov 12"); none for a missing or unreadable one. */
function day(iso: string | null | undefined): string | null {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : null;
}
const line = (parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(' · ');
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null);

/** One project as a row carries it, or null for anything that is not one. A root that lacks an id or a name is no root. */
function namedProject(v: unknown): NamedProject | null {
  if (!object(v)) return null;
  const id = count(v.id);
  const name = text(v.name);
  if (id === null || !name) return null;
  const r = object(v.root) ? v.root : null;
  const rootId = r ? count(r.id) : null;
  const rootName = r ? text(r.name) : null;
  return { id, name, root: r && rootId !== null && rootName ? { id: rootId, name: rootName, programId: text(r.programId) } : null };
}
/** The projects a row carries: a finding's `projects` when it has them, otherwise the row's one `project`. */
function rowProjects(row: { project?: unknown; projects?: unknown }): NamedProject[] {
  const carried = Array.isArray(row.projects) ? row.projects : [row.project];
  return carried.map(namedProject).filter((p): p is NamedProject => p !== null);
}

/** A row's projects as the reader meets them: each filing project once, with the work areas of it the row names. */
interface Place { key: string; name: string; open: RiskProject | null; areas: string[] }
function places(projects: NamedProject[]): Place[] {
  const byKey = new Map<string, Place>();
  for (const p of projects) {
    const filing = p.root ?? p;
    const key = `${p.root ? 'filing' : 'own'}:${filing.id}`;
    const place = byKey.get(key) ?? { key, name: filing.name, areas: [],
      open: p.root?.programId ? { id: p.root.programId, title: p.root.name } : null };
    if (p.root && p.root.id !== p.id && !place.areas.includes(p.name)) place.areas.push(p.name);
    byKey.set(key, place);
  }
  return [...byKey.values()];
}

/** The projects a row belongs to. A filing project the person can open is a link; anything else is said in words. */
function RowProjects({ of, onOpen }: { of: NamedProject[]; onOpen: (project: RiskProject) => void }) {
  const shown = places(of);
  if (shown.length === 0) return null;
  return (
    <span className="pj-risk-m">
      {shown.map((place, i) => {
        const { open } = place;
        return (
          <React.Fragment key={place.key}>
            {i > 0 && ' · '}
            {open
              ? <button type="button" className="ana-work-link" aria-label={`Open ${place.name}`} onClick={() => onOpen(open)}>{place.name}</button>
              : place.name}
            {place.areas.length > 0 && ` (${place.areas.join(', ')})`}
          </React.Fragment>
        );
      })}
    </span>
  );
}

/** One engine's answer: reading, failed (said), empty (what was looked at), or its rows. */
function Answer<T>({ title, read, failed, empty, rows, children }: {
  title: string; read: DataState<T>; failed: string; empty: string; rows: number; children: React.ReactNode;
}) {
  return (
    <div className="pj-risk-sec">
      <h3 className="pj-risk-h">{title}</h3>
      {read.loading ? <p className="pj-risk-note" role="status">Reading…</p>
        : read.error ? <p className="pj-risk-note" role="alert">{failed}</p>
        : rows === 0 ? <p className="pj-risk-note">{empty}</p>
        : children}
    </div>
  );
}

export function ProjectsAtRisk({ open, onClose, onOpenProject }: {
  open: boolean; onClose: () => void; onOpenProject: (project: RiskProject) => void;
}) {
  const findings = useLiveData<Findings>(open ? FINDINGS_URL : null, [open], isFindings);
  const blockers = useLiveData<Blocker[]>(open ? BLOCKERS_URL : null, [open], isBlockers);
  const due = useLiveData<DueSoon>(open ? DUE_SOON_URL : null, [open], isDueSoon);
  if (!open) return null;
  const found = findings.data?.findings ?? [];
  const total = findings.data?.total ?? 0;
  const blocked = blockers.data ?? [];
  const work = due.data?.data.canonicalTasks ?? [];
  return (
    <section className="pj-risk" id="pj-risk" aria-labelledby="pj-risk-h">
      <div className="pj-risk-head">
        <div>
          <h2 id="pj-risk-h" className="pj-risk-title">Which projects are at risk this week</h2>
          <p className="pj-risk-note">Answered by Sentinel’s analyzers and the submission operations register, for the projects you can open.</p>
        </div>
        <button type="button" className="tb-btn" aria-label="Close the risk answer" title="Close" onClick={onClose}>{I.close}</button>
      </div>
      <Answer title="Risks Sentinel found" read={findings} rows={found.length}
        failed="Sentinel’s findings could not be read. This is a failed read, not an empty answer."
        empty="Sentinel has no open findings for these projects.">
        <p className="pj-risk-note">{found.length < total ? `${found.length} of ${total}` : total} open {total === 1 ? 'finding' : 'findings'}, most severe first.</p>
        <ul className="pj-risk-list" aria-label="Risks Sentinel found">
          {found.map((f) => (
            <li key={f.finding_id}>
              <span className="pj-risk-k">{line([enumWords(f.severity), enumWords(f.analyzer_type)])}</span>
              <span className="pj-risk-t">{f.title}</span>
              <span className="pj-risk-m">{line([f.summary, day(f.created_at) && `Found ${day(f.created_at)}`])}</span>
              <RowProjects of={rowProjects(f)} onOpen={onOpenProject} />
            </li>
          ))}
        </ul>
      </Answer>
      <Answer title="Blockers" read={blockers} rows={blocked.length}
        failed="The blockers could not be read. This is a failed read, not an empty register."
        empty="No blockers recorded.">
        <ul className="pj-risk-list" aria-label="Blockers">
          {blocked.map((b) => (
            <li key={b.blockerId}>
              <span className="pj-risk-t">{line([enumWords(b.severity), b.title])}</span>
              <span className="pj-risk-m">{line([b.nextAction && `Next: ${b.nextAction}`, b.ownerName, day(b.dueAt) && `Due ${day(b.dueAt)}`])}</span>
              <RowProjects of={rowProjects(b)} onOpen={onOpenProject} />
            </li>
          ))}
        </ul>
      </Answer>
      <Answer title="Due or overdue in the next 7 days" read={due} rows={work.length}
        failed="The work due this week could not be read. This is a failed read, not an empty list."
        empty="Nothing is due or overdue in the next 7 days.">
        <ul className="pj-risk-list" aria-label="Due or overdue in the next 7 days">
          {work.map((w) => (
            <li key={w.work_item_id}>
              <span className="pj-risk-t">{w.title}</span>
              <span className="pj-risk-m">{line([w.owner_name, day(w.due_at) && `Due ${day(w.due_at)}`])}</span>
              <RowProjects of={rowProjects(w)} onOpen={onOpenProject} />
            </li>
          ))}
        </ul>
      </Answer>
    </section>
  );
}
