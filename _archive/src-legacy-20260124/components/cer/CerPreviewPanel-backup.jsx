import React from 'react';

export default function CerPreviewPanel({ title, sections = [], faers = [], comparators = [] }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{title || 'Clinical Evaluation Report'}</h1>

      {sections.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Drafted Sections</h2>
          {sections.map((s, i) => (
            <div key={i} className="mb-4 border p-4 bg-white rounded shadow">
              <h3 className="text-lg font-bold mb-2">{s.section}</h3>
              <div className="whitespace-pre-wrap text-sm text-gray-800">{s.content}</div>
            </div>
          ))}
        </div>
      )}

      {faers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">FAERS Safety Summary</h2>
          <table className="table-auto w-full text-sm border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-2 py-1">Reaction</th>
                <th className="border px-2 py-1">Outcome</th>
                <th className="border px-2 py-1">Serious</th>
                <th className="border px-2 py-1">Age</th>
                <th className="border px-2 py-1">Sex</th>
                <th className="border px-2 py-1">Date</th>
              </tr>
            </thead>
            <tbody>
              {faers.map((f, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1">{f.reaction}</td>
                  <td className="border px-2 py-1">{f.outcome}</td>
                  <td className="border px-2 py-1">{f.is_serious ? 'Yes' : 'No'}</td>
                  <td className="border px-2 py-1">{f.age || 'N/A'}</td>
                  <td className="border px-2 py-1">
                    {f.sex === '1' ? 'Male' : f.sex === '2' ? 'Female' : 'Unknown'}
                  </td>
                  <td className="border px-2 py-1">{f.report_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {comparators.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Comparator Risk Scores</h2>
          <ul className="list-disc list-inside">
            {comparators.map((c, i) => (
              <li key={i}>
                {c.comparator} – Risk Score: {c.riskScore} (Reports: {c.reportCount})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
