/**
 * The project's program plan: its filing's work breakdown, with this project's
 * progress (S11; founder decision P-82; docs/design/THE_PROGRAM_2026-11-01.md
 * §7.2 and §9 step 2).
 *
 * Split out of Pyramid.tsx. The phases, tasks, roles, hours, dependencies and
 * critical path are the submission-pyramid engine's
 * (services/regulatory/SubmissionPyramidEngine.ts), the same as on the
 * standalone pyramid. Here they are this project's: the pyramid is the one its
 * recorded filing resolves to, and each task's status is recorded on this
 * project (GET/PATCH /api/v1/pyramids/by-project/:ref, pyramid.routes.ts), no
 * longer shared by every project of the same filing type. It lives in the
 * project's Plan step: no new screen.
 *
 * @module client/src/concept2cure/v2/surfaces/PyramidProject
 */
import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { useLiveData } from '../dataConnect';
import { setEditorTarget } from '../editorTarget';
import { pyProgress, type PyPyramid, type PyTask } from '../fixtures/pyramid-data';
import { PyTaskSheet, PyWorkBreakdown, statusRefusal, workDocumentAsk } from './Pyramid';

interface ProjectPyramidRead {
  programId: string;
  /** The engine's pyramid type, or null when the project's filing has none. */
  type: string | null;
  label?: string;
  filing: string | null;
  pyramid?: PyPyramid;
  statuses?: Record<string, string>;
  pendingStore?: boolean;
}
const isRead = (v: unknown): v is ProjectPyramidRead =>
  !!v && typeof v === 'object' && 'type' in v && (((v as ProjectPyramidRead).type === null) || Array.isArray((v as ProjectPyramidRead).pyramid?.tasks));

/** This project's task statuses: the read's, with this visit's writes over them. A write is applied at once and
 *  reverted when refused. The read's statuses are used from the first render, so the plan never claims, even for a
 *  moment, that nothing is done. */
function useProjectTaskStatuses(path: string, read: ProjectPyramidRead | null) {
  const [edits, setEdits] = useState<{ of: ProjectPyramidRead | null; statuses: Record<string, string> } | null>(null);
  const [refusal, setRefusal] = useState('');
  useEffect(() => { setRefusal(''); }, [read]);
  const statuses = edits && edits.of === read ? edits.statuses : (read?.statuses ?? {});
  const setStatus = async (taskId: string, status: string) => {
    const before = statuses;
    const next = { ...statuses };
    if (status === 'todo') delete next[taskId];
    else next[taskId] = status;
    setEdits({ of: read, statuses: next });
    setRefusal('');
    try {
      const res = await apiRequest('PATCH', `${path}/progress/${encodeURIComponent(taskId)}`, { status });
      if (!res.ok) {
        setEdits({ of: read, statuses: before });
        const body = await res.json().catch(() => null);
        setRefusal(statusRefusal(serverMessage(body) ?? `the server refused it (HTTP ${res.status})`));
      }
    } catch (e) {
      setEdits({ of: read, statuses: before });
      setRefusal(statusRefusal(e instanceof Error ? e.message : String(e)));
    }
  };
  return { statuses, refusal, setStatus };
}

export function ProjectProgramPlan({ programId, onNav, onAsk }: {
  programId: string;
  onNav: (id: string) => void;
  onAsk: (text: string) => void;
}) {
  const path = `/api/v1/pyramids/by-project/${encodeURIComponent(programId)}`;
  const read = useLiveData<ProjectPyramidRead>(path, [path], isRead);
  const data = read.data;
  const { statuses, refusal, setStatus } = useProjectTaskStatuses(path, data);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const tasks = useMemo<PyTask[]>(
    () => (data?.pyramid?.tasks ?? []).map((t) => (statuses[t.id] ? { ...t, status: statuses[t.id] } : t)),
    [data, statuses],
  );

  if (!data) {
    if (read.loading) return null;
    return <p className="pj-desc pj-fact-none" role="note">This project's program plan could not be read.</p>;
  }
  // A filing the engine has no work breakdown for: said once, quietly, never an invented plan.
  if (!data.type || !data.pyramid) {
    return (
      <p className="pj-desc pj-fact-none" data-testid="pj-program-none">
        A work breakdown is available for INDs, NDAs, BLAs, MAAs, Japanese marketing applications, 510(k)s, De Novos and PMAs.
        This project&apos;s filing{data.filing ? ` (${data.filing})` : ''} has none yet.
      </p>
    );
  }
  const pyr: PyPyramid = { ...data.pyramid, tasks };
  const progress = pyProgress(pyr);
  const open = openTask ? tasks.find((t) => t.id === openTask) ?? null : null;
  const ind = data.type === 'IND';
  return (
    <section className="pj-sec" aria-labelledby="pj-program-h" data-testid="pj-program-plan">
      <div className="pj-sec-h">
        <h2 id="pj-program-h">Program plan</h2>
        <span className="sec-sub">{data.label ?? data.type} work breakdown</span>
      </div>
      <p className="pj-desc">
        {progress.completed} of {progress.total} tasks done · critical path {progress.criticalPathPct}% done · about {progress.hoursRemaining} hours of work remaining.
        The phases, tasks, hours and dependencies are the engine&apos;s; each task&apos;s status is this project&apos;s.
      </p>
      {data.pendingStore && <p className="pj-desc pj-fact-none" role="note">Recorded progress is not available in this deployment, so every task reads as not started.</p>}
      {refusal && <p className="pj-desc" role="alert">{refusal}</p>}
      <details className="pj-more">
        <summary>The work breakdown: {pyr.phases.length} phases, {progress.total} tasks</summary>
        <PyWorkBreakdown pyr={pyr} focusPhase={null} tasks={tasks} onTask={setOpenTask} onStatus={(id, s) => void setStatus(id, s)} />
      </details>
      {open && (
        <PyTaskSheet pyr={pyr} task={open} tasks={tasks} onClose={() => setOpenTask(null)} onTask={setOpenTask}
          onStatus={(id, s) => void setStatus(id, s)} projectOpen
          onOpenSection={ind ? (code, title) => {
            setEditorTarget({ docType: null, code, label: title, programId });
            setOpenTask(null);
            onNav('document-authoring');
          } : undefined}
          onWorkDocument={ind ? (title) => { setOpenTask(null); onAsk(workDocumentAsk(title, open.name)); } : undefined} />
      )}
    </section>
  );
}
