import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, User, FileType, BarChart2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ExportLog {
  timestamp: string;
  user_id: string;
  protocol_id: string;
  report_type: string;
}

export default function ExportLogDashboard() {
  const [logs, setLogs] = useState<ExportLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<ExportLog[]>([]);
  const [userFilter, setUserFilter] = useState('');
  const [reportTypeFilter, setReportTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/log/exports');
        if (!res.ok) {
          throw new Error('Failed to fetch export logs');
        }
        const data = await res.json();
        setLogs(data.reverse());
        setFilteredLogs(data.reverse());
      } catch (error) {
        console.error('Error fetching export logs:', error);
        // toast call replaced
  // Original: toast({
          title: 'Error',
          description: 'Failed to load export logs. Please try again later.',
          variant: 'destructive',
        })
  console.log('Toast would show:', {
          title: 'Error',
          description: 'Failed to load export logs. Please try again later.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchLogs();
  }, [toast]);

  useEffect(() => {
    // Apply filters when filter state changes
    let result = [...logs];
    
    if (userFilter) {
      result = result.filter(log => 
        log.user_id.toLowerCase().includes(userFilter.toLowerCase())
      );
    }
    
    if (reportTypeFilter) {
      result = result.filter(log => 
        log.report_type.toLowerCase().includes(reportTypeFilter.toLowerCase())
      );
    }
    
    setFilteredLogs(result);
  }, [logs, userFilter, reportTypeFilter]);

  // Calculate stats
  const uniqueUsers = new Set(logs.map(log => log.user_id)).size;
  const uniqueProtocols = new Set(logs.map(log => log.protocol_id)).size;
  const reportTypes = [...new Set(logs.map(log => log.report_type))];

  return (
    <div className="space-y-6">
      <div className="flex flex-col">
        <h1 className="text-2xl font-bold">Export Log Dashboard</h1>
        <p className="text-muted-foreground">
          Track all intelligence reports generated and downloaded by users
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Exports</CardTitle>
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{logs.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueUsers}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Protocols</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueProtocols}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Report Types</CardTitle>
            <FileType className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportTypes.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="user-filter">Filter by User</Label>
          <Input
            id="user-filter"
            placeholder="Enter user ID or email"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="report-filter">Filter by Report Type</Label>
          <Input
            id="report-filter"
            placeholder="Enter report type"
            value={reportTypeFilter}
            onChange={(e) => setReportTypeFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Report Type Tags */}
      <div className="flex flex-wrap gap-2">
        {reportTypes.map((type) => (
          <Badge 
            key={type} 
            variant="outline" 
            className="cursor-pointer hover:bg-primary/10"
            onClick={() => setReportTypeFilter(type)}
          >
            {type}
          </Badge>
        ))}
        {reportTypes.length > 0 && (
          <Badge 
            variant="outline" 
            className="cursor-pointer hover:bg-primary/10"
            onClick={() => setReportTypeFilter('')}
          >
            Clear
          </Badge>
        )}
      </div>

      {/* Export Logs */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Export History</h2>
        
        {loading ? (
          <div className="py-8 text-center">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-muted-foreground mt-2">Loading export logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground">No export logs found.</p>
            </CardContent>
          </Card>
        ) : (
          filteredLogs.map((log, i) => (
            <Card key={i}>
              <CardContent className="p-4 grid md:grid-cols-4 gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">User ID</p>
                  <p className="font-medium truncate">{log.user_id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Protocol ID</p>
                  <p className="font-medium truncate">{log.protocol_id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Report Type</p>
                  <p className="font-medium">{log.report_type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Timestamp</p>
                  <p className="font-medium">{new Date(log.timestamp).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}