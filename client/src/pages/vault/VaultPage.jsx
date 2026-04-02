// /client/src/pages/VaultPage.jsx

import { useState, useEffect } from 'react';
import UnifiedDocumentUpload from '../../components/unified/UnifiedDocumentUpload';
import DocumentDataCenter from '../../components/DocumentDataCenter';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Upload,
  Search,
  Download,
  HardDrive,
  FolderOpen,
  CalendarClock,
  LayoutGrid,
  ListFilter,
} from 'lucide-react';

export default function VaultPage() {
  const [activeTab, setActiveTab] = useState('vault');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [documentStats, setDocumentStats] = useState({
    total: 0,
    byModule: {},
    byType: {},
    byProject: {},
  });
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const { toast } = useToast();

  // Load document statistics on mount and when documents are updated
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setFetchError(null);
        const res = await apiRequest('GET', '/api/vault/list');
        const data = await res.json();

        if (data.success) {
          const fetchedDocuments = Array.isArray(data.documents) ? data.documents : [];
          setDocuments(fetchedDocuments);
          // Calculate statistics
          const stats = {
            total: data.metadata?.totalCount || fetchedDocuments.length || 0,
            byModule: {},
            byType: {},
            byProject: {},
          };

          // Count documents by module
          fetchedDocuments.forEach(doc => {
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
        setFetchError(error.message || 'Failed to load vault documents');
        toast({ title: 'Vault load failed', description: 'Could not fetch document list. Please try again.', variant: 'destructive' });
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

  const moduleOptions = ['all', ...Object.keys(documentStats.byModule)];
  const typeOptions = ['all', ...Object.keys(documentStats.byType)];

  const filteredDocuments = documents.filter(doc => {
    const module = doc.moduleLinked || 'Unknown';
    const type = doc.documentType || 'Unspecified';
    const text = `${doc.title || doc.name || ''} ${doc.fileName || ''} ${doc.uploadedBy || ''}`.toLowerCase();
    const matchesText = !query || text.includes(query.toLowerCase());
    const matchesModule = selectedModule === 'all' || module === selectedModule;
    const matchesType = selectedType === 'all' || type === selectedType;
    return matchesText && matchesModule && matchesType;
  });

  return (
    <div className="container mx-auto py-8 space-y-8">
      <header className="text-center mb-8">
        <h1 className="text-3xl font-bold">Document Vault</h1>
        <p className="text-gray-600 mt-2">
          Secure Document Repository & Device Data Center for Regulatory Submissions
        </p>
      </header>

      {/* Tabs for Vault and Device Data Center */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
          <TabsTrigger value="vault" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Document Vault
          </TabsTrigger>
          <TabsTrigger
            value="device-data"
            className="flex items-center gap-2"
            data-testid="tab-device-data-center"
          >
            <HardDrive className="h-4 w-4" />
            Device Data Center
          </TabsTrigger>
        </TabsList>

        {/* Document Vault Tab */}
        <TabsContent value="vault" className="space-y-6">
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
              {/* Upload Component */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Upload Documents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <UnifiedDocumentUpload
                    moduleCategory="vault"
                    onUploadComplete={handleUploadComplete}
                  />
                </CardContent>
              </Card>

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
              {/* Document Viewer Component */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Document Library
                  </CardTitle>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-4">
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input
                        className="pl-9"
                        placeholder="Search by title, file name, or uploader"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                      />
                    </div>
                    <select
                      value={selectedModule}
                      onChange={e => setSelectedModule(e.target.value)}
                      className="rounded-md border px-3 py-2 text-sm bg-white"
                    >
                      {moduleOptions.map(option => (
                        <option key={option} value={option}>
                          {option === 'all' ? 'All Modules' : option}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedType}
                      onChange={e => setSelectedType(e.target.value)}
                      className="rounded-md border px-3 py-2 text-sm bg-white"
                    >
                      {typeOptions.map(option => (
                        <option key={option} value={option}>
                          {option === 'all' ? 'All Types' : option}
                        </option>
                      ))}
                    </select>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-gray-600">Loading documents...</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <LayoutGrid className="h-4 w-4" />
                          <span>{filteredDocuments.length} documents shown</span>
                          <Badge variant="outline" className="ml-1">
                            {documentStats.total} total
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setRefreshTrigger(prev => prev + 1)}>
                            <Download className="h-4 w-4 mr-2" />
                            Refresh
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setQuery('');
                              setSelectedModule('all');
                              setSelectedType('all');
                            }}
                          >
                            <ListFilter className="h-4 w-4 mr-2" />
                            Reset Filters
                          </Button>
                        </div>
                      </div>

                      {filteredDocuments.length === 0 ? (
                        <div className="bg-gray-50 rounded-lg p-6 text-center">
                          <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                          <p className="text-gray-600">No matching documents found.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {filteredDocuments.slice(0, 12).map(doc => (
                            <div
                              key={doc.id || doc.fileName}
                              className="border rounded-lg p-4 hover:shadow-sm transition-shadow"
                            >
                              <div className="flex justify-between items-start gap-4">
                                <div>
                                  <h3 className="font-semibold text-sm">{doc.title || doc.name || doc.fileName}</h3>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {doc.fileName || 'Unknown filename'}
                                  </p>
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    <Badge variant="secondary">{doc.moduleLinked || 'Unknown'}</Badge>
                                    <Badge variant="outline">{doc.documentType || 'Unspecified'}</Badge>
                                  </div>
                                </div>
                                <div className="text-right text-xs text-gray-500">
                                  <div className="flex items-center gap-1 justify-end">
                                    <CalendarClock className="h-3.5 w-3.5" />
                                    {doc.uploadDate
                                      ? new Date(doc.uploadDate).toLocaleDateString()
                                      : 'Date unavailable'}
                                  </div>
                                  <p className="mt-2">{doc.uploadedBy || 'System Upload'}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Device Data Center Tab */}
        <TabsContent value="device-data" className="mt-6">
          <DocumentDataCenter />
        </TabsContent>
      </Tabs>
    </div>
  );
}
