import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, PieChart, Activity } from 'lucide-react';

export default function CSRLibraryMetrics() {
  // Sample metrics data - in a real implementation, this would come from an API
  const metrics = {
    totalReports: 47,
    byPhase: [
      { phase: 'Phase 1', count: 12 },
      { phase: 'Phase 2', count: 18 },
      { phase: 'Phase 3', count: 15 },
      { phase: 'Phase 4', count: 2 },
    ],
    byIndication: [
      { indication: 'Diabetes', count: 14 },
      { indication: 'Oncology', count: 11 },
      { indication: 'Cardiovascular', count: 9 },
      { indication: 'Neurology', count: 7 },
      { indication: 'Other', count: 6 },
    ],
    recentActivity: [
      { action: 'Upload', document: 'CSR-047', user: 'Sarah Johnson', date: '2023-12-01' },
      { action: 'Analysis', document: 'CSR-042', user: 'David Lee', date: '2023-11-28' },
      { action: 'Export', document: 'CSR-035', user: 'Maria Garcia', date: '2023-11-27' },
    ],
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>CSR Library Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Total Reports</p>
                  <h3 className="text-2xl font-bold">{metrics.totalReports}</h3>
                </div>
                <BarChart className="h-5 w-5 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Indications Covered</p>
                  <h3 className="text-2xl font-bold">{metrics.byIndication.length}</h3>
                </div>
                <PieChart className="h-5 w-5 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Recent Activities</p>
                  <h3 className="text-2xl font-bold">{metrics.recentActivity.length}</h3>
                </div>
                <Activity className="h-5 w-5 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Reports by Phase</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {metrics.byPhase.map(item => (
                  <div key={item.phase} className="flex items-center">
                    <div className="w-36">{item.phase}</div>
                    <div className="flex-1">
                      <div className="bg-gray-200 h-2 rounded-full">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${(item.count / metrics.totalReports) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="ml-2 text-sm text-gray-500">{item.count}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Reports by Indication</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {metrics.byIndication.map(item => (
                  <div key={item.indication} className="flex items-center">
                    <div className="w-36">{item.indication}</div>
                    <div className="flex-1">
                      <div className="bg-gray-200 h-2 rounded-full">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${(item.count / metrics.totalReports) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="ml-2 text-sm text-gray-500">{item.count}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {metrics.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center">
                  <div className="w-24 text-sm text-gray-500">
                    {new Date(activity.date).toLocaleDateString()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{activity.user}</span> performed
                      <span className="font-medium"> {activity.action}</span> on
                      <span className="font-medium"> {activity.document}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}
