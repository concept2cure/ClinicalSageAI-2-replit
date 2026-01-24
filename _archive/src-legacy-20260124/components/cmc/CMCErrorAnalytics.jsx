import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { AlertTriangle, FileWarning, RefreshCw } from 'lucide-react';

const CMCErrorAnalytics = () => {
  const [errorData, setErrorData] = useState({
    totalErrors: 0,
    bySeverity: {},
    byType: {},
    patterns: 0,
    topPatterns: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  const COLORS = ['#ff6b6b', '#f9ca24', '#4834d4', '#6ab04c'];

  useEffect(() => {
    fetchErrorData();
  }, []);

  const fetchErrorData = () => {
    setIsLoading(true);

    // Simulate fetching error analytics data
    setTimeout(() => {
      // Mock data for CMC module errors
      const mockData = {
        totalErrors: 27,
        bySeverity: {
          CRITICAL: 3,
          HIGH: 7,
          MEDIUM: 12,
          LOW: 5,
        },
        byType: {
          validation: 12,
          calculation: 8,
          format: 4,
          data: 3,
        },
        patterns: 4,
        topPatterns: [
          { id: 1, pattern: 'Stability data format inconsistency', count: 8, severity: 'HIGH' },
          { id: 2, pattern: 'Missing required excipient properties', count: 6, severity: 'MEDIUM' },
          { id: 3, pattern: 'Calculation precision errors', count: 5, severity: 'MEDIUM' },
        ],
      };

      setErrorData(mockData);
      setIsLoading(false);
    }, 1000);
  };

  const prepareBarChartData = () => {
    return Object.entries(errorData.byType).map(([key, value]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value,
    }));
  };

  const preparePieChartData = () => {
    return Object.entries(errorData.bySeverity).map(([key, value]) => ({
      name: key,
      value,
    }));
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          CMC Error Analytics
        </CardTitle>
        <CardDescription>Track and analyze errors in CMC processes</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="flex flex-col items-center justify-center p-4 bg-muted/50 rounded-md">
                <span className="text-3xl font-bold">{errorData.totalErrors}</span>
                <span className="text-sm text-muted-foreground">Total Errors</span>
              </div>
              <div className="flex flex-col items-center justify-center p-4 bg-muted/50 rounded-md">
                <span className="text-3xl font-bold">{errorData.bySeverity.CRITICAL || 0}</span>
                <span className="text-sm text-muted-foreground text-red-500">Critical Errors</span>
              </div>
              <div className="flex flex-col items-center justify-center p-4 bg-muted/50 rounded-md">
                <span className="text-3xl font-bold">{errorData.patterns}</span>
                <span className="text-sm text-muted-foreground">Error Patterns</span>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-semibold mb-3">Errors by Type</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={prepareBarChartData()}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#4834d4" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-semibold mb-3">Errors by Severity</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={preparePieChartData()}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {preparePieChartData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">Top Error Patterns</h3>
              <div className="space-y-2">
                {errorData.topPatterns.map(pattern => (
                  <div key={pattern.id} className="flex items-start gap-2 p-3 border rounded-md">
                    <FileWarning className="h-5 w-5 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">{pattern.pattern}</p>
                      <div className="flex gap-3 mt-1">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            pattern.severity === 'CRITICAL'
                              ? 'bg-red-100 text-red-800'
                              : pattern.severity === 'HIGH'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {pattern.severity}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Occurrences: {pattern.count}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={fetchErrorData} variant="outline" className="w-full">
          Refresh Analytics
        </Button>
      </CardFooter>
    </Card>
  );
};

export default CMCErrorAnalytics;
