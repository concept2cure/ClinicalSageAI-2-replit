import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Download, FileText, AlertTriangle, Loader2, TrendingUp, BarChart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

// Mock data for visualizations
const MOCK_ADVERSE_EVENTS = [
  { name: 'Headache', count: 87 },
  { name: 'Nausea', count: 76 },
  { name: 'Fatigue', count: 59 },
  { name: 'Dizziness', count: 47 },
  { name: 'Rash', count: 33 }
];

const MOCK_MONTHLY_DATA = [
  { month: 'Jan', events: 42 },
  { month: 'Feb', events: 38 },
  { month: 'Mar', events: 47 },
  { month: 'Apr', events: 62 },
  { month: 'May', events: 55 },
  { month: 'Jun', events: 43 }
];

// Animation variants for Framer Motion
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { 
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { 
    y: 0, 
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};

// ViewToggle component for switching between chart and table views
const ViewToggle = React.memo(({ viewMode, onViewModeChange }) => {
  return (
    <div className="flex items-center space-x-2 mb-4">
      <Button 
        size="sm" 
        variant={viewMode === 'chart' ? 'default' : 'outline'}
        onClick={() => onViewModeChange('chart')}
        className="flex items-center"
      >
        <BarChart className="mr-2 h-4 w-4" />
        Chart
      </Button>
      <Button 
        size="sm" 
        variant={viewMode === 'table' ? 'default' : 'outline'}
        onClick={() => onViewModeChange('table')}
        className="flex items-center"
      >
        <FileText className="mr-2 h-4 w-4" />
        Table
      </Button>
    </div>
  );
});

ViewToggle.displayName = 'ViewToggle';

// TrendTable component for displaying raw data in table format
const TrendTable = React.memo(({ data, title, keyField, valueField }) => {
  return (
    <div className="rounded-md border overflow-hidden">
      <div className="bg-muted px-4 py-2 font-medium text-sm">{title}</div>
      <div className="overflow-auto max-h-[300px]">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {keyField === 'name' ? 'Event Type' : 'Time Period'}
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Count
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Percentage
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {data.map((item, idx) => {
              const total = data.reduce((sum, i) => sum + i[valueField], 0);
              const percentage = ((item[valueField] / total) * 100).toFixed(1);
              
              return (
                <tr key={idx} className={idx % 2 === 0 ? '' : 'bg-muted/20'}>
                  <td className="px-6 py-2 whitespace-nowrap text-sm">{item[keyField]}</td>
                  <td className="px-6 py-2 whitespace-nowrap text-sm">{item[valueField]}</td>
                  <td className="px-6 py-2 whitespace-nowrap text-sm">{percentage}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

TrendTable.displayName = 'TrendTable';

// DateRangePicker component for selecting custom date ranges
const DateRangePicker = React.memo(({ startDate, endDate, onRangeChange }) => {
  const handleStartChange = (e) => {
    onRangeChange(e.target.value, endDate);
  };
  
  const handleEndChange = (e) => {
    onRangeChange(startDate, e.target.value);
  };
  
  const presetRanges = [
    { label: '3 Months', value: '3' },
    { label: '6 Months', value: '6' },
    { label: '1 Year', value: '12' },
    { label: '2 Years', value: '24' }
  ];
  
  const handlePresetClick = (months) => {
    const today = new Date();
    const pastDate = new Date();
    pastDate.setMonth(today.getMonth() - parseInt(months));
    
    onRangeChange(
      pastDate.toISOString().split('T')[0],
      today.toISOString().split('T')[0]
    );
  };
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3 mb-4"
    >
      <div className="flex flex-wrap gap-2">
        {presetRanges.map((range) => (
          <Button 
            key={range.value} 
            variant="outline" 
            size="sm" 
            onClick={() => handlePresetClick(range.value)}
          >
            {range.label}
          </Button>
        ))}
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="startDate" className="text-xs font-medium">Start Date</label>
          <Input 
            id="startDate"
            type="date" 
            value={startDate} 
            onChange={handleStartChange}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="endDate" className="text-xs font-medium">End Date</label>
          <Input 
            id="endDate"
            type="date" 
            value={endDate} 
            onChange={handleEndChange}
          />
        </div>
      </div>
    </motion.div>
  );
});

DateRangePicker.displayName = 'DateRangePicker';

export default function CERAPIDemo() {
  const [activeTab, setActiveTab] = useState('faers');
  const [ndcCode, setNdcCode] = useState('');
  const [deviceCode, setDeviceCode] = useState('');
  const [multiSourceCodes, setMultiSourceCodes] = useState('');
  const [period, setPeriod] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [responseData, setResponseData] = useState(null);
  const [visualizationData, setVisualizationData] = useState(null);
  const [viewMode, setViewMode] = useState('chart');
  const [error, setError] = useState(null);
  const [showDateRange, setShowDateRange] = useState(false);
  
  // Date range state
  const today = new Date();
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(today.getMonth() - 3);
  
  const [startDate, setStartDate] = useState(threeMonthsAgo.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  
  const { toast } = useToast();

  // Initialize visualization data on component mount
  useEffect(() => {
    setVisualizationData({
      adverseEvents: MOCK_ADVERSE_EVENTS,
      monthlyTrends: MOCK_MONTHLY_DATA
    });
  }, []);

  // Handle date range changes
  const handleDateRangeChange = (start, end) => {
    setStartDate(start);
    setEndDate(end);
    
    // Calculate period in months from the date range
    const startObj = new Date(start);
    const endObj = new Date(end);
    
    const diffMonths = (endObj.getFullYear() - startObj.getFullYear()) * 12 + 
                      (endObj.getMonth() - startObj.getMonth());
    
    setPeriod(diffMonths.toString());
  };
  
  // Handle view mode changes
  const handleViewModeChange = (mode) => {
    // Add smooth animation for view mode change
    setViewMode(mode);
  };
  
  // Toggle date range picker visibility
  const toggleDateRangePicker = () => {
    setShowDateRange(prev => !prev);
  };

  // Extract KPI metrics from response data
  const getKPIMetrics = React.useMemo(() => {
    if (!responseData) return null;
    
    try {
      // In a real implementation, these would be extracted from the actual response
      return {
        totalReports: responseData?.total_reports || 125,
        seriousEvents: responseData?.serious_events || 43,
        trendChange: responseData?.trend_change || '+12%',
        timeframe: `${period || '12'} months`
      };
    } catch (err) {
      console.error('Error extracting KPI metrics:', err);
      return null;
    }
  }, [responseData, period]);

  const handleFetchData = async () => {
    setLoading(true);
    setDownloadReady(false);
    setResponseData(null);
    setError(null);
    
    try {
      let endpoint;
      let payload = {};
      
      switch (activeTab) {
        case 'faers':
          if (!ndcCode.trim()) {
            throw new Error('Please enter a valid NDC code');
          }
          endpoint = '/api/cer/generate';
          payload = { 
            ndc_code: ndcCode, 
            period: period || undefined,
            start_date: startDate,
            end_date: endDate 
          };
          break;
          
        case 'device':
          if (!deviceCode.trim()) {
            throw new Error('Please enter a valid device code');
          }
          endpoint = '/api/cer/device';
          payload = { 
            device_code: deviceCode, 
            period: period || undefined,
            start_date: startDate,
            end_date: endDate 
          };
          break;
          
        case 'multi':
          if (!multiSourceCodes.trim()) {
            throw new Error('Please enter at least one code');
          }
          
          const codes = multiSourceCodes.split(',').map(code => code.trim());
          endpoint = '/api/cer/multi-source';
          payload = { 
            ndc_codes: codes.filter(code => code.includes('-')), 
            device_codes: codes.filter(code => !code.includes('-')),
            period: period || undefined,
            start_date: startDate,
            end_date: endDate 
          };
          break;
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      setResponseData(data);
      setDownloadReady(true);
      
      // In a real implementation, we would extract visualization data from the API response
      // For now, we'll use our mock data with a slight randomization
      setVisualizationData({
        adverseEvents: MOCK_ADVERSE_EVENTS.map(item => ({
          ...item,
          count: item.count + Math.floor(Math.random() * 10 - 5)
        })),
        monthlyTrends: MOCK_MONTHLY_DATA.map(item => ({
          ...item,
          events: item.events + Math.floor(Math.random() * 10 - 5)
        }))
      });
      
      // toast call replaced
  // Original: toast({
        title: "Success",
        description: "Data fetched successfully. You can now download the PDF.",
      })
  console.log('Toast would show:', {
        title: "Success",
        description: "Data fetched successfully. You can now download the PDF.",
      });
      
    } catch (error) {
      console.error('Error fetching data:', error);
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: error.message || "Failed to fetch data from API",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error",
        description: error.message || "Failed to fetch data from API",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handleDownloadPDF = async () => {
    try {
      setLoading(true);
      
      let endpoint;
      let payload = {};
      
      switch (activeTab) {
        case 'faers':
          endpoint = '/api/cer/pdf';
          payload = { ndc_code: ndcCode };
          break;
          
        case 'device':
          endpoint = '/api/cer/device-pdf';
          payload = { device_code: deviceCode };
          break;
          
        case 'multi':
          const codes = multiSourceCodes.split(',').map(code => code.trim());
          endpoint = '/api/cer/multi-pdf';
          payload = { 
            ndc_codes: codes.filter(code => code.includes('-')), 
            device_codes: codes.filter(code => !code.includes('-')) 
          };
          break;
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PDF API Error: ${response.status} - ${errorText}`);
      }
      
      // Get the blob from the response
      const blob = await response.blob();
      
      // Create a temporary URL for the blob
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary link element to trigger the download
      const a = document.createElement('a');
      a.href = url;
      a.download = `cer-report-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // toast call replaced
  // Original: toast({
        title: "Download Started",
        description: "Your PDF report is being downloaded.",
      })
  console.log('Toast would show:', {
        title: "Download Started",
        description: "Your PDF report is being downloaded.",
      });
      
    } catch (error) {
      console.error('Error downloading PDF:', error);
      // toast call replaced
  // Original: toast({
        title: "Download Error",
        description: error.message || "Failed to download PDF report",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Download Error",
        description: error.message || "Failed to download PDF report",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>CER API Demo</CardTitle>
        <CardDescription>
          Directly interact with the CER generation API endpoints
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>API Testing Tool</AlertTitle>
          <AlertDescription>
            This is a direct interface to the CER API endpoints. Use this to test the generation of CER narratives and PDFs.
          </AlertDescription>
        </Alert>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="faers">FAERS (Drug)</TabsTrigger>
            <TabsTrigger value="device">Device</TabsTrigger>
            <TabsTrigger value="multi">Multi-Source</TabsTrigger>
          </TabsList>
          
          <TabsContent value="faers" className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">NDC Code:</label>
              <Input 
                placeholder="Enter NDC code (e.g., 0078-0357-15)" 
                value={ndcCode}
                onChange={(e) => setNdcCode(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Period (Optional):</label>
              <Input 
                placeholder="Time period in months (e.g., 12)" 
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="device" className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Device Code:</label>
              <Input 
                placeholder="Enter device code (e.g., DEN123456)" 
                value={deviceCode}
                onChange={(e) => setDeviceCode(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Period (Optional):</label>
              <Input 
                placeholder="Time period in months (e.g., 12)" 
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="multi" className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Multiple Codes:</label>
              <Textarea 
                placeholder="Enter NDC and/or device codes, separated by commas (e.g., 0078-0357-15, DEN123456)" 
                value={multiSourceCodes}
                onChange={(e) => setMultiSourceCodes(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                NDC codes contain hyphens (0078-0357-15), device codes don't (DEN123456)
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Period (Optional):</label>
              <Input 
                placeholder="Time period in months (e.g., 12)" 
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>
        
        {/* Date range picker toggle */}
        <div className="flex justify-between items-center mt-4 mb-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={toggleDateRangePicker}
            className="flex items-center"
          >
            {showDateRange ? 'Hide Date Range' : 'Custom Date Range'}
          </Button>
        </div>
        
        {/* Date range picker */}
        <AnimatePresence>
          {showDateRange && (
            <DateRangePicker 
              startDate={startDate}
              endDate={endDate}
              onRangeChange={handleDateRangeChange}
            />
          )}
        </AnimatePresence>
        
        <div className="flex space-x-2 mt-6">
          <Button 
            onClick={handleFetchData} 
            disabled={loading}
            className="flex-1"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Generate CER Narrative
              </>
            )}
          </Button>
          
          <Button 
            onClick={handleDownloadPDF} 
            disabled={loading || !downloadReady}
            variant={downloadReady ? "default" : "outline"}
            className="flex-1"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </>
            )}
          </Button>
        </div>
        
        {/* Error state */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4"
          >
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </motion.div>
        )}
      </CardContent>
      
      {(responseData || visualizationData) && (
        <CardFooter className="flex flex-col">
          <AnimatePresence>
            {/* KPI Metrics */}
            {getKPIMetrics && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="w-full mb-6"
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="bg-muted/30">
                    <CardContent className="p-4 flex flex-col items-center justify-center">
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">Total Reports</h4>
                      <p className="text-2xl font-bold">{getKPIMetrics.totalReports}</p>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-muted/30">
                    <CardContent className="p-4 flex flex-col items-center justify-center">
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">Serious Events</h4>
                      <p className="text-2xl font-bold">{getKPIMetrics.seriousEvents}</p>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-muted/30">
                    <CardContent className="p-4 flex flex-col items-center justify-center">
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">Trend Change</h4>
                      <p className="text-2xl font-bold">{getKPIMetrics.trendChange}</p>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-muted/30">
                    <CardContent className="p-4 flex flex-col items-center justify-center">
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">Time Period</h4>
                      <p className="text-2xl font-bold">{getKPIMetrics.timeframe}</p>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            )}
            
            {visualizationData && (
              <motion.div 
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={containerVariants}
                className="w-full mb-6"
              >
                <div className="flex justify-between items-center mb-4">
                  <motion.h3 variants={itemVariants} className="text-lg font-medium">
                    Analysis
                  </motion.h3>
                  
                  <ViewToggle 
                    viewMode={viewMode} 
                    onViewModeChange={handleViewModeChange} 
                  />
                </div>
                
                <AnimatePresence mode="wait">
                  {viewMode === 'chart' ? (
                    <motion.div 
                      key="chart-view"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      variants={itemVariants} 
                      className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6"
                    >
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Adverse Events Distribution</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <RechartsBarChart data={visualizationData.adverseEvents} margin={{ top: 10, right: 10, left: 10, bottom: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="count" fill="#8884d8" />
                              </RechartsBarChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Monthly Trend Analysis</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={visualizationData.monthlyTrends} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="month" />
                                <YAxis />
                                <Tooltip />
                                <Line type="monotone" dataKey="events" stroke="#8884d8" activeDot={{ r: 8 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="table-view"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-6 mb-6"
                    >
                      <TrendTable 
                        data={visualizationData.adverseEvents}
                        title="Adverse Events Distribution" 
                        keyField="name" 
                        valueField="count"
                      />
                      
                      <TrendTable 
                        data={visualizationData.monthlyTrends}
                        title="Monthly Trend Analysis" 
                        keyField="month" 
                        valueField="events"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
            
            {responseData && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full space-y-2"
              >
                <label className="text-sm font-medium">API Response:</label>
                <div className="bg-muted/50 p-4 rounded-md overflow-auto max-h-80">
                  <pre className="text-xs whitespace-pre-wrap">
                    {JSON.stringify(responseData, null, 2)}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardFooter>
      )}
    </Card>
  );
}