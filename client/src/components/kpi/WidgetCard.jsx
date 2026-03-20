import React, { useEffect, useState, useRef } from 'react';
import api from '../../services/api';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// R4: Widget Export - Stub functions until we can install actual dependencies
const html2canvas = element => {
  console.log('html2canvas called for', element);
  return Promise.resolve({
    toBlob: callback => callback(new Blob(['PNG data would be here'], { type: 'image/png' })),
  });
};

const saveAs = (blob, filename) => {
  console.log(`Saving ${filename}`, blob);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function WidgetCard({ widget }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const ref = useRef(null);

  // R5: Check for dark mode
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement?.classList?.contains('dark') || false
  );

  useEffect(() => {
    setLoading(true);
    api
      .get(`/api/org/${widget.org}/widget/${widget.id}/data`)
      .then(response => {
        setData(response.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading widget data:', err);
        setError(err.message || 'Failed to load data');
        setLoading(false);
      });
  }, [widget.id, widget.org]);

  useEffect(() => {
    // Function to check dark mode
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement?.classList?.contains('dark') || false);
    };

    // Check immediately
    checkDarkMode();

    // Setup an observer for theme changes
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.attributeName === 'class' && mutation.target === document.documentElement) {
          checkDarkMode();
        }
      });
    });

    // Start observing
    if (document.documentElement) {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    // Cleanup
    return () => observer.disconnect();
  }, []);

  // Get theme-appropriate colors
  const chartColors = {
    bar: isDarkMode ? '#4ade80' : '#2563eb',
    line: isDarkMode ? '#2dd4bf' : '#0891b2',
    pie: isDarkMode ? '#38bdf8' : '#4f46e5',
    background: isDarkMode ? '#1e293b' : '#ffffff',
    text: isDarkMode ? '#e5e7eb' : '#374151',
    grid: isDarkMode ? '#1f2937' : '#e5e7eb',
  };

  // R4: Export functions
  const exportToPNG = () => {
    if (ref.current) {
      html2canvas(ref.current).then(canvas => {
        canvas.toBlob(blob => {
          saveAs(blob, `${widget.name}.png`);
        });
      });
    }
  };

  const exportToCSV = () => {
    if (data && data.length > 0) {
      // Convert JSON to CSV
      const headers = Object.keys(data[0]).join(',');
      const csvRows = data.map(row =>
        Object.values(row)
          .map(value => (typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value))
          .join(',')
      );
      const csvContent = [headers, ...csvRows].join('\n');

      // Create and download the file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, `${widget.name}.csv`);
    }
  };

  const renderChart = () => {
    if (loading)
      return <div className="flex items-center justify-center h-32">Loading data...</div>;
    if (error) return <div className="text-red-500 p-2">Error: {error}</div>;
    if (!data || data.length === 0)
      return <div className="text-gray-500 p-2">No data available</div>;

    switch (widget.type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey={Object.keys(data[0])[0]} tick={{ fill: chartColors.text }} />
              <YAxis tick={{ fill: chartColors.text }} />
              <Tooltip contentStyle={{ backgroundColor: chartColors.background }} />
              <Legend />
              <Bar dataKey={Object.keys(data[0])[1]} fill={chartColors.bar} />
            </BarChart>
          </ResponsiveContainer>
        );
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey={Object.keys(data[0])[0]} tick={{ fill: chartColors.text }} />
              <YAxis tick={{ fill: chartColors.text }} />
              <Tooltip contentStyle={{ backgroundColor: chartColors.background }} />
              <Legend />
              <Line type="monotone" dataKey={Object.keys(data[0])[1]} stroke={chartColors.line} />
            </LineChart>
          </ResponsiveContainer>
        );
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                dataKey={Object.keys(data[0])[1]}
                nameKey={Object.keys(data[0])[0]}
                cx="50%"
                cy="50%"
                outerRadius={80}
                fill={chartColors.pie}
                label
              />
              <Tooltip contentStyle={{ backgroundColor: chartColors.background }} />
            </PieChart>
          </ResponsiveContainer>
        );
      default:
        return (
          <div className="overflow-auto max-h-40">
            <table className="min-w-full text-xs">
              <thead>
                <tr className={isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}>
                  {Object.keys(data[0]).map(key => (
                    <th key={key} className="px-2 py-1 border">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className={i % 2 ? (isDarkMode ? 'bg-gray-800' : 'bg-gray-50') : ''}>
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="px-2 py-1 border">
                        {val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  };

  return (
    <div
      ref={ref}
      className={`${isDarkMode ? 'bg-gray-800 text-gray-100' : 'bg-white'} shadow rounded p-3 flex flex-col h-full`}
    >
      <div className="flex justify-between items-center mb-1">
        <h4 className="text-sm font-semibold">{widget.name}</h4>
        <div className="text-right text-[11px] space-x-1">
          <button
            onClick={exportToPNG}
            className={`px-2 py-0.5 ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded`}
          >
            PNG
          </button>
          <button
            onClick={exportToCSV}
            className={`px-2 py-0.5 ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded`}
          >
            CSV
          </button>
        </div>
      </div>
      <div className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'} mb-2`}>
        {widget.type.toUpperCase()} Chart
      </div>
      <div className="flex-grow overflow-hidden">{renderChart()}</div>
    </div>
  );
}
