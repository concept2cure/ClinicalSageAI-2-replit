/**
 * ProjectTimeline — full-variant phase strip rendered above the chats
 * column on the Project detail Chats tab. Mirror of
 * design-system/ui_kits/home/Projects.jsx (lines 834–888).
 *
 * Per HANDOFF item 6: daysToTarget is derived at render from
 * differenceInCalendarDays(targetDate, today). Negative = overdue,
 * rendered with --text-warn tone. null when no targetDate.
 */
import { I } from './icons';
import type { Project } from './types';

interface Props {
  project: Project;
}

function deriveDaysToTarget(targetDate: string): number | null {
  if (!targetDate) return null;
  const target = new Date(targetDate);
  if (!isFinite(target.getTime())) return null;
  // Use calendar days: zero out the time portion of both dates.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function ProjectTimeline({ project }: Props) {
  const phases = project.phases || [];
  const completed = phases.filter(p => p.status === 'completed').length;
  const overall = phases.length === 0
    ? 0
    : Math.round((completed / phases.length) * 100);

  // Per HANDOFF item 6: derive at render; ignore the seed-data field.
  const daysToTarget = deriveDaysToTarget(project.targetDate);
  const isOverdue = daysToTarget !== null && daysToTarget < 0;

  return (
    <section className="ptl">
      <header className="ptl-head">
        <div>
          <h2 className="ptl-h2">{project.submissionTypeLabel} submission timeline</h2>
          <p className="ptl-sub">
            {phases.length} phases · {completed} complete · {overall}% overall
          </p>
        </div>
        {daysToTarget != null && (
          <div className="ptl-head-r">
            <span
              className="ptl-days-num"
              style={isOverdue ? { color: 'var(--warning)' } : undefined}
            >
              {isOverdue ? `${Math.abs(daysToTarget)} overdue` : daysToTarget}
            </span>
            <span className="ptl-days-lbl">days to target</span>
          </div>
        )}
      </header>

      <div className="ptl-bar">
        <div className="ptl-bar-fill" style={{ width: `${overall}%` }} />
      </div>

      <ul className="ptl-list">
        {phases.map((p, i) => {
          const isLast = i === phases.length - 1;
          return (
            <li key={p.id} className="ptl-row" data-status={p.status}>
              {!isLast && (
                <span
                  className="ptl-line"
                  data-prev={p.status === 'completed' ? 'done' : 'todo'}
                  aria-hidden="true"
                />
              )}
              <span className="ptl-dot" data-status={p.status}>
                {p.status === 'completed' && <span className="ptl-check">{I.check}</span>}
                {p.status === 'current' && <span className="ptl-cur" />}
              </span>
              <div className="ptl-row-body">
                <div className="ptl-row-name-row">
                  <span className="ptl-row-name">{p.name}</span>
                  {p.status === 'current' && <span className="ptl-pill">In progress</span>}
                </div>
                {p.status === 'current' && p.progress > 0 && p.progress < 100 && (
                  <div className="ptl-row-bar">
                    <div className="ptl-row-bar-fill" style={{ width: `${p.progress}%` }} />
                  </div>
                )}
              </div>
              <span className="ptl-row-pct" data-status={p.status}>
                {p.status === 'completed'
                  ? '100%'
                  : p.status === 'current'
                    ? `${p.progress}%`
                    : '—'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
