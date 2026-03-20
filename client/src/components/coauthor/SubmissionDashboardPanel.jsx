import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  BarChart,
  CheckCircle,
  AlertTriangle,
  Clock,
  FileText,
  Users,
  MessageSquare,
} from 'lucide-react';

export default function SubmissionDashboardPanel({ submissionId }) {
  // In a real implementation, this data would come from an API call
  const dashboardData = {
    totalSections: 28,
    completedSections: 12,
    inProgressSections: 8,
    notStartedSections: 8,
    recentActivities: [
      {
        id: 1,
        user: 'Sarah Johnson',
        action: 'edited',
        section: '2.7.3 Clinical Efficacy',
        time: '2 hours ago',
      },
      {
        id: 2,
        user: 'Robert Chen',
        action: 'commented on',
        section: '2.5.4 Risk Analysis',
        time: '3 hours ago',
      },
      {
        id: 3,
        user: 'Michael Smith',
        action: 'completed',
        section: '2.3.1 Introduction',
        time: '5 hours ago',
      },
      {
        id: 4,
        user: 'AI Assistant',
        action: 'generated draft for',
        section: '2.7.4 Safety Summary',
        time: '6 hours ago',
      },
    ],
    approvals: {
      pending: 3,
      completed: 5,
    },
    issues: {
      critical: 2,
      major: 3,
      minor: 5,
    },
    collaborators: 5,
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
      <Card className="col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center">
            <BarChart className="h-5 w-5 mr-2 text-blue-600" />
            Submission Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="border rounded-md p-3 bg-green-50 border-green-100">
                <div className="text-sm font-medium text-green-800 flex items-center">
                  <CheckCircle className="h-4 w-4 mr-1.5" />
                  <span>Completed</span>
                </div>
                <div className="text-2xl font-semibold text-green-900 mt-1">
                  {dashboardData.completedSections}
                </div>
                <div className="text-xs text-green-700 mt-0.5">
                  {Math.round(
                    (dashboardData.completedSections / dashboardData.totalSections) * 100
                  )}
                  % of total
                </div>
              </div>

              <div className="border rounded-md p-3 bg-amber-50 border-amber-100">
                <div className="text-sm font-medium text-amber-800 flex items-center">
                  <Clock className="h-4 w-4 mr-1.5" />
                  <span>In Progress</span>
                </div>
                <div className="text-2xl font-semibold text-amber-900 mt-1">
                  {dashboardData.inProgressSections}
                </div>
                <div className="text-xs text-amber-700 mt-0.5">
                  {Math.round(
                    (dashboardData.inProgressSections / dashboardData.totalSections) * 100
                  )}
                  % of total
                </div>
              </div>

              <div className="border rounded-md p-3 bg-gray-50 border-gray-200">
                <div className="text-sm font-medium text-gray-700 flex items-center">
                  <FileText className="h-4 w-4 mr-1.5" />
                  <span>Not Started</span>
                </div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">
                  {dashboardData.notStartedSections}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {Math.round(
                    (dashboardData.notStartedSections / dashboardData.totalSections) * 100
                  )}
                  % of total
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <div className="text-sm font-medium">Overall Completion</div>
                <div className="text-sm font-medium">
                  {Math.round(
                    (dashboardData.completedSections / dashboardData.totalSections) * 100
                  )}
                  %
                </div>
              </div>
              <Progress
                value={(dashboardData.completedSections / dashboardData.totalSections) * 100}
                className="h-2"
              />
            </div>

            <div className="border rounded-md">
              <div className="bg-gray-50 p-2 border-b text-sm font-medium">Recent Activity</div>
              <div className="p-2 space-y-2">
                {dashboardData.recentActivities.map(activity => (
                  <div
                    key={activity.id}
                    className="flex items-start p-2 hover:bg-gray-50 rounded-md"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium text-sm mr-3 flex-shrink-0">
                      {activity.user
                        .split(' ')
                        .map(name => name[0])
                        .join('')}
                    </div>
                    <div>
                      <p className="text-sm">
                        <span className="font-medium">{activity.user}</span>
                        <span className="text-gray-600"> {activity.action} </span>
                        <span className="font-medium text-blue-700">{activity.section}</span>
                      </p>
                      <p className="text-xs text-gray-500">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-blue-600" />
              Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2 border rounded-md bg-red-50 border-red-100">
                <div className="flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-2 text-red-600" />
                  <span className="text-sm font-medium text-red-800">Critical</span>
                </div>
                <div className="text-lg font-semibold text-red-900">
                  {dashboardData.issues.critical}
                </div>
              </div>

              <div className="flex justify-between items-center p-2 border rounded-md bg-amber-50 border-amber-100">
                <div className="flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-2 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">Major</span>
                </div>
                <div className="text-lg font-semibold text-amber-900">
                  {dashboardData.issues.major}
                </div>
              </div>

              <div className="flex justify-between items-center p-2 border rounded-md bg-gray-50 border-gray-200">
                <div className="flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-2 text-blue-600" />
                  <span className="text-sm font-medium text-gray-800">Minor</span>
                </div>
                <div className="text-lg font-semibold text-gray-900">
                  {dashboardData.issues.minor}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center">
              <Users className="h-5 w-5 mr-2 text-blue-600" />
              Collaboration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="text-sm font-medium">Active Collaborators</div>
                <div className="bg-blue-100 text-blue-800 rounded-full px-2 py-0.5 text-xs font-medium">
                  {dashboardData.collaborators} Users
                </div>
              </div>

              <div className="flex -space-x-2">
                {[...Array(Math.min(5, dashboardData.collaborators))].map((_, i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium text-white`}
                    style={{
                      backgroundColor: ['#4F46E5', '#d97757', '#0891B2', '#647746', '#5585b3'][i],
                      zIndex: 5 - i,
                    }}
                  >
                    {String.fromCharCode(65 + i)}
                  </div>
                ))}

                {dashboardData.collaborators > 5 && (
                  <div
                    className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600"
                    style={{ zIndex: 0 }}
                  >
                    +{dashboardData.collaborators - 5}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-2 border-t">
                <div className="text-sm font-medium">Comments</div>
                <div className="flex items-center text-sm text-gray-600">
                  <MessageSquare className="h-4 w-4 mr-1.5" />
                  <span>12</span>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="text-sm font-medium">Approvals</div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center text-xs">
                    <CheckCircle className="h-3.5 w-3.5 mr-1 text-green-600" />
                    <span>{dashboardData.approvals.completed}</span>
                  </div>
                  <div className="flex items-center text-xs">
                    <Clock className="h-3.5 w-3.5 mr-1 text-amber-600" />
                    <span>{dashboardData.approvals.pending}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
