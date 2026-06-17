/**
 * ScheduleTab — AnA's regulatory-aware Schedule of Events for a project.
 *
 * Extends the project manager with a visual milestone schedule that AnA sets
 * from the project type, goals, and regulatory framework, then keeps current.
 * Reuses the ProjectTimeline visual language (status dots + connecting line)
 * and surfaces AnA's information updates, program goals, and the proactive
 * tasks/alerts AnA raises.
 *
 * Milestones come from the existing project_workflow_stages (tagged as schedule
 * events) via /api/concept2cure/projects/:id/schedule-of-events.
 */
import { useState, type CSSProperties } from 'react';
import { I } from '../icons';
import {
  useScheduleOfEvents,
  type ScheduleMilestone,
  type ScheduleStatus,
  type OverallScheduleStatus,
} from '../data/useScheduleOfEvents';
import type { Project } from '../types';

interface Props {
  project: Project;
}

const STATUS_COLOR: Record<ScheduleStatus, string> = {
  not_started: 'var(--text-300, #9aa0a6)',
  in_progress: 'var(--accent, #3b82f6)',
  at_risk: 'var(--warning, #d97706)',
  completed: 'var(--success, #16a34a)',
  slipped: 'var(--danger, #dc2626)',
  blocked: 'var(--danger, #dc2626)',
};

const STATUS_LABEL: Record<ScheduleStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  at_risk: 'At risk',
  completed: 'Complete',
  slipped: 'Slipped',
  blocked: 'Blocked',
};

const VERDICT: Record<OverallScheduleStatus, { label: string; color: string }> = {
  on_track: { label: 'On track', color: 'var(--success, #16a34a)' },
  at_risk: { label: 'Needs attention', color: 'var(--warning, #d97706)' },
  off_track: { label: 'Off track', color: 'var(--danger, #dc2626)' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return '';
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

const card: CSSProperties = {
  border: '1px solid var(--border, #e5e7eb)',
  borderRadius: 'var(--radius-md, 10px)',
  padding: '16px',
  background: 'var(--surface-1, transparent)',
};

const chip = (color: string): CSSProperties => ({
  fontSize: '11px',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: '999px',
  color,
  border: `1px solid ${color}`,
  whiteSpace: 'nowrap',
});

export function ScheduleTab({ project }: Props) {
  const { data, loading, busy, error, generate, amend, review } = useScheduleOfEvents(project.id);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const plan = data?.plan ?? null;
  const milestones = data?.milestones ?? [];
  const goals = data?.goals ?? [];
  const revisions = data?.revisions ?? [];
  const health = data?.health;
  const completed = milestones.filter((m) => m.status === 'completed').length;
  const overall = milestones.length === 0 ? 0 : Math.round((completed / milestones.length) * 100);

  if (loading) {
    return (
      <div className="prj-tabbody" style={{ padding: '24px', color: 'var(--text-300, #9aa0a6)' }}>
        Loading schedule…
      </div>
    );
  }

  // ── Empty state: AnA hasn't built a schedule yet ──────────────────────────
  if (!plan) {
    return (
      <div className="prj-tabbody" style={{ padding: '24px' }}>
        <div style={{ ...card, textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', color: 'var(--accent, #3b82f6)' }}>
            {I.sparkles}
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: '16px' }}>No schedule of events yet</h3>
          <p style={{ margin: '0 0 18px', color: 'var(--text-300, #9aa0a6)', maxWidth: '440px', marginInline: 'auto' }}>
            Let AnA build a regulatory-aware schedule of visual milestones for this {project.submissionTypeLabel}{' '}
            program — based on the project type, your goals, and the applicable regulatory requirements. AnA will then
            keep it current, flag slips, and raise tasks and alerts.
          </p>
          {error && <p style={{ color: 'var(--danger, #dc2626)', fontSize: '13px' }}>{error}</p>}
          <button type="button" className="prj-btn" disabled={busy} onClick={() => generate()}>
            {busy ? 'Generating…' : 'Generate schedule with AnA'}
          </button>
        </div>
      </div>
    );
  }

  const verdict = health ? VERDICT[health.overallStatus] : VERDICT.on_track;

  return (
    <div className="prj-tabbody" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* AnA status card */}
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '260px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ color: 'var(--accent, #3b82f6)', display: 'inline-flex' }}>{I.sparkles}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-300, #9aa0a6)' }}>
                AnA update
              </span>
              <span style={chip(verdict.color)}>{verdict.label}</span>
            </div>
            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5 }}>
              {plan.anaSummary || plan.basisSummary || 'Schedule generated.'}
            </p>
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-300, #9aa0a6)', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              {plan.regulatoryFramework && <span>Framework: {plan.regulatoryFramework}</span>}
              {plan.projectType && <span>Type: {plan.projectType}</span>}
              {plan.confidence && <span>Confidence: {plan.confidence}</span>}
              <span>v{plan.version}</span>
              {plan.lastReviewedByAnaAt && <span>Reviewed {fmtRelative(plan.lastReviewedByAnaAt)}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" className="prj-btn" disabled={busy} onClick={() => review()} title="Have AnA re-assess the schedule now">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>{I.refresh} Review now</span>
            </button>
            {confirmRegen ? (
              <>
                <button type="button" className="prj-btn" disabled={busy} onClick={() => { setConfirmRegen(false); generate(); }}>
                  {busy ? 'Working…' : 'Confirm regenerate'}
                </button>
                <button type="button" className="prj-btn" disabled={busy} onClick={() => setConfirmRegen(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="prj-btn" disabled={busy} onClick={() => setConfirmRegen(true)}>
                Regenerate
              </button>
            )}
          </div>
        </div>

        {/* overall progress */}
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-300, #9aa0a6)', marginBottom: '4px' }}>
            <span>{milestones.length} milestones · {completed} complete · target {fmtDate(plan.targetDate)}</span>
            <span>{overall}%</span>
          </div>
          <div style={{ height: '6px', borderRadius: '999px', background: 'var(--border, #e5e7eb)', overflow: 'hidden' }}>
            <div style={{ width: `${overall}%`, height: '100%', background: verdict.color, transition: 'width .2s ease-out' }} />
          </div>
        </div>
        {error && <p style={{ color: 'var(--danger, #dc2626)', fontSize: '13px', marginTop: '10px' }}>{error}</p>}
      </section>

      {/* Milestones */}
      <section>
        <h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>Milestones</h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {milestones.map((m, i) => (
            <MilestoneRow
              key={m.key}
              m={m}
              isLast={i === milestones.length - 1}
              busy={busy}
              onComplete={() => amend(m.key, { status: 'completed', progress: 100, note: 'Marked complete from schedule view.' })}
            />
          ))}
        </ul>
      </section>

      {/* Goals */}
      <section style={card}>
        <h3 style={{ margin: '0 0 4px', fontSize: '14px' }}>Program goals</h3>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-300, #9aa0a6)' }}>
          AnA tracks these and re-baselines them as context changes.
        </p>
        {goals.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-300, #9aa0a6)', margin: 0 }}>
            No goals captured yet. Ask AnA to set program goals in chat.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {goals.map((g) => {
              const tone =
                g.status === 'at_risk' ? 'var(--warning, #d97706)'
                : g.status === 'achieved' ? 'var(--success, #16a34a)'
                : g.status === 'revised' || g.status === 'dropped' ? 'var(--text-300, #9aa0a6)'
                : 'var(--accent, #3b82f6)';
              return (
                <li key={g.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ ...chip(tone), marginTop: '2px' }}>{g.status}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{g.title}</div>
                    {g.description && <div style={{ fontSize: '12px', color: 'var(--text-300, #9aa0a6)' }}>{g.description}</div>}
                    <div style={{ fontSize: '11px', color: 'var(--text-300, #9aa0a6)', display: 'flex', gap: '12px', marginTop: '2px', flexWrap: 'wrap' }}>
                      <span>Target: {fmtDate(g.targetDate)}</span>
                      <span>Priority: {g.priority}</span>
                      {g.metric && <span>Metric: {g.metric}</span>}
                    </div>
                    {g.currentContext && (
                      <div style={{ fontSize: '11px', color: tone, marginTop: '2px' }}>{g.currentContext}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* AnA updates feed (revisions) */}
      <section style={card}>
        <h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>AnA activity</h3>
        {revisions.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-300, #9aa0a6)', margin: 0 }}>No changes recorded yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {revisions.map((r) => (
              <li key={r.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-300, #9aa0a6)', display: 'inline-flex', marginTop: '1px' }}>{I.clock}</span>
                <div style={{ flex: 1 }}>
                  <div>{r.summary}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-300, #9aa0a6)', display: 'flex', gap: '8px' }}>
                    <span>{r.revisionType.replace(/_/g, ' ')}</span>
                    <span>·</span>
                    <span>{fmtRelative(r.createdAt)}</span>
                    {r.createdByAna && <span style={chip('var(--accent, #3b82f6)')}>AnA</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MilestoneRow({
  m,
  isLast,
  busy,
  onComplete,
}: {
  m: ScheduleMilestone;
  isLast: boolean;
  busy: boolean;
  onComplete: () => void;
}) {
  const color = STATUS_COLOR[m.status];
  const isDone = m.status === 'completed';
  const isProblem = m.status === 'slipped' || m.status === 'at_risk' || m.status === 'blocked';
  return (
    <li style={{ display: 'flex', gap: '12px', position: 'relative', paddingBottom: isLast ? 0 : '18px' }}>
      {/* connector + dot */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        <span
          style={{
            width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0,
            background: isDone ? color : 'transparent',
            border: `2px solid ${color}`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            zIndex: 1,
          }}
        >
          {isDone && <span style={{ display: 'inline-flex', transform: 'scale(.6)' }}>{I.check}</span>}
        </span>
        {!isLast && (
          <span style={{ flex: 1, width: '2px', background: 'var(--border, #e5e7eb)', marginTop: '2px', minHeight: '24px' }} />
        )}
      </div>

      {/* body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>{m.title}</span>
          <span style={chip(color)}>{STATUS_LABEL[m.status]}</span>
          {m.isCritical && <span style={chip('var(--danger, #dc2626)')}>Critical path</span>}
          <span style={{ ...chip('var(--text-300, #9aa0a6)') }}>{m.category}</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-300, #9aa0a6)', display: 'flex', gap: '12px', marginTop: '3px', flexWrap: 'wrap' }}>
          <span style={isProblem ? { color: STATUS_COLOR[m.status] } : undefined}>
            Target: {fmtDate(m.targetDate)}
            {m.slipDays != null && m.slipDays > 0 ? ` · ${m.slipDays}d overdue` : ''}
          </span>
          {m.ownerRole && <span>Owner: {m.ownerRole}</span>}
          {m.regulatoryBasis && <span>Basis: {m.regulatoryBasis}</span>}
        </div>
        {m.anaRationale && (
          <div style={{ fontSize: '11px', color: 'var(--text-300, #9aa0a6)', marginTop: '3px', fontStyle: 'italic' }}>
            {m.anaRationale}
          </div>
        )}
      </div>

      {/* right: progress + action */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-300, #9aa0a6)' }}>{isDone ? '100%' : `${m.progress}%`}</span>
        {!isDone && (
          <button
            type="button"
            disabled={busy}
            onClick={onComplete}
            style={{
              fontSize: '11px', padding: '2px 8px', background: 'transparent',
              border: '1px solid var(--border, #e5e7eb)', borderRadius: 'var(--radius-sm, 6px)',
              cursor: 'pointer', color: 'var(--text-300, #9aa0a6)', whiteSpace: 'nowrap',
            }}
          >
            Mark complete
          </button>
        )}
      </div>
    </li>
  );
}
