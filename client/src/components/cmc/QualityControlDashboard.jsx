import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, AlertTriangle, XCircle, Info, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const QualityControlDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');

  // Mock data for quality metrics
  const qualityMetrics = {
    drugSubstance: {
      completeness: 87,
      complianceScore: 92,
      criticalIssues: 0,
      majorIssues: 1,
      minorIssues: 3,
    },
    drugProduct: {
      completeness: 72,
      complianceScore: 85,
      criticalIssues: 0,
      majorIssues: 2,
      minorIssues: 5,
    },
    manufacturingProcess: {
      completeness: 65,
      complianceScore: 78,
      criticalIssues: 1,
      majorIssues: 3,
      minorIssues: 2,
    },
    analyticalMethods: {
      completeness: 91,
      complianceScore: 94,
      criticalIssues: 0,
      majorIssues: 0,
      minorIssues: 2,
    },
  };

  // Recent QC activities
  const recentActivities = [
    {
      timestamp: '2025-05-10 15:23',
      description: 'Analytical method validation checklist updated',
      status: 'success',
    },
    {
      timestamp: '2025-05-10 13:47',
      description: 'Drug substance specification review completed',
      status: 'success',
    },
    {
      timestamp: '2025-05-09 16:12',
      description: 'Critical process parameter review flagged inconsistency',
      status: 'warning',
    },
    {
      timestamp: '2025-05-09 10:35',
      description: 'Stability data analysis completed',
      status: 'success',
    },
    {
      timestamp: '2025-05-08 14:22',
      description: 'Method transfer documentation missing',
      status: 'error',
    },
  ];

  // Recommendations based on QC findings
  const recommendations = [
    { id: 1, description: 'Complete Process Validation documentation', priority: 'high' },
    { id: 2, description: 'Address ICH Q3D elemental impurity data gaps', priority: 'high' },
    {
      id: 3,
      description: 'Update drug product container closure compatibility data',
      priority: 'medium',
    },
    { id: 4, description: 'Add batch genealogy for process intermediates', priority: 'medium' },
    { id: 5, description: 'Enhance method robustness documentation', priority: 'low' },
  ];

  const getStatusIcon = status => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getPriorityBadge = priority => {
    const classes = {
      high: 'bg-red-100 text-red-800 border-red-200',
      medium: 'bg-amber-100 text-amber-800 border-amber-200',
      low: 'bg-green-100 text-green-800 border-green-200',
    };

    return (
      <span className={`text-xs px-2 py-1 rounded-full border ${classes[priority]}`}>
        {priority}
      </span>
    );
  };

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle>Quality Control Dashboard</CardTitle>
        <CardDescription>
          Monitor quality metrics and compliance status across your CMC documentation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="issues">Issues</TabsTrigger>
            <TabsTrigger value="activities">Recent Activities</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(qualityMetrics).map(([section, metrics]) => (
                <Card key={section} className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      {section.replace(/([A-Z])/g, ' $1').trim()}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium">Completeness</span>
                          <span className="text-sm">{metrics.completeness}%</span>
                        </div>
                        <Progress value={metrics.completeness} />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium">Compliance Score</span>
                          <span className="text-sm">{metrics.complianceScore}%</span>
                        </div>
                        <Progress
                          value={metrics.complianceScore}
                          className="bg-gray-100"
                          indicatorClassName={`${
                            metrics.complianceScore >= 90
                              ? 'bg-green-500'
                              : metrics.complianceScore >= 75
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          }`}
                        />
                      </div>

                      <div className="flex justify-between text-sm">
                        <div className="flex items-center">
                          <div className="bg-red-100 p-1 rounded-full mr-2">
                            <XCircle className="h-3 w-3 text-red-600" />
                          </div>
                          <span>Critical: {metrics.criticalIssues}</span>
                        </div>
                        <div className="flex items-center">
                          <div className="bg-amber-100 p-1 rounded-full mr-2">
                            <AlertTriangle className="h-3 w-3 text-amber-600" />
                          </div>
                          <span>Major: {metrics.majorIssues}</span>
                        </div>
                        <div className="flex items-center">
                          <div className="bg-blue-100 p-1 rounded-full mr-2">
                            <Info className="h-3 w-3 text-blue-600" />
                          </div>
                          <span>Minor: {metrics.minorIssues}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Issues Tab */}
          <TabsContent value="issues">
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-medium mb-2">Critical Issues</h3>
                {qualityMetrics.manufacturingProcess.criticalIssues > 0 ? (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm">
                    <div className="flex items-start">
                      <XCircle className="h-5 w-5 text-red-500 mr-2 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-red-800">
                          Incomplete Critical Process Parameter Documentation
                        </h4>
                        <p className="text-red-700 mt-1">
                          Manufacturing process is missing documentation for 2 critical process
                          parameters. This will be flagged during regulatory review.
                        </p>
                        <div className="mt-2">
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            View Details
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs ml-2 bg-red-600 hover:bg-red-700"
                          >
                            Fix Issue
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No critical issues found.</p>
                )}
              </div>

              <div>
                <h3 className="text-base font-medium mb-2">Major Issues</h3>
                <div className="space-y-2">
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm">
                    <div className="flex items-start">
                      <AlertTriangle className="h-5 w-5 text-amber-500 mr-2 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-amber-800">
                          Drug Product Specification Inconsistency
                        </h4>
                        <p className="text-amber-700 mt-1">
                          Release and shelf-life specifications show inconsistent acceptance
                          criteria for Impurity B.
                        </p>
                        <div className="mt-2">
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            View Details
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs ml-2 bg-amber-600 hover:bg-amber-700"
                          >
                            Review and Fix
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm">
                    <div className="flex items-start">
                      <AlertTriangle className="h-5 w-5 text-amber-500 mr-2 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-amber-800">
                          Incomplete Stability Protocol
                        </h4>
                        <p className="text-amber-700 mt-1">
                          Drug product stability protocol is missing testing frequency for
                          photostability studies.
                        </p>
                        <div className="mt-2">
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            View Details
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs ml-2 bg-amber-600 hover:bg-amber-700"
                          >
                            Complete Protocol
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-base font-medium mb-2">Minor Issues</h3>
                <div className="space-y-2">
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm">
                    <div className="flex items-start">
                      <Info className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-800">
                          Method Validation Cross-References
                        </h4>
                        <p className="text-blue-700 mt-1">
                          Cross-references to method validation reports are inconsistently formatted
                          across sections.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm">
                    <div className="flex items-start">
                      <Info className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-800">Formatting Inconsistencies</h4>
                        <p className="text-blue-700 mt-1">
                          Inconsistent formatting of batch numbers throughout Drug Substance
                          section.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Activities Tab */}
          <TabsContent value="activities">
            <div className="border rounded-md divide-y">
              {recentActivities.map((activity, index) => (
                <div key={index} className="p-3 flex items-start">
                  <div className="mr-3 mt-1">{getStatusIcon(activity.status)}</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{activity.description}</p>
                    <p className="text-xs text-gray-500 mt-1">{activity.timestamp}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8">
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Recommendations Tab */}
          <TabsContent value="recommendations">
            <div className="space-y-3">
              {recommendations.map(rec => (
                <div key={rec.id} className="border rounded-md p-3 flex items-start">
                  <div className="flex-1">
                    <div className="flex items-center">
                      {getPriorityBadge(rec.priority)}
                      <span className="text-sm font-medium ml-2">{rec.description}</span>
                    </div>
                  </div>
                  <Button size="sm">Implement</Button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default QualityControlDashboard;
