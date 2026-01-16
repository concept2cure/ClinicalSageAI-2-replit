import React, { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Loader2, Download, ChevronDown, FileText, BarChart, PieChart, LineChart } from 'lucide-react'

// Mock data for visualization
const MOCK_DATA = {
  adverseEventsByAgeBracket: [
    { age: '0-17', count: 25, percent: 5 },
    { age: '18-29', count: 87, percent: 17.4 },
    { age: '30-49', count: 142, percent: 28.4 },
    { age: '50-64', count: 156, percent: 31.2 },
    { age: '65+', count: 90, percent: 18 },
  ],
  adverseEventsBySeverity: [
    { severity: 'Mild', count: 187, percent: 37.4 },
    { severity: 'Moderate', count: 223, percent: 44.6 },
    { severity: 'Severe', count: 71, percent: 14.2 },
    { severity: 'Life-threatening', count: 19, percent: 3.8 },
  ],
  monthlyTrends: Array(12)
    .fill()
    .map((_, i) => ({
      month: new Date(2024, i, 1).toLocaleString('default', { month: 'short' }),
      count: Math.floor(Math.random() * 50) + 20,
    })),
  topReportedEvents: [
    { event: 'Headache', count: 87, percent: 17.4 },
    { event: 'Nausea', count: 76, percent: 15.2 },
    { event: 'Fatigue', count: 59, percent: 11.8 },
    { event: 'Dizziness', count: 47, percent: 9.4 },
    { event: 'Rash', count: 33, percent: 6.6 },
  ],
};

export default function AdvancedDashboard({ filteredData }) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboardData, setDashboardData] = useState(null);

  useEffect(() => {
    // Simulate API call
    const fetchData = async () => {
      setLoading(true);
      try {
        // In a real implementation, we would fetch from the API
        await new Promise(resolve => setTimeout(resolve, 1500));
        setDashboardData(MOCK_DATA);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Use filtered data if available, otherwise use the original data
  const displayData = filteredData || dashboardData;

  const handleExportPDF = () => {
    // In a real implementation, this would trigger a PDF export
    alert('PDF export functionality would be implemented here');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span className="text-lg">Loading dashboard data...</span>
      </div>
    );
  }

  if (!displayData) {
    return (
      <div className="text-center p-12">
        <p className="text-muted-foreground">No data available to display.</p>
      </div>
    );
  }

  // Simple bar chart component
  const BarChartComponent = ({ data, labelKey, valueKey, height = 300 }) => {
    const maxValue = Math.max(...data.map(d => d[valueKey]));

    return (
      <div className="w-full" style={{ height }}>
        <div className="flex h-full items-end">
          {data.map((item, i) => (
            <div key={i} className="flex flex-col items-center flex-1">
              <div
                className="w-full bg-primary rounded-t max-w-[60px] mx-auto"
                style={{
                  height: `${(item[valueKey] / maxValue) * 100}%`,
                  opacity: 0.7 + 0.3 * (item[valueKey] / maxValue),
                }}
              ></div>
              <div className="text-xs mt-2 text-center font-medium">{item[labelKey]}</div>
              <div className="text-xs text-muted-foreground">{item[valueKey]}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Simple pie chart component using colored blocks
  const SimplePieChart = ({ data, labelKey, valueKey }) => {
    const total = data.reduce((sum, item) => sum + item[valueKey], 0);
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-red-500',
      'bg-purple-500',
      'bg-pink-500',
    ];

    return (
      <div className="space-y-3">
        {data.map((item, i) => (
          <div key={i} className="flex items-center">
            <div className={`w-3 h-3 ${colors[i % colors.length]} rounded-full mr-2`}></div>
            <div className="flex-1">
              <div className="text-sm font-medium">{item[labelKey]}</div>
              <div className="h-2 bg-muted rounded-full mt-1">
                <div
                  className={`h-2 ${colors[i % colors.length]} rounded-full`}
                  style={{ width: `${(item[valueKey] / total) * 100}%` }}
                ></div>
              </div>
            </div>
            <div className="ml-2 text-sm text-muted-foreground">
              {Math.round((item[valueKey] / total) * 100)}%
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Advanced Data Visualization</h2>
        <Button onClick={handleExportPDF} className="flex items-center">
          <Download className="mr-2 h-4 w-4" />
          Export PDF
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 mb-6">
          <TabsTrigger value="overview" className="flex items-center">
            <BarChart className="mr-2 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="demographics" className="flex items-center">
            <PieChart className="mr-2 h-4 w-4" />
            Demographics
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center">
            <LineChart className="mr-2 h-4 w-4" />
            Trends
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center">
            <FileText className="mr-2 h-4 w-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Adverse Events by Age</CardTitle>
                <CardDescription>Distribution across age brackets</CardDescription>
              </CardHeader>
              <CardContent>
                <BarChartComponent
                  data={displayData.adverseEventsByAgeBracket}
                  labelKey="age"
                  valueKey="count"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Events by Severity</CardTitle>
                <CardDescription>Classification of reported adverse events</CardDescription>
              </CardHeader>
              <CardContent>
                <SimplePieChart
                  data={displayData.adverseEventsBySeverity}
                  labelKey="severity"
                  valueKey="count"
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Reporting Trends</CardTitle>
              <CardDescription>Number of adverse events reported by month</CardDescription>
            </CardHeader>
            <CardContent>
              <BarChartComponent
                data={displayData.monthlyTrends}
                labelKey="month"
                valueKey="count"
                height={200}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="demographics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Patient Demographics</CardTitle>
              <CardDescription>Detailed breakdown of patient data</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground py-12">
                Demographic analysis would be displayed here with age, gender, and other patient
                characteristics.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Longitudinal Analysis</CardTitle>
              <CardDescription>Trends over time by quarter and year</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground py-12">
                Trend analysis charts would be displayed here showing patterns over time.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Reported Events</CardTitle>
              <CardDescription>Most common adverse events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left pb-2 font-medium">Event</th>
                      <th className="text-right pb-2 font-medium">Count</th>
                      <th className="text-right pb-2 font-medium">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayData.topReportedEvents.map((event, i) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-3">{event.event}</td>
                        <td className="py-3 text-right">{event.count}</td>
                        <td className="py-3 text-right">{event.percent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="text-center pt-4">
                  <Button variant="outline">
                    View All Reports
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {filteredData && (
        <Card className="bg-muted/50 border-dashed">
          <CardHeader>
            <CardTitle>Query Results</CardTitle>
            <CardDescription>Results filtered by your natural language query</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="p-3 bg-accent rounded-lg">
                <p className="font-medium">Query: {filteredData.query}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Timestamp: {new Date(filteredData.timestamp).toLocaleString()}
                </p>
              </div>

              <div className="p-4">
                <h4 className="font-semibold mb-2">Matched Results:</h4>
                <ul className="space-y-2">
                  {filteredData.results.map((result, i) => (
                    <li key={i} className="flex justify-between border-b pb-2">
                      <span>{result.name}</span>
                      <span className="text-sm text-muted-foreground">
                        Relevance: {Math.round(result.relevance * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
