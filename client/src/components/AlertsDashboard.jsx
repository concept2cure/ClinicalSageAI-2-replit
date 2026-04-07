// AlertsDashboard.jsx
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Loader2, BellRing, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * AlertsDashboard Component
 * Shows real-time alerts based on anomaly detection in FAERS data
 */
export default function AlertsDashboard({ ndcCode }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (ndcCode) {
      fetchAlerts();
    } else {
      setLoading(false);
    }
  }, [ndcCode]);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('GET', `/api/cer/alerts/${ndcCode}`);
      const data = await response.json();
      
      if (response.ok) {
        setAlerts(data.alerts || []);
        setError('');
      } else {
        setError(data.message || 'Failed to fetch alerts.');
        setAlerts([]);
      }
    } catch (err) {
      console.error('Error fetching alerts:', err);
      setError(err.message || 'An error occurred while fetching alerts.');
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchAlerts();
  };

  const downloadEnhancedPDF = async () => {
    try {
      // toast call replaced
  // Original: toast({
        title: "Generating PDF",
        description: "Preparing enhanced report with charts...",
      })
  console.log('Toast would show:', {
        title: "Generating PDF",
        description: "Preparing enhanced report with charts...",
      });

      const response = await fetch(`/api/cer/${ndcCode}/enhanced-pdf`);
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF report.');
      }
      
      // Convert response to blob
      const blob = await response.blob();
      
      // Create a URL for the blob
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary anchor and trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `enhanced_cer_${ndcCode}.pdf`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // toast call replaced
  // Original: toast({
        title: "PDF Downloaded",
        description: "Enhanced report has been downloaded successfully.",
      })
  console.log('Toast would show:', {
        title: "PDF Downloaded",
        description: "Enhanced report has been downloaded successfully.",
      });
    } catch (err) {
      console.error('Error downloading PDF:', err);
      // toast call replaced
  // Original: toast({
        title: "Download Failed",
        description: err.message || "Failed to download enhanced report",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Download Failed",
        description: err.message || "Failed to download enhanced report",
        variant: "destructive",
      });
    }
  };

  // Get alert severity based on anomaly value
  const getAlertSeverity = (anomalyValue) => {
    if (anomalyValue >= 3) return "high";
    if (anomalyValue >= 1.5) return "medium";
    return "low";
  };

  // Get color based on severity
  const getSeverityColor = (severity) => {
    switch (severity) {
      case "high": return "destructive";
      case "medium": return "warning";
      default: return "secondary";
    }
  };

  // Format timestamp for display
  const formatTimestamp = () => {
    const now = new Date();
    return now.toLocaleString();
  };

  // Render loading state
  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center">
            <BellRing className="mr-2 h-5 w-5" />
            Real-Time Alerts
          </CardTitle>
          <CardDescription>
            Monitoring for anomalies in adverse event data
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading alerts...</span>
        </CardContent>
      </Card>
    );
  }

  // Render error state
  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center">
            <BellRing className="mr-2 h-5 w-5" />
            Real-Time Alerts
          </CardTitle>
          <CardDescription>
            Monitoring for anomalies in adverse event data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={handleRefresh}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render alerts
  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <BellRing className="mr-2 h-5 w-5" />
            Real-Time Alerts
          </CardTitle>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={downloadEnhancedPDF}>
              <FileDown className="h-4 w-4 mr-1" />
              Export PDF
            </Button>
          </div>
        </div>
        <CardDescription>
          {ndcCode ? `Monitoring anomalies for NDC: ${ndcCode}` : "No NDC code provided"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No alerts detected at this time.
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground mb-3">
              Last updated: {formatTimestamp()}
            </div>
            <div className="space-y-3">
              {alerts.map((alert, idx) => {
                const severity = getAlertSeverity(alert.anomaly);
                const severityColor = getSeverityColor(severity);
                
                return (
                  <div key={idx} className="flex items-start p-3 border rounded-md">
                    <div className="flex-1">
                      <div className="flex items-center mb-1">
                        <h4 className="font-medium mr-2">{alert.event}</h4>
                        <Badge variant={severityColor}>
                          {severity.charAt(0).toUpperCase() + severity.slice(1)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Anomaly score: {alert.anomaly.toFixed(2)}
                      </p>
                      <p className="text-sm mt-1">
                        Unusual activity detected for this adverse event. Consider reviewing recent reports.
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}