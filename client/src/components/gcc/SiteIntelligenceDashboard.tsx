/**
 * Site Intelligence Dashboard Component
 * 
 * Site scorecard, KPI visualization, risk tracking, and enrollment predictions.
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Users,
  Target,
  BarChart3,
  MapPin,
  Phone,
  Mail,
  Star,
  RefreshCw,
  Plus,
  Eye,
  Filter,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Types
interface Site {
  id: string;
  site_number: string;
  site_name: string;
  investigator_name: string;
  city: string;
  state: string;
  country: string;
  status: 'candidate' | 'selected' | 'initiated' | 'active' | 'closed';
  composite_score: number;
  enrollment_score: number;
  quality_score: number;
  operational_score: number;
  target_enrollment: number;
  actual_enrollment: number;
  risk_count: number;
}

interface SiteMetrics {
  id: string;
  metric_date: string;
  enrollment_actual: number;
  enrollment_target: number;
  screening_rate: number;
  screen_fail_rate: number;
  dropout_rate: number;
  query_rate: number;
}

interface SiteRisk {
  id: string;
  risk_category: string;
  risk_description: string;
  likelihood: number;
  impact: number;
  risk_score: number;
  status: 'open' | 'monitoring' | 'mitigated' | 'closed';
  due_date: string | null;
}

// Score Gauge Component
function ScoreGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const getColorClass = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <div className="text-center">
      <div className={`text-3xl font-bold ${getColorClass(score)}`}>
        {score?.toFixed(0) || '-'}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
      <Progress 
        value={score || 0} 
        className="h-1 mt-2"
      />
    </div>
  );
}

// Status Badge Component
function SiteStatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'outline'; color?: string }> = {
    candidate: { variant: 'outline' },
    selected: { variant: 'secondary' },
    initiated: { variant: 'default', color: 'bg-blue-500' },
    active: { variant: 'default', color: 'bg-green-500' },
    closed: { variant: 'outline' },
  };
  
  const config = variants[status] || variants.candidate;
  
  return (
    <Badge variant={config.variant} className={config.color}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

// Site Card Component
function SiteCard({ 
  site, 
  onSelect,
  isSelected 
}: { 
  site: Site;
  onSelect: (site: Site) => void;
  isSelected: boolean;
}) {
  return (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2 ring-primary' : ''
      }`}
      onClick={() => onSelect(site)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{site.site_name}</CardTitle>
            <CardDescription className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {site.city}, {site.country}
            </CardDescription>
          </div>
          <SiteStatusBadge status={site.status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <ScoreGauge score={site.composite_score} label="Overall" color="blue" />
          <ScoreGauge score={site.enrollment_score} label="Enrollment" color="green" />
          <ScoreGauge score={site.quality_score} label="Quality" color="purple" />
          <ScoreGauge score={site.operational_score} label="Operations" color="orange" />
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>{site.actual_enrollment || 0}/{site.target_enrollment || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">PI:</span>
            <span>{site.investigator_name || 'TBD'}</span>
          </div>
          {site.risk_count > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {site.risk_count} risks
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Site Details Panel
function SiteDetailsPanel({ siteId }: { siteId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['site-details', siteId],
    queryFn: async () => {
      const response = await fetch(`/api/gcc/site-intel/sites/${siteId}?includeMetrics=true&includeRisks=true&includePredictions=true`);
      if (!response.ok) throw new Error('Failed to fetch site details');
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const site = data?.site;
  if (!site) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{site.site_name}</CardTitle>
            <CardDescription>Site #{site.site_number}</CardDescription>
          </div>
          <SiteStatusBadge status={site.status} />
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="risks">Risks</TabsTrigger>
            <TabsTrigger value="predictions">Predictions</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* Contact Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-muted-foreground">Investigator</Label>
                <p className="font-medium">{site.investigator_name || '-'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Location</Label>
                <p className="font-medium">
                  {[site.city, site.state, site.country].filter(Boolean).join(', ')}
                </p>
              </div>
              {site.phone && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Phone</Label>
                  <p className="font-medium flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {site.phone}
                  </p>
                </div>
              )}
              {site.email && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {site.email}
                  </p>
                </div>
              )}
            </div>
            
            {/* Scores */}
            <div className="grid grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
              <ScoreGauge score={site.composite_score} label="Composite" color="blue" />
              <ScoreGauge score={site.enrollment_score} label="Enrollment" color="green" />
              <ScoreGauge score={site.quality_score} label="Quality" color="purple" />
              <ScoreGauge score={site.operational_score} label="Operations" color="orange" />
            </div>
            
            {/* Enrollment Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Enrollment Progress</Label>
                <span className="text-sm font-medium">
                  {site.actual_enrollment || 0} / {site.target_enrollment || 0}
                </span>
              </div>
              <Progress 
                value={site.target_enrollment ? (site.actual_enrollment / site.target_enrollment) * 100 : 0} 
              />
            </div>
          </TabsContent>
          
          <TabsContent value="metrics" className="mt-4">
            {site.metrics && site.metrics.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Enrolled</TableHead>
                    <TableHead>Screen Rate</TableHead>
                    <TableHead>Fail Rate</TableHead>
                    <TableHead>Query Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {site.metrics.slice(0, 10).map((m: SiteMetrics) => (
                    <TableRow key={m.id}>
                      <TableCell>{new Date(m.metric_date).toLocaleDateString()}</TableCell>
                      <TableCell>{m.enrollment_actual}/{m.enrollment_target}</TableCell>
                      <TableCell>{m.screening_rate?.toFixed(1) || '-'}%</TableCell>
                      <TableCell>{m.screen_fail_rate?.toFixed(1) || '-'}%</TableCell>
                      <TableCell>{m.query_rate?.toFixed(1) || '-'}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No metrics recorded yet
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="risks" className="mt-4">
            {site.risks && site.risks.length > 0 ? (
              <div className="space-y-2">
                {site.risks.map((risk: SiteRisk) => (
                  <div 
                    key={risk.id}
                    className={`p-3 border rounded-lg ${
                      risk.risk_score >= 15 ? 'border-red-300 bg-red-50 dark:bg-red-900/20' :
                      risk.risk_score >= 10 ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/20' :
                      'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{risk.risk_description}</p>
                        <p className="text-sm text-muted-foreground">
                          {risk.risk_category} • L:{risk.likelihood} × I:{risk.impact} = {risk.risk_score}
                        </p>
                      </div>
                      <Badge variant={risk.status === 'open' ? 'destructive' : 'outline'}>
                        {risk.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No active risks
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="predictions" className="mt-4">
            {site.predictions && site.predictions.length > 0 ? (
              <div className="space-y-4">
                {site.predictions.map((pred: any) => (
                  <div key={pred.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">
                        Predicted: {pred.predicted_enrollment} subjects
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(pred.prediction_date).toLocaleDateString()}
                      </span>
                    </div>
                    {pred.confidence_interval && (
                      <p className="text-sm text-muted-foreground">
                        95% CI: {pred.confidence_interval.lower} - {pred.confidence_interval.upper}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Model: {pred.model_version || 'v1.0'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No predictions available
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Main Dashboard Component
export default function SiteIntelligenceDashboard({ programId }: { programId?: string }) {
  const { toast } = useToast();
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('composite_score');

  // Fetch sites
  const { data: sitesData, isLoading: sitesLoading, refetch } = useQuery({
    queryKey: ['sites', programId, statusFilter, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (programId) params.append('programId', programId);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      params.append('sortBy', sortBy);
      params.append('sortDir', 'DESC');
      params.append('limit', '50');
      
      const response = await fetch(`/api/gcc/site-intel/sites?${params}`);
      if (!response.ok) throw new Error('Failed to fetch sites');
      return response.json();
    }
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['site-intel-stats', programId],
    queryFn: async () => {
      const params = programId ? `?programId=${programId}` : '';
      const response = await fetch(`/api/gcc/site-intel/stats${params}`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    }
  });

  // Recalculate scores mutation
  const recalculateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/gcc/site-intel/recalculate-scores', {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to recalculate scores');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Scores Recalculated',
        description: `Updated scores for ${data.sitesUpdated} sites`
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const stats = statsData?.stats || {};

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Sites</p>
                <p className="text-3xl font-bold">{stats.total_sites || 0}</p>
              </div>
              <Building2 className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Sites</p>
                <p className="text-3xl font-bold text-green-600">{stats.active_sites || 0}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Score</p>
                <p className="text-3xl font-bold">
                  {stats.avg_composite_score?.toFixed(0) || '-'}
                </p>
              </div>
              <Star className="h-8 w-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open Risks</p>
                <p className="text-3xl font-bold text-red-600">{stats.open_risks || 0}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Enrolled</p>
                <p className="text-3xl font-bold">{stats.total_enrollment || 0}</p>
              </div>
              <Users className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="candidate">Candidate</SelectItem>
              <SelectItem value="selected">Selected</SelectItem>
              <SelectItem value="initiated">Initiated</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="composite_score">Composite Score</SelectItem>
              <SelectItem value="enrollment_score">Enrollment Score</SelectItem>
              <SelectItem value="quality_score">Quality Score</SelectItem>
              <SelectItem value="operational_score">Operations Score</SelectItem>
              <SelectItem value="created_at">Date Added</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={() => recalculateMutation.mutate()}
            disabled={recalculateMutation.isPending}
          >
            {recalculateMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Recalculate Scores
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Site
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Sites Grid */}
        <div className="col-span-2 space-y-4">
          {sitesLoading ? (
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {sitesData?.sites?.map((site: Site) => (
                <SiteCard
                  key={site.id}
                  site={site}
                  onSelect={setSelectedSite}
                  isSelected={selectedSite?.id === site.id}
                />
              ))}
              
              {(!sitesData?.sites || sitesData.sites.length === 0) && (
                <div className="col-span-2 text-center py-16 text-muted-foreground">
                  No sites found. Add your first site to get started.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Details Panel */}
        <div>
          {selectedSite ? (
            <SiteDetailsPanel siteId={selectedSite.id} />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Building2 className="h-12 w-12 mb-4 opacity-50" />
                <p>Select a site to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
