// /client/src/pages/VaultPage.jsx

import { useState, useEffect } from 'react';
import VaultUploader from '../components/vault/VaultUploader';
import VaultDocumentViewer from '../components/vault/VaultDocumentViewer';
import UnifiedDocumentUpload from '../components/unified/UnifiedDocumentUpload';

export default function VaultPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [documentStats, setDocumentStats] = useState({
    total: 0,
    byModule: {},
    byType: {},
    byProject: {},
  });
  const [loading, setLoading] = useState(true);

  // Load document statistics on mount and when documents are updated
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/vault/list');
        const data = await res.json();

        if (data.success) {
          // Calculate statistics
          const stats = {
            total: data.metadata.totalCount || 0,
            byModule: {},
            byType: {},
            byProject: {},
          };

          // Count documents by module
          data.documents.forEach(doc => {
            // By module
            const module = doc.moduleLinked || 'Unknown';
            stats.byModule[module] = (stats.byModule[module] || 0) + 1;

            // By document type
            const type = doc.documentType || 'Unspecified';
            stats.byType[type] = (stats.byType[type] || 0) + 1;

            // By project
            const project = doc.projectId || 'Unassigned';
            stats.byProject[project] = (stats.byProject[project] || 0) + 1;
          });

          setDocumentStats(stats);
        }
      } catch (error) {
        console.error('Error fetching vault statistics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [refreshTrigger]);

  // Function to trigger document list refresh after upload
  const handleUploadComplete = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <header className="text-center mb-8">
        <h1 className="text-3xl font-bold">TrialSage Vault™</h1>
        <p className="text-gray-600 mt-2">Secure Document Repository for Regulatory Submissions</p>
      </header>

      {/* Dashboard Stats */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-8">
        <h2 className="text-lg font-semibold mb-3">Vault Statistics</h2>

        {loading ? (
          <p className="text-sm text-gray-500">Loading statistics...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-indigo-50 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-500">Total Documents</p>
              <p className="text-2xl font-bold text-indigo-600">{documentStats.total}</p>
            </div>

            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Top Modules</p>
              <ul className="text-sm mt-1">
                {Object.entries(documentStats.byModule)
                  .sort(([, countA], [, countB]) => countB - countA)
                  .slice(0, 3)
                  .map(([module, count]) => (
                    <li key={module} className="flex justify-between">
                      <span>{module}</span>
                      <span className="font-medium">{count}</span>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="bg-amber-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Top Document Types</p>
              <ul className="text-sm mt-1">
                {Object.entries(documentStats.byType)
                  .sort(([, countA], [, countB]) => countB - countA)
                  .slice(0, 3)
                  .map(([type, count]) => (
                    <li key={type} className="flex justify-between">
                      <span>{type}</span>
                      <span className="font-medium">{count}</span>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Top Projects</p>
              <ul className="text-sm mt-1">
                {Object.entries(documentStats.byProject)
                  .sort(([, countA], [, countB]) => countB - countA)
                  .slice(0, 3)
                  .map(([project, count]) => (
                    <li key={project} className="flex justify-between">
                      <span>{project}</span>
                      <span className="font-medium">{count}</span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <VaultUploader onUploadComplete={handleUploadComplete} />

          <div className="mt-6 bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-3">Vault Features</h2>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>Automatic document versioning</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>Intelligent document organization by CTD module</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>Document filtering by project, uploader, and type</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>Advanced document search capabilities</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>Secure document storage for regulatory submissions</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-2">
          <VaultDocumentViewer key={refreshTrigger} />
        </div>
      </div>
    </div>
  );
}
