import React, { useEffect, useState } from 'react';
import api from '../services/api';

export default function HistoryTable({ project }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (project) {
      api.get(`/api/ind/${project.project_id}/history`).then(({ data }) => setRows(data.reverse()));
    }
  }, [project]);

  if (!project) return null;
  return (
    <div className="mt-4">
      <h4 className="font-semibold mb-1">Submission History</h4>
      {rows.length === 0 && <p className="text-sm text-gray-500">No sequences yet.</p>}
      {rows.length > 0 && (
        <table className="text-sm w-full border">
          <thead className="bg-gray-100 dark:bg-slate-800">
            <tr>
              <th className="p-1 border border-gray-200 dark:border-slate-700">Serial #</th>
              <th className="p-1 border border-gray-200 dark:border-slate-700">Timestamp (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50 dark:bg-slate-800/50'}>
                <td className="border border-gray-200 dark:border-slate-700 p-1 text-center">
                  {r.serial}
                </td>
                <td className="border border-gray-200 dark:border-slate-700 p-1">
                  {new Date(r.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
