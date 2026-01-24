// /client/src/components/advisor/AdvisorSidebarV3.jsx

import { useEffect, useState } from 'react';
import { getAdvisorReadiness } from '../../lib/advisorService';
import AdvisorRiskHeatmapV2 from './AdvisorRiskHeatmapV2';

export default function AdvisorSidebarV3() {
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState('Fast IND Playbook');

  const playbooks = ['Fast IND Playbook', 'Full NDA Playbook', 'EMA IMPD Playbook'];

  useEffect(() => {
    const fetchReadiness = async () => {
      setLoading(true);
      try {
        const data = await getAdvisorReadiness(selectedPlaybook);
        setReadiness(data);
      } catch (error) {
        console.error('Error fetching Advisor data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReadiness();
  }, [selectedPlaybook]);

  const handlePlaybookChange = e => {
    setSelectedPlaybook(e.target.value);
  };

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-md space-y-6 w-full">
        <p className="text-gray-500 text-sm">Loading Regulatory Intelligence...</p>
      </div>
    );
  }

  if (!readiness) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-md space-y-6 w-full">
        <p className="text-red-500 text-sm">Advisor data unavailable.</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-md space-y-6 w-full">
      <h2 className="text-xl font-semibold">Regulatory Intelligence Advisor</h2>

      {/* Playbook Selector */}
      <div className="mt-1">
        <label className="block text-sm font-medium text-gray-600 mb-1">
          Select Regulatory Strategy:
        </label>
        <select
          className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={selectedPlaybook}
          onChange={handlePlaybookChange}
        >
          {playbooks.map(playbook => (
            <option key={playbook} value={playbook}>
              {playbook}
            </option>
          ))}
        </select>
      </div>

      {/* Progress Circle */}
      <div className="flex items-center justify-center mt-4">
        <div className="relative w-24 h-24">
          <svg className="transform rotate-[-90deg]" viewBox="0 0 36 36">
            <path
              className="text-gray-300"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="text-indigo-600"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              strokeDasharray={`${readiness.readinessScore}, 100`}
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold">{readiness.readinessScore}%</span>
          </div>
        </div>
      </div>

      {/* Risk Level */}
      <div className="text-center mt-2">
        <p className="text-xs text-gray-500">Risk Level:</p>
        <p
          className={`text-sm font-semibold ${
            readiness.riskLevel === 'High'
              ? 'text-red-600'
              : readiness.riskLevel === 'Medium'
                ? 'text-yellow-500'
                : 'text-green-600'
          }`}
        >
          {readiness.riskLevel}
        </p>
      </div>

      {/* Estimated Filing Date */}
      <div className="text-center">
        <p className="text-xs text-gray-500">Projected Submission Date:</p>
        <p className="text-sm font-semibold text-indigo-700">
          {readiness.estimatedSubmissionDate || 'TBD'}
        </p>
      </div>

      {/* Critical Gaps */}
      <div>
        <h3 className="text-sm font-semibold mt-3">Critical Gaps:</h3>
        <ul className="mt-1 list-disc list-inside text-xs text-red-500 space-y-1">
          {readiness.missingSections.slice(0, 5).map((gap, idx) => (
            <li key={idx}>{gap}</li>
          ))}
        </ul>
      </div>

      {/* Risk Heatmap */}
      <div className="mt-4">
        <h3 className="text-sm font-semibold mb-2">Risk Visualization:</h3>
        <AdvisorRiskHeatmapV2 missingSections={readiness.missingSections || []} sidebar={true} />
      </div>

      {/* Next Best Actions */}
      <div>
        <h3 className="text-sm font-semibold mt-3">Next Best Actions:</h3>
        <ul className="mt-1 list-disc list-inside text-xs text-green-600 space-y-1">
          {readiness.recommendations.slice(0, 4).map((action, idx) => (
            <li key={idx}>{action}</li>
          ))}
        </ul>
      </div>

      {/* Estimated Delay Cost */}
      <div className="text-center mt-3">
        <p className="text-xs text-gray-500">Estimated Delay Impact:</p>
        <p className="text-sm font-semibold text-red-600">
          ~${(readiness.estimatedDelayDays * 50000).toLocaleString()} lost
        </p>
      </div>

      {/* Powered by */}
      <div className="text-center mt-3 border-t pt-2">
        <p className="text-xs text-gray-400">Powered by TrialSage™ Regulatory AI</p>
      </div>
    </div>
  );
}
