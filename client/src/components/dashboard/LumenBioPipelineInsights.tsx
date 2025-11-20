import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRight, FileText, Beaker, Brain, FlaskConical } from 'lucide-react';

const LumenBioPipelineInsights = ({ className }: { className?: string }) => {
  return (
    <Card className={className}>
      <CardHeader className="border-b bg-slate-50 dark:bg-slate-900 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Beaker className="h-5 w-5 text-indigo-600" />
            <CardTitle className="text-lg">Lumen Bio Pipeline Insights</CardTitle>
          </div>
          <Badge variant="outline" className="bg-white">
            Client Intelligence
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full grid grid-cols-3 mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="indications">Indications</TabsTrigger>
            <TabsTrigger value="trials">Clinical Trials</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white shadow-sm rounded-lg p-4 border">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-gray-500">Parkinson's Disease</p>
                    <h4 className="text-xl font-bold mt-1">24</h4>
                  </div>
                  <Brain className="h-8 w-8 text-blue-500 opacity-80" />
                </div>
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Active clinical trials</p>
                  <Progress value={68} className="h-1.5" />
                </div>
              </div>

              <div className="bg-white shadow-sm rounded-lg p-4 border">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-gray-500">ARDS</p>
                    <h4 className="text-xl font-bold mt-1">18</h4>
                  </div>
                  <FileText className="h-8 w-8 text-emerald-500 opacity-80" />
                </div>
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Active clinical trials</p>
                  <Progress value={52} className="h-1.5" />
                </div>
              </div>

              <div className="bg-white shadow-sm rounded-lg p-4 border">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-gray-500">Solid Tumors</p>
                    <h4 className="text-xl font-bold mt-1">42</h4>
                  </div>
                  <FlaskConical className="h-8 w-8 text-purple-500 opacity-80" />
                </div>
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Active clinical trials</p>
                  <Progress value={85} className="h-1.5" />
                </div>
              </div>
            </div>

            <div className="mt-4 bg-gradient-to-r from-indigo-50 to-blue-50 p-4 rounded-lg border border-blue-100">
              <h4 className="font-medium text-indigo-900 mb-2 flex items-center">
                <Beaker className="h-4 w-4 mr-2 text-indigo-600" />
                Pipeline Summary
              </h4>
              <p className="text-sm text-slate-700">
                Lumen Bio is focused on innovative approaches to neurological disorders, respiratory
                conditions, and oncology. Their pipeline includes 84 active clinical trials across
                multiple therapeutic areas.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="indications" className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm border">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-8 bg-blue-500 rounded-full"></div>
                  <div>
                    <p className="font-medium">Parkinson's disease</p>
                    <p className="text-xs text-gray-500">Neurology</p>
                  </div>
                </div>
                <Badge>24 trials</Badge>
              </div>

              <div className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm border">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-8 bg-emerald-500 rounded-full"></div>
                  <div>
                    <p className="font-medium">Acute Respiratory Distress Syndrome</p>
                    <p className="text-xs text-gray-500">Respiratory</p>
                  </div>
                </div>
                <Badge>18 trials</Badge>
              </div>

              <div className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm border">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-8 bg-purple-500 rounded-full"></div>
                  <div>
                    <p className="font-medium">Solid Tumors</p>
                    <p className="text-xs text-gray-500">Oncology</p>
                  </div>
                </div>
                <Badge>42 trials</Badge>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="trials" className="space-y-4">
            <div className="relative overflow-x-auto shadow-sm rounded-lg border">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3">
                      Trial ID
                    </th>
                    <th scope="col" className="px-6 py-3">
                      Indication
                    </th>
                    <th scope="col" className="px-6 py-3">
                      Phase
                    </th>
                    <th scope="col" className="px-6 py-3">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white border-b hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">NCT04538066</td>
                    <td className="px-6 py-4">Parkinson's Disease</td>
                    <td className="px-6 py-4">Phase 2</td>
                    <td className="px-6 py-4">
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-200"
                      >
                        Recruiting
                      </Badge>
                    </td>
                  </tr>
                  <tr className="bg-white border-b hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">NCT04129957</td>
                    <td className="px-6 py-4">ARDS</td>
                    <td className="px-6 py-4">Phase 1/2</td>
                    <td className="px-6 py-4">
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-200"
                      >
                        Not yet recruiting
                      </Badge>
                    </td>
                  </tr>
                  <tr className="bg-white hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">NCT05281146</td>
                    <td className="px-6 py-4">Solid Tumors</td>
                    <td className="px-6 py-4">Phase 1</td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        Active
                      </Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default LumenBioPipelineInsights;
