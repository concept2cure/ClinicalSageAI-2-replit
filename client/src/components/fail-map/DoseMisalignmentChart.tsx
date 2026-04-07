import React from 'react';

interface DoseData {
  indication: string;
  endpoint: string;
  doseMisalignment: number;
  failureRate: number;
  count: number;
}

interface DoseMisalignmentChartProps {
  data: DoseData[];
}

export const DoseMisalignmentChart: React.FC<DoseMisalignmentChartProps> = ({ data }) => {
  // Group data by indication
  const indicationData = [
    {
      indication: 'Oncology',
      misalignment: 0.52,
      reason: 'Dose limiting toxicities at efficacious dose',
      risk: 'high',
    },
    {
      indication: 'CNS',
      misalignment: 0.38,
      reason: 'Sub-optimal CNS penetration',
      risk: 'medium',
    },
    {
      indication: 'Immunology',
      misalignment: 0.41,
      reason: 'Adaptive immunity mechanisms',
      risk: 'medium',
    },
    {
      indication: 'Cardiovascular',
      misalignment: 0.33,
      reason: 'Temporal response variation',
      risk: 'medium',
    },
    {
      indication: 'Metabolic',
      misalignment: 0.29,
      reason: 'Target saturation issues',
      risk: 'low',
    },
  ];

  // Common dose-finding mistakes
  const mistakes = [
    { mistake: 'Limited PK/PD sampling in Phase 1', percentage: 68 },
    { mistake: 'Linear dose escalation vs. adaptive design', percentage: 57 },
    { mistake: 'Insufficient exposure at target site', percentage: 49 },
    { mistake: 'Biomarker response not tied to clinical outcome', percentage: 42 },
    { mistake: 'Single dose level selection for Phase 2/3', percentage: 38 },
  ];

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium mb-3">Dose-Response Misalignment by Indication</h3>
          <div className="bg-white p-5 rounded-lg border border-slate-200">
            <div className="space-y-5">
              {indicationData.map((item, i) => (
                <div key={i} className="relative">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center">
                      <span className="w-3 h-3 rounded-full bg-amber-500 inline-block mr-2"></span>
                      <span className="text-sm font-medium">{item.indication}</span>
                    </div>
                    <div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          item.risk === 'high'
                            ? 'bg-red-100 text-red-800'
                            : item.risk === 'medium'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {item.risk} risk
                      </span>
                    </div>
                  </div>

                  <div className="mb-1.5 relative w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full bg-amber-500 rounded-r-full"
                      style={{ width: `${item.misalignment * 100}%` }}
                    ></div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {(item.misalignment * 100).toFixed(0)}% misalignment
                    </span>
                    <span className="text-xs text-slate-500">{item.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-3">Common Dose-Finding Mistakes</h3>
          <div className="bg-white p-5 rounded-lg border border-slate-200">
            <div className="space-y-4">
              {mistakes.map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{item.mistake}</span>
                    <span className="font-medium">{item.percentage}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-amber-600"
                      style={{ width: `${item.percentage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-500 italic">
              Percentage of trials where this issue contributed to dose selection failure
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-amber-50 rounded-lg border border-amber-100 p-4">
          <h4 className="text-sm font-medium text-amber-800 mb-2">
            Phase 2 to Phase 3 Dose Changes
          </h4>
          <div className="flex items-center">
            <svg
              className="w-10 h-10 text-amber-600"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 8V16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M15 14L12 17L9 14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="ml-3">
              <span className="block text-xl font-bold text-amber-800">47%</span>
              <span className="text-xs text-amber-600">
                of oncology trials change dose between Phase 2 and Phase 3
              </span>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 rounded-lg border border-amber-100 p-4">
          <h4 className="text-sm font-medium text-amber-800 mb-2">PK/PD-Clinical Response Gap</h4>
          <div className="flex items-center">
            <svg
              className="w-10 h-10 text-amber-600"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M9 19.5L3.5 14L9 8.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M15 4.5L20.5 10L15 15.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="ml-3">
              <span className="block text-xl font-bold text-amber-800">63%</span>
              <span className="text-xs text-amber-600">
                difference between predicted and observed clinical response rates
              </span>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 rounded-lg border border-amber-100 p-4">
          <h4 className="text-sm font-medium text-amber-800 mb-2">Target Engagement Consistency</h4>
          <div className="flex items-center">
            <svg
              className="w-10 h-10 text-amber-600"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22 12H18L15 21L9 3L6 12H2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="ml-3">
              <span className="block text-xl font-bold text-amber-800">39%</span>
              <span className="text-xs text-amber-600">
                of trials show high variability in target engagement at selected dose
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white p-5 rounded-lg border border-slate-200">
        <h3 className="text-sm font-medium mb-3">Mitigation Strategies</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start">
            <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-amber-700 font-medium">1</span>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium">Model-Informed Dose Selection</h4>
              <p className="text-xs text-slate-600 mt-1">
                Advanced PK/PD modeling with tissue-specific data and target engagement metrics
                improves dose prediction accuracy by 35%.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-amber-700 font-medium">2</span>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium">Multiple Dose Arm Strategy</h4>
              <p className="text-xs text-slate-600 mt-1">
                Testing at least 3 dose levels in Phase 2 reduces dose selection errors by 42% and
                provides robust dose-response characterization.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-amber-700 font-medium">3</span>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium">Exposure-Response Analysis</h4>
              <p className="text-xs text-slate-600 mt-1">
                Correlating actual drug exposure (not just dose) with response increases predictive
                accuracy by 58% in Phase 3 outcomes.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-amber-700 font-medium">4</span>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium">Target Engagement Biomarkers</h4>
              <p className="text-xs text-slate-600 mt-1">
                Including pharmacodynamic biomarkers that directly measure target engagement
                improves dose selection by 47%.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
