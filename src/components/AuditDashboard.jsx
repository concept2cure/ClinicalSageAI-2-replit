import React, { useEffect, useState } from 'react';
import api from '../services/api';
export default function AuditDashboard({ org }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (org)
      api.get(`/api/ind/${org}/history`).then(r => setRows(r.data.filter(x => x.type === 'alert')));
  }, [org]);
  return (
    <div className="p-4">
      <h3 className="font-semibold">Alerts</h3>
      {rows.length === 0 ? (
        <p>No alerts.</p>
      ) : (
        <table className="text-sm w-full">
          <tbody>
            {rows.map((a, i) => (
              <tr key={i}>
                <td>{new Date(a.timestamp).toLocaleString()}</td>
                <td>{a.msg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
