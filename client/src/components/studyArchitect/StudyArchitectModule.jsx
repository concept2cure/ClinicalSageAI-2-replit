import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText, Lightbulb, BookOpen, BarChart2, Database, Brain, Settings, Target, Users, Activity, Download, Share2, Plus, Search, LineChart, PieChart } from 'lucide-react'

// Import Study Architect Components
import StudyWorkspace from '@/components/studyArchitect/StudyWorkspace';
import StudyPlanner from '@/components/studyArchitect/StudyPlanner';
import StudyDesignAssistant from '@/components/studyArchitect/StudyDesignAssistant';
import StudySessionSelector from '@/components/studyArchitect/StudySessionSelector';

// Import Protocol Components
import ProtocolBlueprintGenerator from '@/components/protocol/ProtocolBlueprintGenerator';
import ProtocolSuccessPredictor from '@/components/protocol/ProtocolSuccessPredictor';

// Import CSR Intelligence Components
import CSRDashboard from '@/components/csr-analyzer/CSRDashboard';
import CSRIntelligenceInsights from '@/components/csr-analyzer/CSRIntelligenceInsights';

const StudyArchitectModule = ({ selectedSession = null }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [session, setSession] = useState(
    selectedSession || {
      id: 'session-2025-001',
      name: 'Enzymax Phase 2b Study Design',
      indication: 'Type 2 Diabetes',
      lastUpdated: '2025-04-30',
      users: [
        { id: 1, name: 'Dr. Sarah Johnson', role: 'Principal Investigator' },
        { id: 2, name: 'Dr. Michael Chen', role: 'Medical Monitor' },
      ],
    }
  );

  return (
    <div className="space-y-6">
      {/* Session Information Panel */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm text-muted-foreground">Active Session</span>
              </div>
              <CardTitle className="mt-1">{session.name}</CardTitle>
              <CardDescription>
                {session.indication} · Last updated: {session.lastUpdated}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm">
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 md:grid-cols-6 gap-2">
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="planner" className="flex items-center gap-1">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Study Planner</span>
          </TabsTrigger>
          <TabsTrigger value="workspace" className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Workspace</span>
          </TabsTrigger>
          <TabsTrigger value="protocol" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Protocol</span>
          </TabsTrigger>
          <TabsTrigger value="success" className="flex items-center gap-1">
            <BarChart2 className="h-4 w-4" />
            <span className="hidden sm:inline">Success Prediction</span>
          </TabsTrigger>
          <TabsTrigger value="intelligence" className="flex items-center gap-1">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">CSR Intelligence</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Study Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Indication:</div>
                  <div className="font-medium">{session.indication}</div>
                  <div>Phase:</div>
                  <div className="font-medium">Phase 2b</div>
                  <div>Target Population:</div>
                  <div className="font-medium">Adults with T2DM</div>
                  <div>Estimated Duration:</div>
                  <div className="font-medium">52 weeks</div>
                </div>
                <Button variant="link" className="px-0 mt-2 h-auto text-sm">
                  View complete study details
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Study Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1 text-sm">
                      <span>Study Design</span>
                      <span>80%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{ width: '80%' }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1 text-sm">
                      <span>Protocol Draft</span>
                      <span>65%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{ width: '65%' }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1 text-sm">
                      <span>Regulatory Readiness</span>
                      <span>45%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{ width: '45%' }}
                      ></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Success Prediction
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16 rounded-full border-4 border-blue-100 flex items-center justify-center">
                    <div className="text-xl font-bold text-blue-600">89%</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Predicted Success Rate</div>
                    <div className="text-xs text-muted-foreground">Based on CSR analytics</div>
                    <Button
                      variant="link"
                      className="px-0 h-auto text-sm"
                      onClick={() => setActiveTab('success')}
                    >
                      View detailed prediction
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Contributors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {session.users.map(user => (
                    <div key={user.id} className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium">
                        {user.name
                          .split(' ')
                          .map(n => n[0])
                          .join('')}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{user.name}</div>
                        <div className="text-xs text-muted-foreground">{user.role}</div>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full text-sm" size="sm">
                    <Plus className="h-3 w-3 mr-1" />
                    Add Collaborator
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Access Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-600" />
                  Study Design
                </CardTitle>
                <CardDescription>Design and plan your clinical study</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md transition-colors cursor-pointer"
                    onClick={() => setActiveTab('planner')}
                  >
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                      <Target className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">Study Planner</div>
                      <div className="text-sm text-muted-foreground">Define study parameters</div>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md transition-colors cursor-pointer"
                    onClick={() => setActiveTab('workspace')}
                  >
                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">Collaborative Workspace</div>
                      <div className="text-sm text-muted-foreground">Work with your team</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md transition-colors cursor-pointer">
                    <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                      <Lightbulb className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">Design Assistant</div>
                      <div className="text-sm text-muted-foreground">AI-powered assistance</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-600" />
                  Protocol Development
                </CardTitle>
                <CardDescription>Create and optimize your protocol</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md transition-colors cursor-pointer"
                    onClick={() => setActiveTab('protocol')}
                  >
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">Protocol Blueprint</div>
                      <div className="text-sm text-muted-foreground">Create optimized protocol</div>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md transition-colors cursor-pointer"
                    onClick={() => setActiveTab('success')}
                  >
                    <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                      <BarChart2 className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">Success Prediction</div>
                      <div className="text-sm text-muted-foreground">Predict study success</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md transition-colors cursor-pointer">
                    <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                      <Search className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">Regulatory Check</div>
                      <div className="text-sm text-muted-foreground">Validate compliance</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-600" />
                  CSR Intelligence
                </CardTitle>
                <CardDescription>Insights from clinical study reports</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md transition-colors cursor-pointer"
                    onClick={() => setActiveTab('intelligence')}
                  >
                    <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                      <Brain className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">CSR Insights</div>
                      <div className="text-sm text-muted-foreground">Intelligence from CSRs</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md transition-colors cursor-pointer">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                      <LineChart className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">CSR Dashboard</div>
                      <div className="text-sm text-muted-foreground">Analytics overview</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md transition-colors cursor-pointer">
                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                      <Database className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">CSR Database</div>
                      <div className="text-sm text-muted-foreground">Browse CSR library</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle>Recent Activity</CardTitle>
                <Button variant="ghost" size="sm">
                  View All
                </Button>
              </div>
              <CardDescription>Recent actions in this study session</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                      <FileText className="h-4 w-4" />
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">Protocol Blueprint Generated</div>
                    <div className="text-sm text-muted-foreground">
                      Study design parameters used to create optimized protocol blueprint
                    </div>
                    <div className="flex items-center mt-1 text-xs text-muted-foreground">
                      <span>Today at 10:35 AM</span>
                      <span className="mx-2">•</span>
                      <span>Dr. Sarah Johnson</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                      <Brain className="h-4 w-4" />
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">CSR Intelligence Applied</div>
                    <div className="text-sm text-muted-foreground">
                      Insights from 3 similar studies applied to protocol design
                    </div>
                    <div className="flex items-center mt-1 text-xs text-muted-foreground">
                      <span>Yesterday at 2:15 PM</span>
                      <span className="mx-2">•</span>
                      <span>System</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                      <Users className="h-4 w-4" />
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">Collaborator Added</div>
                    <div className="text-sm text-muted-foreground">
                      Dr. Michael Chen added as Medical Monitor
                    </div>
                    <div className="flex items-center mt-1 text-xs text-muted-foreground">
                      <span>Apr 28, 2025</span>
                      <span className="mx-2">•</span>
                      <span>Dr. Sarah Johnson</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Study Planner Tab */}
        <TabsContent value="planner" className="mt-6">
          <StudyPlanner session={session} />
        </TabsContent>

        {/* Workspace Tab */}
        <TabsContent value="workspace" className="mt-6">
          <StudyWorkspace session={session} />
        </TabsContent>

        {/* Protocol Tab */}
        <TabsContent value="protocol" className="mt-6">
          <ProtocolBlueprintGenerator />
        </TabsContent>

        {/* Success Prediction Tab */}
        <TabsContent value="success" className="mt-6">
          <ProtocolSuccessPredictor />
        </TabsContent>

        {/* CSR Intelligence Tab */}
        <TabsContent value="intelligence" className="mt-6">
          <div className="space-y-6">
            <CSRIntelligenceInsights />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StudyArchitectModule;
