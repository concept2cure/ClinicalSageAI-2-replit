import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getJson, postJson } from '../services/api';

/**
 * ESG Submission Component
 *
 * Handles FDA Electronic Submissions Gateway (ESG) submission process
 * with status tracking and acknowledgment monitoring.
 */
const EsgSubmit = ({ project, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [selectedSerial, setSelectedSerial] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  // Load ESG submission history
  useEffect(() => {
    if (!project?.project_id) return;

    const fetchHistory = async () => {
      try {
        const data = await getJson(`/api/ind/${project.project_id}/history`);
        if (Array.isArray(data)) {
          // Filter for ESG submissions only
          const esgHistory = data
            .filter(entry => entry.type === 'esg_submission')
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

          setHistory(esgHistory);

          // If we have a submission, set its status
          if (esgHistory.length > 0) {
            const latest = esgHistory[0];
            setSelectedSerial(latest.serial);
            setSubmissionStatus(latest.status);
          }
        }
      } catch (err) {
        console.error('Failed to fetch ESG history:', err);
      }
    };

    fetchHistory();
  }, [project]);

  // Poll for status updates when we have an active submission
  useEffect(() => {
    if (!selectedSerial || !project?.project_id) return;

    // Don't poll if we already have acknowledgment
    if (submissionStatus?.startsWith('ACK')) return;

    const pollInterval = setInterval(async () => {
      try {
        const data = await getJson(`/api/ind/${project.project_id}/esg/status/${selectedSerial}`);
        if (data?.status && data.status !== submissionStatus) {
          setSubmissionStatus(data.status);

          // If we received acknowledgment, refresh history
          if (data.status.startsWith('ACK') && onComplete) {
            onComplete();
          }
        }
      } catch (err) {
        // Silently ignore errors during polling
        console.log('Waiting for ESG status update...');
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(pollInterval);
  }, [selectedSerial, submissionStatus, project, onComplete]);

  // Submit to FDA ESG
  const handleSubmit = async () => {
    if (!project?.project_id) return;

    setLoading(true);
    setError(null);

    try {
      const projectId = project.project_id || project.id;
      const response = await postJson(`/api/510k/${projectId}/esg/submit`, {
        headers: {
          'x-user-id': localStorage.getItem('userId') || 'system',
          'x-organization-id': localStorage.getItem('organizationId') || 'default'
        }
      });
      
      setSelectedSerial(response.transactionId);
      setSubmissionStatus(response.status);

      // Store the acknowledgment number if available
      if (response.acknowledgmentNumber) {
        setHistory(prev => [{
          type: 'esg_submission',
          serial: response.transactionId,
          acknowledgmentNumber: response.acknowledgmentNumber,
          status: response.status,
          timestamp: response.timestamp
        }, ...prev]);
      }

      // Refresh the parent component's data
      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      console.error('ESG submission failed:', err);
      setError(err.userMessage || 'Failed to submit to FDA ESG. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Format date for display
  const formatDate = dateString => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Determine status text and color
  const getStatusDisplay = status => {
    if (!status) return { text: 'Not Submitted', color: 'gray' };

    switch (status) {
      case 'SUBMITTED':
        return { text: 'Submitted - Awaiting Acknowledgment', color: 'blue' };
      case 'PROCESSING':
        return { text: 'Processing at FDA Gateway', color: 'blue' };
      case 'TIMEOUT':
        return { text: 'Timeout Waiting for Acknowledgment', color: 'orange' };
      case 'ACK_RECEIVED':
        return { text: 'FDA Acknowledgment Received', color: 'green' };
      default:
        return { text: status, color: 'blue' };
    }
  };

  const statusDisplay = getStatusDisplay(submissionStatus);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow border">
        <h2 className="text-xl font-semibold mb-4">FDA ESG Submission</h2>

        <p className="text-sm text-gray-600 mb-6">
          Submit your eCTD package to the FDA Electronic Submissions Gateway (ESG). Once submitted,
          the system will automatically monitor for acknowledgments.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {submissionStatus && (
          <div
            className={`bg-${statusDisplay.color}-50 border border-${statusDisplay.color}-200 text-${statusDisplay.color}-700 px-4 py-3 rounded mb-4`}
          >
            <div className="font-medium">Status: {statusDisplay.text}</div>
            {selectedSerial && <div className="text-sm mt-1">Sequence: {selectedSerial}</div>}
          </div>
        )}

        <div className="flex justify-between items-center">
          <motion.button
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-60"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSubmit}
            disabled={
              loading || submissionStatus === 'PROCESSING' || submissionStatus?.startsWith('ACK')
            }
          >
            {loading ? (
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
                Submitting...
              </span>
            ) : (
              'Submit to FDA ESG'
            )}
          </motion.button>

          {submissionStatus?.startsWith('ACK') && (
            <span className="text-green-600 font-medium flex items-center">
              <svg
                className="w-5 h-5 mr-1"
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
              Submission Acknowledged
            </span>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold mb-4">ESG Submission History</h3>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Sequence
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Date
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {history.map((entry, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {entry.serial}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(entry.timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium
                        ${
                          entry.status?.startsWith('ACK')
                            ? 'bg-green-100 text-green-800'
                            : entry.status === 'TIMEOUT'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow border">
        <h3 className="text-lg font-semibold mb-2">About FDA ESG</h3>
        <p className="text-sm text-gray-600 mb-4">
          The FDA Electronic Submissions Gateway (ESG) is the central transmission point for sending
          information electronically to the FDA. It enhances the ability to receive, process,
          review, and archive electronic submissions.
        </p>

        <h4 className="font-medium text-gray-800 mb-1">Acknowledgment Process</h4>
        <ol className="list-decimal ml-6 text-sm text-gray-600 mb-4 space-y-1">
          <li>ACK1: Receipt by the FDA ESG (usually within minutes)</li>
          <li>ACK2: Receipt by the FDA Center (usually within 24 hours)</li>
          <li>ACK3: Technical validation results (usually within 48 hours)</li>
        </ol>

        <p className="text-xs text-gray-500">
          Note: This system currently tracks the receipt of acknowledgments but does not
          differentiate between ACK1, ACK2, and ACK3. Future upgrades will provide more detailed
          tracking.
        </p>
      </div>
    </div>
  );
};

export default EsgSubmit;
