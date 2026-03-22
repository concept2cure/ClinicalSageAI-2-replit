import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  ReferenceLine,
  BarChart,
  Bar,
} from 'recharts';
import {
import { toast } from '@/hooks/use-toast';
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  Settings,
  RefreshCw,
  Download,
  Bell,
  Eye,
  Activity,
  Target,
  BarChart3,
  AlertCircle,
} from 'lucide-react';

const SystemSuitabilityTrending = ({ methodId, onClose }) => {
  const [trendingData, setTrendingData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [selectedParameter, setSelectedParameter] = useState('retentionTime');
  const [timeframe, setTimeframe] = useState('30');
  const [loading, setLoading] = useState(true);
  const [addingRun, setAddingRun] = useState(false);
  const [newRunData, setNewRunData] = useState({});

  // System suitability parameters configuration
  const parameters = {
    retentionTime: { label: 'Retention Time (min)', color: '#6a9bcc', unit: 'min' },
    theoreticalPlates: { label: 'Theoretical Plates', color: '#788c5d', unit: '' },
    tailingFactor: { label: 'Tailing Factor', color: '#f59e0b', unit: '' },
    resolution: { label: 'Resolution', color: '#ef4444', unit: '' },
    peakArea: { label: 'Peak Area', color: '#6a9bcc', unit: 'counts' },
    rsdArea: { label: 'Area RSD (%)', color: '#d97757', unit: '%' },
    rsdRetention: { label: 'Retention RSD (%)', color: '#06b6d4', unit: '%' },
  };

  useEffect(() => {
    fetchTrendingData();
    fetchAlerts();

    // Set up auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchTrendingData();
      fetchAlerts();
    }, 30000);

    return () => clearInterval(interval);
  }, [methodId, timeframe]);

  const fetchTrendingData = async () => {
    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const headers = {
        'x-tenant-id': currentOrgId,
        'Content-Type': 'application/json',
      };

      const response = await fetch(
        `/api/analytical/methods/${methodId}/trending?timeframe=${timeframe}`,
        { headers }
      );
      const data = await response.json();

      // Format data for charts
      const formattedRuns = data.runs.map((run, index) => ({
        ...run,
        date: new Date(run.runTime).toLocaleDateString(),
        dateTime: new Date(run.runTime),
        runNumber: index + 1,
      }));

      setTrendingData({
        ...data,
        runs: formattedRuns,
      });
    } catch (error) {
      console.error('Error fetching trending data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAlerts = async () => {
    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const headers = {
        'x-tenant-id': currentOrgId,
        'Content-Type': 'application/json',
      };

      const response = await fetch(`/api/analytical/methods/${methodId}/alerts`, { headers });
      const data = await response.json();
      setAlerts(data.alerts || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  };

  const addSystemSuitabilityRun = async () => {
    try {
      setAddingRun(true);
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const headers = {
        'x-tenant-id': currentOrgId,
        'x-user-name': 'Current User',
        'Content-Type': 'application/json',
      };

      const response = await fetch(`/api/analytical/methods/${methodId}/runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify(newRunData),
      });

      if (response.ok) {
        const result = await response.json();

        // Show alerts if any were generated
        if (result.alerts && result.alerts.length > 0) {
          toast({ title: `Run added with ${result.alerts.length} alerts generated!` });
        } else {
          toast({ title: 'System suitability run added successfully!' });
        }

        // Refresh data
        await fetchTrendingData();
        await fetchAlerts();

        // Reset form
        setNewRunData({});
      }
    } catch (error) {
      console.error('Error adding run:', error);
      toast({ title: 'Failed to add system suitability run' });
    } finally {
      setAddingRun(false);
    }
  };

  const getParameterTrend = param => {
    if (!trendingData?.statistics?.[param]) return null;
    return trendingData.statistics[param].trend;
  };

  const getParameterStatus = param => {
    if (!trendingData?.runs) return 'UNKNOWN';

    const latestRun = trendingData.runs[trendingData.runs.length - 1];
    if (!latestRun) return 'UNKNOWN';

    const limits = trendingData.controlLimits?.[param];
    if (!limits) return 'UNKNOWN';

    const value = parseFloat(latestRun[param]);

    if (limits.lower && value < limits.lower) return 'OUT_OF_SPEC';
    if (limits.upper && value > limits.upper) return 'OUT_OF_SPEC';

    return 'IN_SPEC';
  };

  const renderParameterChart = () => {
    if (!trendingData?.runs) return null;

    const param = parameters[selectedParameter];
    const controlLimits = trendingData.controlLimits?.[selectedParameter];

    return (
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={trendingData.runs} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="runNumber"
            label={{ value: 'Run Number', position: 'insideBottom', offset: -10 }}
          />
          <YAxis label={{ value: `${param.label}`, angle: -90, position: 'insideLeft' }} />
          <Tooltip
            labelFormatter={value => `Run #${value}`}
            formatter={value => [value, param.label]}
          />
          <Legend />

          {/* Control limits */}
          {controlLimits?.upper && (
            <ReferenceLine
              y={controlLimits.upper}
              stroke="red"
              strokeDasharray="5 5"
              label="Upper Limit"
            />
          )}
          {controlLimits?.lower && (
            <ReferenceLine
              y={controlLimits.lower}
              stroke="red"
              strokeDasharray="5 5"
              label="Lower Limit"
            />
          )}
          {controlLimits?.target && (
            <ReferenceLine
              y={controlLimits.target}
              stroke="green"
              strokeDasharray="2 2"
              label="Target"
            />
          )}

          {/* Data line with color coding */}
          <Line
            type="monotone"
            dataKey={selectedParameter}
            stroke={param.color}
            strokeWidth={2}
            dot={props => {
              const run = trendingData.runs[props.payload?.runNumber - 1];
              const status = run?.status || 'PASSED';
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={4}
                  fill={status === 'OUT_OF_TREND' ? '#ef4444' : param.color}
                  stroke="#fff"
                  strokeWidth={2}
                />
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  const renderControlChart = () => {
    if (!trendingData?.runs) return null;

    const data = trendingData.runs.map((run, index) => ({
      runNumber: index + 1,
      value: parseFloat(run[selectedParameter]),
      status: run.status,
      upperLimit: trendingData.controlLimits?.[selectedParameter]?.upper,
      lowerLimit: trendingData.controlLimits?.[selectedParameter]?.lower,
      target: trendingData.controlLimits?.[selectedParameter]?.target,
    }));

    return (
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart data={data} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="runNumber" type="number" domain={['dataMin', 'dataMax']} />
          <YAxis dataKey="value" />
          <Tooltip
            formatter={(value, name) => [value, parameters[selectedParameter].label]}
            labelFormatter={label => `Run #${label}`}
          />

          <Scatter dataKey="value" fill="#6a9bcc" />

          {/* Control limits lines */}
          {data[0]?.upperLimit && (
            <ReferenceLine y={data[0].upperLimit} stroke="red" strokeDasharray="5 5" />
          )}
          {data[0]?.lowerLimit && (
            <ReferenceLine y={data[0].lowerLimit} stroke="red" strokeDasharray="5 5" />
          )}
          {data[0]?.target && (
            <ReferenceLine y={data[0].target} stroke="green" strokeDasharray="2 2" />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    );
  };

  const getSeverityColor = severity => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-600';
      case 'HIGH':
        return 'bg-orange-600';
      case 'MEDIUM':
        return 'bg-yellow-600';
      default:
        return 'bg-gray-600';
    }
  };

  const getTrendIcon = trend => {
    switch (trend) {
      case 'INCREASING':
        return <TrendingUp className="h-4 w-4 text-blue-600" />;
      case 'DECREASING':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p>Loading trending data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            System Suitability Trending
          </h2>
          <p className="text-gray-600">Real-time monitoring and analytics for method performance</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchTrendingData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <Bell className="h-5 w-5" />
              Active Alerts ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.map(alert => (
                <Alert key={alert.id} className="border-orange-300">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="flex items-center justify-between">
                    <span>{alert.type.replace('_', ' ')}</span>
                    <Badge className={getSeverityColor(alert.severity)}>{alert.severity}</Badge>
                  </AlertTitle>
                  <AlertDescription>{alert.message}</AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Object.entries(parameters).map(([key, param]) => {
          const stats = trendingData?.statistics?.[key];
          const trend = getParameterTrend(key);
          const status = getParameterStatus(key);

          return (
            <Card
              key={key}
              className={`cursor-pointer transition-all ${
                selectedParameter === key ? 'ring-2 ring-blue-500 bg-blue-50' : ''
              }`}
              onClick={() => setSelectedParameter(key)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-gray-600">{param.label}</div>
                  {getTrendIcon(trend)}
                </div>
                <div className="text-2xl font-bold mb-1">
                  {stats?.mean || 'N/A'}
                  <span className="text-sm font-normal text-gray-500 ml-1">{param.unit}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">CV: {stats?.cv || 'N/A'}%</span>
                  <Badge
                    variant={status === 'IN_SPEC' ? 'default' : 'destructive'}
                    className="text-xs"
                  >
                    {status === 'IN_SPEC' ? 'In Spec' : 'Out of Spec'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Trending Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {parameters[selectedParameter]?.label} Trending
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{trendingData?.runs?.length || 0} runs</Badge>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>{renderParameterChart()}</CardContent>
      </Card>

      {/* Add New Run */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Add System Suitability Run
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label>Theoretical Plates</Label>
              <Input
                type="number"
                placeholder="12000"
                value={newRunData.theoreticalPlates || ''}
                onChange={e =>
                  setNewRunData(prev => ({ ...prev, theoreticalPlates: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Tailing Factor</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="1.2"
                value={newRunData.tailingFactor || ''}
                onChange={e => setNewRunData(prev => ({ ...prev, tailingFactor: e.target.value }))}
              />
            </div>
            <div>
              <Label>Resolution</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="5.0"
                value={newRunData.resolution || ''}
                onChange={e => setNewRunData(prev => ({ ...prev, resolution: e.target.value }))}
              />
            </div>
            <div>
              <Label>Retention Time (min)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="8.5"
                value={newRunData.retentionTime || ''}
                onChange={e => setNewRunData(prev => ({ ...prev, retentionTime: e.target.value }))}
              />
            </div>
            <div>
              <Label>Area RSD (%)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="1.0"
                value={newRunData.rsdArea || ''}
                onChange={e => setNewRunData(prev => ({ ...prev, rsdArea: e.target.value }))}
              />
            </div>
            <div>
              <Label>Retention RSD (%)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.5"
                value={newRunData.rsdRetention || ''}
                onChange={e => setNewRunData(prev => ({ ...prev, rsdRetention: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Operator</Label>
              <Input
                placeholder="Analyst Name"
                value={newRunData.operator || ''}
                onChange={e => setNewRunData(prev => ({ ...prev, operator: e.target.value }))}
              />
            </div>
            <div>
              <Label>Instrument</Label>
              <Input
                placeholder="HPLC-001"
                value={newRunData.instrument || ''}
                onChange={e => setNewRunData(prev => ({ ...prev, instrument: e.target.value }))}
              />
            </div>
            <div className="md:col-span-3">
              <Label>Comments</Label>
              <Textarea
                placeholder="Any observations or notes..."
                value={newRunData.comments || ''}
                onChange={e => setNewRunData(prev => ({ ...prev, comments: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={addSystemSuitabilityRun} disabled={addingRun}>
              {addingRun ? 'Adding...' : 'Add Run'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemSuitabilityTrending;
