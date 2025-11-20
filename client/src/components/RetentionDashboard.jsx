import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CircleXIcon,
  CircleCheckIcon,
  ArchiveIcon,
  RotateCcwIcon,
  RotateCwIcon,
  CalendarIcon,
  AlertTriangleIcon,
  ClockIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const RetentionDashboard = () => {
  const [stats, setStats] = useState({
    totalPolicies: 0,
    activePolicies: 0,
    totalDocuments: 0,
    expiringSoon: 0,
    archivedThisMonth: 0,
    deletedThisMonth: 0,
  });

  const [lastRun, setLastRun] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const { toast } = useToast();

  // Simulated data for recent retention activities
  const [recentActivity, setRecentActivity] = useState([
    {
      id: '1',
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      action: 'archive',
      documentName: 'April Progress Report',
      documentType: 'progress_report',
      policyName: 'Monthly Reports Policy',
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      action: 'delete',
      documentName: 'January Site Visit Notes',
      documentType: 'site_visit',
      policyName: 'Site Visit Retention',
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      action: 'notification',
      documentName: 'Vendor Qualification Assessment',
      documentType: 'vendor_qualification',
      policyName: 'Vendor Documentation Policy',
    },
  ]);

  // Simulated data for upcoming expirations
  const [upcomingExpirations, setUpcomingExpirations] = useState([
    {
      id: '101',
      documentName: 'Q2 Quality Metrics',
      documentType: 'quality_metrics',
      expirationDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      policyName: 'Quarterly Reports Policy',
      daysTillExpiration: 7,
    },
    {
      id: '102',
      documentName: 'Training Records 2023',
      documentType: 'training_records',
      expirationDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      policyName: 'Training Records Policy',
      daysTillExpiration: 15,
    },
    {
      id: '103',
      documentName: 'Equipment Calibration Logs',
      documentType: 'calibration_records',
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      policyName: 'Equipment Records Policy',
      daysTillExpiration: 30,
    },
  ]);

  useEffect(() => {
    // Simulated stats for dashboard
    setStats({
      totalPolicies: 12,
      activePolicies: 10,
      totalDocuments: 2856,
      expiringSoon: 23,
      archivedThisMonth: 47,
      deletedThisMonth: 31,
    });

    // Simulated last run data
    setLastRun({
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      processedCount: 142,
      archivedCount: 12,
      deletedCount: 8,
      failedCount: 1,
      duration: '00:04:36',
    });
  }, []);

  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleRunNow = () => {
    setIsRunning(true);

    // Simulate API call to manually trigger retention job
    toast({
      title: 'Retention job started',
      description:
        'The document retention job has been started. This may take several minutes to complete.',
    });

    // Simulate completion after 5 seconds
    setTimeout(() => {
      setIsRunning(false);

      // Update last run stats
      setLastRun({
        timestamp: new Date().toISOString(),
        processedCount: 156,
        archivedCount: 14,
        deletedCount: 9,
        failedCount: 0,
        duration: '00:05:12',
      });

      toast({
        title: 'Retention job completed',
        description: 'The document retention job has completed successfully.',
      });
    }, 5000);
  };

  const getActionIcon = action => {
    switch (action) {
      case 'archive':
        return <ArchiveIcon className="h-4 w-4 text-blue-500" />;
      case 'delete':
        return <CircleXIcon className="h-4 w-4 text-red-500" />;
      case 'notification':
        return <AlertTriangleIcon className="h-4 w-4 text-yellow-500" />;
      default:
        return <CircleCheckIcon className="h-4 w-4 text-green-500" />;
    }
  };

  const getExpirationBadge = days => {
    if (days <= 7) {
      return <Badge variant="destructive">{days} days</Badge>;
    } else if (days <= 30) {
      return <Badge variant="warning">{days} days</Badge>;
    } else {
      return <Badge variant="outline">{days} days</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Policies</CardTitle>
            <div className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPolicies}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activePolicies} active (
              {Math.round((stats.activePolicies / stats.totalPolicies) * 100)}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Archived This Month</CardTitle>
            <ArchiveIcon className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.archivedThisMonth}</div>
            <p className="text-xs text-muted-foreground">Documents moved to archive</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deleted This Month</CardTitle>
            <CircleXIcon className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.deletedThisMonth}</div>
            <p className="text-xs text-muted-foreground">Documents permanently removed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
            <AlertTriangleIcon className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.expiringSoon}</div>
            <p className="text-xs text-muted-foreground">Documents approaching retention limits</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Last Execution</CardTitle>
            <CardDescription>Most recent retention job execution details</CardDescription>
          </CardHeader>
          <CardContent>
            {lastRun ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Run Date</p>
                    <p className="text-sm">{formatDate(lastRun.timestamp)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Duration</p>
                    <p className="text-sm">{lastRun.duration}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Processed</p>
                    <p className="text-sm">{lastRun.processedCount} documents</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Archived</p>
                    <p className="text-sm">{lastRun.archivedCount} documents</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Deleted</p>
                    <p className="text-sm">{lastRun.deletedCount} documents</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Failed</p>
                    <p className="text-sm">{lastRun.failedCount} operations</p>
                  </div>
                </div>
                <Button onClick={handleRunNow} disabled={isRunning} className="w-full">
                  {isRunning ? (
                    <>
                      <RotateCwIcon className="mr-2 h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <RotateCcwIcon className="mr-2 h-4 w-4" />
                      Run Retention Job Now
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-4 py-6">
                <CalendarIcon className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No retention jobs have been executed yet.
                </p>
                <Button onClick={handleRunNow} disabled={isRunning}>
                  {isRunning ? 'Running...' : 'Run First Job'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Upcoming Schedule</CardTitle>
            <CardDescription>Next scheduled automated retention runs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="rounded-full p-1 bg-blue-100">
                  <ClockIcon className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Daily Run</p>
                  <p className="text-xs text-muted-foreground">Every day at 01:00 AM</p>
                </div>
                <Badge className="ml-auto" variant="outline">
                  1:00 AM
                </Badge>
              </div>

              <div className="flex items-center space-x-4">
                <div className="rounded-full p-1 bg-green-100">
                  <ClockIcon className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Notification Check</p>
                  <p className="text-xs text-muted-foreground">Every Monday at 09:00 AM</p>
                </div>
                <Badge className="ml-auto" variant="outline">
                  Weekly
                </Badge>
              </div>

              <div className="flex items-center space-x-4">
                <div className="rounded-full p-1 bg-yellow-100">
                  <ClockIcon className="h-6 w-6 text-yellow-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Monthly Deep Clean</p>
                  <p className="text-xs text-muted-foreground">1st of each month at 02:00 AM</p>
                </div>
                <Badge className="ml-auto" variant="outline">
                  Monthly
                </Badge>
              </div>

              <div className="flex justify-center">
                <Button variant="outline" className="mt-2">
                  Manage Schedule
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Retention Activity</CardTitle>
          <CardDescription>
            Monitor retention activities and upcoming document expirations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="upcoming">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upcoming">Upcoming Expirations</TabsTrigger>
              <TabsTrigger value="recent">Recent Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Policy</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Time Left</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingExpirations.map(doc => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">{doc.documentName}</TableCell>
                      <TableCell>{doc.documentType}</TableCell>
                      <TableCell>{doc.policyName}</TableCell>
                      <TableCell>{formatDate(doc.expirationDate)}</TableCell>
                      <TableCell className="text-right">
                        {getExpirationBadge(doc.daysTillExpiration)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {upcomingExpirations.length === 0 && (
                <div className="flex flex-col items-center justify-center space-y-4 py-8">
                  <CircleCheckIcon className="h-12 w-12 text-green-500" />
                  <p className="text-sm text-muted-foreground">No documents are expiring soon.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="recent" className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Policy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentActivity.map(activity => (
                    <TableRow key={activity.id}>
                      <TableCell>{formatDate(activity.timestamp)}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getActionIcon(activity.action)}
                          <span className="capitalize">{activity.action}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{activity.documentName}</TableCell>
                      <TableCell>{activity.documentType}</TableCell>
                      <TableCell>{activity.policyName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {recentActivity.length === 0 && (
                <div className="flex flex-col items-center justify-center space-y-4 py-8">
                  <CalendarIcon className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No recent retention activity.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default RetentionDashboard;
