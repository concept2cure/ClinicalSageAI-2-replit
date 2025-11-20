import React, { useEffect, useState } from 'react';
import api from '../services/api';
export default function DataPrivacy() {
  const [users, set] = useState({});
  const [sel, setSel] = useState('');
  const load = () => api.get('/api/org/tenant/users').then(r => set(r.data));
  useEffect(load, []);
  const exp = () => window.open(`/api/user/${sel}/export`, '_blank');
  const purge = () => {
    if (window.confirm('Permanently purge user?'))
      api.post(`/api/user/${sel}/purge`).then(() => alert('Scheduled'));
  };
  return (
    <div className="p-4">
      <h3 className="font-semibold mb-2">Data Privacy Tools</h3>
      <select value={sel} onChange={e => setSel(e.target.value)} className="border p-1">
        <option value="">-- choose user --</option>
        {Object.keys(users).map(u => (
          <option key={u}>{u}</option>
        ))}
      </select>
      {sel && (
        <div className="mt-2 space-x-2">
          <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={exp}>
            Export JSON+ZIP
          </button>
          <button className="bg-red-600 text-white px-3 py-1 rounded" onClick={purge}>
            Purge
          </button>
        </div>
      )}
    </div>
  );
}
