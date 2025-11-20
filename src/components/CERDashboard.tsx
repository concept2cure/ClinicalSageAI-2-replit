import React, { useState, useEffect, useMemo, useContext, createContext } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Download, 
  FileText, 
  Share2, 
  Moon, 
  Sun, 
  Calendar as CalendarIcon,
  ChevronDown,
  FileSpreadsheet
} from 'lucide-react';

// --- Types ---
interface AuthContextType {
  isAuthenticated: boolean;
}

interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

interface TrendData {
  [date: string]: number;
}

interface ChartDataPoint {
  date: string;
  value: number;
}

interface APIResponse {
  trend: TrendData;
  narrative: string;
}

interface PanelEntry {
  source: string;
  product_code: string;
  trend: TrendData;
}

interface MultiSourceResponse {
  analysis: {
    analyses: PanelEntry[];
  };
  narrative: string;
}

interface EndpointPanelProps {
  type: 'faers' | 'device';
}

// --- Auth and Theme Contexts ---
const AuthContext = createContext<AuthContextType>({ isAuthenticated: false });
const ThemeContext = createContext<ThemeContextType>({ 
  theme: 'light', 
  toggleTheme: () => {} 
});

export default function CERDashboard() {
  const [tab, setTab] = useState<'FAERS' | 'Device' | 'Multi-Source'>('FAERS');
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated } = useContext(AuthContext);

  // Check for authentication - we'll default to true for now, but in a real app 
  // this would be controlled by the actual auth system
  if (!isAuthenticated) {
    return (
      <div className="p-8">
        <h2 className="text-xl">Please log in to access the CER Dashboard.</h2>
      </div>
    );
  }

  const tabs = ['FAERS', 'Device', 'Multi-Source'] as const;
  
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className="p-8 max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-extrabold">TrialSage CER Dashboard</h1>
          <Button variant="outline" onClick={toggleTheme} className="gap-2">
            {theme === 'light' ? (
              <>
                <Moon className="h-4 w-4" />
                Dark Mode
              </>
            ) : (
              <>
                <Sun className="h-4 w-4" />
                Light Mode
              </>
            )}
          </Button>
        </header>
        
        <nav className="mb-6 flex flex-wrap space-x-2 sm:space-x-4">
          {tabs.map(t => (
            <Button
              key={t}
              variant={tab === t ? 'default' : 'outline'}
              onClick={() => setTab(t)}
              className="mb-2"
            >
              {t}
            </Button>
          ))}
        </nav>
        
        <main>
          {tab === 'FAERS' && <EndpointPanel type="faers" />}
          {tab === 'Device' && <EndpointPanel type="device" />}
          {tab === 'Multi-Source' && <MultiSourcePanel />}
        </main>
      </div>
    </ThemeContext.Provider>
  );
}

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // Check localStorage and system preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
    
    // Check if the user has a system preference
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    
    return 'light';
  });
  
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  
  return { theme, toggleTheme };
}

function EndpointPanel({ type }: EndpointPanelProps) {
  const { toast } = useToast();
  const storageKey = `cer_${type}_prefs`;
  
  // Load saved preferences
  const getSavedPreferences = () => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch (e) {
      return {};
    }
  };
  
  const saved = getSavedPreferences();
  
  // State
  const [code, setCode] = useState<string>(saved.code || '');
  const [periods, setPeriods] = useState<number>(saved.periods || 6);
  const [startDate, setStartDate] = useState<Date>(
    saved.startDate 
      ? new Date(saved.startDate) 
      : new Date(new Date().setFullYear(new Date().getFullYear() - 5))
  );
  const [endDate, setEndDate] = useState<Date>(
    saved.endDate ? new Date(saved.endDate) : new Date()
  );
  const [viewMode, setViewMode] = useState<'Chart' | 'Table'>(saved.viewMode || 'Chart');
  const [data, setData] = useState<TrendData | null>(null);
  const [narrative, setNarrative] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Save preferences when they change
  useEffect(() => {
    localStorage.setItem(
      storageKey, 
      JSON.stringify({ code, periods, startDate, endDate, viewMode })
    );
  }, [code, periods, startDate, endDate, viewMode, storageKey]);

  // Format dates for calendar
  const formatDate = (date: Date): string => {
    return format(date, 'PPP');
  };

  // Fetch data from API
  const fetchNarrative = async (): Promise<void> => {
    if (!code) {
      // toast call replaced
  // Original: toast({
        title: "Missing Code",
        description: "Please enter a code to generate the report.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing Code",
        description: "Please enter a code to generate the report.",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({ 
        periods: periods.toString(), 
        start_date: startDate.toISOString(), 
        end_date: endDate.toISOString() 
      });
      
      const res = await fetch(`/api/narrative/${type}/${code}?${params}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Error ${res.status}: Failed to fetch data`);
      }
      
      const json: APIResponse = await res.json();
      setData(json.trend);
      setNarrative(json.narrative);
      
      // toast call replaced
  // Original: toast({
        title: "Report Generated",
        description: `Successfully generated the ${type.toUpperCase()
  console.log('Toast would show:', {
        title: "Report Generated",
        description: `Successfully generated the ${type.toUpperCase()} report.`,
        variant: "default"
      });
    } catch (e: any) {
      setError(e.message);
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: e.message || "Failed to generate report",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error",
        description: e.message || "Failed to generate report",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Convert trend data to chart format
  const chartData: ChartDataPoint[] = useMemo(() => 
    data ? Object.entries(data).map(([date, value]) => ({ date, value })) : [], 
    [data]
  );

  // Export data as CSV
  const exportCSV = (): void => {
    if (!chartData.length) {
      // toast call replaced
  // Original: toast({
        title: "Nothing to Export",
        description: "Please generate a report first.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Nothing to Export",
        description: "Please generate a report first.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      const csv = ['Date,Count', ...chartData.map(r => `${r.date},${r.value}`)].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_${code}_trend.csv`;
      a.click();
      
      // toast call replaced
  // Original: toast({
        title: "Export Successful",
        description: "Your data has been exported as CSV.",
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "Export Successful",
        description: "Your data has been exported as CSV.",
        variant: "default"
      });
    } catch (e) {
      // toast call replaced
  // Original: toast({
        title: "Export Failed",
        description: "Failed to export data as CSV.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Export Failed",
        description: "Failed to export data as CSV.",
        variant: "destructive"
      });
    }
  };

  // Share link to this report
  const shareLink = (): void => {
    try {
      const params = new URLSearchParams({ 
        code, 
        periods: periods.toString(), 
        start: startDate.toISOString(), 
        end: endDate.toISOString() 
      });
      
      const shareUrl = `${window.location.href.split('?')[0]}?tab=${type}&${params}`;
      navigator.clipboard.writeText(shareUrl);
      
      // toast call replaced
  // Original: toast({
        title: "Link Copied",
        description: "Link to this report has been copied to clipboard.",
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "Link Copied",
        description: "Link to this report has been copied to clipboard.",
        variant: "default"
      });
    } catch (e) {
      // toast call replaced
  // Original: toast({
        title: "Copy Failed",
        description: "Failed to copy link to clipboard.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Copy Failed",
        description: "Failed to copy link to clipboard.",
        variant: "destructive"
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-2xl font-semibold uppercase">{type} CER</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <div className="space-y-2">
            <label htmlFor="code" className="text-sm font-medium">Product Code</label>
            <Input 
              id="code"
              placeholder="Enter code" 
              value={code} 
              onChange={e => setCode(e.target.value)} 
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="periods" className="text-sm font-medium">Time Periods</label>
            <Input 
              id="periods"
              type="number" 
              min={1} 
              max={12} 
              value={periods} 
              onChange={e => setPeriods(parseInt(e.target.value) || 6)} 
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Start Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formatDate(startDate)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => date && setStartDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">End Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formatDate(endDate)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => date && setEndDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">View Mode</label>
            <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'Chart' | 'Table')}>
              <SelectTrigger>
                <SelectValue placeholder="Select view mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Chart">Chart</SelectItem>
                <SelectItem value="Table">Table</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={fetchNarrative} 
            disabled={loading || !code}
            className="gap-2"
          >
            {loading ? <Spinner size="sm" /> : 'Generate'}
          </Button>
          
          <Button 
            variant="outline" 
            onClick={() => window.open(`/api/narrative/${type}/${code}/pdf?periods=${periods}`, '_blank')} 
            disabled={!narrative}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            PDF
          </Button>
          
          <Button 
            variant="outline" 
            onClick={exportCSV} 
            disabled={!chartData.length}
            className="gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            CSV
          </Button>
          
          <Button 
            variant="ghost" 
            onClick={shareLink}
            className="gap-2"
          >
            <Share2 className="w-4 h-4" />
            Share
          </Button>
        </div>
        
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 rounded-md border border-red-200 dark:border-red-800">
            <p>{error}</p>
          </div>
        )}
        
        {!loading && viewMode === 'Chart' && chartData.length > 0 && (
          <div className="mt-4 bg-white dark:bg-slate-900 p-4 rounded-md border border-gray-200 dark:border-gray-800">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart 
                data={chartData} 
                margin={{ top: 10, right: 20, bottom: 10, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ccc" strokeOpacity={0.2} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fill: 'var(--foreground)' }} 
                  tickLine={{ stroke: 'var(--foreground)' }} 
                  axisLine={{ stroke: 'var(--foreground)', strokeOpacity: 0.3 }}
                />
                <YAxis 
                  tick={{ fill: 'var(--foreground)' }} 
                  tickLine={{ stroke: 'var(--foreground)' }} 
                  axisLine={{ stroke: 'var(--foreground)', strokeOpacity: 0.3 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--background)', 
                    borderColor: 'var(--border)', 
                    color: 'var(--foreground)' 
                  }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="var(--primary)" 
                  strokeWidth={2} 
                  dot={false} 
                  activeDot={{ r: 6, stroke: 'var(--primary)', strokeWidth: 2, fill: 'var(--background)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        
        {!loading && viewMode === 'Table' && chartData.length > 0 && (
          <div className="mt-4 bg-white dark:bg-slate-900 p-4 rounded-md border border-gray-200 dark:border-gray-800">
            <ScrollArea className="max-h-48">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chartData.map((r, i) => (
                    <TableRow key={i} className={i % 2 ? 'bg-muted/50' : ''}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>{r.value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}
        
        {narrative && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }}
            className="mt-4"
          >
            <h3 className="text-lg font-semibold mb-2">Narrative</h3>
            <ScrollArea className="h-48 p-4 bg-slate-50 dark:bg-slate-900 border border-gray-200 dark:border-gray-800 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm">{narrative}</pre>
            </ScrollArea>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

function MultiSourcePanel() {
  const { toast } = useToast();
  
  // State
  const [ndcCodes, setNdcCodes] = useState<string>('');
  const [deviceCodes, setDeviceCodes] = useState<string>('');
  const [periods, setPeriods] = useState<number>(6);
  const [panels, setPanels] = useState<PanelEntry[]>([]);
  const [narrative, setNarrative] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch multi-source data
  const fetchMulti = async (): Promise<void> => {
    if (!ndcCodes && !deviceCodes) {
      // toast call replaced
  // Original: toast({
        title: "Missing Codes",
        description: "Please enter at least one NDC code or device code.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing Codes",
        description: "Please enter at least one NDC code or device code.",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    setError(null);
    setNarrative('');
    setPanels([]);
    
    try {
      const body = {
        ndc_codes: ndcCodes.split(',').map(s => s.trim()).filter(Boolean),
        device_codes: deviceCodes.split(',').map(s => s.trim()).filter(Boolean),
        periods
      };
      
      const res = await fetch('/api/narrative/multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Error ${res.status}: Failed to fetch data`);
      }
      
      const json: MultiSourceResponse = await res.json();
      setPanels(json.analysis.analyses);
      setNarrative(json.narrative);
      
      // toast call replaced
  // Original: toast({
        title: "Report Generated",
        description: "Successfully generated the multi-source report.",
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "Report Generated",
        description: "Successfully generated the multi-source report.",
        variant: "default"
      });
    } catch (e: any) {
      setError(e.message);
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: e.message || "Failed to generate multi-source report",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error",
        description: e.message || "Failed to generate multi-source report",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Export multi-source data as CSV
  const exportCSVMulti = (): void => {
    if (!panels.length) {
      // toast call replaced
  // Original: toast({
        title: "Nothing to Export",
        description: "Please generate a report first.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Nothing to Export",
        description: "Please generate a report first.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      const rows = panels.flatMap(entry =>
        Object.entries(entry.trend).map(([date, value]) => 
          [`${entry.source}:${entry.product_code}`, date, value]
        )
      );
      
      const csv = [["Source:Code", "Date", "Count"], ...rows]
        .map(r => r.join(','))
        .join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `multi_cer.csv`;
      a.click();
      
      // toast call replaced
  // Original: toast({
        title: "Export Successful",
        description: "Your multi-source data has been exported as CSV.",
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "Export Successful",
        description: "Your multi-source data has been exported as CSV.",
        variant: "default"
      });
    } catch (e) {
      // toast call replaced
  // Original: toast({
        title: "Export Failed",
        description: "Failed to export data as CSV.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Export Failed",
        description: "Failed to export data as CSV.",
        variant: "destructive"
      });
    }
  };

  // Share multi-source link
  const shareLinkMulti = (): void => {
    try {
      const params = new URLSearchParams({ 
        ndc_codes: ndcCodes, 
        device_codes: deviceCodes, 
        periods: periods.toString() 
      });
      
      const shareUrl = `${window.location.href.split('?')[0]}?tab=Multi-Source&${params}`;
      navigator.clipboard.writeText(shareUrl);
      
      // toast call replaced
  // Original: toast({
        title: "Link Copied",
        description: "Link to this multi-source report has been copied to clipboard.",
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "Link Copied",
        description: "Link to this multi-source report has been copied to clipboard.",
        variant: "default"
      });
    } catch (e) {
      // toast call replaced
  // Original: toast({
        title: "Copy Failed",
        description: "Failed to copy link to clipboard.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Copy Failed",
        description: "Failed to copy link to clipboard.",
        variant: "destructive"
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-2xl font-semibold">Multi-Source CER</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label htmlFor="ndcCodes" className="text-sm font-medium">NDC Codes (comma-separated)</label>
            <Input 
              id="ndcCodes"
              placeholder="e.g. 12345-678-90, 12345-678-91" 
              value={ndcCodes} 
              onChange={e => setNdcCodes(e.target.value)} 
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="deviceCodes" className="text-sm font-medium">Device Codes (comma-separated)</label>
            <Input 
              id="deviceCodes"
              placeholder="e.g. K123456, K789012" 
              value={deviceCodes} 
              onChange={e => setDeviceCodes(e.target.value)} 
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="multiPeriods" className="text-sm font-medium">Time Periods</label>
            <Input 
              id="multiPeriods"
              type="number" 
              min={1} 
              max={12} 
              value={periods} 
              onChange={e => setPeriods(parseInt(e.target.value) || 6)} 
            />
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={fetchMulti} 
            disabled={loading || (!ndcCodes && !deviceCodes)}
            className="gap-2"
          >
            {loading ? <Spinner size="sm" /> : 'Generate'}
          </Button>
          
          <Button 
            variant="outline" 
            onClick={() => window.open('/api/narrative/multi/pdf', '_blank')} 
            disabled={!narrative}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            PDF
          </Button>
          
          <Button 
            variant="outline" 
            onClick={exportCSVMulti} 
            disabled={!panels.length}
            className="gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            CSV
          </Button>
          
          <Button 
            variant="ghost" 
            onClick={shareLinkMulti}
            className="gap-2"
          >
            <Share2 className="w-4 h-4" />
            Share
          </Button>
        </div>
        
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 rounded-md border border-red-200 dark:border-red-800">
            <p>{error}</p>
          </div>
        )}
        
        {panels.map((entry, idx) => (
          <Card key={idx} className="mb-4">
            <CardHeader>
              <h3 className="font-bold">{entry.source}: {entry.product_code}</h3>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart 
                  data={Object.entries(entry.trend).map(([d, v]) => ({ date: d, value: v }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#ccc" strokeOpacity={0.2} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: 'var(--foreground)' }} 
                    tickLine={{ stroke: 'var(--foreground)' }} 
                    axisLine={{ stroke: 'var(--foreground)', strokeOpacity: 0.3 }}
                  />
                  <YAxis 
                    tick={{ fill: 'var(--foreground)' }} 
                    tickLine={{ stroke: 'var(--foreground)' }} 
                    axisLine={{ stroke: 'var(--foreground)', strokeOpacity: 0.3 }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--background)', 
                      borderColor: 'var(--border)', 
                      color: 'var(--foreground)' 
                    }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="var(--primary)" 
                    activeDot={{ r: 6, stroke: 'var(--primary)', strokeWidth: 2, fill: 'var(--background)' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ))}
        
        {narrative && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }}
            className="mt-4"
          >
            <h3 className="text-lg font-semibold mb-2">Combined Narrative</h3>
            <ScrollArea className="h-48 p-4 bg-slate-50 dark:bg-slate-900 border border-gray-200 dark:border-gray-800 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm">{narrative}</pre>
            </ScrollArea>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}