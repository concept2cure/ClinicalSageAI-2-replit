import React, { useEffect, useState } from 'react';
import api from '../services/api';
const ROLES = ['admin', 'submitter', 'readonly'];
const CHANNELS = { 0: 'NONE', 1: 'TEAMS', 2: 'EMAIL', 3: 'BOTH' };
const PERMS = ['ind.read', 'ind.write', 'esg.submit', 'compliance.manage', 'alerts.view'];
export default function RoleManager() {
  const [users, setUsers] = useState({});
  const [inv, setInv] = useState(false);
  const [nu, setNu] = useState({ username: '', role: 'user' });
  const load = () => api.get('/api/org/tenant/users').then(r => setUsers(r.data)); // tenant stub
  useEffect(load, []);
  const setRole = (u, r) => api.put(`/api/org/tenant/users/${u}`, { role: r }).then(load);
  const toggle = (u, p) => {
    const perms = users[u].perms || [];
    const has = perms.includes(p);
    const newP = has ? perms.filter(x => x !== p) : [...perms, p];
    api.put(`/api/org/tenant/users/${u}`, { perms: newP }).then(load);
  };
  const invite = () =>
    api.post('/api/org/tenant/users', nu).then(() => {
      setInv(false);
      load();
    });
  return (
    <div className="p-4">
      <button
        onClick={() => setInv(true)}
        className="bg-green-700 text-white px-3 py-1 mb-2 rounded"
      >
        Invite User
      </button>
      <table className="text-sm w-full">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Alerts</th>
            {PERMS.map(p => (
              <th key={p}>{p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(users).map(([u, d]) => (
            <tr key={u}>
              <td>{u}</td>
              <td>
                <select value={d.role} onChange={e => setRole(u, e.target.value)}>
                  {ROLES.map(r => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </td>
              <td>
                <select
                  value={d.alert_channels || 1}
                  onChange={e =>
                    api
                      .put(`/api/org/tenant/users/${u}`, { alert_channels: +e.target.value })
                      .then(load)
                  }
                >
                  {Object.entries(CHANNELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </td>
              {PERMS.map(p => (
                <td key={p}>
                  <input
                    type="checkbox"
                    checked={d.perms?.includes(p)}
                    onChange={() => toggle(u, p)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {inv && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-4 rounded">
            <h3 className="font-semibold mb-2">Invite User</h3>
            <input
              placeholder="Email"
              className="border p-1 mb-2 w-full"
              value={nu.username}
              onChange={e => setNu({ ...nu, username: e.target.value })}
            />
            <select
              value={nu.role}
              onChange={e => setNu({ ...nu, role: e.target.value })}
              className="border p-1 mb-2 w-full"
            >
              {ROLES.map(r => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <button className="bg-blue-600 text-white px-3 py-1 mr-2 rounded" onClick={invite}>
              Send Invite
            </button>
            <button className="px-3 py-1" onClick={() => setInv(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
