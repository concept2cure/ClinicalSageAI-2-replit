import React, { useState, useEffect } from 'react';

/**
 * PredictiveVaultBrowser component
 * Fetches and displays documents from the live Vault DMS API.
 * REVISION: 2.0 - Refactored to use live API data.
 */
export default function PredictiveVaultBrowser() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/vault');

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        setDocuments(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch documents:', err);
        setError('Failed to load documents. Please ensure the server is running.');
        setDocuments([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, []);

  const renderContent = () => {
    if (loading) {
      return <p className="text-center text-gray-500">Loading documents...</p>;
    }

    if (error) {
      return <p className="text-center text-red-500">{error}</p>;
    }

    if (documents.length === 0) {
      return <p className="text-center text-gray-500">No documents found in the vault.</p>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200">
          <thead>
            <tr className="bg-gray-100 text-left text-sm font-semibold text-gray-600">
              <th className="py-3 px-4">Title</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {documents.map(doc => (
              <tr key={doc.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-medium text-gray-800">{doc.title}</td>
                <td className="py-3 px-4 text-gray-600">{doc.type}</td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      doc.status === 'Active'
                        ? 'bg-green-100 text-green-800'
                        : doc.status === 'Completed'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {doc.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-600">
                  {new Date(doc.updated_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Document Vault</h1>
      <p className="text-md text-gray-600 mb-6">Live Document Repository</p>
      <div className="bg-white p-4 rounded-lg shadow-md">{renderContent()}</div>
    </div>
  );
}
