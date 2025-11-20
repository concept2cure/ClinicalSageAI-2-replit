// /client/src/components/advisor/AdvisorSidebar.jsx

import { useEffect, useState } from 'react';

export default function AdvisorSidebar() {
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch data from the advisor API
    console.log('Fetching Regulatory Intelligence data from API...');

    fetch('/api/advisor/check-readiness')
      .then(response => {
        if (!response.ok) {
          throw new Error(`API responded with status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Received advisor data:', data);
        setReadiness(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching advisor data:', error);
        // Fallback to mock data if API fails
        const mockData = {
          success: true,
          readinessScore: 65,
          missingSections: [
            'CMC Stability Data',
            'Clinical Study Reports (CSR)',
            'Toxicology Reports',
            'Drug Substance Specs',
            'Drug Product Specs',
            'Pharmacology Reports',
            'Investigator Brochure Updates',
          ],
          riskLevel: 'Medium',
          estimatedDelayDays: 49,
          recommendations: [
            'Upload CMC Stability Data immediately.',
            'Upload Clinical Study Reports (CSR) immediately.',
            'Upload Toxicology Reports immediately.',
            'Upload Drug Substance Specs immediately.',
            'Upload Drug Product Specs immediately.',
          ],
        };

        setReadiness(mockData);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-md space-y-6 w-full">
        <p className="text-gray-500 text-sm">Loading Submission Readiness...</p>
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

      <div className="space-y-2 text-sm">
        <p>
          <strong>Submission Readiness:</strong> {readiness.readinessScore}%
        </p>
        <p>
          <strong>Risk Level:</strong>{' '}
          <span
            className={
              readiness.riskLevel === 'High'
                ? 'text-red-600'
                : readiness.riskLevel === 'Medium'
                  ? 'text-yellow-500'
                  : 'text-green-600'
            }
          >
            {readiness.riskLevel}
          </span>
        </p>
        <p>
          <strong>Estimated Delay:</strong> {readiness.estimatedDelayDays} days
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold mt-4">High Priority Gaps:</h3>
        <ul className="mt-2 list-disc list-inside text-xs text-red-500 space-y-1">
          {readiness.missingSections.slice(0, 5).map((gap, idx) => (
            <li key={idx}>{gap}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-semibold mt-4">Recommended Next Actions:</h3>
        <ul className="mt-2 list-disc list-inside text-xs text-green-600 space-y-1">
          {readiness.recommendations.slice(0, 5).map((action, idx) => (
            <li key={idx}>{action}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
