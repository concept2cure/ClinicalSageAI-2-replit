import React, { useEffect, useState } from 'react';
import api from '../services/api';
export default function RedactionLog() {
  const [rows, set] = useState([]);
  useEffect(() => {
    api.get('/api/org/system/history').then(r => set(r.data.filter(x => x.type === 'redaction')));
  }, []);
  return (
    <div className="p-4">
      <h3 className="font-semibold mb-2">Redaction Log</h3>
      <table className="text-xs w-full">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{new Date(r.timestamp).toLocaleString()}</td>
              <td>{r.matches.map(m => m[0]).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
