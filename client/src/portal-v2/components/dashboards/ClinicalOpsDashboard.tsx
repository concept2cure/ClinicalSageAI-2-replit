/**
 * Concept2Cure Client Portal V2 - Clinical Operations Dashboard
 *
 * Trial management dashboard for clinical operations teams with
 * study tracking, site management, and enrollment monitoring.
 *
 * @version 2.0.0
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  Users,
  MapPin,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  Target,
  BarChart3,
  Stethoscope,
  UserPlus,
  Building2,
  ArrowUpRight,
  ChevronRight,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// STUDY OVERVIEW COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface Study {
  id: string;
  name: string;
  protocol: string;
  phase: string;
  status: 'recruiting' | 'active' | 'follow_up' | 'completed' | 'paused';
  indication: string;
  enrolled: number;
  target: number;
  sites: number;
  activeSites: number;
}

interface StudyOverviewProps {
  studies: Study[];
}

const StudyOverview: React.FC<StudyOverviewProps> = ({ studies }) => {
  const getStatusConfig = (status: Study['status']) => {
    switch (status) {
      case 'recruiting':
        return { label: 'Recruiting', color: 'bg-stone-100 text-stone-800', icon: UserPlus };
      case 'active':
        return { label: 'Active', color: 'bg-stone-100 text-stone-800', icon: Activity };
      case 'follow_up':
        return { label: 'Follow-up', color: 'bg-stone-100 text-stone-800', icon: Clock };
      case 'completed':
        return { label: 'Completed', color: 'bg-stone-100 text-stone-800', icon: CheckCircle2 };
      case 'paused':
        return { label: 'Paused', color: 'bg-stone-100 text-stone-800', icon: AlertTriangle };
      default:
        return { label: status, color: 'bg-stone-100', icon: Activity };
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-stone-600" />
              Active Studies
            </CardTitle>
            <CardDescription>Clinical trial portfolio overview</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {studies.map(study => {
            const statusConfig = getStatusConfig(study.status);
            const StatusIcon = statusConfig.icon;
            const enrollmentPercent = Math.round((study.enrolled / study.target) * 100);

            return (
              <div
                key={study.id}
                className="rounded-lg border p-4 hover:shadow-sm transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{study.name}</span>
                      <Badge className={`text-xs ${statusConfig.color}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusConfig.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {study.protocol} • {study.phase} • {study.indication}
                    </p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </div>

                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Enrollment</div>
                    <div className="font-semibold">
                      {study.enrolled}/{study.target}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Active Sites</div>
                    <div className="font-semibold">
                      {study.activeSites}/{study.sites}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Progress</div>
                    <div className="font-semibold">{enrollmentPercent}%</div>
                  </div>
                </div>

                <Progress value={enrollmentPercent} className="h-2" />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ENROLLMENT TRACKER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface EnrollmentData {
  period: string;
  target: number;
  actual: number;
  screenFailure: number;
}

interface EnrollmentTrackerProps {
  data: EnrollmentData[];
  currentRate: number;
  targetRate: number;
}

const EnrollmentTracker: React.FC<EnrollmentTrackerProps> = ({ data, currentRate, targetRate }) => {
  const isOnTrack = currentRate >= targetRate * 0.9;
  const ratePercent = Math.round((currentRate / targetRate) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-stone-600" />
          Enrollment Tracking
        </CardTitle>
        <CardDescription>Monthly enrollment performance</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Rate Summary */}
          <div
            className={`rounded-lg p-4 ${isOnTrack ? 'bg-stone-100 border border-stone-200' : 'bg-stone-100 border border-stone-200'}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Current Enrollment Rate</div>
                <div className="text-2xl font-bold">
                  {currentRate}{' '}
                  <span className="text-sm font-normal text-muted-foreground">pts/month</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Target</div>
                <div className="font-semibold">{targetRate} pts/month</div>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-sm mb-1">
                <span>{isOnTrack ? 'On Track' : 'Below Target'}</span>
                <span>{ratePercent}% of target</span>
              </div>
              <Progress value={ratePercent} className="h-2" />
            </div>
          </div>

          {/* Monthly Data */}
          <div className="space-y-2">
            {data.map(month => (
              <div
                key={month.period}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <span className="text-sm font-medium">{month.period}</span>
                <div className="flex items-center gap-4">
                  <div className="text-sm">
                    <span
                      className={month.actual >= month.target ? 'text-stone-700' : 'text-stone-600'}
                    >
                      {month.actual}
                    </span>
                    <span className="text-muted-foreground">/{month.target}</span>
                  </div>
                  <div className="text-xs text-muted-foreground w-16 text-right">
                    {month.screenFailure} SF
                  </div>
                  {month.actual >= month.target ? (
                    <CheckCircle2 className="h-4 w-4 text-stone-900" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-stone-900" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SITE PERFORMANCE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface Site {
  id: string;
  name: string;
  location: string;
  pi: string;
  enrolled: number;
  target: number;
  status: 'high_performer' | 'on_track' | 'needs_attention' | 'inactive';
  lastActivity: Date;
}

interface SitePerformanceProps {
  sites: Site[];
}

const SitePerformance: React.FC<SitePerformanceProps> = ({ sites }) => {
  const getStatusConfig = (status: Site['status']) => {
    switch (status) {
      case 'high_performer':
        return { label: 'High Performer', color: 'text-stone-700', bg: 'bg-stone-100' };
      case 'on_track':
        return { label: 'On Track', color: 'text-stone-600', bg: 'bg-stone-100' };
      case 'needs_attention':
        return { label: 'Needs Attention', color: 'text-stone-600', bg: 'bg-stone-100' };
      case 'inactive':
        return { label: 'Inactive', color: 'text-stone-600', bg: 'bg-stone-50' };
      default:
        return { label: status, color: 'text-stone-600', bg: 'bg-stone-50' };
    }
  };

  const sortedSites = [...sites].sort((a, b) => {
    const performanceA = a.enrolled / a.target;
    const performanceB = b.enrolled / b.target;
    return performanceB - performanceA;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-stone-600" />
              Site Performance
            </CardTitle>
            <CardDescription>Enrollment by investigator site</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            <MapPin className="h-4 w-4 mr-1" />
            Map View
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {sortedSites.slice(0, 5).map((site, index) => {
            const statusConfig = getStatusConfig(site.status);
            const performance = Math.round((site.enrolled / site.target) * 100);

            return (
              <div
                key={site.id}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-stone-50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full ${statusConfig.bg} flex items-center justify-center text-sm font-bold ${statusConfig.color}`}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{site.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {site.pi} • {site.location}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm">
                    {site.enrolled}/{site.target}
                  </div>
                  <div className={`text-xs ${statusConfig.color}`}>{performance}%</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="mt-4 grid grid-cols-3 gap-2 p-3 bg-stone-50 rounded-lg">
          <div className="text-center">
            <div className="text-lg font-bold text-stone-700">
              {sites.filter(s => s.status === 'high_performer').length}
            </div>
            <div className="text-xs text-muted-foreground">High Performers</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-stone-600">
              {sites.filter(s => s.status === 'on_track').length}
            </div>
            <div className="text-xs text-muted-foreground">On Track</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-stone-600">
              {sites.filter(s => s.status === 'needs_attention').length}
            </div>
            <div className="text-xs text-muted-foreground">Need Attention</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// UPCOMING MILESTONES COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface Milestone {
  id: string;
  name: string;
  study: string;
  date: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'at_risk';
  owner: string;
}

interface UpcomingMilestonesProps {
  milestones: Milestone[];
}

const UpcomingMilestones: React.FC<UpcomingMilestonesProps> = ({ milestones }) => {
  const getStatusConfig = (status: Milestone['status']) => {
    switch (status) {
      case 'pending':
        return { color: 'bg-stone-100 text-stone-800' };
      case 'in_progress':
        return { color: 'bg-stone-100 text-stone-800' };
      case 'completed':
        return { color: 'bg-stone-100 text-stone-800' };
      case 'at_risk':
        return { color: 'bg-stone-100 text-stone-800' };
      default:
        return { color: 'bg-stone-100' };
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  };

  const getDaysUntil = (date: Date) => {
    const now = new Date();
    const target = new Date(date);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-stone-600" />
          Upcoming Milestones
        </CardTitle>
        <CardDescription>Key study milestones and deadlines</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {milestones
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 6)
            .map(milestone => {
              const statusConfig = getStatusConfig(milestone.status);
              const daysUntil = getDaysUntil(milestone.date);
              const isUrgent = daysUntil <= 7 && milestone.status !== 'completed';

              return (
                <div
                  key={milestone.id}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-stone-50 cursor-pointer"
                >
                  <div className="space-y-1">
                    <div className="font-medium text-sm">{milestone.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {milestone.study} • {milestone.owner}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${statusConfig.color}`}>
                      {milestone.status.replace('_', ' ')}
                    </Badge>
                    <span
                      className={`text-sm font-medium ${isUrgent ? 'text-stone-700' : 'text-muted-foreground'}`}
                    >
                      {formatDate(milestone.date)}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
        <Button variant="ghost" className="w-full mt-3">
          View full timeline
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CLINICAL OPERATIONS DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export const ClinicalOpsDashboard: React.FC = () => {
  // Mock data
  const studies: Study[] = [
    {
      id: '1',
      name: 'BTX-331-001',
      protocol: 'BTX-331-001',
      phase: 'Phase 1',
      status: 'recruiting',
      indication: 'Solid Tumors',
      enrolled: 18,
      target: 45,
      sites: 12,
      activeSites: 10,
    },
    {
      id: '2',
      name: 'MX-201-301',
      protocol: 'MX-201-301',
      phase: 'Phase 3',
      status: 'active',
      indication: 'Type 2 Diabetes',
      enrolled: 856,
      target: 1200,
      sites: 85,
      activeSites: 78,
    },
    {
      id: '3',
      name: 'CX-550-201',
      protocol: 'CX-550-201',
      phase: 'Phase 2',
      status: 'follow_up',
      indication: 'NASH',
      enrolled: 180,
      target: 180,
      sites: 24,
      activeSites: 20,
    },
  ];

  const enrollmentData: EnrollmentData[] = [
    { period: 'Jan 2026', target: 45, actual: 52, screenFailure: 12 },
    { period: 'Dec 2025', target: 45, actual: 38, screenFailure: 15 },
    { period: 'Nov 2025', target: 45, actual: 41, screenFailure: 8 },
    { period: 'Oct 2025', target: 45, actual: 48, screenFailure: 11 },
  ];

  const sites: Site[] = [
    {
      id: '1',
      name: 'Johns Hopkins Medical',
      location: 'Baltimore, MD',
      pi: 'Dr. Sarah Johnson',
      enrolled: 24,
      target: 20,
      status: 'high_performer',
      lastActivity: new Date(),
    },
    {
      id: '2',
      name: 'Cleveland Clinic',
      location: 'Cleveland, OH',
      pi: 'Dr. Michael Chen',
      enrolled: 18,
      target: 20,
      status: 'on_track',
      lastActivity: new Date(),
    },
    {
      id: '3',
      name: 'Mayo Clinic',
      location: 'Rochester, MN',
      pi: 'Dr. Emily Davis',
      enrolled: 15,
      target: 20,
      status: 'on_track',
      lastActivity: new Date(),
    },
    {
      id: '4',
      name: 'UCSF Medical Center',
      location: 'San Francisco, CA',
      pi: 'Dr. Robert Wilson',
      enrolled: 8,
      target: 20,
      status: 'needs_attention',
      lastActivity: new Date(),
    },
    {
      id: '5',
      name: 'Mass General Hospital',
      location: 'Boston, MA',
      pi: 'Dr. Amanda Lee',
      enrolled: 22,
      target: 20,
      status: 'high_performer',
      lastActivity: new Date(),
    },
  ];

  const milestones: Milestone[] = [
    {
      id: '1',
      name: 'DSMB Meeting',
      study: 'MX-201-301',
      date: new Date('2026-02-05'),
      status: 'in_progress',
      owner: 'Dr. Chen',
    },
    {
      id: '2',
      name: 'Interim Analysis',
      study: 'MX-201-301',
      date: new Date('2026-02-15'),
      status: 'pending',
      owner: 'Biostatistics',
    },
    {
      id: '3',
      name: 'Site Initiation Visit',
      study: 'BTX-331-001',
      date: new Date('2026-02-10'),
      status: 'at_risk',
      owner: 'CRA Team',
    },
    {
      id: '4',
      name: 'Last Patient Last Visit',
      study: 'CX-550-201',
      date: new Date('2026-03-01'),
      status: 'pending',
      owner: 'Clinical Ops',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clinical Operations</h1>
          <p className="text-muted-foreground">Study management and enrollment tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <BarChart3 className="h-4 w-4 mr-1" />
            Reports
          </Button>
          <Button size="sm">
            <Activity className="h-4 w-4 mr-1" />
            New Study
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Enrolled</p>
                <p className="text-2xl font-bold">1,054</p>
                <p className="text-xs text-stone-700 flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3" /> +12% vs target
                </p>
              </div>
              <Users className="h-8 w-8 text-stone-900 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Sites</p>
                <p className="text-2xl font-bold">108</p>
                <p className="text-xs text-muted-foreground mt-1">across 3 studies</p>
              </div>
              <Building2 className="h-8 w-8 text-stone-900 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Screen Failure Rate</p>
                <p className="text-2xl font-bold">18%</p>
                <p className="text-xs text-stone-700 flex items-center gap-1 mt-1">
                  <TrendingDown className="h-3 w-3" /> -3% vs last month
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-stone-900 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Days to LPLV</p>
                <p className="text-2xl font-bold">142</p>
                <p className="text-xs text-muted-foreground mt-1">for MX-201-301</p>
              </div>
              <Calendar className="h-8 w-8 text-stone-900 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <StudyOverview studies={studies} />
          <EnrollmentTracker data={enrollmentData} currentRate={45} targetRate={45} />
        </div>
        <div className="space-y-6">
          <SitePerformance sites={sites} />
          <UpcomingMilestones milestones={milestones} />
        </div>
      </div>
    </div>
  );
};

export default ClinicalOpsDashboard;
