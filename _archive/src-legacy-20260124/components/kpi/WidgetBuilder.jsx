import React, { useState } from 'react';
import MonacoEditor from 'react-monaco-editor';

export default function WidgetBuilder({ initialData = {}, onSave, onCancel }) {
  const [data, setData] = useState(
    initialData.id
      ? initialData
      : {
          name: '',
          sql: 'SELECT * FROM metrics LIMIT 10',
          type: 'bar',
          visibility: 'private',
        }
  );

  return (
    <div className="bg-white p-4 rounded shadow-lg">
      <h3 className="text-lg font-semibold mb-3">Widget Configuration</h3>

      <label className="block mb-1 text-sm">Widget Name</label>
      <input
        type="text"
        className="border p-1 w-full mb-2"
        value={data.name}
        onChange={e => setData({ ...data, name: e.target.value })}
        placeholder="Widget Name"
      />

      <label className="block mb-1 text-sm">Chart Type</label>
      <select
        className="border p-1 w-full mb-2"
        value={data.type}
        onChange={e => setData({ ...data, type: e.target.value })}
      >
        <option value="bar">Bar Chart</option>
        <option value="line">Line Chart</option>
        <option value="pie">Pie Chart</option>
        <option value="table">Table</option>
      </select>

      <label className="block mb-1 text-sm">Visibility</label>
      <select
        className="border p-1 w-full mb-2"
        value={data.visibility}
        onChange={e => setData({ ...data, visibility: e.target.value })}
      >
        <option value="private">Private</option>
        <option value="role">Role-shared</option>
        <option value="public">Public</option>
      </select>

      <label className="block mb-1 text-sm">SQL Query</label>
      <div className="mb-2 text-xs">
        <div className="flex space-x-2 mb-1">
          <div>
            Table:
            <select
              className="border p-1"
              onChange={e => {
                const table = e.target.value;
                setData({ ...data, sql: `SELECT * FROM ${table} LIMIT 10` });
              }}
            >
              <option value="">Select table</option>
              <option value="metrics">metrics</option>
              <option value="alerts">alerts</option>
            </select>
          </div>
          <div>
            Group By:
            <select
              className="border p-1"
              onChange={e => {
                const column = e.target.value;
                if (column) {
                  setData({
                    ...data,
                    sql: `SELECT ${column}, COUNT(*) as count FROM metrics GROUP BY ${column}`,
                  });
                }
              }}
            >
              <option value="">Select column</option>
              <option value="category">category</option>
              <option value="value">value</option>
              <option value="timestamp">timestamp</option>
            </select>
          </div>
        </div>
      </div>
      <MonacoEditor
        width="100%"
        height="150"
        language="sql"
        theme="vs-light"
        value={data.sql}
        onChange={sql => setData({ ...data, sql })}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
        }}
      />

      <div className="flex justify-end mt-4 space-x-2">
        <button className="bg-gray-200 px-3 py-1 rounded" onClick={onCancel}>
          Cancel
        </button>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={() => onSave(data)}>
          Save Widget
        </button>
      </div>
    </div>
  );
}
