import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import WorkflowProgress from './WorkflowProgress';
import AnimatedWorkflow from './AnimatedWorkflow';
import { getJson, postJson } from '../../services/api';

/**
 * WorkflowDashboard Component
 *
 * A comprehensive dashboard for managing IND submission workflows,
 * displaying status, progress, and providing action buttons.
 */
const WorkflowDashboard = ({ project }) => {
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({
    forms: { completed: false, count: 0 },
    module2: { completed: false, count: 0 },
    module3: { completed: false, count: 0 },
    ectd: { completed: false, count: 0 },
    esg: { completed: false, count: 0 },
    ack: { completed: false, date: null },
  });
  const [selectedSerial, setSelectedSerial] = useState(null);
  const [esgStatus, setEsgStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeDisplay, setActiveDisplay] = useState('progress'); // "progress" or "animated"

  // Fetch project history
  useEffect(() => {
    if (!project?.project_id) return;

    const fetchHistory = async () => {
      try {
        const data = await getJson(`/api/ind/${project.project_id}/history`);
        if (Array.isArray(data)) {
          setHistory(data);
          analyzeHistory(data);
        }
      } catch (err) {
        console.error('Failed to fetch history:', err);
        setError('Failed to load submission history');
      }
    };

    fetchHistory();
  }, [project]);

  // Poll ESG status if there's an active submission
  useEffect(() => {
    if (!selectedSerial || !project?.project_id) return;

    const pollInterval = setInterval(async () => {
      try {
        const data = await getJson(`/api/ind/${project.project_id}/esg/status/${selectedSerial}`);
        setEsgStatus(data.status);

        // If we received acknowledgment, stop polling
        if (data.status?.startsWith('ACK')) {
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.log('Waiting for ESG status...');
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(pollInterval);
  }, [selectedSerial, project]);

  // Analyze history to determine completion status
  const analyzeHistory = historyData => {
    // Count items by type
    const formCount = historyData.filter(h => h.type?.includes('form')).length;
    const module2Count = historyData.filter(h => h.type?.includes('narrative')).length;
    const module3Count = historyData.filter(h => h.type?.includes('module3')).length;
    const ectdCount = historyData.filter(h => h.type === 'ectd_ga').length;
    const esgCount = historyData.filter(h => h.type === 'esg_submission').length;

    // Find the most recent acknowledgment
    const ackEntry = historyData
      .filter(h => h.type === 'esg_submission' && h.status?.includes('ACK'))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

    // Update statistics
    setStats({
      forms: { completed: formCount >= 3, count: formCount },
      module2: { completed: module2Count >= 3, count: module2Count },
      module3: { completed: module3Count >= 1, count: module3Count },
      ectd: { completed: ectdCount >= 1, count: ectdCount },
      esg: { completed: esgCount >= 1, count: esgCount },
      ack: {
        completed: !!ackEntry,
        date: ackEntry ? new Date(ackEntry.timestamp) : null,
      },
    });

    // If we have an ESG submission, set it as the selected serial
    const latestEsg = historyData
      .filter(h => h.type === 'esg_submission')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

    if (latestEsg && latestEsg.serial) {
      setSelectedSerial(latestEsg.serial);
      setEsgStatus(latestEsg.status);
    }
  };

  // Determine the current active stage
  const determineActiveStage = () => {
    if (!stats.forms.completed) return 'forms';
    if (!stats.module2.completed) return 'module2';
    if (!stats.module3.completed) return 'module3';
    if (!stats.ectd.completed) return 'ectd';
    if (!stats.esg.completed) return 'esg';
    if (stats.ack.completed) return 'acknowledgment';
    return 'esg';
  };

  // Determine the completed stages
  const determineCompletedStages = () => {
    const completed = [];
    if (stats.forms.completed) completed.push('forms');
    if (stats.module2.completed) completed.push('module2');
    if (stats.module3.completed) completed.push('module3');
    if (stats.ectd.completed) completed.push('ectd');
    if (stats.esg.completed) completed.push('esg');
    if (stats.ack.completed) completed.push('acknowledgment');
    return completed;
  };

  // Submit to ESG
  const submitToEsg = async () => {
    if (!project?.project_id) return;

    setLoading(true);
    setError(null);

    try {
      const response = await postJson(`/api/ind/${project.project_id}/esg/submit`);
      setSelectedSerial(response.serial);

      // Refresh history
      const updatedHistory = await getJson(`/api/ind/${project.project_id}/history`);
      if (Array.isArray(updatedHistory)) {
        setHistory(updatedHistory);
        analyzeHistory(updatedHistory);
      }
    } catch (err) {
      console.error('ESG submission failed:', err);
      setError(err.userMessage || 'Failed to submit to FDA ESG');
    } finally {
      setLoading(false);
    }
  };

  // Format date for display
  const formatDate = date => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Visualization toggle */}
      <div className="flex justify-end">
        <div className="inline-flex rounded-md shadow-sm" role="group">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-l-lg ${activeDisplay === 'progress' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100'}`}
            onClick={() => setActiveDisplay('progress')}
          >
            Progress Bar
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-r-lg ${activeDisplay === 'animated' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100'}`}
            onClick={() => setActiveDisplay('animated')}
          >
            Animated Flow
          </button>
        </div>
      </div>

      {/* Animated workflow visualizations */}
      <motion.div
        key={activeDisplay}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {activeDisplay === 'progress' ? (
          <WorkflowProgress project={{ history }} currentStage={determineActiveStage()} />
        ) : (
          <AnimatedWorkflow
            currentStage={determineActiveStage()}
            completedStages={determineCompletedStages()}
          />
        )}
      </motion.div>

      {/* Action panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Status panel */}
        <div className="bg-white p-4 rounded-lg shadow border col-span-2">
          <h3 className="text-lg font-semibold mb-3">Submission Status</h3>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm border-b pb-2">
              <span className="font-medium">Module 1 Forms</span>
              <span className={`${stats.forms.completed ? 'text-green-600' : 'text-gray-500'}`}>
                {stats.forms.completed ? (
                  <span className="flex items-center">
                    <svg
                      className="w-4 h-4 mr-1 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      ></path>
                    </svg>
                    Complete ({stats.forms.count}/3)
                  </span>
                ) : (
                  `In Progress (${stats.forms.count}/3)`
                )}
              </span>
            </div>

            <div className="flex justify-between items-center text-sm border-b pb-2">
              <span className="font-medium">Module 2 Narratives</span>
              <span className={`${stats.module2.completed ? 'text-green-600' : 'text-gray-500'}`}>
                {stats.module2.completed ? (
                  <span className="flex items-center">
                    <svg
                      className="w-4 h-4 mr-1 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      ></path>
                    </svg>
                    Complete ({stats.module2.count}/3)
                  </span>
                ) : (
                  `In Progress (${stats.module2.count}/3)`
                )}
              </span>
            </div>

            <div className="flex justify-between items-center text-sm border-b pb-2">
              <span className="font-medium">Module 3 Documentation</span>
              <span className={`${stats.module3.completed ? 'text-green-600' : 'text-gray-500'}`}>
                {stats.module3.completed ? (
                  <span className="flex items-center">
                    <svg
                      className="w-4 h-4 mr-1 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      ></path>
                    </svg>
                    Complete
                  </span>
                ) : (
                  'Not Started'
                )}
              </span>
            </div>

            <div className="flex justify-between items-center text-sm border-b pb-2">
              <span className="font-medium">eCTD Package</span>
              <span className={`${stats.ectd.completed ? 'text-green-600' : 'text-gray-500'}`}>
                {stats.ectd.completed ? (
                  <span className="flex items-center">
                    <svg
                      className="w-4 h-4 mr-1 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      ></path>
                    </svg>
                    Generated ({stats.ectd.count})
                  </span>
                ) : (
                  'Not Generated'
                )}
              </span>
            </div>

            <div className="flex justify-between items-center text-sm border-b pb-2">
              <span className="font-medium">FDA ESG Submission</span>
              <span className={`${stats.esg.completed ? 'text-green-600' : 'text-gray-500'}`}>
                {stats.esg.completed ? (
                  <span className="flex items-center">
                    <svg
                      className="w-4 h-4 mr-1 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      ></path>
                    </svg>
                    Submitted
                  </span>
                ) : (
                  'Not Submitted'
                )}
              </span>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="font-medium">FDA Acknowledgment</span>
              <span className={`${stats.ack.completed ? 'text-green-600' : 'text-gray-500'}`}>
                {stats.ack.completed ? (
                  <span className="flex items-center">
                    <svg
                      className="w-4 h-4 mr-1 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      ></path>
                    </svg>
                    Received ({formatDate(stats.ack.date)})
                  </span>
                ) : (
                  'Pending'
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="bg-white p-4 rounded-lg shadow border">
          <h3 className="text-lg font-semibold mb-3">Actions</h3>

          <div className="space-y-3">
            {error && <div className="bg-red-50 text-red-700 p-2 rounded text-sm">{error}</div>}

            {esgStatus && (
              <div
                className={`p-2 rounded text-sm ${
                  esgStatus.includes('ACK')
                    ? 'bg-green-50 text-green-700'
                    : 'bg-blue-50 text-blue-700'
                }`}
              >
                <div className="font-medium">ESG Status: {esgStatus}</div>
                <div className="text-xs mt-1">Sequence: {selectedSerial}</div>
              </div>
            )}

            <motion.button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-60"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={submitToEsg}
              disabled={loading || !stats.ectd.completed}
            >
              {loading ? (
                <span className="flex items-center justify-center">
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
                  Submitting...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <svg
                    className="w-4 h-4 mr-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                    ></path>
                  </svg>
                  Submit to FDA ESG
                </span>
              )}
            </motion.button>

            {history.filter(h => h.type === 'ectd_ga').length > 0 && (
              <motion.button
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded border"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  const latestEctd = history
                    .filter(h => h.type === 'ectd_ga')
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

                  if (latestEctd && latestEctd.serial) {
                    window.open(
                      `/api/ind/${project.project_id}/ectd/${latestEctd.serial}`,
                      '_blank'
                    );
                  }
                }}
              >
                <span className="flex items-center justify-center">
                  <svg
                    className="w-4 h-4 mr-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    ></path>
                  </svg>
                  Download Latest eCTD
                </span>
              </motion.button>
            )}
          </div>

          <div className="mt-4 text-xs text-gray-500">
            <p>To complete FDA submission:</p>
            <ol className="list-decimal ml-4 mt-1 space-y-1">
              <li className={stats.forms.completed ? 'text-green-600' : ''}>
                Complete Module 1 forms
              </li>
              <li className={stats.module2.completed ? 'text-green-600' : ''}>
                Generate Module 2 narratives
              </li>
              <li className={stats.module3.completed ? 'text-green-600' : ''}>
                Upload Module 3 documentation
              </li>
              <li className={stats.ectd.completed ? 'text-green-600' : ''}>Build eCTD package</li>
              <li className={stats.esg.completed ? 'text-green-600' : ''}>Submit to FDA ESG</li>
              <li className={stats.ack.completed ? 'text-green-600' : ''}>
                Receive FDA acknowledgment
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowDashboard;
