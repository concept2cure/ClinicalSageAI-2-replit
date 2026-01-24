import React from 'react';

// Simplified chart rendering since we can't install recharts due to dependency issues
function BarChart({ data }) {
  if (!data || !data.length) return <div className="text-center p-2">No data available</div>;

  // Find the maximum value for scaling
  const maxValue = Math.max(
    ...data.map(item => {
      const val = Object.values(item).find(v => typeof v === 'number');
      return val || 0;
    })
  );

  return (
    <div className="flex flex-col h-full">
      {data.map((item, i) => {
        const label = Object.keys(item).find(k => typeof item[k] === 'string');
        const value = Object.values(item).find(v => typeof v === 'number') || 0;
        const width = `${(value / maxValue) * 100}%`;

        return (
          <div key={i} className="flex items-center mb-1">
            <div className="text-xs w-20 truncate mr-1">{item[label]}</div>
            <div className="flex-grow bg-gray-100 rounded-sm h-4">
              <div
                className="bg-blue-500 h-full rounded-sm text-xs text-white px-1 flex items-center"
                style={{ width }}
              >
                {value}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LineChart({ data }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-sm text-gray-500">Line chart visualization (would use Recharts)</div>
    </div>
  );
}

function PieChart({ data }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-sm text-gray-500">Pie chart visualization (would use Recharts)</div>
    </div>
  );
}

export default function WidgetChart({ type, data }) {
  if (!data) return <div className="p-2 text-gray-400">Loading data...</div>;

  if (data.error) {
    return (
      <div className="p-2 text-red-500 text-xs">
        <div className="font-bold">Error:</div>
        <div>{data.error}</div>
      </div>
    );
  }

  if (!data.results || !data.results.length) {
    return <div className="p-2 text-gray-400">No data available</div>;
  }

  switch (type.toLowerCase()) {
    case 'bar':
      return <BarChart data={data.results} />;
    case 'line':
      return <LineChart data={data.results} />;
    case 'pie':
      return <PieChart data={data.results} />;
    default:
      return (
        <pre className="p-2 text-xs overflow-auto">{JSON.stringify(data.results, null, 2)}</pre>
      );
  }
}
