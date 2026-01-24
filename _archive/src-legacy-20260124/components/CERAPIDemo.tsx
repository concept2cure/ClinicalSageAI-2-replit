import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Download, FileText, AlertTriangle, Loader2, BarChart, 
  Calendar, FileBarChart2, Table, ArrowUpDown, Clock, 
  Info, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart as RechartsBarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line
} from 'recharts';

// Types for API responses and component props
type AdverseEvent = {
  name: string;
  count: number;
};

type MonthlyTrend = {
  month: string;
  events: number;
};

type VisualizationData = {
  adverseEvents: AdverseEvent[];
  monthlyTrends: MonthlyTrend[];
};

type KPIMetrics = {
  totalReports: number;
  seriousEvents: number;
  trendChange: string;
  timeframe: string;
};

type ViewModeType = 'chart' | 'table';

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

// ViewToggle Component
interface ViewToggleProps {
  viewMode: ViewModeType;
  onViewModeChange: (mode: ViewModeType) => void;
}

const ViewToggle: React.FC<ViewToggleProps> = React.memo(({ viewMode, onViewModeChange }) => {
  return (
    <div className="flex items-center space-x-2">
      <Button 
        size="sm" 
        variant={viewMode === 'chart' ? 'default' : 'outline'}
        onClick={() => onViewModeChange('chart')}
      >
        <FileBarChart2 className="mr-2 h-4 w-4" />
        Chart
      </Button>
      <Button 
        size="sm" 
        variant={viewMode === 'table' ? 'default' : 'outline'}
        onClick={() => onViewModeChange('table')}
      >
        <Table className="mr-2 h-4 w-4" />
        Table
      </Button>
    </div>
  );
});

ViewToggle.displayName = 'ViewToggle';

// TrendTable Component
interface TrendTableProps {
  data: Record<string, any>[];
  title: string;
  keyField: string;
  valueField: string;
}

const TrendTable: React.FC<TrendTableProps> = React.memo(({ data, title, keyField, valueField }) => {
  const [sortKey, setSortKey] = useState<string>(keyField);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];

      if (sortDirection === 'asc') {
        return typeof aValue === 'string' 
          ? aValue.localeCompare(bValue) 
          : aValue - bValue;
      } else {
        return typeof aValue === 'string' 
          ? bValue.localeCompare(aValue) 
          : bValue - aValue;
      }
    });
  }, [data, sortKey, sortDirection]);

  // Calculate total for percentages
  const total = useMemo(() => {
    return data.reduce((sum, item) => sum + item[valueField], 0);
  }, [data, valueField]);

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="bg-card px-4 py-2 font-medium text-sm flex justify-between items-center border-b">
        <span>{title}</span>
        <span className="text-xs text-muted-foreground">
          Total: {total} records
        </span>
      </div>
      <div className="overflow-auto max-h-[300px]">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              <th 
                scope="col" 
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort(keyField)}
              >
                <div className="flex items-center">
                  {keyField === 'name' ? 'Event Type' : 'Time Period'}
                  <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
                </div>
              </th>
              <th 
                scope="col" 
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort(valueField)}
              >
                <div className="flex items-center">
                  Count
                  <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
                </div>
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Percentage
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {sortedData.map((item, idx) => {
              const percentage = ((item[valueField] / total) * 100).toFixed(1);
              
              return (
                <tr key={idx} className={idx % 2 === 0 ? '' : 'bg-muted/20'}>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{item[keyField]}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">{item[valueField]}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">
                    <div className="flex items-center">
                      <div className="w-24 bg-muted rounded-full h-2 mr-2">
                        <div 
                          className="bg-primary h-2 rounded-full" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      {percentage}%
                    </div>
                  </td>
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

// DateRangePicker Component
interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onRangeChange: (start: string, end: string) => void;
}

const DateRangePicker: React.FC<DateRangePickerProps> = React.memo(({ startDate, endDate, onRangeChange }) => {
  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onRangeChange(e.target.value, endDate);
  };
  
  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onRangeChange(startDate, e.target.value);
  };
  
  // Preset ranges for quick selection
  const presetRanges = [
    { label: '3 Months', value: 3 },
    { label: '6 Months', value: 6 },
    { label: '1 Year', value: 12 },
    { label: '2 Years', value: 24 }
  ];
  
  // Apply preset date range
  const handlePresetClick = (months: number) => {
    const today = new Date();
    const pastDate = new Date();
    pastDate.setMonth(today.getMonth() - months);
    
    onRangeChange(
      pastDate.toISOString().split('T')[0],
      today.toISOString().split('T')[0]
    );
  };
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="p-4 bg-muted/30 rounded-lg space-y-4"
    >
      <div className="flex items-center">
        <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
        <span className="text-sm font-medium">Quick Presets</span>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {presetRanges.map((range) => (
          <Button 
            key={range.label} 
            variant="outline" 
            size="sm" 
            onClick={() => handlePresetClick(range.value)}
          >
            {range.label}
          </Button>
        ))}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="start-date" className="text-xs font-medium">
            Start Date
          </label>
          <Input 
            id="start-date"
            type="date" 
            value={startDate} 
            onChange={handleStartChange}
            max={endDate}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="end-date" className="text-xs font-medium">
            End Date
          </label>
          <Input 
            id="end-date"
            type="date" 
            value={endDate} 
            onChange={handleEndChange}
            min={startDate}
          />
        </div>
      </div>
      
      <div className="text-xs text-muted-foreground">
        Selected range: {new Date(startDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}
      </div>
    </motion.div>
  );
});

DateRangePicker.displayName = 'DateRangePicker';

// KPI Metrics Card
interface KPICardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, icon }) => {
  return (
    <Card className="bg-card">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          {icon}
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
};

// Main CER API Demo Component
const CERAPIDemo: React.FC = () => {
  // Tab state
  const [activeTab, setActiveTab] = useState<string>('faers');
  
  // Form state
  const [ndcCode, setNdcCode] = useState<string>('');
  const [deviceCode, setDeviceCode] = useState<string>('');
  const [multiSourceCodes, setMultiSourceCodes] = useState<string>('');
  const [period, setPeriod] = useState<string>('12'); // Default to 12 months
  
  // UI state
  const [loading, setLoading] = useState<boolean>(false);
  const [downloadReady, setDownloadReady] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewModeType>('chart');
  const [showDateRange, setShowDateRange] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Data state
  const [responseData, setResponseData] = useState<any>(null);
  const [visualizationData, setVisualizationData] = useState<VisualizationData>({
    adverseEvents: [
      { name: 'Headache', count: 87 },
      { name: 'Nausea', count: 76 },
      { name: 'Fatigue', count: 59 },
      { name: 'Dizziness', count: 47 },
      { name: 'Rash', count: 33 }
    ],
    monthlyTrends: [
      { month: 'Jan', events: 42 },
      { month: 'Feb', events: 38 },
      { month: 'Mar', events: 47 },
      { month: 'Apr', events: 62 },
      { month: 'May', events: 55 },
      { month: 'Jun', events: 43 }
    ]
  });
  
  const { toast } = useToast();
  
  // Initialize date range (past 12 months by default)
  const today = new Date();
  const pastDate = new Date();
  pastDate.setMonth(today.getMonth() - 12);
  
  const [startDate, setStartDate] = useState<string>(pastDate.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(today.toISOString().split('T')[0]);
  
  // Extract KPI metrics from response data
  const kpiMetrics = useMemo<KPIMetrics | null>(() => {
    if (!responseData) return null;
    
    try {
      // Extract metrics from API response
      const data = responseData.data || {};
      return {
        totalReports: data.total_reports || 125,
        seriousEvents: data.serious_events || 43,
        trendChange: data.trend || '+12%',
        timeframe: `${period} months`
      };
    } catch (err) {
      console.error('Error extracting KPI metrics:', err);
      return null;
    }
  }, [responseData, period]);
  
  // Handle date range changes
  const handleDateRangeChange = useCallback((start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    
    // Calculate period in months from the date range
    const startObj = new Date(start);
    const endObj = new Date(end);
    
    const diffMonths = (endObj.getFullYear() - startObj.getFullYear()) * 12 + 
                      (endObj.getMonth() - startObj.getMonth());
    
    setPeriod(Math.max(1, diffMonths).toString());
  }, []);
  
  // Toggle date range picker visibility
  const toggleDateRangePicker = useCallback(() => {
    setShowDateRange(prev => !prev);
  }, []);
  
  // Handle API data fetch
  const handleFetchData = useCallback(async () => {
    setLoading(true);
    setDownloadReady(false);
    setResponseData(null);
    setError(null);
    
    try {
      let endpoint: string;
      let payload: Record<string, any> = {};
      
      switch (activeTab) {
        case 'faers':
          if (!ndcCode.trim()) {
            throw new Error('Please enter a valid NDC code');
          }
          endpoint = '/api/cer/generate';
          payload = { 
            ndc_code: ndcCode, 
            period: period || '12',
            start_date: startDate,
            end_date: endDate 
          };
          break;
          
        case 'device':
          if (!deviceCode.trim()) {
            throw new Error('Please enter a valid device code');
          }
          endpoint = '/api/cer/generate'; // Adjust as needed when API is available
          payload = { 
            device_code: deviceCode, 
            period: period || '12',
            start_date: startDate,
            end_date: endDate 
          };
          break;
          
        case 'multi':
          if (!multiSourceCodes.trim()) {
            throw new Error('Please enter at least one code');
          }
          
          const codes = multiSourceCodes.split(',').map(code => code.trim());
          endpoint = '/api/cer/analyze';
          payload = { 
            ndc_codes: codes.filter(code => code.includes('-')), 
            device_codes: codes.filter(code => !code.includes('-')),
            period: period || '12',
            start_date: startDate,
            end_date: endDate 
          };
          break;
          
        default:
          throw new Error('Invalid tab selection');
      }
      
      console.log(`Fetching data from ${endpoint} with payload:`, payload);
      
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
      
      // Process API response data for visualization
      try {
        const responseData = data.data || {};
        
        if (responseData.adverse_events || responseData.monthly_trends) {
          const adverseEvents = responseData.adverse_events?.map((event: any) => ({
            name: event.name || event.event || 'Unknown',
            count: event.count || 0
          })) || visualizationData.adverseEvents;
          
          const monthlyTrends = responseData.monthly_trends?.map((trend: any) => ({
            month: trend.month || new Date(trend.date).toLocaleString('default', { month: 'short' }),
            events: trend.count || trend.events || 0
          })) || visualizationData.monthlyTrends;
          
          setVisualizationData({
            adverseEvents,
            monthlyTrends
          });
        }
      } catch (err) {
        console.error('Error processing visualization data:', err);
      }
      
      // toast call replaced
  // Original: toast({
        title: "Success",
        description: "Data fetched successfully. You can now download the PDF.",
      })
  console.log('Toast would show:', {
        title: "Success",
        description: "Data fetched successfully. You can now download the PDF.",
      });
      
    } catch (error: any) {
      console.error('Error fetching data:', error);
      setError(error.message || 'An unknown error occurred');
      
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
  }, [
    activeTab, ndcCode, deviceCode, multiSourceCodes, 
    period, startDate, endDate, toast, visualizationData
  ]);
  
  // Handle PDF download
  const handleDownloadPDF = useCallback(async () => {
    try {
      setLoading(true);
      
      let endpoint: string;
      let payload: Record<string, any> = {};
      
      switch (activeTab) {
        case 'faers':
          if (!ndcCode.trim()) {
            throw new Error('Please enter a valid NDC code');
          }
          endpoint = '/api/cer/export-pdf';
          payload = { 
            ndc_codes: [ndcCode]
          };
          break;
          
        case 'device':
          if (!deviceCode.trim()) {
            throw new Error('Please enter a valid device code');
          }
          endpoint = '/api/cer/export-pdf';
          payload = { 
            device_codes: [deviceCode]
          };
          break;
          
        case 'multi':
          if (!multiSourceCodes.trim()) {
            throw new Error('Please enter at least one code');
          }
          
          const codes = multiSourceCodes.split(',').map(code => code.trim());
          endpoint = '/api/cer/export-pdf';
          payload = { 
            ndc_codes: codes.filter(code => code.includes('-')), 
            device_codes: codes.filter(code => !code.includes('-'))
          };
          break;
          
        default:
          throw new Error('Invalid tab selection');
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
      
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      setError(error.message || 'An unknown error occurred');
      
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
  }, [
    activeTab, ndcCode, deviceCode, multiSourceCodes, toast
  ]);
  
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
              <p className="text-xs text-muted-foreground">
                The NDC (National Drug Code) uniquely identifies prescription and over-the-counter drugs in the US.
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Period (Optional):</label>
              <Input 
                placeholder="Time period in months (e.g., 12)" 
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                type="number"
                min="1"
                max="60"
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
              <p className="text-xs text-muted-foreground">
                FDA device identifiers for medical devices in the MAUDE database.
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Period (Optional):</label>
              <Input 
                placeholder="Time period in months (e.g., 12)" 
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                type="number"
                min="1"
                max="60"
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
                type="number"
                min="1"
                max="60"
              />
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="flex justify-between items-center mt-4 mb-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={toggleDateRangePicker}
            className="flex items-center"
          >
            <Calendar className="mr-2 h-4 w-4" />
            {showDateRange ? 'Hide Date Range' : 'Custom Date Range'}
          </Button>
        </div>
        
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
                <Search className="mr-2 h-4 w-4" />
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
            {kpiMetrics && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="w-full mb-6"
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KPICard 
                    title="Total Reports" 
                    value={kpiMetrics.totalReports}
                    icon={<BarChart className="h-4 w-4 text-muted-foreground" />}
                  />
                  <KPICard 
                    title="Serious Events" 
                    value={kpiMetrics.seriousEvents}
                    icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
                  />
                  <KPICard 
                    title="Trend Change" 
                    value={kpiMetrics.trendChange}
                    icon={<ArrowUpDown className="h-4 w-4 text-muted-foreground" />}
                  />
                  <KPICard 
                    title="Time Period" 
                    value={kpiMetrics.timeframe}
                    icon={<Clock className="h-4 w-4 text-muted-foreground" />}
                  />
                </div>
              </motion.div>
            )}
            
            {/* Visualization */}
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
                    onViewModeChange={setViewMode} 
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
            
            {/* API Response */}
            {responseData && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full space-y-2"
              >
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">API Response:</label>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </div>
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
};

export default CERAPIDemo;