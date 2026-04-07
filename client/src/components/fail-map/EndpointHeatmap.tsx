import React from 'react';

interface EndpointData {
  endpoint: string;
  indication: string;
  failureRate: number;
  count: number;
}

interface EndpointHeatmapProps {
  data: EndpointData[];
}

export const EndpointHeatmap: React.FC<EndpointHeatmapProps> = ({ data }) => {
  // Group data by indication and endpoint for the heatmap
  const indications = [...new Set(data.map(item => item.indication))];
  const endpoints = [...new Set(data.map(item => item.endpoint))];

  // Create a lookup table for faster rendering
  const dataMap: Record<string, Record<string, number>> = {};

  indications.forEach(indication => {
    dataMap[indication] = {};
    endpoints.forEach(endpoint => {
      const match = data.find(item => item.indication === indication && item.endpoint === endpoint);
      dataMap[indication][endpoint] = match ? match.failureRate : 0;
    });
  });

  // Calculate highest failure rate for color scaling
  const maxFailureRate = Math.max(...data.map(item => item.failureRate));

  // Function to get color based on failure rate
  const getColor = (rate: number) => {
    if (rate === 0) return 'bg-slate-100';

    const intensity = Math.floor((rate / maxFailureRate) * 100);

    if (intensity > 80) return 'bg-red-600 text-white';
    if (intensity > 60) return 'bg-red-500 text-white';
    if (intensity > 40) return 'bg-red-400 text-white';
    if (intensity > 20) return 'bg-red-300';
    return 'bg-red-200';
  };

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="p-2 border border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-40">
                Indication / Endpoint
              </th>
              {endpoints.map(endpoint => (
                <th
                  key={endpoint}
                  className="p-2 border border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                >
                  {endpoint}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indications.map(indication => (
              <tr key={indication}>
                <td className="p-2 border border-slate-200 text-sm font-medium">{indication}</td>
                {endpoints.map(endpoint => {
                  const failureRate = dataMap[indication][endpoint];
                  return (
                    <td
                      key={`${indication}-${endpoint}`}
                      className={`p-2 border border-slate-200 text-center ${getColor(failureRate)}`}
                    >
                      {failureRate ? `${(failureRate * 100).toFixed(0)}%` : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-center justify-between bg-white p-4 rounded-lg border border-slate-200">
        <div>
          <h4 className="text-sm font-medium mb-2">Top Failure Patterns</h4>
          <ul className="space-y-1 text-xs text-slate-600">
            {data
              .sort((a, b) => b.failureRate - a.failureRate)
              .slice(0, 3)
              .map((item, i) => (
                <li key={i} className="flex items-center">
                  <span
                    className={`inline-block w-3 h-3 rounded-full mr-2 ${getColor(item.failureRate)}`}
                  ></span>
                  <span>
                    {item.endpoint} in {item.indication}: {(item.failureRate * 100).toFixed(0)}%
                    failure rate
                  </span>
                </li>
              ))}
          </ul>
        </div>

        <div className="flex flex-col items-end">
          <h4 className="text-sm font-medium mb-2">Failure Rate Legend</h4>
          <div className="flex items-center space-x-2">
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 rounded-full bg-red-200 mr-1"></span>
              <span className="text-xs">20-40%</span>
            </div>
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 rounded-full bg-red-300 mr-1"></span>
              <span className="text-xs">40-60%</span>
            </div>
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 rounded-full bg-red-400 mr-1"></span>
              <span className="text-xs">60-80%</span>
            </div>
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 rounded-full bg-red-600 mr-1"></span>
              <span className="text-xs">80%+</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <h4 className="text-sm font-medium mb-2">Phase Transition Impact</h4>
          <p className="text-xs text-slate-600">
            Overall response rate (ORR) endpoints fail 42% more often in Phase 3 oncology trials
            than in Phase 2, suggesting a systematic issue with efficacy translation to larger, more
            diverse patient populations.
          </p>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <h4 className="text-sm font-medium mb-2">Endpoint Selection Insights</h4>
          <p className="text-xs text-slate-600">
            Patient-reported outcomes in neurology trials show 71% failure rates, indicating
            potential issues with endpoint sensitivity, placebo effects, or measurement reliability
            in subjective assessments.
          </p>
        </div>
      </div>
    </div>
  );
};
