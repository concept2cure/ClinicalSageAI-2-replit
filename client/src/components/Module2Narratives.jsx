import React, { useState, useEffect } from 'react';
import { postJson, getJson } from '../services/api';

export default function Module2Narratives({ project }) {
  const [busy, setBusy] = useState('');
  const [narrativeStatus, setNarrativeStatus] = useState({});
  const [error, setError] = useState(null);
  const [regenerate, setRegenerate] = useState(false);
  const [activeSections, setActiveSections] = useState([]);

  const sections = ['quality', 'nonclinical', 'clinical'];
  const nice = {
    quality: 'Quality Overall Summary (2.3)',
    nonclinical: 'Nonclinical Overview (2.4)',
    clinical: 'Clinical Overview (2.5)',
  };

  // Fetch the status of all narratives when the component loads or project changes
  useEffect(() => {
    if (!project?.project_id) return;

    // Reset states when project changes
    setError(null);
    setBusy('');
    setNarrativeStatus({});

    // Fetch narrative status for the current project
    getJson(`/api/ind/${project.project_id}/module2`)
      .then(data => {
        if (data.narratives) {
          // Transform into an object keyed by section
          const status = {};
          data.narratives.forEach(narrative => {
            status[narrative.section] = narrative;
          });
          setNarrativeStatus(status);

          // Set active sections that have existing narratives
          const active = data.narratives.filter(n => n.exists).map(n => n.section);
          setActiveSections(active);
        }
      })
      .catch(err => {
        console.error('Failed to fetch narrative status:', err);
        setError('Failed to load narrative status. Please try refreshing the page.');
      });
  }, [project]);

  const generateNarrative = section => {
    // Clear any previous errors
    setError(null);
    setBusy(section);

    // Determine if this is a regeneration of an existing narrative
    const forceRegenerate = regenerate && narrativeStatus[section]?.exists;

    postJson(`/api/ind/${project.project_id}/module2/${section}`, {
      force_regenerate: forceRegenerate,
    })
      .then(() => {
        // Update the status to show this section now exists
        setNarrativeStatus(prev => ({
          ...prev,
          [section]: {
            ...prev[section],
            exists: true,
            last_updated: new Date().toISOString(),
            version: (prev[section]?.version || 0) + 1,
          },
        }));

        // Add to active sections if not already there
        if (!activeSections.includes(section)) {
          setActiveSections(prev => [...prev, section]);
        }

        // Open the document in a new tab
        window.open(`/api/ind/${project.project_id}/module2/${section}`);
      })
      .catch(err => {
        console.error(`Error generating ${section} narrative:`, err);
        setError(
          `Failed to generate ${nice[section]}: ${err.response?.data?.detail || err.message}`
        );
      })
      .finally(() => {
        setBusy('');
      });
  };

  // Format the version and last updated date for display
  const formatStatus = section => {
    const status = narrativeStatus[section];
    if (!status || !status.exists) return null;

    const version = status.version || 1;
    const lastUpdated = status.last_updated
      ? new Date(status.last_updated).toLocaleString()
      : 'Unknown';

    return `v${version} • Last updated: ${lastUpdated}`;
  };

  return (
    <div className="space-y-6 p-4 bg-white rounded-lg shadow">
      <div>
        <h2 className="text-xl font-semibold mb-2">Module 2 - CTD Summaries</h2>
        <p className="text-sm text-gray-600 mb-4">
          Generate comprehensive Module 2 section summaries using AI. These summaries are essential
          components of an IND submission and will be generated based on your project metadata. Each
          document follows ICH guidelines and includes appropriate regulatory formatting.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="mb-4 flex items-center">
          <label className="flex items-center text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={regenerate}
              onChange={e => setRegenerate(e.target.checked)}
              className="mr-2 h-4 w-4 rounded border-gray-300"
            />
            Regenerate existing documents
          </label>
        </div>
      </div>

      <div className="space-y-4">
        {sections.map(section => (
          <div key={section} className="border rounded-md p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
              <div>
                <h3 className="font-medium">{nice[section]}</h3>
                {narrativeStatus[section]?.exists && (
                  <p className="text-xs text-gray-500">{formatStatus(section)}</p>
                )}
              </div>

              <button
                onClick={() => generateNarrative(section)}
                disabled={!project || busy !== ''}
                className={`mt-2 md:mt-0 px-4 py-2 rounded text-sm font-medium ${
                  narrativeStatus[section]?.exists
                    ? regenerate
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {busy === section ? (
                  <span className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Generating...
                  </span>
                ) : narrativeStatus[section]?.exists ? (
                  regenerate ? (
                    'Regenerate'
                  ) : (
                    'Download'
                  )
                ) : (
                  'Generate'
                )}
              </button>
            </div>

            <p className="text-sm text-gray-600">
              {section === 'quality' &&
                'Quality Overall Summary describing drug substance and product specifications for your IND submission.'}
              {section === 'nonclinical' &&
                'Nonclinical Overview summarizing pharmacology, ADME, and toxicology findings to support clinical trials.'}
              {section === 'clinical' &&
                'Clinical Overview providing rationale, protocol design, and safety/efficacy considerations.'}
            </p>
          </div>
        ))}
      </div>

      {activeSections.length > 0 && (
        <div className="mt-6 pt-4 border-t">
          <h3 className="font-medium mb-2">Module 2 Documents</h3>
          <p className="text-sm text-gray-600 mb-3">
            These documents have been successfully generated for your project:
          </p>

          <ul className="space-y-2">
            {activeSections.map(section => (
              <li
                key={`history-${section}`}
                className="flex justify-between items-center p-2 bg-gray-50 rounded"
              >
                <span>{nice[section]}</span>
                <button
                  onClick={() => window.open(`/api/ind/${project.project_id}/module2/${section}`)}
                  className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
