/**
 * Dashboard Overview Component
 * 
 * Main dashboard view showing key metrics, recent activity, and quick actions.
 */

import { 
  ArrowUpRight, 
  ArrowDownRight,
  FileText, 
  Clock, 
  CheckCircle2,
  AlertTriangle,
  Plus,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { QuickActionCard } from '../widgets/QuickActionCard';
import { RecentActivityFeed } from '../widgets/RecentActivityFeed';
import { ProjectStatusWidget } from '../widgets/ProjectStatusWidget';

// Stat card for dashboard metrics
function StatCard({ 
  title, 
  value, 
  change, 
  trend, 
  icon: Icon 
}: { 
  title: string; 
  value: string; 
  change: string; 
  trend: 'up' | 'down'; 
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center">
            <Icon className="h-6 w-6 text-blue-600" />
          </div>
          <div className={`flex items-center gap-1 text-sm ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
            {trend === 'up' ? (
              <ArrowUpRight className="h-4 w-4" />
            ) : (
              <ArrowDownRight className="h-4 w-4" />
            )}
            <span>{change}</span>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardOverview() {
  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, John</h1>
          <p className="text-gray-500 mt-1">Here's what's happening with your submissions today.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline">
            <Clock className="h-4 w-4 mr-2" />
            View Timeline
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Submission
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Active Submissions" 
          value="12" 
          change="+2 this week" 
          trend="up" 
          icon={FileText}
        />
        <StatCard 
          title="Pending Reviews" 
          value="5" 
          change="-1 from yesterday" 
          trend="down" 
          icon={Clock}
        />
        <StatCard 
          title="Approved" 
          value="28" 
          change="+4 this month" 
          trend="up" 
          icon={CheckCircle2}
        />
        <StatCard 
          title="Requires Attention" 
          value="3" 
          change="+1 new" 
          trend="up" 
          icon={AlertTriangle}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Project Status */}
        <div className="lg:col-span-2 space-y-6">
          <ProjectStatusWidget />
          
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks and shortcuts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <QuickActionCard
                  title="Generate CER"
                  description="Create a Clinical Evaluation Report"
                  href="/cer-generator"
                  icon="file-text"
                />
                <QuickActionCard
                  title="Upload Documents"
                  description="Add files to your vault"
                  href="/vault"
                  icon="upload"
                />
                <QuickActionCard
                  title="Run Validation"
                  description="Check compliance status"
                  href="/validation-hub-enhanced"
                  icon="check-circle"
                />
                <QuickActionCard
                  title="Ask AnA"
                  description="Get regulatory guidance"
                  href="/ask-lumen"
                  icon="message-circle"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Activity Feed */}
        <div className="space-y-6">
          <RecentActivityFeed />
          
          {/* Upcoming Deadlines */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Upcoming Deadlines</CardTitle>
                <Button variant="ghost" size="sm" className="text-blue-600">
                  View all
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">IND Response Due</p>
                  <p className="text-xs text-gray-500">In 3 days</p>
                </div>
                <Badge variant="destructive" className="text-xs">Urgent</Badge>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-100">
                <div className="h-2 w-2 rounded-full bg-yellow-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">510(k) Submission</p>
                  <p className="text-xs text-gray-500">In 2 weeks</p>
                </div>
                <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">Soon</Badge>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className="h-2 w-2 rounded-full bg-gray-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Annual Report</p>
                  <p className="text-xs text-gray-500">In 1 month</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default DashboardOverview;
