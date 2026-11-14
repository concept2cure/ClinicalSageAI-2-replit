/**
 * The List: the Tasks page's first view (D6.md §A.4 step 5, as amended by §A.7
 * items 5-6). Split out of TaskBoard.tsx, which is over its size limits.
 *
 * The open tasks grouped by when (Overdue, Due within 7 days, Later, No due date),
 * each group in the order of need (taskOrderOfNeed.ts). Finished work is in a
 * closed "Done" disclosure. In Mine, the approvals and reviews waiting on the
 * person follow, from the one component the tray and Home use (OpenWork.tsx);
 * the assigned tasks are this list, so they are not listed twice.
 *
 * It replaces the Table view (the `.ctable` grid) and keeps its view id, `table`.
 * Every field the table showed is here: the project (in the row when the list
 * spans projects), title, module, status (in words in the row), priority, owner
 * and due.
 */
import React from 'react';
import { I } from '../icons';
import { groupByNeed } from './taskOrderOfNeed';
import type { ListRow } from './taskListRows';

function Row({ row }: { row: ListRow }) {
  const id = `tb-row-${row.key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const facts = [row.statusLabel, ...row.flags, row.module, row.priority, row.owner, row.project].filter(Boolean).join(' · ');
  /* Overdue is said in words, not by colour alone: the server's label says it in most cases; where it reads
     "today" for a time already past, the word is added. */
  const due = row.overdue && !/overdue/i.test(row.due) ? `Overdue · ${row.due}` : row.due;
  return (
    <li>
      <button type="button" className="sp-row tb-row" aria-label={`Open ${row.title}`} aria-describedby={`${id} ${id}-due`}
        title={row.from} onClick={row.onOpen}>
        <span className="tb-row-dot" data-status={row.status} aria-hidden="true" />
        <span className="sp-row-b">
          <span className="sp-row-t">{row.title}</span>
          <span className="sp-row-s" id={id}>{facts}</span>
        </span>
        <span className="tb-row-due" id={`${id}-due`} data-over={row.overdue || undefined}>
          {row.overdue && I.clock}{due}
        </span>
      </button>
    </li>
  );
}

/** Each person-facing group of open tasks, then Done. */
export function TaskNeedList({ rows, done, now, children }: {
  /** Open rows; ordered and grouped here. */
  rows: readonly ListRow[];
  /** Finished rows, listed under Done. */
  done: readonly ListRow[];
  now: number;
  /** Mine's approvals and reviews. */
  children?: React.ReactNode;
}) {
  const groups = groupByNeed(rows, (r) => r.need, now);
  return (
    <div className="tb-list-view" data-testid="tb-list">
      {groups.map((g) => (
        <section key={g.id} className="pj-sec" aria-labelledby={`tb-grp-${g.id}`}>
          <div className="pj-sec-h">
            <h2 id={`tb-grp-${g.id}`}>{g.label}</h2>
            <span className="sec-sub">{g.items.length || 'none'}</span>
          </div>
          {g.items.length > 0 && (
            <ul className="sp-list" role="list">
              {g.items.map((row) => <Row key={row.key} row={row} />)}
            </ul>
          )}
        </section>
      ))}
      {children}
      {done.length > 0 && (
        <details className="pj-more">
          <summary>Done ({done.length})</summary>
          <ul className="sp-list" role="list">
            {done.map((row) => <Row key={row.key} row={row} />)}
          </ul>
        </details>
      )}
    </div>
  );
}
