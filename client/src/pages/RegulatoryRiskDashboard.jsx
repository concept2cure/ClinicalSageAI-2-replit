// client/src/pages/RegulatoryRiskDashboard.jsx
import { useEffect, useMemo, useState } from 'react';
import AdvisorRiskHeatmapV2 from '../components/advisor/AdvisorRiskHeatmapV2';
import AdvisorSidebarV3 from '../components/advisor/AdvisorSidebarV3';
import { authService } from '../services/authService';

export default function RegulatoryRiskDashboard() {
  const [selectedPlaybook, setSelectedPlaybook] = useState('Executive Playbook');
  const [playbookOptions, setPlaybookOptions] = useState(['Executive Playbook']);
  const [currentData, setCurrentData] = useState(null);
  const [loading, setLoading] = useState(true);

  const subId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('subId') || localStorage.getItem('activeSubmissionId');
  }, []);

  useEffect(() => {
    const loadPlaybook = async () => {
      if (!subId) {
        setCurrentData(null);
        setLoading(false);
        return;
      }

      const token = authService.getToken();
      if (!token) {
        setCurrentData(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`/api/reg/playbook/${subId}/generate`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Unable to load playbook.');
        }

        const payload = await response.json();
        const cards = Array.isArray(payload?.cards) ? payload.cards : [];

        const missingSections = cards
          .filter(card => card.kind === 'M3_COMPLETE')
          .flatMap(card => card.details?.missing || [])
          .filter(Boolean);

        const cardIds = cards.map(card => card.card_id).filter(Boolean);
        let readinessScore = 0;

        if (cardIds.length) {
          const simResponse = await fetch('/api/reg/playbook/simulate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ subId, cardIds }),
          });

          if (simResponse.ok) {
            const simulation = await simResponse.json();
            readinessScore = simulation?.current ?? 0;
          }
        }

        const riskLevel = readinessScore >= 80 ? 'Low' : readinessScore >= 60 ? 'Medium' : 'High';

        setCurrentData({
          missingSections,
          readinessScore,
          riskLevel,
          estimatedDelayDays: null,
        });
      } catch (error) {
        console.error('Error loading playbook:', error);
        setCurrentData(null);
      } finally {
        setLoading(false);
      }
    };

    loadPlaybook();
  }, [subId]);

  const handlePlaybookChange = e => {
    setSelectedPlaybook(e.target.value);
  };

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Regulatory Risk Intelligence Dashboard
        </h1>
        <p className="text-gray-600">
          Comprehensive visualization of CTD readiness, risk levels, and critical submission gaps.
        </p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Select Regulatory Strategy:
        </label>
        <select
          className="px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm w-full sm:w-64"
          value={selectedPlaybook}
          onChange={handlePlaybookChange}
        >
          {playbookOptions.map(playbook => (
            <option key={playbook} value={playbook}>
              {playbook}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Enhanced Risk Visualization */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4">CTD Critical Risk Analysis</h2>

            {!subId && (
              <div className="text-sm text-gray-600 mb-4">
                Select a submission to view regulatory risk playbooks.
              </div>
            )}

            {loading && (
              <div className="text-sm text-gray-600 mb-4">Loading playbook data...</div>
            )}

            {!loading && subId && !currentData && (
              <div className="text-sm text-gray-600 mb-4">No playbook data available.</div>
            )}

            {/* Summary cards */}
            {currentData && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-blue-700">Readiness</h3>
                <p className="text-2xl font-bold text-blue-800">{currentData.readinessScore}%</p>
              </div>

              <div className="bg-red-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-red-700">Risk Level</h3>
                <p className="text-2xl font-bold text-red-800">{currentData.riskLevel}</p>
              </div>

              <div className="bg-amber-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-amber-700">Delay Estimate</h3>
                <p className="text-2xl font-bold text-amber-800">
                  {currentData.estimatedDelayDays == null ? 'N/A' : `${currentData.estimatedDelayDays} days`}
                </p>
              </div>

              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-purple-700">Financial Impact</h3>
                <p className="text-2xl font-bold text-purple-800">
                  {currentData.estimatedDelayDays == null
                    ? 'N/A'
                    : `$${(currentData.estimatedDelayDays * 50000).toLocaleString()}`}
                </p>
              </div>
            </div>
            )}

            {currentData && (
              <div className="bg-gray-50 p-4 rounded mb-6">
                <h3 className="text-lg font-semibold mb-3">Critical CTD Gaps</h3>
                <AdvisorRiskHeatmapV2 missingSections={currentData.missingSections} />
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div>
          <AdvisorSidebarV3 />
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mt-8 bg-blue-50 border border-blue-100 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-700 mb-1">Information</h3>
        <p className="text-xs text-blue-600">
          This dashboard visualizes submission readiness across CTD sections, highlighting critical
          regulatory gaps and risks. Select different regulatory playbooks to see how strategy
          changes affect submission timelines and requirements. Each missing section displays its
          risk level, delay impact, and estimated financial cost.
        </p>
      </div>
    </div>
  );
}
