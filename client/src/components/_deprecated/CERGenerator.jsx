// CERGenerator.jsx
import React, { useState } from 'react';

export default function CERGenerator() {
  const [ndcCode, setNdcCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');

  const validateNdcCode = code => {
    // Basic NDC code validation (can be more specific based on requirements)
    const ndcPattern = /^\d{4,5}-\d{3,4}-\d{1,2}$|^\d{5}-\d{4}-\d{2}$|^\d{1,5}$/;
    return ndcPattern.test(code);
  };

  const generateCER = async () => {
    // Validate input
    if (!ndcCode.trim()) {
      setError('Please enter an NDC code');
      return;
    }

    if (!validateNdcCode(ndcCode)) {
      setError(
        'Please enter a valid NDC code format (e.g., 12345-678-90, 12345-6789-01, or numeric)'
      );
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setPdfUrl('');

    try {
      // Call the API to generate CER
      const response = await fetch('/api/cer/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ndc_code: ndcCode }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Error generating CER');
      }

      setResult(data);

      // If PDF URL is returned, set it
      if (data.pdf_url) {
        setPdfUrl(data.pdf_url);
      }
    } catch (err) {
      console.error('Error generating CER:', err);
      setError(err.message || 'An error occurred while generating the CER');
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = () => {
    // Either use the returned PDF URL or generate a new one
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    } else if (result) {
      window.open(`/api/cer/export-pdf?ndc_code=${ndcCode}`, '_blank');
    }
  };

  // Example NDC codes that can be used
  const exampleNdcCodes = [
    '0002-3227-30',
    '0074-3799-13',
    '0078-0357-15',
    '0173-0519-00',
    '50580-506-01',
  ];

  const handleExampleClick = code => {
    setNdcCode(code);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <label htmlFor="ndcCode" className="block text-sm font-medium text-gray-700 mb-1">
          NDC Code
        </label>
        <div className="flex space-x-2">
          <input
            id="ndcCode"
            type="text"
            value={ndcCode}
            onChange={e => setNdcCode(e.target.value)}
            placeholder="Enter NDC code (e.g., 12345-678-90)"
            className="w-full p-2 border border-gray-300 rounded-md"
            onKeyPress={e => e.key === 'Enter' && generateCER()}
          />
          <button
            onClick={generateCER}
            disabled={loading}
            className={`px-4 py-2 text-white rounded-md ${
              loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Generating...' : 'Generate CER'}
          </button>
        </div>
      </div>

      {/* Example NDC codes */}
      <div className="mb-4">
        <p className="text-sm font-medium text-gray-700 mb-2">Example NDC codes:</p>
        <div className="flex flex-wrap gap-2">
          {exampleNdcCodes.map((code, index) => (
            <button
              key={index}
              onClick={() => handleExampleClick(code)}
              className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-full transition-colors"
            >
              {code}
            </button>
          ))}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-md">
          <p>{error}</p>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Results section */}
      {result && !loading && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Clinical Evaluation Report</h2>
            <button
              onClick={downloadPdf}
              className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Download PDF
            </button>
          </div>

          <div className="bg-gray-50 p-4 rounded-md mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold text-gray-700">Product Information</h3>
                <p className="text-sm text-gray-600">NDC Code: {result.ndc_code}</p>
                <p className="text-sm text-gray-600">
                  Product Name: {result.product_name || 'N/A'}
                </p>
                <p className="text-sm text-gray-600">
                  Manufacturer: {result.manufacturer || 'N/A'}
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-700">Report Summary</h3>
                <p className="text-sm text-gray-600">Total Reports: {result.total_reports || 0}</p>
                <p className="text-sm text-gray-600">
                  Serious Events: {result.serious_events || 0}
                </p>
                <p className="text-sm text-gray-600">
                  Report Generated: {new Date().toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Narrative section */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-700 mb-2">Clinical Evaluation Narrative</h3>
            <div className="bg-white border border-gray-200 rounded-md p-4 max-h-96 overflow-y-auto">
              {result.cer_narrative ? (
                <div
                  dangerouslySetInnerHTML={{ __html: result.cer_narrative.replace(/\n/g, '<br/>') }}
                />
              ) : (
                <p className="text-gray-500 italic">No narrative available.</p>
              )}
            </div>
          </div>

          {/* Top Adverse Events */}
          {result.top_events && result.top_events.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-700 mb-2">Top Adverse Events</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Event
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Count
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Percentage
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {result.top_events.map((event, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {event.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {event.count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {event.percentage ? `${(event.percentage * 100).toFixed(1)}%` : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Bottom note about enhanced analysis */}
          <div className="bg-blue-50 p-4 rounded-md text-blue-800 text-sm">
            <p className="font-semibold mb-1">Need more detailed analysis?</p>
            <p>
              Visit the{' '}
              <a href="/enhanced-cer-dashboard" className="text-blue-600 hover:underline">
                Enhanced CER Dashboard
              </a>{' '}
              to compare multiple products, view interactive visualizations, and get AI-powered
              insights.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
