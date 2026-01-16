// src/pages/INDWizardDashboard.jsx
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  FileText, User, Building, Calendar, TrendingUp, AlertCircle, CheckCircle, Clock, Plus, BarChart3, Activity } from 'lucide-react'

export default function INDWizardDashboard() {
  const [wizardData, setWizardData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  // Fetch wizard data and stats
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch wizard data and stats in parallel
        const [wizardResponse, statsResponse] = await Promise.all([
          fetch('/api/ind/wizard/data'),
          fetch('/api/ind/stats'),
        ]);

        if (!wizardResponse.ok || !statsResponse.ok) {
          throw new Error('Failed to fetch data');
        }

        const wizardData = await wizardResponse.json();
        const statsData = await statsResponse.json();

        setWizardData(wizardData);
        setStats(statsData);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
        toast({
          title: 'Error',
          description: 'Failed to load IND Wizard data',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [toast]);

  const getSectionStatusColor = status => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'in_progress':
        return 'bg-yellow-500';
      case 'not_started':
        return 'bg-gray-300';
      default:
        return 'bg-gray-300';
    }
  };

  const getSectionStatusText = status => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      case 'not_started':
        return 'Not Started';
      default:
        return 'Unknown';
    }
  };

  const createNewProject = async () => {
    try {
      const response = await fetch('/api/ind/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New IND Project',
          drugName: 'New Drug',
          indication: 'New Indication',
          sponsor: 'Your Company',
        }),
      });

      if (!response.ok) throw new Error('Failed to create project');

      const result = await response.json();

      toast({
        title: 'Success',
        description: 'New IND project created successfully',
      });

      // Navigate to new project
      setLocation(`/ind/wizard/pre-planning`);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to create new project',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-lg p-6 space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading IND Wizard</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">IND Wizard Dashboard</h1>
            <p className="text-gray-600 mt-2">Manage your IND submission projects</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setLocation('/')}>
              <Building className="w-4 h-4 mr-2" />
              Back to Platform
            </Button>
            <Button onClick={createNewProject}>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="current-project">Current Project</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            {/* Statistics Cards */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <FileText className="w-8 h-8 text-blue-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600">Total Projects</p>
                        <p className="text-2xl font-bold">{stats?.totalProjects || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <CheckCircle className="w-8 h-8 text-green-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600">Completed</p>
                        <p className="text-2xl font-bold">{stats?.completedProjects || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Clock className="w-8 h-8 text-yellow-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600">Active Projects</p>
                        <p className="text-2xl font-bold">{stats?.activeProjects || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <TrendingUp className="w-8 h-8 text-purple-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600">Compliance Rate</p>
                        <p className="text-2xl font-bold">{stats?.complianceRate || 0}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Recent Activity */}
            {stats && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Activity className="w-5 h-5 mr-2" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(stats?.recentActivity || []).map(activity => (
                      <div key={activity.id} className="flex items-center space-x-4">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{activity.action}</p>
                          <p className="text-xs text-gray-500">{activity.project}</p>
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(activity.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="current-project">
            {wizardData && (
              <div className="space-y-6">
                {/* Project Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Current Project: {wizardData?.name || 'No Project Selected'}</span>
                      <Badge
                        variant={wizardData?.status === 'in_progress' ? 'default' : 'secondary'}
                      >
                        {wizardData?.status?.replace('_', ' ') || 'Unknown'}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="flex items-center">
                          <FileText className="w-5 h-5 text-gray-500 mr-3" />
                          <div>
                            <p className="text-sm text-gray-600">Drug Name</p>
                            <p className="font-medium">{wizardData?.drugName || 'Not specified'}</p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <User className="w-5 h-5 text-gray-500 mr-3" />
                          <div>
                            <p className="text-sm text-gray-600">Indication</p>
                            <p className="font-medium">
                              {wizardData?.indication || 'Not specified'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <Building className="w-5 h-5 text-gray-500 mr-3" />
                          <div>
                            <p className="text-sm text-gray-600">Sponsor</p>
                            <p className="font-medium">{wizardData?.sponsor || 'Not specified'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-gray-600 mb-2">Overall Progress</p>
                          <Progress value={wizardData?.progress || 0} className="h-2" />
                          <p className="text-sm text-gray-500 mt-1">
                            {wizardData?.progress || 0}% Complete
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Last Updated</p>
                          <p className="font-medium">
                            {wizardData?.lastUpdated
                              ? new Date(wizardData.lastUpdated).toLocaleString()
                              : 'Not available'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Section Progress */}
                <Card>
                  <CardHeader>
                    <CardTitle>Section Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {Object.entries(wizardData?.sections || {}).map(([key, section]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex items-center space-x-3">
                            <div
                              className={`w-3 h-3 rounded-full ${getSectionStatusColor(section?.status)}`}
                            ></div>
                            <div>
                              <p className="font-medium capitalize">
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                              </p>
                              <p className="text-sm text-gray-500">
                                {getSectionStatusText(section?.status)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            <div className="w-24">
                              <Progress value={section?.progress || 0} className="h-1" />
                            </div>
                            <span className="text-sm text-gray-500 w-12">
                              {section?.progress || 0}%
                            </span>
                            <Link
                              href={`/ind/wizard/${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`}
                            >
                              <Button variant="outline" size="sm">
                                {section?.status === 'completed' ? 'Review' : 'Continue'}
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Button variant="outline" className="h-auto p-4">
                        <div className="text-center">
                          <FileText className="w-6 h-6 mx-auto mb-2" />
                          <p className="text-sm font-medium">Generate Forms</p>
                        </div>
                      </Button>
                      <Button variant="outline" className="h-auto p-4">
                        <div className="text-center">
                          <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                          <p className="text-sm font-medium">Risk Assessment</p>
                        </div>
                      </Button>
                      <Button variant="outline" className="h-auto p-4">
                        <div className="text-center">
                          <Calendar className="w-6 h-6 mx-auto mb-2" />
                          <p className="text-sm font-medium">Timeline Review</p>
                        </div>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2" />
                  Analytics & Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {stats && (
                    <>
                      <div className="space-y-4">
                        <h3 className="font-medium">Performance Metrics</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Success Rate</span>
                            <span className="text-sm font-medium">
                              {stats?.complianceRate || 0}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Avg. Completion Time</span>
                            <span className="text-sm font-medium">
                              {stats?.avgCompletionTime || 0} days
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Active Projects</span>
                            <span className="text-sm font-medium">
                              {stats?.activeProjects || 0}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h3 className="font-medium">Compliance Overview</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Overall Compliance</span>
                            <span className="text-sm font-medium">
                              {stats?.complianceRate || 0}%
                            </span>
                          </div>
                          <Progress value={stats?.complianceRate || 0} className="h-2" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
