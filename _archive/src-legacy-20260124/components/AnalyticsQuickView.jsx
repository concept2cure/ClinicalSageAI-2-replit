import React from 'react';
import { LineChart, BarChart2, PieChart, Settings, ExternalLink } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * AnalyticsQuickView Component
 *
 * Provides a quick view of key analytics and metrics relevant to the client.
 */
const AnalyticsQuickView = ({ clientId }) => {
  // In a real application, this would fetch data from an API
  // Here we're just showing static sample data

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <BarChart2 className="h-5 w-5 mr-2 text-blue-600" />
            <CardTitle className="text-lg font-medium">Analytics</CardTitle>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings size={16} />
          </Button>
        </div>
        <CardDescription>Performance metrics & trends</CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <Tabs defaultValue="submissions">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="submissions">Submissions</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="submissions" className="mt-0">
            <div className="space-y-4">
              {/* Submission Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <div className="text-xs text-blue-600 font-medium mb-1">Total Submissions</div>
                  <div className="text-2xl font-bold text-blue-700">12</div>
                  <div className="text-xs text-blue-500 mt-1">+2 this quarter</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                  <div className="text-xs text-green-600 font-medium mb-1">Approval Rate</div>
                  <div className="text-2xl font-bold text-green-700">92%</div>
                  <div className="text-xs text-green-500 mt-1">+5% vs. last year</div>
                </div>
              </div>

              {/* Submission Status */}
              <div className="space-y-2 mt-3">
                <h4 className="text-sm font-medium text-gray-700">Status Breakdown</h4>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
                    <span className="text-xs text-gray-600">In Progress</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-xs font-medium">5</span>
                    <span className="text-xs text-gray-500 ml-1">(42%)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-amber-500 mr-2"></div>
                    <span className="text-xs text-gray-600">Under Review</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-xs font-medium">3</span>
                    <span className="text-xs text-gray-500 ml-1">(25%)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                    <span className="text-xs text-gray-600">Approved</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-xs font-medium">4</span>
                    <span className="text-xs text-gray-500 ml-1">(33%)</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="documents" className="mt-0">
            <div className="space-y-4">
              {/* Document Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                  <div className="text-xs text-purple-600 font-medium mb-1">Total Documents</div>
                  <div className="text-2xl font-bold text-purple-700">87</div>
                  <div className="text-xs text-purple-500 mt-1">+12 this month</div>
                </div>
                <div className="bg-teal-50 p-3 rounded-lg border border-teal-100">
                  <div className="text-xs text-teal-600 font-medium mb-1">Approval Time</div>
                  <div className="text-2xl font-bold text-teal-700">7d</div>
                  <div className="text-xs text-teal-500 mt-1">-2d vs. avg.</div>
                </div>
              </div>

              {/* Document Types */}
              <div className="space-y-2 mt-3">
                <h4 className="text-sm font-medium text-gray-700">Document Types</h4>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 mr-2"></div>
                    <span className="text-xs text-gray-600">Protocols</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-xs font-medium">22</span>
                    <span className="text-xs text-gray-500 ml-1">(25%)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-pink-500 mr-2"></div>
                    <span className="text-xs text-gray-600">CERs</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-xs font-medium">18</span>
                    <span className="text-xs text-gray-500 ml-1">(21%)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-amber-500 mr-2"></div>
                    <span className="text-xs text-gray-600">CMC Documents</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-xs font-medium">31</span>
                    <span className="text-xs text-gray-500 ml-1">(36%)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></div>
                    <span className="text-xs text-gray-600">Other</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-xs font-medium">16</span>
                    <span className="text-xs text-gray-500 ml-1">(18%)</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="mt-0">
            <div className="space-y-4">
              {/* Timeline Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                  <div className="text-xs text-orange-600 font-medium mb-1">On-Time Rate</div>
                  <div className="text-2xl font-bold text-orange-700">84%</div>
                  <div className="text-xs text-orange-500 mt-1">+7% vs. last quarter</div>
                </div>
                <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                  <div className="text-xs text-red-600 font-medium mb-1">Critical Deadlines</div>
                  <div className="text-2xl font-bold text-red-700">3</div>
                  <div className="text-xs text-red-500 mt-1">Next: May 15</div>
                </div>
              </div>

              {/* Milestone Timeline */}
              <div className="space-y-2 mt-3">
                <h4 className="text-sm font-medium text-gray-700">Upcoming Milestones</h4>
                <div className="mt-2 space-y-3">
                  <div className="relative pl-6 pb-3 border-l border-gray-200">
                    <div className="absolute left-0 top-0 bg-green-500 w-3 h-3 rounded-full -translate-x-1.5"></div>
                    <p className="text-xs font-medium text-gray-800">BTX-112 IND Submission</p>
                    <p className="text-xs text-gray-500">May 15, 2025</p>
                  </div>
                  <div className="relative pl-6 pb-3 border-l border-gray-200">
                    <div className="absolute left-0 top-0 bg-blue-500 w-3 h-3 rounded-full -translate-x-1.5"></div>
                    <p className="text-xs font-medium text-gray-800">BTX-112 Phase II Start</p>
                    <p className="text-xs text-gray-500">May 30, 2025</p>
                  </div>
                  <div className="relative pl-6 border-l border-gray-200">
                    <div className="absolute left-0 top-0 bg-purple-500 w-3 h-3 rounded-full -translate-x-1.5"></div>
                    <p className="text-xs font-medium text-gray-800">XR-24 Annual Report</p>
                    <p className="text-xs text-gray-500">June 12, 2025</p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="pt-0">
        <Button variant="outline" className="w-full mt-2" size="sm">
          <ExternalLink className="h-4 w-4 mr-2" />
          View Full Analytics
        </Button>
      </CardFooter>
    </Card>
  );
};

export default AnalyticsQuickView;
