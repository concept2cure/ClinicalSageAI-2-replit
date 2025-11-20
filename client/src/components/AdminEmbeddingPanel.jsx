// AdminEmbeddingPanel.jsx - Component for managing document embeddings
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle, RefreshCw, FileText, Database } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DocumentEmbeddingInfo from "@/components/DocumentEmbeddingInfo";

const AdminEmbeddingPanel = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [expandedDocId, setExpandedDocId] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query to get embedding status
  const { 
    data: statusData, 
    isLoading: isStatusLoading, 
    isError: isStatusError,
    refetch: refetchStatus 
  } = useQuery({
    queryKey: ['/api/embeddings/status'],
    refetchInterval: pollingEnabled ? 5000 : false, // Poll every 5 seconds when enabled
    onError: (err) => {
      console.error('Failed to fetch embedding status:', err);
      // toast call replaced
  // Original: toast({
        title: "Error fetching status",
        description: "Could not retrieve document embedding status.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error fetching status",
        description: "Could not retrieve document embedding status.",
        variant: "destructive",
      });
    }
  });
  
  // Enable polling when processing is detected
  useEffect(() => {
    if (statusData?.isProcessing) {
      setPollingEnabled(true);
    } else if (pollingEnabled) {
      // Continue polling for a short time after processing completes
      const timer = setTimeout(() => {
        setPollingEnabled(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [statusData?.isProcessing, pollingEnabled]);

  // Mutation to process changed documents
  const processDocumentsMutation = useMutation({
    mutationFn: async () => {
      setIsProcessing(true);
      const response = await fetch('/api/embeddings/process-changed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to process documents');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // toast call replaced
  // Original: toast({
        title: "Processing started",
        description: `Document embedding process has been started in the background for ${data.documentsToProcess || 'pending'} documents.`,
        variant: "default",
      })
  console.log('Toast would show:', {
        title: "Processing started",
        description: `Document embedding process has been started in the background for ${data.documentsToProcess || 'pending'} documents.`,
        variant: "default",
      });
      
      // Enable polling for automatic status updates
      setPollingEnabled(true);
      
      // Invalidate the status query to reflect the change
      queryClient.invalidateQueries({ queryKey: ['/api/embeddings/status'] });
    },
    onError: (err) => {
      console.error('Failed to process documents:', err);
      // toast call replaced
  // Original: toast({
        title: "Processing failed",
        description: err.message || "Failed to start document embedding process.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Processing failed",
        description: err.message || "Failed to start document embedding process.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsProcessing(false);
    }
  });

  const handleProcessDocuments = () => {
    processDocumentsMutation.mutate();
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Document Embeddings Management</CardTitle>
        <CardDescription>
          Manage vector embeddings for AI-powered document retrieval
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isStatusLoading ? (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : statusData ? (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-4 grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Total Documents</div>
                  <div className="text-2xl font-semibold mt-1">{statusData.totalDocuments || 0}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Embedded Documents</div>
                  <div className="text-2xl font-semibold mt-1">{statusData.embeddedDocuments || 0}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Document Chunks</div>
                  <div className="text-2xl font-semibold mt-1">{statusData.totalChunks || 0}</div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-medium">Processing Status</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {statusData.isProcessing ? (
                        <span className="flex items-center">
                          <Loader2 className="h-4 w-4 animate-spin mr-2 text-amber-500" />
                          Processing documents
                        </span>
                      ) : (
                        <span className="flex items-center">
                          <CheckCircle className="h-4 w-4 mr-2 text-emerald-500" />
                          Ready
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant={statusData.pendingChanges > 0 ? "destructive" : "outline"}>
                    {statusData.pendingChanges || 0} pending changes
                  </Badge>
                </div>
                
                {statusData.isProcessing && statusData.processingProgress && (
                  <div className="mt-3">
                    <div className="flex justify-between mb-1 text-xs text-slate-500">
                      <span>Processing documents...</span>
                      <span>{Math.round(statusData.processingProgress * 100)}%</span>
                    </div>
                    <Progress 
                      value={statusData.processingProgress * 100} 
                      className="h-2 bg-slate-200 dark:bg-slate-700" 
                    />
                  </div>
                )}
                
                <div className="flex justify-between mt-3 text-xs text-slate-500">
                  <span>Embedding coverage</span>
                  <span>{statusData.embeddedDocuments} / {statusData.totalDocuments} documents</span>
                </div>
                <Progress 
                  value={(statusData.embeddedDocuments / (statusData.totalDocuments || 1)) * 100} 
                  className="h-2 mt-1 bg-slate-200 dark:bg-slate-700" 
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                {statusData.lastProcessed && (
                  <div className="flex items-center">
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Last processed: {new Date(statusData.lastProcessed).toLocaleString()}
                  </div>
                )}
                
                {statusData.processingStartedAt && statusData.isProcessing && (
                  <div className="flex items-center">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    Started: {new Date(statusData.processingStartedAt).toLocaleString()}
                  </div>
                )}
              </div>

              {statusData.pendingChanges > 0 && (
                <Alert variant="warning" className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertTitle className="text-amber-800 dark:text-amber-300">Changes detected</AlertTitle>
                  <AlertDescription className="text-amber-700 dark:text-amber-400">
                    {statusData.pendingChanges} documents have been modified and need to be re-embedded for optimal AI retrieval.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
            
            <TabsContent value="documents" className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg mb-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-base font-medium flex items-center">
                    <Database className="h-4 w-4 mr-2 text-slate-500" />
                    Document Library
                  </h3>
                  <Badge className="ml-2" variant="outline">
                    {statusData.totalDocuments || 0} documents
                  </Badge>
                </div>
                
                <div className="flex justify-between">
                  <div className="text-sm text-slate-500">
                    Manage document embeddings for AI-powered search and retrieval
                  </div>
                </div>
              </div>
              
              {statusData.recentDocuments && statusData.recentDocuments.length > 0 ? (
                <div className="space-y-3">
                  {statusData.recentDocuments.map((doc, idx) => (
                    <DocumentEmbeddingInfo 
                      key={doc.id || idx}
                      document={doc}
                      isExpanded={expandedDocId === (doc.id || idx)}
                      onToggleExpand={() => setExpandedDocId(expandedDocId === (doc.id || idx) ? null : (doc.id || idx))}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <h4 className="text-lg font-medium mb-1">No Documents Available</h4>
                  <p className="text-sm max-w-md mx-auto">
                    There are no documents available to display. Documents will appear here once they are uploaded to the system.
                  </p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="settings" className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                <h3 className="text-base font-medium mb-3">Embedding Settings</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium text-sm">Auto-embed new documents</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Automatically create embeddings for newly uploaded documents
                      </div>
                    </div>
                    <div className="flex items-center">
                      <Badge variant="success">Enabled</Badge>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium text-sm">Embedding model</div>
                      <div className="text-xs text-slate-500 mt-1">
                        OpenAI text-embedding-ada-002
                      </div>
                    </div>
                    <div className="flex items-center">
                      <Badge variant="outline">Default</Badge>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium text-sm">Chunk size</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Maximum token length per document chunk
                      </div>
                    </div>
                    <div className="flex items-center">
                      <Badge variant="outline">1000 tokens</Badge>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium text-sm">Chunk overlap</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Token overlap between adjacent chunks
                      </div>
                    </div>
                    <div className="flex items-center">
                      <Badge variant="outline">100 tokens</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Could not retrieve embedding status information.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={refetchStatus} disabled={isProcessing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isStatusLoading ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
        <Button 
          onClick={handleProcessDocuments} 
          disabled={isProcessing || (statusData && statusData.isProcessing) || (statusData && statusData.pendingChanges === 0)}
        >
          {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Process Changed Documents
        </Button>
      </CardFooter>
    </Card>
  );
};

export default AdminEmbeddingPanel;