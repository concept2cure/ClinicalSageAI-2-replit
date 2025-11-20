// client/src/components/advisor/TimelineSimulator.jsx
import { useState } from 'react';
import { Calendar, ChevronRight, RefreshCcw } from 'lucide-react';

export default function TimelineSimulator({ readinessData, onSimulate, simulationData, onReset }) {
  const [selectedSection, setSelectedSection] = useState('');
  const [completionDate, setCompletionDate] = useState('');
  const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

  const handleSectionChange = e => {
    setSelectedSection(e.target.value);
  };

  const handleDateChange = e => {
    setCompletionDate(e.target.value);
  };

  const handleSimulation = () => {
    if (selectedSection && completionDate) {
      onSimulate(selectedSection, completionDate);
    }
  };

  // Find the best completion date - 14 days from now as default
  const getDefaultDate = () => {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 14);
    return defaultDate.toISOString().split('T')[0];
  };

  const isSimulationActive = !!simulationData.modifiedSection;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Timeline Simulator</h2>
        {isSimulationActive && (
          <div className="text-sm text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
            Simulation Active
          </div>
        )}
      </div>

      <p className="text-gray-600 mb-6">
        Simulate the impact of your document completion timeline on overall regulatory readiness and
        submission date.
      </p>

      {/* Simulation Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select Missing Section:
          </label>
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={selectedSection}
            onChange={handleSectionChange}
          >
            <option value="">-- Select Section --</option>
            {readinessData.missingSections.map(section => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Estimated Completion Date:
          </label>
          <div className="relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Calendar className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="date"
              min={today}
              value={completionDate || getDefaultDate()}
              onChange={handleDateChange}
              className="w-full pl-10 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
        </div>

        <div className="flex items-end">
          <button
            onClick={handleSimulation}
            disabled={!selectedSection || !completionDate}
            className={`w-full flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium text-white ${
              !selectedSection || !completionDate
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            Run Simulation <ChevronRight className="ml-1 h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Simulation Results */}
      {isSimulationActive ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between mb-6">
            <h3 className="text-lg font-semibold">Simulation Results</h3>
            <button
              onClick={onReset}
              className="flex items-center text-sm text-gray-600 hover:text-indigo-600"
            >
              <RefreshCcw className="mr-1 h-4 w-4" /> Reset
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Before Changes</h4>

              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">Readiness Score</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {simulationData.original.readinessScore}%
                  </p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">Estimated Delay</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {simulationData.original.estimatedDelayDays} days
                  </p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">Financial Impact</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${(simulationData.original.estimatedDelayDays * 50000).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">
                After Completing {simulationData.modifiedSection}
              </h4>

              <div className="space-y-4">
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <p className="text-sm text-indigo-500">Readiness Score</p>
                  <div className="flex items-center">
                    <p className="text-2xl font-bold text-indigo-900">
                      {simulationData.simulated.readinessScore}%
                    </p>
                    <span className="ml-2 text-sm font-medium text-green-600">
                      +
                      {simulationData.simulated.readinessScore -
                        simulationData.original.readinessScore}
                      %
                    </span>
                  </div>
                </div>

                <div className="bg-indigo-50 p-4 rounded-lg">
                  <p className="text-sm text-indigo-500">Estimated Delay</p>
                  <div className="flex items-center">
                    <p className="text-2xl font-bold text-indigo-900">
                      {simulationData.simulated.estimatedDelayDays} days
                    </p>
                    <span className="ml-2 text-sm font-medium text-green-600">
                      -
                      {simulationData.original.estimatedDelayDays -
                        simulationData.simulated.estimatedDelayDays}{' '}
                      days
                    </span>
                  </div>
                </div>

                <div className="bg-indigo-50 p-4 rounded-lg">
                  <p className="text-sm text-indigo-500">Financial Impact</p>
                  <div className="flex items-center">
                    <p className="text-2xl font-bold text-indigo-900">
                      ${(simulationData.simulated.estimatedDelayDays * 50000).toLocaleString()}
                    </p>
                    <span className="ml-2 text-sm font-medium text-green-600">
                      -$
                      {(
                        (simulationData.original.estimatedDelayDays -
                          simulationData.simulated.estimatedDelayDays) *
                        50000
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-green-50 border border-green-100 rounded-lg">
            <h3 className="text-sm font-semibold text-green-800 mb-1">Strategic Insight</h3>
            <p className="text-sm text-green-700">
              Completing <strong>{simulationData.modifiedSection}</strong> by{' '}
              {new Date(simulationData.modifiedDate).toLocaleDateString()}
              will improve your submission readiness by{' '}
              {simulationData.simulated.readinessScore - simulationData.original.readinessScore}%
              and accelerate your filing date by{' '}
              {simulationData.original.estimatedDelayDays -
                simulationData.simulated.estimatedDelayDays}{' '}
              days, saving approximately $
              {(
                (simulationData.original.estimatedDelayDays -
                  simulationData.simulated.estimatedDelayDays) *
                50000
              ).toLocaleString()}
              in delay costs.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-6 text-center">
          <h3 className="text-lg font-medium text-blue-800 mb-2">Run Your First Simulation</h3>
          <p className="text-blue-600 mb-4">
            Select a missing document section and an estimated completion date to see how it impacts
            your regulatory timeline and costs.
          </p>
          <p className="text-sm text-blue-500">
            The simulator will predict submission date changes, readiness score improvements, and
            financial savings.
          </p>
        </div>
      )}

      {/* Tips Section */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-1">High-Impact Documents</h3>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• CMC Stability Studies (30-45 day impact)</li>
            <li>• Clinical Study Reports (30-60 day impact)</li>
            <li>• Toxicology Reports (14-21 day impact)</li>
          </ul>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-1">Optimization Tips</h3>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• Prioritize high-risk documents with largest timeline impact</li>
            <li>• Complete CMC sections before clinical documents</li>
            <li>• Use interim reports where possible for fastest impact</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
