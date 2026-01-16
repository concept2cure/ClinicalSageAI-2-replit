import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, RefreshCw, Zap, AlertCircle, CheckCircle, Bookmark, Book, Database } from 'lucide-react'
import { cerApiService } from '@/services/CerAPIService';
import { useToast } from '@/components/ui/toaster';
import DataRetrievalStatus from './DataRetrievalStatus';

/**
 * CER Data Retrieval Panel Component
 *
 * This component provides a unified interface for triggering and monitoring
 * autonomous data retrieval for CER reports including FAERS data and literature.
 */
const CerDataRetrievalPanel = ({ reportId, deviceName, onDataUpdated }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [retrievalStatus, setRetrievalStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('status');
  const [faersData, setFaersData] = useState(null);
  const [literatureData, setLiteratureData] = useState(null);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  // Check data retrieval status periodically
  useEffect(() => {
    if (!reportId) return;

    const checkStatus = async () => {
      try {
        const status = await cerApiService.getDataRetrievalStatus(reportId);
        setRetrievalStatus(status);

        // If data is complete, fetch it
        if (status?.faersStatus === 'completed') {
          fetchFaersData();
        }
        if (status?.literatureStatus === 'completed') {
          fetchLiteratureData();
        }
      } catch (error) {
        console.error('Error checking data retrieval status:', error);
      }
    };

    // Check immediately
    checkStatus();

    // Setup interval to check every 5 seconds
    const interval = setInterval(checkStatus, 5000);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [reportId]);

  /**
   * Trigger autonomous data retrieval for the current report
   */
  const triggerDataRetrieval = async () => {
    if (!reportId) {
      toast({
        title: 'Report ID Required',
        description: 'A report ID is required to trigger autonomous data retrieval',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const result = await cerApiService.retrieveDataForCER(reportId);

      toast({
        title: 'Data Retrieval Initiated',
        description: 'Autonomous data retrieval has been started for this report',
      });

      setRetrievalStatus(result);
    } catch (error) {
      console.error('Error triggering data retrieval:', error);
      setError(error.message || 'Failed to trigger autonomous data retrieval');
      toast({
        title: 'Error',
        description: error.message || 'Failed to trigger autonomous data retrieval',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Fetch FAERS data for the current report
   */
  const fetchFaersData = async () => {
    if (!reportId) return;

    try {
      const data = await cerApiService.getFaersDataForReport(reportId);

      if (data) {
        setFaersData(data);

        // Notify parent component
        if (onDataUpdated) {
          onDataUpdated({ type: 'faers', data });
        }
      }
    } catch (error) {
      console.error('Error fetching report FAERS data:', error);
    }
  };

  /**
   * Fetch literature data for the current report
   */
  const fetchLiteratureData = async () => {
    if (!reportId) return;

    try {
      const data = await cerApiService.getLiteratureForReport(reportId);

      if (data) {
        setLiteratureData(data);

        // Notify parent component
        if (onDataUpdated) {
          onDataUpdated({ type: 'literature', data });
        }
      }
    } catch (error) {
      console.error('Error fetching report literature data:', error);
    }
  };

  /**
   * Render the data retrieval tab content
   */
  const renderStatusTab = () => {
    return (
      <div className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DataRetrievalStatus
          reportId={reportId}
          status={retrievalStatus}
          isLoading={isLoading}
          onTriggerRetrieval={triggerDataRetrieval}
        />

        {/* Data Sources Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data Sources</CardTitle>
            <CardDescription>
              External data integrated into this clinical evaluation report
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Database className="h-4 w-4 mr-2 text-primary" />
                  <span>FDA FAERS Database</span>
                </div>
                <Badge variant={faersData ? 'success' : 'outline'}>
                  {faersData ? `${faersData.totalReports || 0} Reports` : 'Pending'}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Book className="h-4 w-4 mr-2 text-primary" />
                  <span>Scientific Literature</span>
                </div>
                <Badge variant={literatureData ? 'success' : 'outline'}>
                  {literatureData ? `${literatureData.length || 0} Papers` : 'Pending'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  /**
   * Render FAERS data tab content
   */
  const renderFaersTab = () => {
    if (!faersData) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          <Database className="mx-auto h-12 w-12 mb-3 text-muted" />
          <p>No FDA FAERS data available yet. Use the data retrieval process to fetch data.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>FAERS Data Summary</CardTitle>
            <CardDescription>
              FDA Adverse Event Reports for {deviceName || 'this device'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Total Reports</p>
                <p className="text-2xl font-bold">{faersData.totalReports || 0}</p>
              </div>
              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Serious Events</p>
                <p className="text-2xl font-bold">{faersData.seriousEvents?.length || 0}</p>
              </div>
              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Time Period</p>
                <p className="text-lg font-medium">
                  {faersData.reportingPeriod || 'All Available'}
                </p>
              </div>
            </div>

            {/* Top Adverse Events */}
            {faersData.adverseEventCounts?.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Top Adverse Events</h3>
                <div className="space-y-2">
                  {faersData.adverseEventCounts.slice(0, 5).map((item, index) => (
                    <div key={index} className="flex items-center justify-between py-1 border-b">
                      <span>{item.event}</span>
                      <Badge variant="outline">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  /**
   * Render literature data tab content
   */
  const renderLiteratureTab = () => {
    if (!literatureData) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          <Book className="mx-auto h-12 w-12 mb-3 text-muted" />
          <p>No literature data available yet. Use the data retrieval process to fetch data.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Scientific Literature</CardTitle>
            <CardDescription>
              Relevant literature for {deviceName || 'this device'} clinical evaluation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">
                Retrieved {literatureData.length} relevant papers
              </p>
            </div>

            {/* Literature Items */}
            <div className="space-y-3">
              {literatureData.slice(0, 5).map((item, index) => (
                <Card key={index} className="bg-muted/20">
                  <CardContent className="p-3">
                    <h4 className="font-medium text-sm">{item.title}</h4>
                    <p className="text-xs text-muted-foreground">{item.authors}</p>
                    <p className="text-xs">
                      {item.journal}, {item.year}
                    </p>
                  </CardContent>
                </Card>
              ))}

              {literatureData.length > 5 && (
                <div className="text-center py-2">
                  <p className="text-sm text-muted-foreground">
                    + {literatureData.length - 5} more papers
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="status" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="status" className="flex-1">
            Status
          </TabsTrigger>
          <TabsTrigger value="faers" className="flex-1">
            FAERS Data
          </TabsTrigger>
          <TabsTrigger value="literature" className="flex-1">
            Literature
          </TabsTrigger>
        </TabsList>
        {/* CLIENT IS HERE - EMERGENCY FIX ACTIVE */}

        <TabsContent value="status" className="space-y-4">
          {renderStatusTab()}
        </TabsContent>

        <TabsContent value="faers" className="space-y-4">
          {renderFaersTab()}
        </TabsContent>

        <TabsContent value="literature" className="space-y-4">
          {renderLiteratureTab()}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CerDataRetrievalPanel;
