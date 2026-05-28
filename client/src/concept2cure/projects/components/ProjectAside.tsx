// ProjectAside — port of ui_kits/projects/App.jsx Aside.

import * as React from 'react';

interface Member  { user_id: number; name: string; email: string; role: string; added_at: string | null }
interface Evidence { id: number; evidence_kind: string; title: string; meta: string | null; pinned_at: string | null }
interface Activity { id: string; action: string; resource_type: string | null; occurred_at: string | null; actor_id: number | null; details: Record<string, unknown> | null }

interface AsideProps {
  team:     Member[];
  evidence: Evidence[];
  activity: Activity[];
}

function relTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60)  return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)   return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

function initials(name: string): string {
  return name.split(' ').map(n => n[0] ?? '').slice(0, 2).join('').toUpperCase();
}

function presenceFrom(added: string | null): string {
  if (!added) return 'Offline';
  const diff = Date.now() - new Date(added).getTime();
  return diff < 3_600_000 ? 'Online' : 'Offline';
}

export function ProjectAside({ team, evidence, activity }: AsideProps) {
  return (
    <>
      <div className="pj-aside-sec">
        <h3>Team <span className="meta">{team.length}</span></h3>
        <div className="pj-people">
          {team.length === 0 ? (
            <div style={{ color: 'var(--text-400)', fontSize: 12 }}>No members added yet.</div>
          ) : team.map(m => (
            <div key={m.user_id} className="pj-person">
              <span className="av">{initials(m.name)}</span>
              <div>
                <div className="name">{m.name}</div>
                <div className="role">{m.role}</div>
              </div>
              <span className="status">{presenceFrom(m.added_at)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pj-aside-sec">
        <h3>Pinned evidence
          <a className="link" href="#" style={{ marginLeft: 'auto' }}>Vault →</a>
        </h3>
        {evidence.length === 0 ? (
          <div style={{ color: 'var(--text-400)', fontSize: 12 }}>No evidence pinned yet.</div>
        ) : evidence.map(e => (
          <div key={e.id} className="pj-evidence">
            <div className="kind">{e.evidence_kind}</div>
            <div className="title">{e.title}</div>
            {e.meta && <div className="meta">{e.meta}</div>}
          </div>
        ))}
      </div>

      <div className="pj-aside-sec">
        <h3>Activity
          <a className="link" href="#" style={{ marginLeft: 'auto' }}>Open log →</a>
        </h3>
        {activity.length === 0 ? (
          <div style={{ color: 'var(--text-400)', fontSize: 12 }}>No recent activity.</div>
        ) : activity.map(a => (
          <div key={a.id} className="pj-audit-row">
            <span className="body">{a.action.replace(/_/g, ' ')}</span>
            <span className="when">{relTime(a.occurred_at)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
