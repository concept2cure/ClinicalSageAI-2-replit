import React from 'react';

interface PowerData {
  indication: string;
  endpoint: string;
  actualPower: number;
  plannedPower: number;
  failureRate: number;
  count: number;
}

interface StatisticalPowerChartProps {
  data: PowerData[];
}

export const StatisticalPowerChart: React.FC<StatisticalPowerChartProps> = ({ data }) => {
  // Top underpowered indications
  const indications = [
    { name: 'Rare Disease', powerDeficit: 34, failureRate: 0.76 },
    { name: 'CNS/Neurology', powerDeficit: 28, failureRate: 0.73 },
    { name: 'Psychiatry', powerDeficit: 25, failureRate: 0.71 },
    { name: 'Cardiovascular', powerDeficit: 21, failureRate: 0.68 },
    { name: 'Inflammatory Disease', powerDeficit: 19, failureRate: 0.65 },
  ];

  // Common underpowering factors
  const factors = [
    { factor: 'High placebo response', percentage: 73 },
    { factor: 'Endpoint variability underestimated', percentage: 65 },
    { factor: 'Patient heterogeneity', percentage: 58 },
    { factor: 'Composite endpoint complexity', percentage: 52 },
    { factor: 'Dropout rates higher than expected', percentage: 47 },
  ];

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium mb-3">Power Deficit by Indication</h3>
          <div className="bg-white rounded-lg p-6 border border-dashed border-slate-300">
            {indications.map((item, i) => (
              <div key={i} className="mb-4">
                <div className="flex justify-between items-center mb-1">
                  <div>
                    <span className="text-sm font-medium">{item.name}</span>
                    <span className="ml-2 text-xs text-red-600">
                      {item.powerDeficit}% underpowered
                    </span>
                  </div>
                  <span className="text-sm">{(item.failureRate * 100).toFixed(0)}% failure</span>
                </div>
                <div className="relative w-full h-6 bg-slate-100 rounded-full overflow-hidden">
                  {/* Power deficit visualization */}
                  <div
                    className="absolute left-0 top-0 h-full bg-blue-500"
                    style={{ width: '80%' }}
                  ></div>
                  <div
                    className="absolute right-0 top-0 h-full bg-red-500"
                    style={{ width: `${item.powerDeficit}%` }}
                  ></div>
                  <div
                    className="absolute left-0 top-0 h-full w-[1px] bg-slate-600"
                    style={{ left: '80%' }}
                  ></div>
                  <div className="absolute top-0 left-0 w-full h-full flex items-center justify-between px-3">
                    <span className="text-xs text-white font-medium z-10">Planned Power (80%)</span>
                    <span className="text-xs text-white font-medium z-10">Deficit</span>
                  </div>
                </div>
              </div>
            ))}
            <div className="mt-2 text-xs text-slate-500 italic">
              Average statistical power deficit across indications with high failure rates
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-3">Reasons for Statistical Underpowering</h3>
          <div className="bg-white rounded-lg p-6 border border-dashed border-slate-300">
            {factors.map((item, i) => (
              <div key={i} className="mb-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm">{item.factor}</span>
                  <span className="text-sm font-medium">{item.percentage}%</span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="mt-2 text-xs text-slate-500 italic">
              Percentage of trials where this factor contributed to underpowering
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
          <h3 className="text-sm font-medium text-blue-800 mb-3">
            Phase-Specific Statistical Issues
          </h3>

          <div className="space-y-4">
            <div className="flex">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-700 font-medium">P1</span>
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-medium text-blue-800">Phase 1</h4>
                <p className="text-xs text-blue-600 mt-0.5">
                  PK variability underestimated by 40% on average, affecting dose selection
                </p>
              </div>
            </div>

            <div className="flex">
              <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-700 font-medium">P2</span>
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-medium text-blue-800">Phase 2</h4>
                <p className="text-xs text-blue-600 mt-0.5">
                  Underestimation of required sample size by 35% due to endpoint variability
                </p>
              </div>
            </div>

            <div className="flex">
              <div className="w-10 h-10 bg-blue-300 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-700 font-medium">P3</span>
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-medium text-blue-800">Phase 3</h4>
                <p className="text-xs text-blue-600 mt-0.5">
                  Population heterogeneity leads to 45% reduction in effect size compared to Phase 2
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-3">Statistical Mitigation Strategies</h3>
          <div className="bg-white p-4 rounded-lg border border-slate-200">
            <ul className="space-y-2.5">
              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg
                    className="w-4 h-4 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    ></path>
                  </svg>
                </div>
                <div className="ml-2.5">
                  <p className="text-sm font-medium">Adaptive Trial Designs</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Could prevent 42% of underpowering failures through interim sample size
                    re-estimation
                  </p>
                </div>
              </li>

              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg
                    className="w-4 h-4 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    ></path>
                  </svg>
                </div>
                <div className="ml-2.5">
                  <p className="text-sm font-medium">Biomarker Stratification</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Reduces required sample size by 38% by targeting responder populations
                  </p>
                </div>
              </li>

              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg
                    className="w-4 h-4 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    ></path>
                  </svg>
                </div>
                <div className="ml-2.5">
                  <p className="text-sm font-medium">Historical Borrowing</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Bayesian methods with historical data improve power by 25-30% in rare diseases
                  </p>
                </div>
              </li>

              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg
                    className="w-4 h-4 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    ></path>
                  </svg>
                </div>
                <div className="ml-2.5">
                  <p className="text-sm font-medium">Enhanced Placebo Control Designs</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Reduces placebo response by 35% in CNS trials, increasing assay sensitivity
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
