import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Database, FileJson, Loader2, RefreshCw, PlusCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Separator } from "@/components/ui/separator";

interface ExportResult {
  total: number;
  exported: number;
  skipped: number;
  errors: number;
  filesInDir: number;
  totalExportedSinceLastRequest?: number;
  lastExportDate?: string;
}

export default function AdminPanel() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("database");
  
  // Database to JSON export mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/csr/export-to-json');
      return response.json();
    },
    onSuccess: (data) => {
      // toast call replaced
  // Original: toast({
        title: "Export Successful",
        description: `Exported ${data.results.exported} new CSR files. Total available: ${data.results.filesInDir}`,
        variant: "default",
      })
  console.log('Toast would show:', {
        title: "Export Successful",
        description: `Exported ${data.results.exported} new CSR files. Total available: ${data.results.filesInDir}`,
        variant: "default",
      });
    },
    onError: (error: Error) => {
      // toast call replaced
  // Original: toast({
        title: "Export Failed",
        description: error.message || "An error occurred during export",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Export Failed",
        description: error.message || "An error occurred during export",
        variant: "destructive",
      });
    }
  });
  
  // Reset counter mutation
  const resetCounterMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/csr/reset-export-counter');
      return response.json();
    },
    onSuccess: (data) => {
      // toast call replaced
  // Original: toast({
        title: "Counter Reset",
        description: "The CSR export counter has been reset successfully",
        variant: "default",
      })
  console.log('Toast would show:', {
        title: "Counter Reset",
        description: "The CSR export counter has been reset successfully",
        variant: "default",
      });
      // Refresh the export data to show updated counter
      exportMutation.mutate();
    },
    onError: (error: Error) => {
      // toast call replaced
  // Original: toast({
        title: "Reset Failed",
        description: error.message || "An error occurred while resetting the counter",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Reset Failed",
        description: error.message || "An error occurred while resetting the counter",
        variant: "destructive",
      });
    }
  });
  
  // Import additional CSRs mutation
  const importCsrMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/import/additional-csrs');
      return response.json();
    },
    onSuccess: (data) => {
      // toast call replaced
  // Original: toast({
        title: "Import Process Started",
        description: data.message || "The CSR import process has been started in the background. This may take several minutes.",
        variant: "default",
      })
  console.log('Toast would show:', {
        title: "Import Process Started",
        description: data.message || "The CSR import process has been started in the background. This may take several minutes.",
        variant: "default",
      });
    },
    onError: (error: Error) => {
      // toast call replaced
  // Original: toast({
        title: "Import Failed",
        description: error.message || "An error occurred while starting the CSR import process",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Import Failed",
        description: error.message || "An error occurred while starting the CSR import process",
        variant: "destructive",
      });
    }
  });

  const handleExportToJson = () => {
    // toast call replaced
  // Original: toast({
      title: "Starting Export",
      description: "Exporting database CSRs to JSON files. This may take a few minutes...",
    })
  console.log('Toast would show:', {
      title: "Starting Export",
      description: "Exporting database CSRs to JSON files. This may take a few minutes...",
    });
    exportMutation.mutate();
  };
  
  const handleResetCounter = () => {
    resetCounterMutation.mutate();
  };
  
  const handleImportCsrs = () => {
    // toast call replaced
  // Original: toast({
      title: "Starting Import",
      description: "Starting the CSR import process. This will run in the background and may take several minutes...",
    })
  console.log('Toast would show:', {
      title: "Starting Import",
      description: "Starting the CSR import process. This will run in the background and may take several minutes...",
    });
    importCsrMutation.mutate();
  };

  const results = exportMutation.data?.results as ExportResult | undefined;

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Admin Panel</CardTitle>
          <CardDescription>
            Administrative tools for managing TrialSage platform data
          </CardDescription>
        </CardHeader>
        
        <Tabs defaultValue="database" value={activeTab} onValueChange={setActiveTab}>
          <CardContent>
            <TabsList className="mb-4">
              <TabsTrigger value="database">
                <Database className="mr-2 h-4 w-4" />
                Database Management
              </TabsTrigger>
              <TabsTrigger value="audit" onClick={() => window.location.href = '/admin/audit-dashboard'}>
                <FileJson className="mr-2 h-4 w-4" />
                Audit Dashboard
              </TabsTrigger>
              {/* Add more tabs here as needed */}
            </TabsList>
            
            <TabsContent value="database" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FileJson className="mr-2 h-5 w-5" />
                    CSR Database to JSON Export
                  </CardTitle>
                  <CardDescription>
                    Export all CSR records from the database to JSON files so they can be loaded by the search service
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-4">
                    This tool addresses the discrepancy between the number of CSRs in the database (~2,871) 
                    and the number loaded by the search service (~779) by converting all database records to 
                    the required JSON format.
                  </p>
                  
                  {exportMutation.isSuccess && (
                    <Alert className="mb-4 bg-green-50 border-green-200">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <AlertTitle className="text-green-800">Export Complete</AlertTitle>
                      <AlertDescription className="text-green-700">
                        <div className="mt-2">
                          <p><strong>Total CSRs in database:</strong> {results?.total}</p>
                          <p><strong>Newly exported:</strong> {results?.exported}</p>
                          <p><strong>Skipped (already exist):</strong> {results?.skipped}</p>
                          <p><strong>Errors:</strong> {results?.errors}</p>
                          <p className="mt-2"><strong>Total JSON files available:</strong> {results?.filesInDir}</p>
                          {results?.totalExportedSinceLastRequest !== undefined && (
                            <div className="mt-2 p-2 bg-green-100 rounded border border-green-300">
                              <p><strong>Total CSRs exported since last request:</strong> {results.totalExportedSinceLastRequest}</p>
                              {results.lastExportDate && (
                                <p><strong>Last export date:</strong> {new Date(results.lastExportDate).toLocaleString()}</p>
                              )}
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={handleResetCounter}
                                disabled={resetCounterMutation.isPending}
                                className="mt-2"
                              >
                                {resetCounterMutation.isPending ? (
                                  <>
                                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                    Resetting...
                                  </>
                                ) : (
                                  'Reset Counter'
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {exportMutation.isError && (
                    <Alert className="mb-4 bg-red-50 border-red-200">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <AlertTitle className="text-red-800">Export Failed</AlertTitle>
                      <AlertDescription className="text-red-700">
                        {exportMutation.error instanceof Error ? exportMutation.error.message : 'Unknown error occurred'}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
                <CardFooter className="flex justify-between">
                  <div className="text-xs text-muted-foreground">
                    <Badge variant="outline" className="mr-2">
                      Database: 2,871 CSRs
                    </Badge>
                    <Badge variant="outline">
                      Search Service: 779 CSRs
                    </Badge>
                  </div>
                  <Button 
                    onClick={handleExportToJson}
                    disabled={exportMutation.isPending}
                  >
                    {exportMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <FileJson className="mr-2 h-4 w-4" />
                        Export to JSON
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <PlusCircle className="mr-2 h-5 w-5" />
                    Import Additional CSRs
                  </CardTitle>
                  <CardDescription>
                    Import additional clinical study reports to grow the TrialSage database
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-4">
                    This tool initiates a batch import process that will add more clinical study reports to the database.
                    The import runs in the background and typically processes between 50-100 new CSRs per batch.
                  </p>
                  
                  {importCsrMutation.isSuccess && (
                    <Alert className="mb-4 bg-green-50 border-green-200">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <AlertTitle className="text-green-800">Import Process Started</AlertTitle>
                      <AlertDescription className="text-green-700">
                        <div className="mt-2">
                          <p>A new batch of CSRs is now being imported in the background. This process typically takes 
                          5-10 minutes to complete. Once finished, the new records will be available in the database.</p>
                          <p className="mt-2">After the import completes, use the "Export to JSON" function above 
                          to make the new records available to the search service.</p>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {importCsrMutation.isError && (
                    <Alert className="mb-4 bg-red-50 border-red-200">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <AlertTitle className="text-red-800">Import Failed</AlertTitle>
                      <AlertDescription className="text-red-700">
                        {importCsrMutation.error instanceof Error ? importCsrMutation.error.message : 'Unknown error occurred'}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
                <CardFooter className="flex justify-between">
                  <div className="text-xs text-muted-foreground">
                    <Badge variant="outline" className="mr-2">
                      Current Progress: 2,871 CSRs (72%)
                    </Badge>
                    <Badge variant="outline">
                      Target: 4,000 CSRs
                    </Badge>
                  </div>
                  <Button 
                    onClick={handleImportCsrs}
                    disabled={importCsrMutation.isPending}
                    variant="default"
                  >
                    {importCsrMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Start Import
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}