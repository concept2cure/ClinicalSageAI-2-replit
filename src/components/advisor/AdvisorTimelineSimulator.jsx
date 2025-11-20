// /client/src/components/advisor/AdvisorTimelineSimulator.jsx

import { useState, useEffect } from 'react';

export default function AdvisorTimelineSimulator() {
  const [missingSections, setMissingSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState('');
  const [simulatedFilingDate, setSimulatedFilingDate] = useState('');

  useEffect(() => {
    const fetchMissingSections = async () => {
      try {
        const res = await fetch('/api/advisor/check-readiness');
        const data = await res.json();

        // Process gaps from the response
        if (data && data.gaps) {
          // Extract missing section names from gaps array
          const missingSectionsList = data.gaps
            .filter(gap => gap.status === 'missing')
            .map(gap => gap.section);

          setMissingSections(missingSectionsList);
        } else {
          console.error('Failed to load Advisor Readiness.');
          // Fallback data for demonstration
          console.log('Using fallback data for demonstration');
          setMissingSections([
            'CMC Stability Study',
            'Clinical Study Reports',
            'Toxicology Reports',
          ]);
        }
      } catch (error) {
        console.error('Failed to fetch missing sections', error);
        // Fallback data for demonstration
        setMissingSections(['CMC Stability Study', 'Clinical Study Reports', 'Toxicology Reports']);
      }
    };

    fetchMissingSections();
  }, []);

  const calculateSimulatedFiling = () => {
    if (!estimatedCompletionDate) return;

    const baseFilingDate = new Date();
    baseFilingDate.setDate(baseFilingDate.getDate() + 49); // Assume current estimated delay

    const completionDate = new Date(estimatedCompletionDate);
    const timeDiffDays = Math.floor((completionDate - new Date()) / (1000 * 60 * 60 * 24));

    if (timeDiffDays < 0) {
      setSimulatedFilingDate('Invalid Date');
    } else {
      const simulatedDate = new Date();
      simulatedDate.setDate(simulatedDate.getDate() + (timeDiffDays + 20)); // 20 days extra for regulatory review buffers
      setSimulatedFilingDate(simulatedDate.toISOString().slice(0, 10));
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-md font-semibold text-gray-700">Timeline Simulation Tool</h3>
      <p className="text-sm text-gray-500">
        Predict how document completion impacts your estimated submission date.
      </p>

      <div className="space-y-4">
        {/* Select Section */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Select Critical Document to Complete:
          </label>
          <select
            value={selectedSection}
            onChange={e => setSelectedSection(e.target.value)}
            className="w-full border px-3 py-2 rounded text-sm"
          >
            <option value="">-- Select Section --</option>
            {missingSections.map((section, idx) => (
              <option key={idx} value={section}>
                {section}
              </option>
            ))}
          </select>
        </div>

        {/* Choose Estimated Completion Date */}
        <div>
          <label className="block text-sm font-medium mb-1">Estimated Completion Date:</label>
          <input
            type="date"
            value={estimatedCompletionDate}
            onChange={e => setEstimatedCompletionDate(e.target.value)}
            className="w-full border px-3 py-2 rounded text-sm"
          />
        </div>

        {/* Simulate Button */}
        <button
          onClick={calculateSimulatedFiling}
          className="w-full bg-indigo-600 text-white font-semibold py-2 rounded hover:bg-indigo-700 transition"
        >
          Simulate New Filing Date
        </button>

        {/* Simulated Filing Result */}
        {simulatedFilingDate && (
          <div className="text-center mt-4">
            <p className="text-sm text-gray-500">Predicted New Submission Date:</p>
            <p className="text-lg font-bold text-indigo-600">{simulatedFilingDate}</p>
          </div>
        )}
      </div>
    </div>
  );
}
