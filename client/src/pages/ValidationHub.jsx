import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, FileCheck, Flag, Settings, Search, Database, BarChart2, Download, FileText, Loader2, Filter, PlusCircle, FileX } from 'lucide-react'
import JPValidationPanel from '@/components/validation/JPValidationPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

/**
 * ValidationHub Page Component
 *
 * This page provides a centralized hub for validation activities across
 * different regulatory regions (FDA, EMA, PMDA).
 */
const ValidationHub = () => {
  const [activeRegion, setActiveRegion] = useState('PMDA');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { toast } = useToast();

  // Fetch submission documents
  const {
    data: documents,
    isLoading: isLoadingDocuments,
    error: documentsError,
    refetch: refetchDocuments,
  } = useQuery({
    queryKey: ['/api/documents'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/documents');
        return await response.json();
      } catch (error) {
        console.error('Error fetching documents:', error);
        // Return demo documents for UI demonstration
        return [
          {
            id: 1,
            title: 'Clinical Study Protocol',
            module: 'm4.2.1.1',
            status: 'approved',
            path: '/documents/protocol.pdf',
            created_at: '2025-03-15T10:30:00Z',
          },
          {
            id: 2,
            title: 'Investigator Brochure',
            module: 'm4.3',
            status: 'pending',
            path: '/documents/brochure.pdf',
            created_at: '2025-03-18T14:45:00Z',
          },
          {
            id: 3,
            title: 'Statistical Analysis Plan',
            module: 'm2.5',
            status: 'qc_failed',
            path: '/documents/stats_plan.pdf',
            created_at: '2025-03-20T09:15:00Z',
          },
          {
            id: 4,
            title: 'Japanese Application Form',
            module: 'm1.2',
            status: 'pending',
            path: '/documents/jp_application.pdf',
            created_at: '2025-03-21T16:30:00Z',
            jp_specific: true,
            jp_ctd_compliant: true,
          },
          {
            id: 5,
            title: 'Japan-specific Annex Document',
            module: 'jp-annex/ja-1',
            status: 'pending',
            path: '/documents/jp_annex_1.pdf',
            created_at: '2025-03-22T11:20:00Z',
            jp_specific: true,
            jp_ctd_compliant: true,
          },
        ];
      }
    },
  });

  // Fetch validation history
  const { data: validationHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['/api/validation/history'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/validation/history');
        return await response.json();
      } catch (error) {
        console.error('Error fetching validation history:', error);
        // Return demo history for UI demonstration
        return [
          {
            id: 'pmda_validation_20250420123045',
            region: 'PMDA',
            status: 'passed',
            document_count: 5,
            timestamp: '2025-04-20T12:30:45Z',
            user: 'john.doe',
          },
          {
            id: 'fda_validation_20250419103015',
            region: 'FDA',
            status: 'qc_failed',
            document_count: 8,
            timestamp: '2025-04-19T10:30:15Z',
            user: 'jane.smith',
          },
          {
            id: 'ema_validation_20250417143022',
            region: 'EMA',
            status: 'passed',
            document_count: 6,
            timestamp: '2025-04-17T14:30:22Z',
            user: 'john.doe',
          },
        ];
      }
    },
  });

  // Handle validation complete
  const handleValidationComplete = data => {
    console.log('Validation complete:', data);
    refetchDocuments();

    toast({
      title: 'Validation Complete',
      description: `${activeRegion} validation has been completed.`,
    });
  };

  // Filter documents based on search query and status filter
  const filteredDocuments = documents?.filter(doc => {
    const matchesSearch =
      searchQuery === '' ||
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.module.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Handle document upload - in a real implementation, this would open a file picker
  const handleDocumentUpload = () => {
    toast({
      title: 'Upload Feature',
      description: 'Document upload feature would be implemented here.',
    });
  };

  // Generate validation report
  const handleDownloadReport = () => {
    toast({
      title: 'Download Report',
      description: `${activeRegion} validation report would be downloaded here.`,
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Validation Hub</h1>
          <p className="text-gray-500 mt-1">Centralized validation for regulatory submissions</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refetchDocuments()}>
            <Search className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleDocumentUpload}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
          <Button onClick={handleDownloadReport}>
            <Download className="h-4 w-4 mr-2" />
            Download Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
              <CardDescription>Filter documents and validation results</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="qc_failed">QC Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Region</label>
                <div className="flex flex-col space-y-2">
                  <Button
                    variant={activeRegion === 'FDA' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setActiveRegion('FDA')}
                  >
                    <Flag className="h-4 w-4 mr-2 text-blue-600" />
                    FDA (United States)
                  </Button>
                  <Button
                    variant={activeRegion === 'EMA' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setActiveRegion('EMA')}
                  >
                    <Flag className="h-4 w-4 mr-2 text-yellow-600" />
                    EMA (European Union)
                  </Button>
                  <Button
                    variant={activeRegion === 'PMDA' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setActiveRegion('PMDA')}
                  >
                    <Flag className="h-4 w-4 mr-2 text-red-600" />
                    PMDA (Japan)
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Document Stats</label>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 bg-gray-50 rounded border">
                    <div className="text-xl font-bold">{documents?.length || 0}</div>
                    <div className="text-xs text-gray-500">Total</div>
                  </div>
                  <div className="p-2 bg-green-50 rounded border border-green-100">
                    <div className="text-xl font-bold text-green-700">
                      {documents?.filter(d => d.status === 'approved').length || 0}
                    </div>
                    <div className="text-xs text-green-600">Approved</div>
                  </div>
                  <div className="p-2 bg-yellow-50 rounded border border-yellow-100">
                    <div className="text-xl font-bold text-yellow-700">
                      {documents?.filter(d => d.status === 'pending').length || 0}
                    </div>
                    <div className="text-xs text-yellow-600">Pending</div>
                  </div>
                  <div className="p-2 bg-red-50 rounded border border-red-100">
                    <div className="text-xl font-bold text-red-700">
                      {documents?.filter(d => d.status === 'qc_failed').length || 0}
                    </div>
                    <div className="text-xs text-red-600">Failed</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Validation History</CardTitle>
              <CardDescription>Recent validation runs</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingHistory ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : validationHistory?.length > 0 ? (
                <div className="space-y-3">
                  {validationHistory.map(history => (
                    <div key={history.id} className="flex items-start border-b pb-3">
                      <div className="mr-3">
                        {history.status === 'passed' ? (
                          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                            <FileCheck className="h-4 w-4 text-green-600" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center">
                          <p className="text-sm font-medium">{history.region} Validation</p>
                          <Badge
                            variant="outline"
                            className={`ml-2 ${
                              history.status === 'passed'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}
                          >
                            {history.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(history.timestamp).toLocaleString()} • {history.document_count}{' '}
                          documents
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <p>No validation history available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-3">
          <Tabs defaultValue="validation" className="space-y-6">
            <TabsList>
              <TabsTrigger value="validation">
                <FileCheck className="h-4 w-4 mr-2" />
                Validation
              </TabsTrigger>
              <TabsTrigger value="documents">
                <FileText className="h-4 w-4 mr-2" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="analytics">
                <BarChart2 className="h-4 w-4 mr-2" />
                Analytics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="validation" className="space-y-6">
              {activeRegion === 'PMDA' && (
                <JPValidationPanel
                  documents={filteredDocuments}
                  onValidationComplete={handleValidationComplete}
                />
              )}

              {activeRegion === 'FDA' && (
                <div className="p-8 text-center">
                  <FileCheck className="h-12 w-12 mx-auto mb-4 text-blue-600" />
                  <h2 className="text-2xl font-bold mb-2">FDA Validation</h2>
                  <p className="text-gray-500 mb-4">
                    FDA validation panel would be implemented here.
                  </p>
                  <Button variant="outline">Configure FDA Validation</Button>
                </div>
              )}

              {activeRegion === 'EMA' && (
                <div className="p-8 text-center">
                  <FileCheck className="h-12 w-12 mx-auto mb-4 text-yellow-600" />
                  <h2 className="text-2xl font-bold mb-2">EMA Validation</h2>
                  <p className="text-gray-500 mb-4">
                    EMA validation panel would be implemented here.
                  </p>
                  <Button variant="outline">Configure EMA Validation</Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="documents">
              {isLoadingDocuments ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : documentsError ? (
                <div className="p-8 text-center">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-600" />
                  <h2 className="text-xl font-bold mb-2">Error Loading Documents</h2>
                  <p className="text-gray-500 mb-4">
                    {documentsError.message || 'Failed to load documents. Please try again.'}
                  </p>
                  <Button onClick={() => refetchDocuments()}>Retry</Button>
                </div>
              ) : (
                <div className="bg-white rounded-lg border overflow-hidden">
                  <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="font-medium">Documents ({filteredDocuments?.length || 0})</h3>
                    <Button variant="outline" size="sm">
                      <Filter className="h-4 w-4 mr-2" />
                      Advanced Filters
                    </Button>
                  </div>

                  <div className="divide-y">
                    {filteredDocuments?.length > 0 ? (
                      filteredDocuments.map(doc => (
                        <div key={doc.id} className="p-4 hover:bg-gray-50">
                          <div className="flex justify-between">
                            <div>
                              <div className="flex items-center">
                                <FileText className="h-4 w-4 mr-2 text-gray-400" />
                                <span className="font-medium">{doc.title}</span>
                              </div>
                              <div className="text-sm text-gray-500 mt-1">
                                Module: {doc.module} • Added:{' '}
                                {new Date(doc.created_at).toLocaleDateString()}
                              </div>
                            </div>
                            <div>
                              <Badge
                                variant="outline"
                                className={`
                                  ${
                                    doc.status === 'approved'
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : doc.status === 'qc_failed'
                                        ? 'bg-red-50 text-red-700 border-red-200'
                                        : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                  }
                                `}
                              >
                                {doc.status === 'approved'
                                  ? 'Approved'
                                  : doc.status === 'qc_failed'
                                    ? 'Failed'
                                    : 'Pending'}
                              </Badge>
                            </div>
                          </div>

                          {doc.module?.startsWith('jp-annex') && (
                            <div className="mt-2 flex">
                              <Badge
                                variant="outline"
                                className="bg-red-50 text-red-700 border-red-200 mr-2"
                              >
                                JP Specific
                              </Badge>
                              {doc.jp_ctd_compliant && (
                                <Badge
                                  variant="outline"
                                  className="bg-green-50 text-green-700 border-green-200"
                                >
                                  CTD Compliant
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-gray-500">
                        <FileX className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p>No documents found matching your criteria</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="analytics">
              <Card>
                <CardHeader>
                  <CardTitle>Validation Analytics</CardTitle>
                  <CardDescription>
                    Performance metrics and insights for regulatory submissions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="p-8 text-center">
                    <BarChart2 className="h-12 w-12 mx-auto mb-4 text-blue-600" />
                    <h2 className="text-xl font-bold mb-2">Analytics Dashboard</h2>
                    <p className="text-gray-500 mb-4">
                      The validation analytics dashboard would be implemented here.
                    </p>
                    <Button variant="outline">Configure Analytics</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default ValidationHub;
