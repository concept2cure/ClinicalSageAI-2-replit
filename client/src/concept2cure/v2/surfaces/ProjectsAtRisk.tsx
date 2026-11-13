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
 * Each row names its project and opens it (F1, 2026-11-12). The rows carry the
 * numeric id of a project; the project list carries it as `project_id` beside
 * the program's id, so a row is matched to a listed project by that number and
 * opened through the one opener Projects has. The names are read from the whole
 * list (the palette's read), not from the page Projects shows, which is filtered
 * and paged. Three cases are kept honest:
 *   - a finding about several projects names each of them, by id. The label an
 *     engine stored beside an id is never shown;
 *   - a row whose project is not in the list gets no name and no reason: the
 *     list cannot tell an archived project from a work area or one past its cap;
 *   - a failed read of the list is said once, as a failed read.
 *
 * Split out of Projects.tsx, which is at the 100 kB file ceiling.
 */
import React from 'react';
import { useLiveData, type DataState } from '../dataConnect';
import { I } from '../icons';
import { PALETTE_PROJECTS_URL } from '../paletteProjects';
import { enumWords } from './projectWords';
import { vaultProjectOf } from './vaultSponsors';

interface AffectedItem { type?: unknown; id?: unknown }
interface Finding {
  finding_id: string; analyzer_type: string; severity: string; title: string; summary?: string | null; created_at?: string | null;
  project_id?: number | null; affected_items?: AffectedItem[] | null;
}
interface Findings { findings: Finding[]; total: number }
interface Blocker { blockerId: string; severity: string; title: string; nextAction?: string | null; ownerName?: string | null; dueAt?: string | null; projectId?: number | null }
interface DueWork { work_item_id: string; title: string; owner_name?: string | null; due_at?: string | null; project_id?: number | null }
interface DueSoon { data: { canonicalTasks: DueWork[] } }

/** A listed project, as Projects opens one. */
export interface RiskProject { id: string; title: string; code: string; ws?: string; status?: string }
/** The listed projects by the numeric id the rows carry: still reading, failed, or read. */
type ProjectNames = { state: 'reading' | 'failed' } | { state: 'read'; byNumber: ReadonlyMap<number, RiskProject> };

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFindings = (v: unknown): v is Findings => object(v) && Array.isArray(v.findings) && typeof v.total === 'number';
const isBlockers = (v: unknown): v is Blocker[] => Array.isArray(v);
const isDueSoon = (v: unknown): v is DueSoon => object(v) && object(v.data) && Array.isArray(v.data.canonicalTasks);
const isRows = (v: unknown): v is unknown[] => Array.isArray(v);

export const FINDINGS_URL = '/api/sentinel/findings?status=open&limit=20';
export const BLOCKERS_URL = '/api/submission-ops/blockers';
export const DUE_SOON_URL = '/api/submission-ops/due-soon';

/** A stored date as the reader reads it ("Nov 12"); none for a missing or unreadable one. */
function day(iso: string | null | undefined): string | null {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : null;
}
const line = (parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(' · ');

/** A project's numeric id as a row or a list card carries it; none for anything else. */
const projectNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null);
const numbers = (values: unknown[]): number[] => [...new Set(values.map(projectNumber).filter((n): n is number => n !== null))];

/** Every project a finding is about: its own, and each project among the items it affects. */
function findingProjects(f: Finding): number[] {
  const affected = Array.isArray(f.affected_items) ? f.affected_items : [];
  return numbers([f.project_id, ...affected.filter((a) => object(a) && a.type === 'project').map((a) => a.id)]);
}

/** One card of the project list, keyed by its `project_id`; null for a card that carries none. */
function namedProject(row: unknown): [number, RiskProject] | null {
  const card = vaultProjectOf(row);
  const number = object(row) ? projectNumber(row.project_id) : null;
  if (!card || number === null) return null;
  return [number, { id: card.id, title: card.title, code: card.code ?? '—', ...(card.ws ? { ws: card.ws } : {}), ...(card.status ? { status: card.status } : {}) }];
}

/** The projects the person can open, by the number the rows carry, read while the answer is open. */
function useProjectNames(open: boolean): ProjectNames {
  const { loading, error, data } = useLiveData<unknown[]>(open ? PALETTE_PROJECTS_URL : null, [open], isRows);
  return React.useMemo<ProjectNames>(() => {
    if (!open || loading) return { state: 'reading' };
    if (error || !Array.isArray(data)) return { state: 'failed' };
    return { state: 'read', byNumber: new Map(data.map(namedProject).filter((e): e is [number, RiskProject] => e !== null)) };
  }, [open, loading, error, data]);
}

/** The projects a row belongs to, each a link that opens it. Nothing for a project the list does not hold. */
function RowProjects({ of, names, onOpen }: { of: number[]; names: ProjectNames; onOpen: (project: RiskProject) => void }) {
  if (names.state !== 'read') return null;
  const projects = of.map((n) => names.byNumber.get(n)).filter((p): p is RiskProject => p !== undefined);
  if (projects.length === 0) return null;
  return (
    <span className="pj-risk-m">
      {projects.map((p, i) => (
        <React.Fragment key={p.id}>
          {i > 0 && ' · '}
          <button type="button" className="ana-work-link" aria-label={`Open ${p.title}`} onClick={() => onOpen(p)}>{p.title}</button>
        </React.Fragment>
      ))}
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
  const names = useProjectNames(open);
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
          {names.state === 'failed' && (
            <p className="pj-risk-note" role="alert">The project list could not be read, so the rows below do not name their projects. The rows themselves are complete.</p>
          )}
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
              <RowProjects of={findingProjects(f)} names={names} onOpen={onOpenProject} />
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
              <RowProjects of={numbers([b.projectId])} names={names} onOpen={onOpenProject} />
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
              <RowProjects of={numbers([w.project_id])} names={names} onOpen={onOpenProject} />
            </li>
          ))}
        </ul>
      </Answer>
    </section>
  );
}
