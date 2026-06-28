/** Access — read-only roster of who can reach the Business Center: the business
 *  roles, the email allowlist, and current role holders. Granting or revoking
 *  access stays a separate, explicit operation. */

import * as React from 'react';
import { useAccess } from '../hooks/useBusinessCenter';
import {
  Badge,
  SectionHeader,
  Loading,
  ErrorState,
  Empty,
} from '../../master-admin/components/ui';
import { statusTone } from '../bizc-format';

export function Access() {
  const { data, loading, error, refresh } = useAccess();

  if (loading && !data) return <Loading label="Loading access roster…" />;
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  if (!data) return null;

  const { roles, allowlistEmails, roleHolders } = data;

  return (
    <div className="ma-stack">
      <SectionHeader
        title="Access"
        sub="Who can reach the Business Center, from the same source of truth the server enforces. This view is read-only."
      />

      <div className="ma-card">
        <SectionHeader title="Business roles" sub="Roles that grant access." />
        {roles.length === 0 ? (
          <Empty label="No business roles defined." />
        ) : (
          <div className="ma-tag-list">
            {roles.map(r => (
              <Badge key={r} tone="accent">
                {r}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="ma-card">
        <SectionHeader
          title="Allowlisted emails"
          sub="Individual addresses granted access regardless of role."
        />
        {allowlistEmails.length === 0 ? (
          <Empty label="No emails on the allowlist." />
        ) : (
          <div className="ma-tag-list">
            {allowlistEmails.map(e => (
              <Badge key={e} tone="muted">
                {e}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="ma-card">
        <SectionHeader title="Role holders" sub="Users currently holding a business role." />
        {roleHolders.length === 0 ? (
          <Empty label="No users currently hold a business role." />
        ) : (
          <div className="ma-table-wrap">
            <table className="ma-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Organization</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {roleHolders.map(h => (
                  <tr key={`${h.id}:${h.role}`}>
                    <td>
                      <div className="ma-cell-primary">{h.name || h.email}</div>
                      <div className="ma-cell-sub">{h.email}</div>
                    </td>
                    <td>{h.organization_name || '—'}</td>
                    <td>
                      <Badge tone="accent">{h.role}</Badge>
                    </td>
                    <td>
                      <Badge tone={statusTone(h.status)}>{h.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ma-foot-note">
        Snapshot generated {new Date(data.generatedAt).toLocaleString()}.
      </div>
    </div>
  );
}
