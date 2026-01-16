import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';
import { BarChart, FileText, Users, Search } from 'lucide-react'

// Sample data - in a real implementation, this would come from an API
const sampleReports = [
  {
    id: 'CSR-001',
    title: 'Phase 3 Study of LumenTrial-XR in Type 2 Diabetes',
    sponsor: 'Pfizer',
    date: '2023-10-15',
    phase: 'Phase 3',
    fileSize: '12.4 MB',
    processingStatus: 'completed',
  },
  {
    id: 'CSR-002',
    title: 'Safety and Efficacy Study of TrialSage-IV in Rheumatoid Arthritis',
    sponsor: 'Novartis',
    date: '2023-09-22',
    phase: 'Phase 2',
    fileSize: '8.7 MB',
    processingStatus: 'completed',
  },
  {
    id: 'CSR-003',
    title: 'Double-Blind Study of RegulatoryCTX for Major Depressive Disorder',
    sponsor: 'Roche',
    date: '2023-11-05',
    phase: 'Phase 2',
    fileSize: '15.2 MB',
    processingStatus: 'processing',
  },
];

export default function CSRExtractorDashboard() {
  const [activeTab, setActiveTab] = useState('reports');
  const [reports, setReports] = useState([]);

  // Simulate loading data on mount
  useEffect(() => {
    const loadData = async () => {
      // In a real implementation, this would fetch from an API
      await new Promise(resolve => setTimeout(resolve, 1000));
      setReports(sampleReports);
    };

    loadData();
  }, []);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>CSR Library Dashboard</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="reports" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>Reports</span>
            </TabsTrigger>
            <TabsTrigger value="statistics" className="flex items-center gap-2">
              <BarChart className="h-4 w-4" />
              <span>Statistics</span>
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span>Insights</span>
            </TabsTrigger>
            <TabsTrigger value="sharing" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>Sharing</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sponsor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phase
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {reports.map(report => (
                    <tr key={report.id} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {report.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {report.title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {report.sponsor}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(report.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {report.phase}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            report.processingStatus === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {report.processingStatus === 'completed' ? 'Completed' : 'Processing'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="statistics">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{reports.length}</div>
                  <div className="text-sm text-gray-500">Total Reports</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {reports.filter(r => r.processingStatus === 'completed').length}
                  </div>
                  <div className="text-sm text-gray-500">Processed Reports</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {reports.filter(r => r.processingStatus === 'processing').length}
                  </div>
                  <div className="text-sm text-gray-500">Processing Reports</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="insights">
            <div className="text-center py-12">
              <p className="text-gray-500">Select reports to generate insights and comparisons</p>
            </div>
          </TabsContent>

          <TabsContent value="sharing">
            <div className="text-center py-12">
              <p className="text-gray-500">Configure sharing settings and access controls</p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
