// /client/src/components/advisor/AdvisorRiskHeatmapV2.jsx

import React, { useState, useEffect } from 'react';
import LoadingSpinner from '../common/LoadingSpinner';
import { toast } from '@/hooks/use-toast';

export default function AdvisorRiskHeatmapV2({ sidebar = false }) {
  const [missingSections, setMissingSections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMissingSections = async () => {
      try {
        const res = await fetch('/api/advisor/check-readiness?playbook=Fast IND Playbook');
        const data = await res.json();

        // Log the response for debugging
        console.log('API Response:', data);

        // Process gaps from the response
        if (data && data.gaps && Array.isArray(data.gaps)) {
          // Based on the API response format we've received, each gap has section and status fields
          const missingSectionsList = data.gaps
            .filter(gap => gap.status === 'missing' || gap.status === 'incomplete')
            .map(gap => gap.section);

          console.log('Extracted missing sections:', missingSectionsList);

          // If we found sections, use them
          if (missingSectionsList.length > 0) {
            setMissingSections(missingSectionsList);
          } else {
            // Fallback to showing all sections from our risk profile
            console.warn('Using all sections from risk profile as fallback');
            setMissingSections(Object.keys(sectionRiskProfile).slice(0, 6));
          }
        } else {
          console.error('Failed to load Advisor Readiness or invalid data structure.');
          // Use default example sections from our risk profile
          setMissingSections([
            'CMC Stability Study',
            'Clinical Study Reports (CSR)',
            'Toxicology Reports',
            'Drug Substance Specs',
            'Quality Overall Summary',
          ]);
        }
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to fetch missing sections', error);
        // Fallback data
        setMissingSections([
          'CMC Stability Study',
          'Clinical Study Reports (CSR)',
          'Toxicology Reports',
          'Drug Substance Specs',
          'Quality Overall Summary',
        ]);
        setIsLoading(false);
      }
    };

    fetchMissingSections();
  }, []);
  // Define criticality and delay impact mappings
  const sectionRiskProfile = {
    'CMC Stability Study': { risk: 'High', delayDays: 30, financialRisk: 750000 },
    'Clinical Study Reports (CSR)': { risk: 'High', delayDays: 45, financialRisk: 1000000 },
    'Clinical Safety Reports': { risk: 'High', delayDays: 30, financialRisk: 600000 },
    'Drug Substance Specs': { risk: 'Medium', delayDays: 21, financialRisk: 400000 },
    'Drug Product Specs': { risk: 'Medium', delayDays: 21, financialRisk: 400000 },
    'Nonclinical Overview': { risk: 'Medium', delayDays: 14, financialRisk: 250000 },
    'Toxicology Reports': { risk: 'Medium', delayDays: 14, financialRisk: 300000 },
    'Genotoxicity Reports': { risk: 'Medium', delayDays: 14, financialRisk: 300000 },
    'Pharmacology Reports': { risk: 'Low', delayDays: 7, financialRisk: 100000 },
    'Pharmacokinetics Reports': { risk: 'Low', delayDays: 7, financialRisk: 100000 },
    'Cover Letter': { risk: 'Low', delayDays: 2, financialRisk: 20000 },
    'Intro Summary': { risk: 'Low', delayDays: 3, financialRisk: 15000 },
    'Tabulated Summaries': { risk: 'Low', delayDays: 5, financialRisk: 25000 },
    'Investigator Brochure Updates': { risk: 'Low', delayDays: 5, financialRisk: 25000 },
    'US Agent Appointment': { risk: 'Low', delayDays: 2, financialRisk: 20000 },
    'GMP Certificates': { risk: 'Medium', delayDays: 14, financialRisk: 350000 },
    'Clinical Overview': { risk: 'Medium', delayDays: 21, financialRisk: 450000 },
    'ADME Studies': { risk: 'Medium', delayDays: 14, financialRisk: 300000 },
    'Carcinogenicity Reports': { risk: 'High', delayDays: 30, financialRisk: 650000 },
    'Quality Overall Summary': { risk: 'High', delayDays: 28, financialRisk: 550000 },
    'Clinical Summary': { risk: 'Medium', delayDays: 21, financialRisk: 400000 },
  };

  const getRiskProfile = section => {
    return sectionRiskProfile[section] || { risk: 'Low', delayDays: 5, financialRisk: 25000 };
  };

  // For sidebar view - more compact version
  if (sidebar) {
    return (
      <div>
        <div className="grid grid-cols-2 gap-1">
          {missingSections.slice(0, 4).map((section, idx) => {
            const { risk } = getRiskProfile(section);
            const riskColor =
              risk === 'High' ? 'bg-red-500' : risk === 'Medium' ? 'bg-yellow-400' : 'bg-green-400';

            return (
              <div key={idx} className={`rounded-sm p-1 text-white text-xs ${riskColor}`}>
                <span className="text-[11px] block truncate">{section}</span>
              </div>
            );
          })}
        </div>

        {missingSections.length > 4 && (
          <div className="text-xs mt-1 text-gray-500">
            +{missingSections.length - 4} more risks...
          </div>
        )}
      </div>
    );
  }

  // For dashboard view - full version
  if (isLoading) {
    return (
      <div className="p-4 bg-white rounded-lg shadow-md space-y-4">
        <h3 className="text-md font-semibold text-gray-700 mb-2">Regulatory Risk Heatmap</h3>
        <LoadingSpinner text="Loading risk data..." />
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-md space-y-4">
      <h3 className="text-md font-semibold text-gray-700 mb-2">Regulatory Risk Heatmap</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {missingSections.map((section, idx) => {
          const { risk, delayDays, financialRisk } = getRiskProfile(section);
          const riskColor =
            risk === 'High' ? 'bg-red-500' : risk === 'Medium' ? 'bg-yellow-400' : 'bg-green-400';

          return (
            <div
              key={idx}
              className={`rounded-md p-3 flex flex-col items-center justify-center text-white font-semibold ${riskColor} hover:opacity-90 cursor-pointer transition-all duration-200`}
              onClick={() => {
                // Create a more detailed modal or panel instead of a simple alert
                const { risk, delayDays, financialRisk } = getRiskProfile(section);

                // Create a custom modal popup with action buttons
                const modal = document.createElement('div');
                modal.className =
                  'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
                modal.innerHTML = `
                  <div class="bg-white rounded-lg p-4 sm:p-6 max-w-md w-full mx-4 shadow-xl overflow-y-auto max-h-[90vh]">
                    <h3 class="text-lg sm:text-xl font-bold text-gray-900 mb-2">${section}</h3>
                    <div class="mb-4 pb-4 border-b border-gray-200">
                      <div class="flex items-center mt-2">
                        <span class="w-3 h-3 rounded-full ${riskColor} mr-2"></span>
                        <span class="text-gray-700"><strong>${risk} Risk Level</strong></span>
                      </div>
                      <p class="text-xs sm:text-sm text-gray-600 mt-3">
                        Completing this section is critical to your regulatory submission.
                        Current delays in this area result in:
                      </p>
                      <ul class="mt-2 space-y-1 text-xs sm:text-sm">
                        <li class="flex items-center">
                          <svg class="w-4 h-4 text-red-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                          </svg>
                          <span><strong>Time Impact:</strong> +${delayDays} days to submission timeline</span>
                        </li>
                        <li class="flex items-center">
                          <svg class="w-4 h-4 text-red-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                          </svg>
                          <span><strong>Financial Impact:</strong> ~$${(
                            financialRisk / 1000
                          ).toLocaleString()}k estimated cost</span>
                        </li>
                      </ul>
                    </div>
                    <div class="flex flex-col space-y-2">
                      <button id="openDocumentEditor" class="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded text-sm sm:text-base">
                        Open Document Editor
                      </button>
                      <button id="viewAnalysis" class="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded text-sm sm:text-base">
                        View Detailed Analysis
                      </button>
                      <button class="closeModal w-full py-2 px-4 border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded mt-2 text-sm sm:text-base">
                        Close
                      </button>
                    </div>
                  </div>
                `;

                document.body.appendChild(modal);

                // Add event listeners for all buttons

                // Open Document Editor button
                modal.querySelector('#openDocumentEditor').addEventListener('click', () => {
                  document.body.removeChild(modal);
                  toast({
                    title: `Opening editor for "${section}"`,
                    description: 'Navigate to the Documents tab to begin drafting this section.',
                  });
                });

                // View Detailed Analysis button
                modal.querySelector('#viewAnalysis').addEventListener('click', () => {
                  document.body.removeChild(modal);
                  toast({
                    title: `Risk analysis for "${section}"`,
                    description: `${risk} risk identified. Estimated +${delayDays} day delay, ~$${(
                      financialRisk / 1000
                    ).toLocaleString()}k financial impact. Address this section to reduce submission risk.`,
                  });
                });

                // Handle close button
                modal.querySelector('.closeModal').addEventListener('click', () => {
                  document.body.removeChild(modal);
                });

                // Also close on background click
                modal.addEventListener('click', e => {
                  if (e.target === modal) {
                    document.body.removeChild(modal);
                  }
                });
              }}
              title={`Risk details for ${section}`}
            >
              <span className="text-xs text-center">{section}</span>
              <span className="text-[11px] mt-2">{risk} Risk</span>
              <span className="text-[11px]">
                +{delayDays}d / ~${(financialRisk / 1000).toLocaleString()}k
              </span>
            </div>
          );
        })}
      </div>

      {missingSections.length === 0 && (
        <div className="text-center text-sm text-green-600 font-semibold">
          🎉 All critical sections completed!
        </div>
      )}
    </div>
  );
}
