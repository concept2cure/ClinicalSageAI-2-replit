// /client/src/components/advisor/AdvisorSummaryPanel.jsx

import React, { useState, useEffect } from 'react';
import { AlertTriangle, TrendingUp, Clock, DollarSign } from 'lucide-react';

export default function AdvisorSummaryPanel() {
  const [advisorData, setAdvisorData] = useState({
    readinessScore: 65,
    riskLevel: 'Medium',
    delayDays: 49,
    financialImpact: 2450000,
  });

  const [playbook, setPlaybook] = useState('Fast IND Playbook');

  // Fetch advisor data from API
  useEffect(() => {
    const fetchAdvisorReadiness = async () => {
      try {
        const response = await fetch(
          `/api/advisor/check-readiness?playbook=${encodeURIComponent(playbook)}`
        );
        if (response.ok) {
          const data = await response.json();
          setAdvisorData(data);
        } else {
          console.error('Failed to load Advisor Readiness.');
          console.log('Using fallback data for demonstration');
          // Default fallback data is already set in useState above
        }
      } catch (error) {
        console.error('Failed to load Advisor Readiness.', error);
        console.log('Using fallback data for demonstration');
      }
    };

    fetchAdvisorReadiness();
  }, [playbook]);

  // Format a number as currency
  const formatCurrency = value => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Get risk level color
  const getRiskLevelColor = level => {
    switch (level.toLowerCase()) {
      case 'high':
        return 'text-red-600 bg-red-50';
      case 'medium':
        return 'text-amber-600 bg-amber-50';
      case 'low':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-blue-600 bg-blue-50';
    }
  };

  return (
    <div className="mb-8">
      <div className="flex flex-col md:flex-row items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Regulatory Intelligence Hub</h1>
          <p className="text-gray-600 text-sm">
            Comprehensive strategic regulatory platform with intelligent risk prediction, dynamic
            timeline simulation, and AI-powered guidance.
          </p>
        </div>

        {/* Playbook Selector */}
        <div className="mt-3 md:mt-0">
          <div className="flex items-center">
            <span className="text-sm font-medium text-gray-700 mr-2">Regulatory Strategy:</span>
            <select
              value={playbook}
              onChange={e => setPlaybook(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="Fast IND Playbook">Fast IND Playbook</option>
              <option value="Cost-Optimized IND Playbook">Cost-Optimized IND Playbook</option>
              <option value="Global Submission Playbook">Global Submission Playbook</option>
            </select>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Readiness Score */}
        <div className="bg-yellow-50 p-4 rounded-md flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-yellow-800 mb-1">Readiness Score</div>
            <div className="text-2xl font-bold text-yellow-800">{advisorData.readinessScore}%</div>
          </div>
          <div className="h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-yellow-700" />
          </div>
        </div>

        {/* Risk Level */}
        <div
          className={`p-4 rounded-md flex items-center justify-between ${getRiskLevelColor(advisorData.riskLevel)}`}
        >
          <div>
            <div className="text-xs font-medium mb-1">Risk Level</div>
            <div className="text-2xl font-bold">{advisorData.riskLevel}</div>
          </div>
          <div
            className={`h-12 w-12 rounded-full flex items-center justify-center ${
              advisorData.riskLevel.toLowerCase() === 'high'
                ? 'bg-red-100'
                : advisorData.riskLevel.toLowerCase() === 'medium'
                  ? 'bg-amber-100'
                  : 'bg-green-100'
            }`}
          >
            <AlertTriangle
              className={`h-6 w-6 ${
                advisorData.riskLevel.toLowerCase() === 'high'
                  ? 'text-red-700'
                  : advisorData.riskLevel.toLowerCase() === 'medium'
                    ? 'text-amber-700'
                    : 'text-green-700'
              }`}
            />
          </div>
        </div>

        {/* Delay Estimate */}
        <div className="bg-red-50 p-4 rounded-md flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-red-800 mb-1">Delay Estimate</div>
            <div className="text-2xl font-bold text-red-800">{advisorData.delayDays} days</div>
          </div>
          <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
            <Clock className="h-6 w-6 text-red-700" />
          </div>
        </div>

        {/* Financial Impact */}
        <div className="bg-green-50 p-4 rounded-md flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-green-800 mb-1">Financial Impact</div>
            <div className="text-2xl font-bold text-green-800">
              {formatCurrency(advisorData.financialImpact)}
            </div>
          </div>
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <DollarSign className="h-6 w-6 text-green-700" />
          </div>
        </div>
      </div>
    </div>
  );
}
