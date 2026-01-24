import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useToast } from '../hooks/useToast';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Sankey,
  Treemap,
  RadialBarChart,
  RadialBar,
} from 'recharts';
import {
  Network,
  HeatMapGrid,
  Choropleth,
  GeoFeature,
  StreamGraph,
  Sunburst,
  ParallelCoordinates,
  CirclePacking,
  Marimekko,
  Candlestick,
  StackedAreaChart,
  TreemapChart,
} from '../components/visualization';
import {
  DashboardLayout,
  WidgetContainer,
  GridLayout,
  KPITile,
  SectionMatrix,
  StatusRibbon,
  SubmissionTimeline,
  DataTable,
  FilterBar,
  ExportMenu,
  UserActivityCard,
  RegulatoryIntelligencePanel,
  PredictionCard,
  DocumentQualityMatrix,
} from '../components/analytics';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  AlertCircle,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileText,
  Filter,
  BarChart2,
  PieChart as PieChartIcon,
  Plus,
  Save,
  Search,
  Settings,
  Share2,
  TrendingUp,
  User,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle,
  Eye,
  ExternalLink,
  RefreshCcw,
  Calendar,
  Sliders,
  BarChart4,
  Map,
  RadialBar as RadialBarIcon,
} from 'lucide-react';
import {
  Tooltip as ShadTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { Skeleton } from '../components/ui/skeleton';
import { Switch } from '../components/ui/switch';
import { Progress } from '../components/ui/progress';
import { Calendar as CalendarComponent } from '../components/ui/calendar';

// Theme colors with enterprise palette
const CHART_COLORS = {
  primary: '#FF1493', // Hot Pink
  secondary: '#FFB6C1',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
  dark: '#1F2937',
  light: '#F9FAFB',
};

// Extended palette for multi-series charts
const EXTENDED_COLORS = [
  '#FF1493', // Hot Pink
  '#9333EA', // Purple
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#64748B', // Slate
  '#EC4899', // Pink
  '#8B5CF6', // Violet
  '#0EA5E9', // Sky
  '#14B8A6', // Teal
  '#F97316', // Orange
];

// Analytics Dashboard Component
export default function AnalyticsDashboard() {
  const { dashboardType = 'overview' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State for selected filters and view options
  const [activeTab, setActiveTab] = useState(dashboardType);
  const [timeRange, setTimeRange] = useState('30days');
  const [filters, setFilters] = useState({});
  const [dashboardConfig, setDashboardConfig] = useState(null);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');
  const [isDefaultDashboard, setIsDefaultDashboard] = useState(true);

  // Handle tab change
  useEffect(() => {
    if (activeTab !== dashboardType) {
      navigate(`/analytics/${activeTab}`);
    }
  }, [activeTab, dashboardType, navigate]);

  // Reset dashboard config when tab changes
  useEffect(() => {
    setDashboardConfig(null);
    setIsCustomizing(false);
  }, [dashboardType]);

  // Convert time range to actual dates
  const dateRange = useMemo(() => {
    const end = new Date();
    let start = new Date();

    switch (timeRange) {
      case '7days':
        start.setDate(end.getDate() - 7);
        break;
      case '30days':
        start.setDate(end.getDate() - 30);
        break;
      case '90days':
        start.setDate(end.getDate() - 90);
        break;
      case '1year':
        start.setFullYear(end.getFullYear() - 1);
        break;
      default:
        start.setDate(end.getDate() - 30);
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  }, [timeRange]);

  // Fetch dashboard configuration
  const {
    data: dashboardData,
    isLoading: isLoadingDashboard,
    error: dashboardError,
  } = useQuery({
    queryKey: ['/api/analytics/dashboard', activeTab],
    enabled: !dashboardConfig,
  });

  // Fetch analytics data based on dashboard type
  const {
    data: analyticsData,
    isLoading: isLoadingAnalytics,
    error: analyticsError,
  } = useQuery({
    queryKey: ['/api/analytics/data', activeTab, dateRange, filters],
    enabled: !!dashboardData,
  });

  // Save dashboard configuration
  const saveDashboardMutation = useMutation({
    mutationFn: async config => {
      // Would call API endpoint to save dashboard config
      const response = await fetch('/api/analytics/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error('Failed to save dashboard configuration');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Dashboard saved',
        description: 'Your dashboard configuration has been saved successfully',
        variant: 'success',
      });
      setShowSaveDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/dashboard'] });
    },
    onError: error => {
      toast({
        title: 'Error saving dashboard',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle save dashboard
  const handleSaveDashboard = () => {
    if (!newDashboardName.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a name for your dashboard',
        variant: 'destructive',
      });
      return;
    }

    saveDashboardMutation.mutate({
      dashboardType: activeTab,
      name: newDashboardName,
      layout: dashboardConfig?.layout || 'grid',
      widgets: dashboardConfig?.widgets || [],
      filters,
      isDefault: isDefaultDashboard,
    });
  };

  // Handle dashboard customization
  const handleAddWidget = widgetType => {
    if (!dashboardConfig) return;

    const newWidgets = [
      ...dashboardConfig.widgets,
      {
        type: widgetType,
        position: { x: 0, y: 0, w: 4, h: 6 },
      },
    ];

    setDashboardConfig({
      ...dashboardConfig,
      widgets: newWidgets,
    });
  };

  const handleRemoveWidget = index => {
    if (!dashboardConfig) return;

    const newWidgets = dashboardConfig.widgets.filter((_, i) => i !== index);

    setDashboardConfig({
      ...dashboardConfig,
      widgets: newWidgets,
    });
  };

  const handleWidgetResize = (index, size) => {
    if (!dashboardConfig) return;

    const newWidgets = [...dashboardConfig.widgets];
    newWidgets[index] = {
      ...newWidgets[index],
      position: {
        ...newWidgets[index].position,
        w: size.width,
        h: size.height,
      },
    };

    setDashboardConfig({
      ...dashboardConfig,
      widgets: newWidgets,
    });
  };

  const handleWidgetMove = (index, position) => {
    if (!dashboardConfig) return;

    const newWidgets = [...dashboardConfig.widgets];
    newWidgets[index] = {
      ...newWidgets[index],
      position: {
        ...newWidgets[index].position,
        x: position.x,
        y: position.y,
      },
    };

    setDashboardConfig({
      ...dashboardConfig,
      widgets: newWidgets,
    });
  };

  // Use data from the API or fallback to initial config
  useEffect(() => {
    if (dashboardData && !dashboardConfig) {
      setDashboardConfig(dashboardData.config);
    }
  }, [dashboardData, dashboardConfig]);

  // If data is loading, show skeleton
  if (isLoadingDashboard && !dashboardConfig) {
    return <DashboardSkeleton />;
  }

  // If there's an error, show error state
  if (dashboardError && !dashboardConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Error Loading Dashboard</h2>
        <p className="text-gray-600 mb-4">
          {dashboardError.message || 'An error occurred while loading the dashboard'}
        </p>
        <Button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/analytics/dashboard'] })}
        >
          <RefreshCcw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Dashboard Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Enterprise Analytics</h1>
              <p className="text-sm text-gray-500">Advanced insights for regulatory submissions</p>
            </div>

            <div className="flex items-center space-x-4">
              {/* Time Range Selector */}
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7days">Last 7 Days</SelectItem>
                  <SelectItem value="30days">Last 30 Days</SelectItem>
                  <SelectItem value="90days">Last 90 Days</SelectItem>
                  <SelectItem value="1year">Last Year</SelectItem>
                </SelectContent>
              </Select>

              {/* Filter Button */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="flex items-center">
                    <Filter className="mr-2 h-4 w-4" />
                    Filters
                    {Object.keys(filters).length > 0 && (
                      <Badge className="ml-2 bg-pink-600">{Object.keys(filters).length}</Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[400px] sm:w-[540px]">
                  <SheetHeader>
                    <SheetTitle>Dashboard Filters</SheetTitle>
                    <SheetDescription>
                      Apply filters to customize your analytics view
                    </SheetDescription>
                  </SheetHeader>

                  <div className="mt-6 space-y-6">
                    {/* Filter form would go here - specific to each dashboard type */}
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="submission_type">Submission Type</Label>
                        <Select
                          onValueChange={value =>
                            setFilters({ ...filters, submission_type: value })
                          }
                          value={filters.submission_type || ''}
                        >
                          <SelectTrigger id="submission_type">
                            <SelectValue placeholder="All Submission Types" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">All Types</SelectItem>
                            <SelectItem value="IND">IND</SelectItem>
                            <SelectItem value="NDA">NDA</SelectItem>
                            <SelectItem value="BLA">BLA</SelectItem>
                            <SelectItem value="MAA">MAA</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="authority">Regulatory Authority</Label>
                        <Select
                          onValueChange={value => setFilters({ ...filters, authority: value })}
                          value={filters.authority || ''}
                        >
                          <SelectTrigger id="authority">
                            <SelectValue placeholder="All Authorities" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">All Authorities</SelectItem>
                            <SelectItem value="FDA">FDA</SelectItem>
                            <SelectItem value="EMA">EMA</SelectItem>
                            <SelectItem value="PMDA">PMDA</SelectItem>
                            <SelectItem value="NMPA">NMPA</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="status">Status</Label>
                        <Select
                          onValueChange={value => setFilters({ ...filters, status: value })}
                          value={filters.status || ''}
                        >
                          <SelectTrigger id="status">
                            <SelectValue placeholder="All Statuses" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">All Statuses</SelectItem>
                            <SelectItem value="DRAFT">Draft</SelectItem>
                            <SelectItem value="IN_REVIEW">In Review</SelectItem>
                            <SelectItem value="APPROVED">Approved</SelectItem>
                            <SelectItem value="SUBMITTED">Submitted</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="date_range">Custom Date Range</Label>
                        <div className="flex items-center space-x-2 mt-1.5">
                          <input
                            type="date"
                            value={filters.start_date || ''}
                            onChange={e => setFilters({ ...filters, start_date: e.target.value })}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          <span className="text-sm text-gray-500">to</span>
                          <input
                            type="date"
                            value={filters.end_date || ''}
                            onChange={e => setFilters({ ...filters, end_date: e.target.value })}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between pt-4 border-t">
                      <Button variant="outline" onClick={() => setFilters({})}>
                        Reset Filters
                      </Button>
                      <Button
                        onClick={() => {
                          // Apply filters
                          toast({
                            title: 'Filters Applied',
                            description: `${Object.keys(filters).length} filters are now active`,
                          });
                        }}
                      >
                        Apply Filters
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Export Button */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Export Options</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      toast({
                        title: 'Exporting to PDF',
                        description: 'Your dashboard is being exported to PDF',
                      });
                    }}
                  >
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      toast({
                        title: 'Exporting to Excel',
                        description: 'Your dashboard data is being exported to Excel',
                      });
                    }}
                  >
                    Export to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      toast({
                        title: 'Exporting Chart Images',
                        description: 'Your charts are being exported as images',
                      });
                    }}
                  >
                    Export Charts as Images
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      toast({
                        title: 'Exporting to CSV',
                        description: 'Your dashboard data is being exported to CSV',
                      });
                    }}
                  >
                    Export Data as CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Dashboard Actions */}
              <Button
                variant={isCustomizing ? 'default' : 'outline'}
                onClick={() => setIsCustomizing(!isCustomizing)}
              >
                <Settings className="mr-2 h-4 w-4" />
                {isCustomizing ? 'Done' : 'Customize'}
              </Button>

              {isCustomizing && (
                <Button onClick={() => setShowSaveDialog(true)}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Dashboard
                </Button>
              )}
            </div>
          </div>

          {/* Dashboard Tabs */}
          <Tabs
            defaultValue={activeTab}
            value={activeTab}
            onValueChange={setActiveTab}
            className="mt-4"
          >
            <TabsList className="w-full md:w-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="submission">Submission Analytics</TabsTrigger>
              <TabsTrigger value="regulatory">Regulatory Intelligence</TabsTrigger>
              <TabsTrigger value="user">User Productivity</TabsTrigger>
              <TabsTrigger value="system">System Performance</TabsTrigger>
              <TabsTrigger value="predictive">Predictive Analytics</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        {/* Dashboard Title + Description */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">{getDashboardTitle(activeTab)}</h2>
          <p className="text-sm text-gray-500">{getDashboardDescription(activeTab)}</p>
        </div>

        {/* Loading State */}
        {isLoadingAnalytics && !analyticsData && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-[180px] w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Error State */}
        {analyticsError && !analyticsData && (
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="text-red-700 flex items-center">
                <AlertCircle className="mr-2 h-5 w-5" />
                Error Loading Analytics Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-red-600">
                {analyticsError.message || 'An error occurred while loading analytics data'}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/analytics/data'] })}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Dashboard Grid */}
        {dashboardConfig && (
          <div
            className={`grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-6 ${isCustomizing ? 'border-2 border-dashed border-pink-300 p-4 rounded-lg' : ''}`}
          >
            {renderDashboardWidgets()}
          </div>
        )}
      </main>

      {/* Widget Library - Only shown when customizing */}
      {isCustomizing && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              className="fixed right-6 bottom-6 rounded-full shadow-lg h-12 w-12 p-0"
              size="icon"
            >
              <Plus className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[360px] sm:w-[480px]">
            <SheetHeader>
              <SheetTitle>Widget Library</SheetTitle>
              <SheetDescription>Drag and drop widgets to your dashboard</SheetDescription>
            </SheetHeader>

            <ScrollArea className="h-[calc(100vh-120px)] mt-6">
              <div className="space-y-6">
                <div>
                  <h3 className="font-medium text-sm mb-3">KPI Widgets</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {getAvailableWidgets().kpi.map(widget => (
                      <div
                        key={widget.type}
                        className="border rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => handleAddWidget(widget.type)}
                      >
                        <div className="flex items-center justify-center bg-pink-100 text-pink-600 w-10 h-10 rounded-lg mb-2">
                          {widget.icon}
                        </div>
                        <h4 className="font-medium text-sm">{widget.name}</h4>
                        <p className="text-xs text-gray-500">{widget.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-sm mb-3">Charts & Visualizations</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {getAvailableWidgets().charts.map(widget => (
                      <div
                        key={widget.type}
                        className="border rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => handleAddWidget(widget.type)}
                      >
                        <div className="flex items-center justify-center bg-pink-100 text-pink-600 w-10 h-10 rounded-lg mb-2">
                          {widget.icon}
                        </div>
                        <h4 className="font-medium text-sm">{widget.name}</h4>
                        <p className="text-xs text-gray-500">{widget.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-sm mb-3">Data Tables & Lists</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {getAvailableWidgets().tables.map(widget => (
                      <div
                        key={widget.type}
                        className="border rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => handleAddWidget(widget.type)}
                      >
                        <div className="flex items-center justify-center bg-pink-100 text-pink-600 w-10 h-10 rounded-lg mb-2">
                          {widget.icon}
                        </div>
                        <h4 className="font-medium text-sm">{widget.name}</h4>
                        <p className="text-xs text-gray-500">{widget.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-sm mb-3">Advanced Analytics</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {getAvailableWidgets().advanced.map(widget => (
                      <div
                        key={widget.type}
                        className="border rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => handleAddWidget(widget.type)}
                      >
                        <div className="flex items-center justify-center bg-pink-100 text-pink-600 w-10 h-10 rounded-lg mb-2">
                          {widget.icon}
                        </div>
                        <h4 className="font-medium text-sm">{widget.name}</h4>
                        <p className="text-xs text-gray-500">{widget.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      )}

      {/* Save Dashboard Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Dashboard</DialogTitle>
            <DialogDescription>
              Create a customized dashboard that you can access later
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="dashboard-name">Dashboard Name</Label>
              <Input
                id="dashboard-name"
                placeholder="My Custom Dashboard"
                value={newDashboardName}
                onChange={e => setNewDashboardName(e.target.value)}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="default-dashboard"
                checked={isDefaultDashboard}
                onCheckedChange={setIsDefaultDashboard}
              />
              <Label htmlFor="default-dashboard">
                Set as default {getDashboardTitle(activeTab)} dashboard
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDashboard} disabled={saveDashboardMutation.isPending}>
              {saveDashboardMutation.isPending ? 'Saving...' : 'Save Dashboard'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // Helper function to render dashboard widgets
  function renderDashboardWidgets() {
    if (!dashboardConfig || !dashboardConfig.widgets) return null;

    return dashboardConfig.widgets.map((widget, index) => {
      const colSpan = widget.position.w || 4;
      const rowSpan = widget.position.h || 6;

      // Convert to tailwind grid classes
      const colSpanClass = `md:col-span-${Math.min(colSpan, 6)} xl:col-span-${Math.min(colSpan * 2, 12)}`;

      // For height use a fixed height based on row span
      const heightClass = getHeightClass(rowSpan);

      return (
        <div
          key={`${widget.type}-${index}`}
          className={`${colSpanClass} ${isCustomizing ? 'ring-2 ring-pink-200 ring-inset' : ''}`}
        >
          <Card className={`overflow-hidden h-full ${heightClass}`}>
            {isCustomizing && (
              <div className="absolute top-0 right-0 p-1 flex items-center space-x-1 bg-white border border-gray-200 rounded-bl-lg z-10">
                <TooltipProvider>
                  <ShadTooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleRemoveWidget(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Remove Widget</p>
                    </TooltipContent>
                  </ShadTooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <ShadTooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          handleWidgetResize(index, {
                            width: Math.min(widget.position.w + 1, 6),
                            height: widget.position.h,
                          })
                        }
                      >
                        <ArrowsExpand className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Increase Width</p>
                    </TooltipContent>
                  </ShadTooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <ShadTooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          handleWidgetResize(index, {
                            width: Math.max(widget.position.w - 1, 1),
                            height: widget.position.h,
                          })
                        }
                      >
                        <ArrowsContract className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Decrease Width</p>
                    </TooltipContent>
                  </ShadTooltip>
                </TooltipProvider>
              </div>
            )}

            {renderWidget(widget, index)}
          </Card>
        </div>
      );
    });
  }

  // Helper function to render widget based on type
  function renderWidget(widget, index) {
    // Mock data for different widget types
    const data = getWidgetData(widget.type);

    switch (widget.type) {
      // KPI widgets
      case 'submission_status':
        return (
          <>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                Submission Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {data.map((item, i) => (
                  <div key={i} className="flex flex-col">
                    <span className="text-3xl font-bold text-gray-900">{item.count}</span>
                    <span className="text-sm text-gray-500">{item.status}</span>
                    <Progress
                      value={item.percentage}
                      className="h-1.5 mt-1.5"
                      indicatorClassName={getColorClass(item.status)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </>
        );

      case 'completion_rate':
        return (
          <>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <CheckCircle className="mr-2 h-5 w-5" />
                Submission Completion Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center h-full">
                <div className="relative h-40 w-40">
                  <CircularProgressIndicator
                    value={data.completionPercentage}
                    size={160}
                    strokeWidth={12}
                    color={CHART_COLORS.primary}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-gray-900">
                      {data.completionPercentage}%
                    </span>
                    <span className="text-sm text-gray-500">Completion</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 w-full">
                  <div className="text-center">
                    <div className="text-xl font-bold text-gray-900">{data.sectionsComplete}</div>
                    <div className="text-xs text-gray-500">Complete</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-gray-900">{data.sectionsInProgress}</div>
                    <div className="text-xs text-gray-500">In Progress</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-gray-900">{data.sectionsNotStarted}</div>
                    <div className="text-xs text-gray-500">Not Started</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </>
        );

      case 'time_saved':
        return (
          <>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Clock className="mr-2 h-5 w-5" />
                Time Saved Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center">
                <div className="flex items-center justify-center mb-4">
                  <div className="text-4xl font-bold text-gray-900">
                    {data.timeSavedPercentage}%
                  </div>
                  <div className="flex flex-col ml-4">
                    <span className="text-sm font-medium">Time Reduction</span>
                    <span className="text-xs text-gray-500">vs. Traditional Process</span>
                  </div>
                </div>
                <div className="w-full mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Traditional</span>
                    <span>IND Wizard</span>
                  </div>
                  <div className="relative h-6 bg-gray-100 rounded-full">
                    <div
                      className="absolute h-6 left-0 bg-pink-600 rounded-full"
                      style={{ width: `${100 - data.timeSavedPercentage}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{data.traditionalDays} days</span>
                    <span>{data.newDays} days</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 w-full mt-2">
                  <div className="border rounded-lg p-3">
                    <div className="text-xs text-gray-500">Time Saved</div>
                    <div className="text-xl font-bold">{data.daysSaved} days</div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-xs text-gray-500">Cost Reduction</div>
                    <div className="text-xl font-bold">${data.costSavings}k</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </>
        );

      case 'quality_score':
        return (
          <>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Zap className="mr-2 h-5 w-5" />
                Submission Quality Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center">
                <div className="flex items-baseline mb-4">
                  <span className="text-5xl font-bold text-gray-900">{data.overallScore}</span>
                  <span className="text-lg text-gray-500 ml-1">/100</span>
                </div>
                <div className="w-full space-y-3 mt-2">
                  {data.components.map((component, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{component.name}</span>
                        <span className="font-medium">{component.score}/100</span>
                      </div>
                      <Progress
                        value={component.score}
                        className="h-2"
                        indicatorClassName={getQualityScoreColor(component.score)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </>
        );

      // Chart widgets
      case 'submission_timeline':
        return (
          <>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <TrendingUp className="mr-2 h-5 w-5" />
                Submission Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[300px] w-full p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSubmissions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.8} />
                        <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="submissions"
                      stroke={CHART_COLORS.primary}
                      fillOpacity={1}
                      fill="url(#colorSubmissions)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </>
        );

      case 'completion_by_module':
        return (
          <>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <BarChart2 className="mr-2 h-5 w-5" />
                Completion by Module
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[300px] w-full p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="complete" stackId="a" fill={CHART_COLORS.success} />
                    <Bar dataKey="inProgress" stackId="a" fill={CHART_COLORS.warning} />
                    <Bar dataKey="notStarted" stackId="a" fill={CHART_COLORS.dark} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </>
        );

      case 'authority_performance':
        return (
          <>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Activity className="mr-2 h-5 w-5" />
                Regulatory Authority Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[300px] w-full p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis dataKey="name" type="category" width={60} />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="firstCycleApproval"
                      name="First Cycle %"
                      fill={CHART_COLORS.success}
                    />
                    <Bar
                      dataKey="reviewTime"
                      name="Avg. Review Time (days)"
                      fill={CHART_COLORS.primary}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </>
        );

      case 'user_activity':
        return (
          <>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <User className="mr-2 h-5 w-5" />
                User Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[300px] w-full p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" orientation="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="activeUsers"
                      name="Active Users"
                      stroke={CHART_COLORS.primary}
                      activeDot={{ r: 8 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="editsPerUser"
                      name="Edits per User"
                      stroke={CHART_COLORS.info}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </>
        );

      case 'section_matrix':
        // This is an advanced visualization specific to regulatory submissions
        return (
          <>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                Section Status Matrix
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-auto">
              <div className="min-w-[600px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium">Section</th>
                      <th className="py-2 px-3 text-left font-medium">Status</th>
                      <th className="py-2 px-3 text-left font-medium">Author</th>
                      <th className="py-2 px-3 text-left font-medium">Reviewer</th>
                      <th className="py-2 px-3 text-left font-medium">Completion</th>
                      <th className="py-2 px-3 text-left font-medium">Quality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((section, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="py-2 px-3 font-medium">
                          {section.code} - {section.title}
                        </td>
                        <td className="py-2 px-3">
                          <Badge className={getStatusBadgeClass(section.status)}>
                            {section.status}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">{section.author}</td>
                        <td className="py-2 px-3">{section.reviewer}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center space-x-2">
                            <Progress
                              value={section.completion}
                              className="h-2 w-24"
                              indicatorClassName={getQualityScoreColor(section.completion)}
                            />
                            <span className="text-xs">{section.completion}%</span>
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center space-x-2">
                            <Progress
                              value={section.quality}
                              className="h-2 w-24"
                              indicatorClassName={getQualityScoreColor(section.quality)}
                            />
                            <span className="text-xs">{section.quality}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </>
        );

      case 'prediction_success':
        return (
          <>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Zap className="mr-2 h-5 w-5" />
                Submission Success Prediction
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center">
                <div className="relative h-36 w-36 mb-4">
                  <CircularProgressIndicator
                    value={data.probability * 100}
                    size={144}
                    strokeWidth={12}
                    color={getProbabilityColor(data.probability)}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-gray-900">
                      {Math.round(data.probability * 100)}%
                    </span>
                    <span className="text-xs text-gray-500">Probability</span>
                  </div>
                </div>

                <div className="text-sm mb-4 text-center">{data.prediction}</div>

                <div className="w-full space-y-2">
                  <h4 className="text-sm font-medium">Key Factors</h4>
                  {data.factors.map((factor, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span>{factor.name}</span>
                      <div className="flex items-center">
                        <div className="h-2 w-20 bg-gray-200 rounded-full overflow-hidden mr-2">
                          <div
                            className={`h-full ${getFactorColor(factor.impact)}`}
                            style={{ width: `${Math.abs(factor.impact) * 100}%` }}
                          ></div>
                        </div>
                        <span className={factor.impact > 0 ? 'text-green-600' : 'text-red-600'}>
                          {factor.impact > 0 ? '+' : ''}
                          {factor.impact}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </>
        );

      case 'network_analysis':
        return (
          <>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Share2 className="mr-2 h-5 w-5" />
                Document Relationships Network
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <Share2 className="h-16 w-16 mx-auto mb-2 opacity-50" />
                <p>Network visualization would appear here</p>
                <p className="text-xs mt-1">
                  Showing document interdependencies and reference patterns
                </p>
              </div>
            </CardContent>
          </>
        );

      case 'regulatory_intelligence':
        return (
          <>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <AlertCircle className="mr-2 h-5 w-5" />
                Regulatory Intelligence
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px]">
                <div className="p-4 space-y-4">
                  {data.map((item, i) => (
                    <div
                      key={i}
                      className="border-l-4 pl-4 py-1"
                      style={{ borderColor: getImpactColor(item.impact) }}
                    >
                      <div className="flex justify-between items-start">
                        <h4 className="font-medium text-gray-900">{item.title}</h4>
                        <Badge variant="outline" className={getImpactBadgeClass(item.impact)}>
                          Impact: {item.impact}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{item.summary}</p>
                      <div className="flex items-center mt-2 text-xs text-gray-500 space-x-3">
                        <span>{item.date}</span>
                        <span>{item.authority}</span>
                        <a href="#" className="flex items-center text-pink-600 hover:underline">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View Source
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </>
        );

      // Default fallback
      default:
        return (
          <>
            <CardHeader>
              <CardTitle>{getWidgetTitle(widget.type)}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p>Widget {widget.type}</p>
                <p className="text-xs mt-1">Data visualization would appear here</p>
              </div>
            </CardContent>
          </>
        );
    }
  }

  // Helper functions to get data and styling
  function getHeightClass(rowSpan) {
    switch (rowSpan) {
      case 1:
        return 'h-[120px]';
      case 2:
        return 'h-[200px]';
      case 3:
        return 'h-[280px]';
      case 4:
        return 'h-[360px]';
      case 5:
        return 'h-[440px]';
      case 6:
        return 'h-[520px]';
      default:
        return 'h-[300px]';
    }
  }

  function getColorClass(status) {
    switch (status) {
      case 'Drafts':
        return 'bg-blue-500';
      case 'In Review':
        return 'bg-amber-500';
      case 'Completed':
        return 'bg-green-500';
      case 'Submitted':
        return 'bg-pink-600';
      default:
        return 'bg-gray-500';
    }
  }

  function getQualityScoreColor(score) {
    if (score >= 90) return 'bg-green-500';
    if (score >= 75) return 'bg-blue-500';
    if (score >= 60) return 'bg-amber-500';
    return 'bg-red-500';
  }

  function getStatusBadgeClass(status) {
    switch (status) {
      case 'Not Started':
        return 'bg-gray-500 text-white';
      case 'In Progress':
        return 'bg-blue-500 text-white';
      case 'In Review':
        return 'bg-amber-500 text-white';
      case 'Complete':
        return 'bg-green-500 text-white';
      case 'Needs Revision':
        return 'bg-red-500 text-white';
      case 'Approved':
        return 'bg-pink-600 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  }

  function getProbabilityColor(probability) {
    if (probability >= 0.8) return CHART_COLORS.success;
    if (probability >= 0.6) return CHART_COLORS.info;
    if (probability >= 0.4) return CHART_COLORS.warning;
    return CHART_COLORS.danger;
  }

  function getFactorColor(impact) {
    if (impact > 0) return 'bg-green-500';
    return 'bg-red-500';
  }

  function getImpactColor(impact) {
    switch (impact) {
      case 'High':
        return CHART_COLORS.danger;
      case 'Medium':
        return CHART_COLORS.warning;
      case 'Low':
        return CHART_COLORS.info;
      default:
        return CHART_COLORS.dark;
    }
  }

  function getImpactBadgeClass(impact) {
    switch (impact) {
      case 'High':
        return 'border-red-500 text-red-700';
      case 'Medium':
        return 'border-amber-500 text-amber-700';
      case 'Low':
        return 'border-blue-500 text-blue-700';
      default:
        return 'border-gray-500 text-gray-700';
    }
  }
}

// Helper Components
function ArrowsExpand({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 011.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 011.414-1.414L15 13.586V12a1 1 0 011-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ArrowsContract({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 011.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 011.414-1.414L15 13.586V12a1 1 0 011-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function X({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CircularProgressIndicator({
  value,
  size = 100,
  strokeWidth = 8,
  color = CHART_COLORS.primary,
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (value / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="transform -rotate-90"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#E5E7EB"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={circumference - progress}
        strokeLinecap="round"
      />
    </svg>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-56" />
            <div className="flex items-center space-x-4">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
            </div>
          </div>
          <div className="mt-4">
            <Skeleton className="h-10 w-full md:w-96" />
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6">
        <Skeleton className="h-10 w-72 mb-6" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[180px] w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}

// Utility functions
function getDashboardTitle(type) {
  switch (type) {
    case 'overview':
      return 'Dashboard Overview';
    case 'submission':
      return 'Submission Analytics';
    case 'regulatory':
      return 'Regulatory Intelligence';
    case 'user':
      return 'User Productivity';
    case 'system':
      return 'System Performance';
    case 'predictive':
      return 'Predictive Analytics';
    default:
      return 'Analytics Dashboard';
  }
}

function getDashboardDescription(type) {
  switch (type) {
    case 'overview':
      return 'Comprehensive overview of submissions, user activity, and regulatory performance';
    case 'submission':
      return 'Detailed analytics for submission completeness, quality, and timeline prediction';
    case 'regulatory':
      return 'Insights into regulatory authority performance and intelligence monitoring';
    case 'user':
      return 'Track user productivity, contributions, and efficiency metrics';
    case 'system':
      return 'Monitor system performance, usage patterns, and resource utilization';
    case 'predictive':
      return 'AI-powered predictions for submission success, review timelines, and optimization opportunities';
    default:
      return 'Enterprise-grade analytics for regulatory submissions';
  }
}

function getWidgetTitle(type) {
  // Convert from camelCase or snake_case to Title Case With Spaces
  return type
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

function getAvailableWidgets() {
  return {
    kpi: [
      {
        type: 'submission_status',
        name: 'Submission Status',
        description: 'Overview of submission status counts',
        icon: <FileText className="h-5 w-5" />,
      },
      {
        type: 'completion_rate',
        name: 'Completion Rate',
        description: 'Percentage of completed submission sections',
        icon: <CheckCircle className="h-5 w-5" />,
      },
      {
        type: 'time_saved',
        name: 'Time Saved',
        description: 'Time efficiency gains from automation',
        icon: <Clock className="h-5 w-5" />,
      },
      {
        type: 'quality_score',
        name: 'Quality Score',
        description: 'Overall quality metrics for submissions',
        icon: <Zap className="h-5 w-5" />,
      },
    ],
    charts: [
      {
        type: 'submission_timeline',
        name: 'Submission Timeline',
        description: 'Track submission volume over time',
        icon: <TrendingUp className="h-5 w-5" />,
      },
      {
        type: 'completion_by_module',
        name: 'Module Completion',
        description: 'Completion status by submission module',
        icon: <BarChart2 className="h-5 w-5" />,
      },
      {
        type: 'authority_performance',
        name: 'Authority Performance',
        description: 'Review metrics by regulatory authority',
        icon: <Activity className="h-5 w-5" />,
      },
      {
        type: 'user_activity',
        name: 'User Activity',
        description: 'Track user engagement and activity',
        icon: <User className="h-5 w-5" />,
      },
    ],
    tables: [
      {
        type: 'section_matrix',
        name: 'Section Matrix',
        description: 'Detailed status of all submission sections',
        icon: <FileText className="h-5 w-5" />,
      },
      {
        type: 'regulatory_intelligence',
        name: 'Regulatory Intelligence',
        description: 'Latest regulatory updates and guidance',
        icon: <AlertCircle className="h-5 w-5" />,
      },
    ],
    advanced: [
      {
        type: 'prediction_success',
        name: 'Success Prediction',
        description: 'AI prediction of submission acceptance',
        icon: <Zap className="h-5 w-5" />,
      },
      {
        type: 'network_analysis',
        name: 'Network Analysis',
        description: 'Document relationship visualization',
        icon: <Share2 className="h-5 w-5" />,
      },
    ],
  };
}

// Mock data for widgets
function getWidgetData(widgetType) {
  switch (widgetType) {
    case 'submission_status':
      return [
        { status: 'Drafts', count: 14, percentage: 70 },
        { status: 'In Review', count: 7, percentage: 35 },
        { status: 'Completed', count: 23, percentage: 85 },
        { status: 'Submitted', count: 18, percentage: 60 },
      ];

    case 'completion_rate':
      return {
        completionPercentage: 68,
        sectionsComplete: 17,
        sectionsInProgress: 5,
        sectionsNotStarted: 3,
      };

    case 'time_saved':
      return {
        timeSavedPercentage: 75,
        traditionalDays: 120,
        newDays: 30,
        daysSaved: 90,
        costSavings: 450,
      };

    case 'quality_score':
      return {
        overallScore: 87,
        components: [
          { name: 'Content Accuracy', score: 92 },
          { name: 'Regulatory Compliance', score: 88 },
          { name: 'Clarity & Structure', score: 85 },
          { name: 'Cross-References', score: 80 },
        ],
      };

    case 'submission_timeline':
      return [
        { month: 'Jan', submissions: 4 },
        { month: 'Feb', submissions: 3 },
        { month: 'Mar', submissions: 5 },
        { month: 'Apr', submissions: 7 },
        { month: 'May', submissions: 5 },
        { month: 'Jun', submissions: 9 },
        { month: 'Jul', submissions: 8 },
        { month: 'Aug', submissions: 11 },
        { month: 'Sep', submissions: 13 },
        { month: 'Oct', submissions: 15 },
        { month: 'Nov', submissions: 12 },
        { month: 'Dec', submissions: 14 },
      ];

    case 'completion_by_module':
      return [
        { name: 'Module 1', complete: 8, inProgress: 2, notStarted: 0 },
        { name: 'Module 2', complete: 6, inProgress: 3, notStarted: 1 },
        { name: 'Module 3', complete: 5, inProgress: 4, notStarted: 3 },
        { name: 'Module 4', complete: 4, inProgress: 2, notStarted: 4 },
        { name: 'Module 5', complete: 3, inProgress: 5, notStarted: 5 },
      ];

    case 'authority_performance':
      return [
        { name: 'FDA', firstCycleApproval: 78, reviewTime: 90 },
        { name: 'EMA', firstCycleApproval: 82, reviewTime: 85 },
        { name: 'PMDA', firstCycleApproval: 75, reviewTime: 68 },
        { name: 'NMPA', firstCycleApproval: 65, reviewTime: 95 },
      ];

    case 'user_activity':
      return [
        { date: '10/1', activeUsers: 12, editsPerUser: 45 },
        { date: '10/2', activeUsers: 15, editsPerUser: 38 },
        { date: '10/3', activeUsers: 14, editsPerUser: 42 },
        { date: '10/4', activeUsers: 18, editsPerUser: 36 },
        { date: '10/5', activeUsers: 20, editsPerUser: 40 },
        { date: '10/6', activeUsers: 22, editsPerUser: 35 },
        { date: '10/7', activeUsers: 25, editsPerUser: 32 },
        { date: '10/8', activeUsers: 28, editsPerUser: 30 },
        { date: '10/9', activeUsers: 30, editsPerUser: 28 },
        { date: '10/10', activeUsers: 32, editsPerUser: 34 },
        { date: '10/11', activeUsers: 28, editsPerUser: 38 },
        { date: '10/12', activeUsers: 26, editsPerUser: 42 },
        { date: '10/13', activeUsers: 28, editsPerUser: 45 },
        { date: '10/14', activeUsers: 30, editsPerUser: 48 },
      ];

    case 'section_matrix':
      return [
        {
          code: '1.1',
          title: 'Administrative Information',
          status: 'Complete',
          author: 'J. Smith',
          reviewer: 'M. Johnson',
          completion: 100,
          quality: 95,
        },
        {
          code: '2.1',
          title: 'Introduction',
          status: 'Complete',
          author: 'J. Smith',
          reviewer: 'M. Johnson',
          completion: 100,
          quality: 90,
        },
        {
          code: '2.2',
          title: 'Overall Summary',
          status: 'In Review',
          author: 'A. Rodriguez',
          reviewer: 'M. Johnson',
          completion: 85,
          quality: 82,
        },
        {
          code: '2.3',
          title: 'Background',
          status: 'In Progress',
          author: 'S. Lee',
          reviewer: '',
          completion: 65,
          quality: 70,
        },
        {
          code: '2.4',
          title: 'Risk Analysis',
          status: 'In Progress',
          author: 'S. Lee',
          reviewer: '',
          completion: 40,
          quality: 65,
        },
        {
          code: '3.1',
          title: 'Chemistry Data',
          status: 'Not Started',
          author: '',
          reviewer: '',
          completion: 0,
          quality: 0,
        },
        {
          code: '3.2',
          title: 'Manufacturing',
          status: 'Needs Revision',
          author: 'P. Williams',
          reviewer: 'T. Garcia',
          completion: 75,
          quality: 55,
        },
        {
          code: '4.1',
          title: 'Pharmacology',
          status: 'Approved',
          author: 'J. Smith',
          reviewer: 'Dr. Martinez',
          completion: 100,
          quality: 98,
        },
      ];

    case 'prediction_success':
      return {
        probability: 0.87,
        prediction: 'High likelihood of first-cycle approval',
        factors: [
          { name: 'Content Quality', impact: 0.35 },
          { name: 'Regulatory Compliance', impact: 0.25 },
          { name: 'Submission Completeness', impact: 0.22 },
          { name: 'Missing Safety Data', impact: -0.18 },
          { name: 'Protocol Deviations', impact: -0.12 },
        ],
      };

    case 'regulatory_intelligence':
      return [
        {
          title: 'FDA Updates Guidance on Clinical Trial Design',
          summary: 'New recommendations for adaptive trial designs and patient enrollment criteria',
          date: '10/12/2025',
          authority: 'FDA',
          impact: 'High',
        },
        {
          title: 'EMA Revises Requirements for Module 3',
          summary: 'Updated expectations for chemistry, manufacturing, and controls documentation',
          date: '10/05/2025',
          authority: 'EMA',
          impact: 'Medium',
        },
        {
          title: 'PMDA Announces New Review Timeline',
          summary:
            'Shortened review periods for priority submissions in oncology and rare diseases',
          date: '09/28/2025',
          authority: 'PMDA',
          impact: 'Medium',
        },
        {
          title: 'FDA Enforcement Action on Data Integrity',
          summary: 'Warning letter issued regarding electronic records compliance and audit trails',
          date: '09/15/2025',
          authority: 'FDA',
          impact: 'High',
        },
        {
          title: 'ICH E6(R3) Implementation Timeline',
          summary: 'Global implementation schedule for updated Good Clinical Practice guidelines',
          date: '09/10/2025',
          authority: 'ICH',
          impact: 'High',
        },
      ];

    default:
      return [];
  }
}
