// client/src/pages/EnhancedRegulatoryDashboard.jsx
import { useState, useEffect } from 'react';
import { getAdvisorReadiness } from '../../lib/advisorService';
import AdvisorRiskHeatmapV2 from '../../components/advisor/AdvisorRiskHeatmapV2';
import TimelineSimulator from '../../components/advisor/TimelineSimulator';
// AskLumenCopilot removed — mock AI, not part of beta (Wave 2)
import { AlertTriangle, Clock, DollarSign, BarChart2 } from 'lucide-react';

export default function EnhancedRegulatoryDashboard() {
  const [selectedPlaybook, setSelectedPlaybook] = useState('Fast IND Playbook');
  const [readinessData, setReadinessData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('riskMap'); // 'riskMap', 'timeline', 'copilot'
  const [simulationData, setSimulationData] = useState({
    modifiedDate: null,
    modifiedSection: null,
    original: null,
    simulated: null,
  });

  const playbooks = [
    'Fast IND Playbook',
    'Full NDA Playbook',
    'EMA IMPD Playbook',
    'Accelerated Approval Path',
  ];

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await getAdvisorReadiness(selectedPlaybook);
        setReadinessData(data);
        setSimulationData({
          ...simulationData,
          original: data,
          simulated: data,
        });
      } catch (error) {
        console.error('Error fetching advisor data:', error);

        // Fallback data (will be replaced with API data in production)
        const fallbackData = {
          readinessScore:
            selectedPlaybook === 'Fast IND Playbook'
              ? 65
              : selectedPlaybook === 'Full NDA Playbook'
                ? 35
                : selectedPlaybook === 'Accelerated Approval Path'
                  ? 72
                  : 75,
          riskLevel: selectedPlaybook === 'Full NDA Playbook' ? 'High' : 'Medium',
          missingSections:
            selectedPlaybook === 'Fast IND Playbook'
              ? [
                  'CMC Stability Study',
                  'Clinical Study Reports (CSR)',
                  'Toxicology Reports',
                  'Drug Substance Specs',
                  'Pharmacology Reports',
                  'Investigator Brochure Updates',
                ]
              : selectedPlaybook === 'Full NDA Playbook'
                ? [
                    'CMC Stability Study',
                    'Clinical Study Reports (CSR)',
                    'Toxicology Reports',
                    'ADME Studies',
                    'Carcinogenicity Reports',
                    'Genotoxicity Reports',
                    'Quality Overall Summary',
                    'Nonclinical Overview',
                    'Clinical Summary',
                    'Drug Substance Specs',
                    'Drug Product Specs',
                    'Clinical Safety Reports',
                  ]
                : selectedPlaybook === 'Accelerated Approval Path'
                  ? ['Interim Clinical Data Report', 'Drug Substance Specs', 'Risk Management Plan']
                  : [
                      'CMC Stability Study',
                      'GMP Certificates',
                      'Clinical Overview',
                      'Clinical Safety Reports',
                    ],
          recommendations: [
            'Upload CMC Stability Study immediately.',
            'Upload Clinical Study Reports immediately.',
            'Complete Quality Overall Summary.',
            'Finalize Toxicology Reports within 14 days.',
            'Update Drug Substance Specifications.',
          ],
          estimatedDelayDays:
            selectedPlaybook === 'Fast IND Playbook'
              ? 45
              : selectedPlaybook === 'Full NDA Playbook'
                ? 120
                : selectedPlaybook === 'Accelerated Approval Path'
                  ? 28
                  : 30,
          estimatedSubmissionDate: 'July 15, 2025',
          criticalPath: [
            {
              task: 'CMC Stability Study',
              dueDate: 'June 15, 2025',
              impact: 'High',
              financialRisk: 750000,
            },
            {
              task: 'Clinical Study Reports',
              dueDate: 'June 10, 2025',
              impact: 'High',
              financialRisk: 900000,
            },
            {
              task: 'Toxicology Report Update',
              dueDate: 'May 30, 2025',
              impact: 'Medium',
              financialRisk: 300000,
            },
          ],
          regulatoryRisks: [
            {
              risk: 'Missing stability data may trigger FDA RTF',
              probability: 'High',
              mitigation: 'Complete stability protocol and expedite interim report',
            },
            {
              risk: 'Incomplete clinical safety narratives',
              probability: 'Medium',
              mitigation: 'Prioritize completion of safety narratives for SAEs',
            },
          ],
        };

        setReadinessData(fallbackData);
        setSimulationData({
          ...simulationData,
          original: fallbackData,
          simulated: fallbackData,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedPlaybook]);

  const handlePlaybookChange = e => {
    setSelectedPlaybook(e.target.value);
  };

  const handleTimelineSimulation = (sectionName, completionDate) => {
    // This would be connected to an actual API that performs the timeline recalculation
    // For now, we'll simulate the changes

    const section = readinessData.missingSections.find(s => s === sectionName);
    if (!section) return;

    // Get the risk profile for this section
    const riskProfiles = {
      'CMC Stability Study': { delayReduction: 30, financialSavings: 750000 },
      'Clinical Study Reports (CSR)': { delayReduction: 45, financialSavings: 1000000 },
      'Toxicology Reports': { delayReduction: 14, financialSavings: 300000 },
      'Drug Substance Specs': { delayReduction: 21, financialSavings: 400000 },
      'GMP Certificates': { delayReduction: 14, financialSavings: 350000 },
    };

    const profile = riskProfiles[sectionName] || { delayReduction: 15, financialSavings: 250000 };

    // Calculate new delay reduction based on completion date
    const today = new Date();
    const completion = new Date(completionDate);
    const daysDiff = Math.round((completion - today) / (1000 * 60 * 60 * 24));

    // If completion is far in the future, the benefit is reduced
    const adjustedReduction = Math.max(1, profile.delayReduction - Math.floor(daysDiff / 7));
    const adjustedSavings = Math.round(
      profile.financialSavings * (adjustedReduction / profile.delayReduction)
    );

    // Remove this section from missing sections
    const updatedMissingSections = readinessData.missingSections.filter(s => s !== sectionName);

    // Calculate new readiness score (simplistic approach)
    const totalSections = 12; // Assume total sections needed
    const completedSections = totalSections - updatedMissingSections.length;
    const newReadinessScore = Math.round((completedSections / totalSections) * 100);

    // Calculate new delay
    const newDelay = Math.max(0, readinessData.estimatedDelayDays - adjustedReduction);

    // Calculate new submission date
    const submissionDate = new Date(today);
    submissionDate.setDate(submissionDate.getDate() + newDelay);
    const formattedDate = submissionDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Create simulated data
    const simulatedData = {
      ...readinessData,
      readinessScore: newReadinessScore,
      missingSections: updatedMissingSections,
      estimatedDelayDays: newDelay,
      estimatedSubmissionDate: formattedDate,
      riskLevel: newReadinessScore > 70 ? 'Low' : newReadinessScore > 50 ? 'Medium' : 'High',
    };

    setSimulationData({
      modifiedDate: completionDate,
      modifiedSection: sectionName,
      original: readinessData,
      simulated: simulatedData,
    });
  };

  const resetSimulation = () => {
    setSimulationData({
      ...simulationData,
      modifiedDate: null,
      modifiedSection: null,
      simulated: simulationData.original,
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto p-8 max-w-7xl">
        <div className="flex justify-center items-center min-h-[300px]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  // Display data is either the simulated data (if simulation is active) or the original data
  const displayData = simulationData.modifiedSection ? simulationData.simulated : readinessData;

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <div className="flex flex-col md:flex-row justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Regulatory Intelligence Hub</h1>
          <p className="text-slate-600 max-w-3xl">
            Comprehensive strategic regulatory platform with intelligent risk prediction, dynamic
            timeline simulation, and AI-powered guidance.
          </p>
        </div>

        <div className="mt-4 md:mt-0 w-full md:w-64">
          <label className="block text-sm font-medium text-slate-600 mb-1">
            Regulatory Strategy:
          </label>
          <select
            className="w-full px-3 py-2 bg-white/80 border border-slate-200/70 rounded-md shadow-sm focus:outline-none focus:ring-slate-400 focus:border-slate-400 sm:text-sm"
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
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div
          className={`p-4 rounded-lg flex items-center ${
            displayData.readinessScore >= 70
              ? 'bg-emerald-50/60 text-emerald-900 border border-emerald-200/70'
              : displayData.readinessScore >= 50
                ? 'bg-amber-50/60 text-amber-900 border border-amber-200/70'
                : 'bg-rose-50/60 text-rose-900 border border-rose-200/70'
          }`}
        >
          <div className="rounded-full p-2 mr-3 bg-white/80 border border-slate-200/60">
            <BarChart2
              className={
                displayData.readinessScore >= 70
                  ? 'text-emerald-500'
                  : displayData.readinessScore >= 50
                    ? 'text-amber-500'
                    : 'text-rose-500'
              }
              size={20}
            />
          </div>
          <div>
            <p className="text-xs opacity-80">Readiness Score</p>
            <p className="text-xl font-bold">{displayData.readinessScore}%</p>
          </div>
        </div>

        <div
          className={`p-4 rounded-lg flex items-center ${
            displayData.riskLevel === 'Low'
              ? 'bg-emerald-50/60 text-emerald-900 border border-emerald-200/70'
              : displayData.riskLevel === 'Medium'
                ? 'bg-amber-50/60 text-amber-900 border border-amber-200/70'
                : 'bg-rose-50/60 text-rose-900 border border-rose-200/70'
          }`}
        >
          <div className="rounded-full p-2 mr-3 bg-white/80 border border-slate-200/60">
            <AlertTriangle
              className={
                displayData.riskLevel === 'Low'
                  ? 'text-emerald-500'
                  : displayData.riskLevel === 'Medium'
                    ? 'text-amber-500'
                    : 'text-rose-500'
              }
              size={20}
            />
          </div>
          <div>
            <p className="text-xs opacity-80">Risk Level</p>
            <p className="text-xl font-bold">{displayData.riskLevel}</p>
          </div>
        </div>

        <div
          className={`p-4 rounded-lg flex items-center ${
            displayData.estimatedDelayDays <= 14
              ? 'bg-emerald-50/60 text-emerald-900 border border-emerald-200/70'
              : displayData.estimatedDelayDays <= 30
                ? 'bg-amber-50/60 text-amber-900 border border-amber-200/70'
                : 'bg-rose-50/60 text-rose-900 border border-rose-200/70'
          }`}
        >
          <div className="rounded-full p-2 mr-3 bg-white/80 border border-slate-200/60">
            <Clock
              className={
                displayData.estimatedDelayDays <= 14
                  ? 'text-emerald-500'
                  : displayData.estimatedDelayDays <= 30
                    ? 'text-amber-500'
                    : 'text-rose-500'
              }
              size={20}
            />
          </div>
          <div>
            <p className="text-xs opacity-80">Delay Estimate</p>
            <p className="text-xl font-bold">{displayData.estimatedDelayDays} days</p>
          </div>
        </div>

        <div
          className={`p-4 rounded-lg flex items-center ${
            displayData.estimatedDelayDays * 50000 <= 500000
              ? 'bg-emerald-50/60 text-emerald-900 border border-emerald-200/70'
              : displayData.estimatedDelayDays * 50000 <= 1000000
                ? 'bg-amber-50/60 text-amber-900 border border-amber-200/70'
                : 'bg-rose-50/60 text-rose-900 border border-rose-200/70'
          }`}
        >
          <div className="rounded-full p-2 mr-3 bg-white/80 border border-slate-200/60">
            <DollarSign
              className={
                displayData.estimatedDelayDays * 50000 <= 500000
                  ? 'text-emerald-500'
                  : displayData.estimatedDelayDays * 50000 <= 1000000
                    ? 'text-amber-500'
                    : 'text-rose-500'
              }
              size={20}
            />
          </div>
          <div>
            <p className="text-xs opacity-80">Financial Impact</p>
            <p className="text-xl font-bold">
              ${(displayData.estimatedDelayDays * 50000).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200/60 mb-6">
        <nav className="flex -mb-px space-x-6">
          <button
            onClick={() => setActiveTab('riskMap')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'riskMap'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Risk Heatmap
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'timeline'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Timeline Simulator
          </button>
          {/* Ask Lumen AI tab removed — mock AI, not part of beta (Wave 2) */}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white/80 rounded-2xl border border-slate-200/60 shadow-sm p-6 mb-6">
        {activeTab === 'riskMap' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-900">CTD Critical Gap Risk Analysis</h2>
              {simulationData.modifiedSection && (
                <div className="text-sm text-slate-700 bg-slate-900/5 px-3 py-1 rounded-full">
                  Simulated View
                </div>
              )}
            </div>

            <p className="text-slate-600 mb-6">
              Interactive visualization of CTD gaps with dynamic risk assessment. Click any risk
              tile for detailed analysis and remediation options.
            </p>

            <AdvisorRiskHeatmapV2 missingSections={displayData.missingSections || []} />

            {simulationData.modifiedSection && (
              <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200/60">
                <h3 className="text-sm font-medium text-slate-800 mb-2">Simulation Active</h3>
                <p className="text-sm text-slate-700">
                  This simulation shows the impact of completing{' '}
                  <strong>{simulationData.modifiedSection}</strong> by{' '}
                  {new Date(simulationData.modifiedDate).toLocaleDateString()}.
                </p>
                <button
                  onClick={resetSimulation}
                  className="mt-2 text-sm bg-white text-slate-700 border border-slate-200/70 px-3 py-1 rounded hover:bg-slate-50"
                >
                  Reset Simulation
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <TimelineSimulator
            readinessData={readinessData}
            onSimulate={handleTimelineSimulation}
            simulationData={simulationData}
            onReset={resetSimulation}
          />
        )}

        {/* AskLumenCopilot tab content removed — mock AI (Wave 2) */}
      </div>

      {/* Estimated Submission Path */}
      <div className="bg-white/80 rounded-2xl border border-slate-200/60 shadow-sm p-6 mb-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Estimated Submission Path</h2>

        <div className="flex items-center mb-6">
          <div className="w-full bg-slate-200/70 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full ${
                displayData.readinessScore >= 70
                  ? 'bg-emerald-500'
                  : displayData.readinessScore >= 50
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
              }`}
              style={{ width: `${displayData.readinessScore}%` }}
            ></div>
          </div>
          <span className="ml-4 text-sm font-medium text-slate-700">
            Target Date: {displayData.estimatedSubmissionDate}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Critical Path Items</h3>
            <ul className="space-y-2">
              {(displayData.criticalPath || []).map((item, idx) => (
                <li key={idx} className="flex justify-between p-2 bg-slate-50/70 rounded text-sm">
                  <span>{item.task}</span>
                  <span className="font-medium">{item.dueDate}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Top Regulatory Risks</h3>
            <ul className="space-y-2">
              {(displayData.regulatoryRisks || []).map((risk, idx) => (
                <li key={idx} className="p-2 bg-slate-50/70 rounded text-sm">
                  <div className="flex justify-between">
                    <span>{risk.risk}</span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        risk.probability === 'High'
                          ? 'bg-rose-100/70 text-rose-800'
                          : risk.probability === 'Medium'
                            ? 'bg-amber-100/70 text-amber-800'
                            : 'bg-emerald-100/70 text-emerald-800'
                      }`}
                    >
                      {risk.probability}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Mitigation: {risk.mitigation}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-slate-50 border border-slate-200/60 rounded-lg p-4">
        <h3 className="text-sm font-medium text-slate-800 mb-1">Strategic Intelligence</h3>
        <p className="text-xs text-slate-600">
          This intelligent regulatory dashboard combines AI prediction, strategic simulation, and
          real-time risk analysis to provide a comprehensive view of your submission readiness. Use
          the Timeline Simulator to model different completion scenarios and Ask AnA for
          strategic regulatory guidance.
        </p>
      </div>
    </div>
  );
}
