import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BarChart, ChartContainer, ChartTooltip, ChartBars } from '@/components/ui/chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Download, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { trialsageApi } from '@/lib/api-connector';

interface BenchmarkDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'benchmarks' | 'ai_models';
}

const BenchmarkDetailsModal: React.FC<BenchmarkDetailsModalProps> = ({
  open,
  onOpenChange,
  type,
}) => {
  // Fetch actual data from the API
  const { data, isLoading, error } = useQuery({
    queryKey: [type === 'benchmarks' ? '/api/analytics/benchmarks' : '/api/analytics/ai-models'],
    queryFn: async () => {
      try {
        const result =
          type === 'benchmarks'
            ? await trialsageApi.analytics.getBenchmarkData()
            : await trialsageApi.analytics.getAiModelData();
        return result.data;
      } catch (err) {
        console.error('Error fetching data:', err);
        throw err;
      }
    },
    // Only fetch when modal is open
    enabled: open,
  });

  const title = type === 'benchmarks' ? 'Data Benchmarks (892)' : 'AI Insight Models (14)';
  const description =
    type === 'benchmarks'
      ? 'Comprehensive collection of performance benchmarks across various therapeutic areas and phases'
      : 'Advanced AI models trained on clinical study data to provide protocol optimization insights';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl">{title}</DialogTitle>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X size={18} />
            </Button>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Separator className="my-2" />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-emerald-500 rounded-full border-t-transparent"></div>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-500">Error loading data. Please try again later.</p>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="w-full justify-start px-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="details">Detailed List</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              {type === 'ai_models' && <TabsTrigger value="training">Training Data</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview" className="flex-1 overflow-auto mt-4">
              <ScrollArea className="h-[60vh]">
                <div className="space-y-6 px-1">
                  {type === 'benchmarks' ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Total Benchmarks
                          </h3>
                          <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                            892
                          </p>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Therapeutic Areas
                          </h3>
                          <p className="text-2xl font-semibold text-gray-900 dark:text-white">34</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Latest Update
                          </h3>
                          <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                            Apr 15, 2025
                          </p>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-lg font-medium mb-3">Benchmark Categories</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                            <h4 className="font-medium mb-2">Protocol Design</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              Metrics for optimal protocol structure and specifications
                            </p>
                            <p className="text-sm">
                              <span className="font-medium">241</span> benchmarks
                            </p>
                          </div>
                          <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                            <h4 className="font-medium mb-2">Endpoint Selection</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              Primary and secondary endpoint performance metrics
                            </p>
                            <p className="text-sm">
                              <span className="font-medium">183</span> benchmarks
                            </p>
                          </div>
                          <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                            <h4 className="font-medium mb-2">Enrollment Criteria</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              Inclusion/exclusion parameters for optimal recruitment
                            </p>
                            <p className="text-sm">
                              <span className="font-medium">267</span> benchmarks
                            </p>
                          </div>
                          <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                            <h4 className="font-medium mb-2">Statistical Analysis</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              Power calculations and statistical methodology metrics
                            </p>
                            <p className="text-sm">
                              <span className="font-medium">201</span> benchmarks
                            </p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-lg font-medium mb-3">Phase Distribution</h3>
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                          <div className="h-80">
                            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-2">
                              Benchmark count by clinical trial phase
                            </p>
                            {/* Add chart here if needed */}
                            <div className="grid grid-cols-4 gap-2 mt-4">
                              <div className="flex flex-col items-center">
                                <div
                                  className="w-full bg-blue-100 dark:bg-blue-900/30 rounded-t-lg h-40"
                                  style={{ height: '76px' }}
                                ></div>
                                <p className="mt-2 text-sm font-medium">Phase 1</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  124 benchmarks
                                </p>
                              </div>
                              <div className="flex flex-col items-center">
                                <div
                                  className="w-full bg-emerald-100 dark:bg-emerald-900/30 rounded-t-lg"
                                  style={{ height: '142px' }}
                                ></div>
                                <p className="mt-2 text-sm font-medium">Phase 2</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  286 benchmarks
                                </p>
                              </div>
                              <div className="flex flex-col items-center">
                                <div
                                  className="w-full bg-purple-100 dark:bg-purple-900/30 rounded-t-lg"
                                  style={{ height: '198px' }}
                                ></div>
                                <p className="mt-2 text-sm font-medium">Phase 3</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  382 benchmarks
                                </p>
                              </div>
                              <div className="flex flex-col items-center">
                                <div
                                  className="w-full bg-orange-100 dark:bg-orange-900/30 rounded-t-lg"
                                  style={{ height: '92px' }}
                                ></div>
                                <p className="mt-2 text-sm font-medium">Phase 4</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  100 benchmarks
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                            AI Models
                          </h3>
                          <p className="text-2xl font-semibold text-gray-900 dark:text-white">14</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Training CSRs
                          </h3>
                          <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                            3,021
                          </p>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Latest Model
                          </h3>
                          <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                            Apr 10, 2025
                          </p>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-lg font-medium mb-3">AI Model Types</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                            <h4 className="font-medium mb-2">Protocol Prediction Models</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              Predict success probability based on protocol design
                            </p>
                            <p className="text-sm">
                              <span className="font-medium">4</span> models
                            </p>
                          </div>
                          <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                            <h4 className="font-medium mb-2">Enrollment Optimization</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              Optimize inclusion/exclusion criteria for recruitment
                            </p>
                            <p className="text-sm">
                              <span className="font-medium">3</span> models
                            </p>
                          </div>
                          <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                            <h4 className="font-medium mb-2">Endpoint Selection</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              Recommend optimal endpoints for specific indications
                            </p>
                            <p className="text-sm">
                              <span className="font-medium">5</span> models
                            </p>
                          </div>
                          <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                            <h4 className="font-medium mb-2">Dosing Analysis</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              Analyze optimal dosing protocols from historical data
                            </p>
                            <p className="text-sm">
                              <span className="font-medium">2</span> models
                            </p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-lg font-medium mb-3">Model Performance</h3>
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <h4 className="text-sm font-medium mb-2">
                                Protocol Success Prediction
                              </h4>
                              <div className="space-y-2">
                                <div className="flex justify-between items-center text-sm">
                                  <span>Accuracy</span>
                                  <span className="font-medium">87.3%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-emerald-500 h-full rounded-full"
                                    style={{ width: '87.3%' }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium mb-2">Enrollment Prediction</h4>
                              <div className="space-y-2">
                                <div className="flex justify-between items-center text-sm">
                                  <span>Mean Absolute Error</span>
                                  <span className="font-medium">12.4%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-blue-500 h-full rounded-full"
                                    style={{ width: '78%' }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="details" className="flex-1 overflow-auto mt-4">
              <ScrollArea className="h-[60vh]">
                <div className="space-y-4 px-1">
                  {type === 'benchmarks' ? (
                    <>
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-medium">Benchmark List</h3>
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <Download size={16} />
                          Export
                        </Button>
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-lg border overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b">
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  Benchmark ID
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  Category
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  Therapeutic Area
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  Phase
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  Value
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                              <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/10">
                                <td className="px-4 py-3 text-sm">BM-001243</td>
                                <td className="px-4 py-3 text-sm">Endpoint Selection</td>
                                <td className="px-4 py-3 text-sm">Oncology</td>
                                <td className="px-4 py-3 text-sm">Phase 3</td>
                                <td className="px-4 py-3 text-sm">OS + PFS composite</td>
                              </tr>
                              <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/10">
                                <td className="px-4 py-3 text-sm">BM-000782</td>
                                <td className="px-4 py-3 text-sm">Protocol Design</td>
                                <td className="px-4 py-3 text-sm">Cardiology</td>
                                <td className="px-4 py-3 text-sm">Phase 2</td>
                                <td className="px-4 py-3 text-sm">3:1 randomization</td>
                              </tr>
                              <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/10">
                                <td className="px-4 py-3 text-sm">BM-000413</td>
                                <td className="px-4 py-3 text-sm">Enrollment Criteria</td>
                                <td className="px-4 py-3 text-sm">Neurology</td>
                                <td className="px-4 py-3 text-sm">Phase 3</td>
                                <td className="px-4 py-3 text-sm">Age range expansion</td>
                              </tr>
                              <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/10">
                                <td className="px-4 py-3 text-sm">BM-000951</td>
                                <td className="px-4 py-3 text-sm">Statistical Analysis</td>
                                <td className="px-4 py-3 text-sm">Immunology</td>
                                <td className="px-4 py-3 text-sm">Phase 2</td>
                                <td className="px-4 py-3 text-sm">Bayesian approach</td>
                              </tr>
                              <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/10">
                                <td className="px-4 py-3 text-sm">BM-000192</td>
                                <td className="px-4 py-3 text-sm">Protocol Design</td>
                                <td className="px-4 py-3 text-sm">Oncology</td>
                                <td className="px-4 py-3 text-sm">Phase 1</td>
                                <td className="px-4 py-3 text-sm">3+3 dose escalation</td>
                              </tr>
                              <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/10">
                                <td className="px-4 py-3 text-sm">BM-000621</td>
                                <td className="px-4 py-3 text-sm">Endpoint Selection</td>
                                <td className="px-4 py-3 text-sm">Respiratory</td>
                                <td className="px-4 py-3 text-sm">Phase 3</td>
                                <td className="px-4 py-3 text-sm">FEV1 + SGRQ</td>
                              </tr>
                              <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/10">
                                <td className="px-4 py-3 text-sm">BM-000845</td>
                                <td className="px-4 py-3 text-sm">Enrollment Criteria</td>
                                <td className="px-4 py-3 text-sm">Dermatology</td>
                                <td className="px-4 py-3 text-sm">Phase 3</td>
                                <td className="px-4 py-3 text-sm">PASI score threshold</td>
                              </tr>
                              <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/10">
                                <td className="px-4 py-3 text-sm">BM-000712</td>
                                <td className="px-4 py-3 text-sm">Statistical Analysis</td>
                                <td className="px-4 py-3 text-sm">Endocrinology</td>
                                <td className="px-4 py-3 text-sm">Phase 3</td>
                                <td className="px-4 py-3 text-sm">Per-protocol analysis</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 text-sm text-gray-500 dark:text-gray-400">
                          Showing 8 of 892 benchmarks
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-medium">AI Insight Models</h3>
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <Info size={16} />
                          Documentation
                        </Button>
                      </div>

                      <div className="space-y-4">
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                          <div className="flex justify-between">
                            <div>
                              <h4 className="font-medium">Protocol Success Predictor v3.2</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                Predicts phase transition probability based on protocol design
                              </p>
                            </div>
                            <Badge variant="outline" className="h-fit">
                              Protocol Prediction
                            </Badge>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Trained on:</span>
                              <p>2,437 CSRs</p>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Accuracy:</span>
                              <p>87.3%</p>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">
                                Last updated:
                              </span>
                              <p>Apr 10, 2025</p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                          <div className="flex justify-between">
                            <div>
                              <h4 className="font-medium">Enrollment Optimizer v2.1</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                Recommends optimal inclusion/exclusion criteria modifications
                              </p>
                            </div>
                            <Badge variant="outline" className="h-fit">
                              Enrollment Optimization
                            </Badge>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Trained on:</span>
                              <p>1,892 CSRs</p>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Accuracy:</span>
                              <p>81.5%</p>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">
                                Last updated:
                              </span>
                              <p>Mar 22, 2025</p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                          <div className="flex justify-between">
                            <div>
                              <h4 className="font-medium">Endpoint Recommender v4.0</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                Suggests optimal primary/secondary endpoints by indication
                              </p>
                            </div>
                            <Badge variant="outline" className="h-fit">
                              Endpoint Selection
                            </Badge>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Trained on:</span>
                              <p>3,021 CSRs</p>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Accuracy:</span>
                              <p>92.1%</p>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">
                                Last updated:
                              </span>
                              <p>Apr 5, 2025</p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                          <div className="flex justify-between">
                            <div>
                              <h4 className="font-medium">Dosing Regimen Analyzer v1.5</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                Analyzes optimal dosing based on historical efficacy data
                              </p>
                            </div>
                            <Badge variant="outline" className="h-fit">
                              Dosing Analysis
                            </Badge>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Trained on:</span>
                              <p>1,532 CSRs</p>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Accuracy:</span>
                              <p>79.8%</p>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">
                                Last updated:
                              </span>
                              <p>Feb 18, 2025</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="performance" className="flex-1 overflow-auto mt-4">
              <ScrollArea className="h-[60vh]">
                <div className="space-y-6 px-1">
                  {type === 'benchmarks' ? (
                    <>
                      <div>
                        <h3 className="text-lg font-medium mb-3">Therapeutic Area Distribution</h3>
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                              <span className="text-sm">Oncology (183)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                              <span className="text-sm">Cardiology (127)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                              <span className="text-sm">Neurology (121)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                              <span className="text-sm">Immunology (98)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-red-500"></div>
                              <span className="text-sm">Infectious Diseases (92)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                              <span className="text-sm">Other (271)</span>
                            </div>
                          </div>

                          <div className="mt-4 h-60 w-full">
                            {/* Chart placeholder */}
                            <div className="flex h-full w-full items-end justify-around gap-2">
                              <div className="bg-emerald-500 dark:bg-emerald-600 w-8 h-[70%] rounded-t-md"></div>
                              <div className="bg-blue-500 dark:bg-blue-600 w-8 h-[45%] rounded-t-md"></div>
                              <div className="bg-purple-500 dark:bg-purple-600 w-8 h-[42%] rounded-t-md"></div>
                              <div className="bg-amber-500 dark:bg-amber-600 w-8 h-[35%] rounded-t-md"></div>
                              <div className="bg-red-500 dark:bg-red-600 w-8 h-[33%] rounded-t-md"></div>
                              <div className="bg-gray-500 dark:bg-gray-600 w-8 h-[55%] rounded-t-md"></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-lg font-medium mb-3">Benchmark Performance Impact</h3>
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                          <div className="space-y-4">
                            <div>
                              <div className="flex justify-between mb-1">
                                <h4 className="text-sm font-medium">Protocol Design Benchmarks</h4>
                                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-500">
                                  +32% Success Rate
                                </span>
                              </div>
                              <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className="bg-emerald-500 h-full rounded-full"
                                  style={{ width: '75%' }}
                                ></div>
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between mb-1">
                                <h4 className="text-sm font-medium">
                                  Endpoint Selection Benchmarks
                                </h4>
                                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-500">
                                  +21% Success Rate
                                </span>
                              </div>
                              <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className="bg-blue-500 h-full rounded-full"
                                  style={{ width: '62%' }}
                                ></div>
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between mb-1">
                                <h4 className="text-sm font-medium">
                                  Enrollment Criteria Benchmarks
                                </h4>
                                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-500">
                                  +45% Recruitment Rate
                                </span>
                              </div>
                              <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className="bg-purple-500 h-full rounded-full"
                                  style={{ width: '85%' }}
                                ></div>
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between mb-1">
                                <h4 className="text-sm font-medium">
                                  Statistical Analysis Benchmarks
                                </h4>
                                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-500">
                                  +18% Power Efficiency
                                </span>
                              </div>
                              <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className="bg-amber-500 h-full rounded-full"
                                  style={{ width: '58%' }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <h3 className="text-lg font-medium mb-3">Model Performance Metrics</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                            <h4 className="text-sm font-medium mb-3">
                              Success Prediction Accuracy
                            </h4>
                            <div className="space-y-4">
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-sm">Protocol Success Predictor v3.2</span>
                                  <span className="text-sm font-medium">87.3%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-emerald-500 h-full rounded-full"
                                    style={{ width: '87.3%' }}
                                  ></div>
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-sm">Enrollment Optimizer v2.1</span>
                                  <span className="text-sm font-medium">81.5%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-emerald-500 h-full rounded-full"
                                    style={{ width: '81.5%' }}
                                  ></div>
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-sm">Endpoint Recommender v4.0</span>
                                  <span className="text-sm font-medium">92.1%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-emerald-500 h-full rounded-full"
                                    style={{ width: '92.1%' }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                            <h4 className="text-sm font-medium mb-3">F1 Score by Model</h4>
                            <div className="space-y-4">
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-sm">Protocol Success Predictor v3.2</span>
                                  <span className="text-sm font-medium">0.853</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-blue-500 h-full rounded-full"
                                    style={{ width: '85.3%' }}
                                  ></div>
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-sm">Enrollment Optimizer v2.1</span>
                                  <span className="text-sm font-medium">0.792</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-blue-500 h-full rounded-full"
                                    style={{ width: '79.2%' }}
                                  ></div>
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-sm">Endpoint Recommender v4.0</span>
                                  <span className="text-sm font-medium">0.915</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-blue-500 h-full rounded-full"
                                    style={{ width: '91.5%' }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-lg font-medium mb-3">Therapeutic Area Performance</h3>
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                          <div className="overflow-x-auto">
                            <table className="min-w-full">
                              <thead>
                                <tr className="border-b">
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Therapeutic Area
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Protocol Prediction
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Enrollment Optimization
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Endpoint Selection
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                <tr>
                                  <td className="px-4 py-3 text-sm">Oncology</td>
                                  <td className="px-4 py-3 text-sm">92.1%</td>
                                  <td className="px-4 py-3 text-sm">86.5%</td>
                                  <td className="px-4 py-3 text-sm">94.3%</td>
                                </tr>
                                <tr>
                                  <td className="px-4 py-3 text-sm">Cardiology</td>
                                  <td className="px-4 py-3 text-sm">89.7%</td>
                                  <td className="px-4 py-3 text-sm">82.1%</td>
                                  <td className="px-4 py-3 text-sm">91.8%</td>
                                </tr>
                                <tr>
                                  <td className="px-4 py-3 text-sm">Neurology</td>
                                  <td className="px-4 py-3 text-sm">85.3%</td>
                                  <td className="px-4 py-3 text-sm">79.4%</td>
                                  <td className="px-4 py-3 text-sm">89.7%</td>
                                </tr>
                                <tr>
                                  <td className="px-4 py-3 text-sm">Immunology</td>
                                  <td className="px-4 py-3 text-sm">90.2%</td>
                                  <td className="px-4 py-3 text-sm">85.1%</td>
                                  <td className="px-4 py-3 text-sm">92.5%</td>
                                </tr>
                                <tr>
                                  <td className="px-4 py-3 text-sm">Infectious Diseases</td>
                                  <td className="px-4 py-3 text-sm">86.7%</td>
                                  <td className="px-4 py-3 text-sm">80.3%</td>
                                  <td className="px-4 py-3 text-sm">90.1%</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {type === 'ai_models' && (
              <TabsContent value="training" className="flex-1 overflow-auto mt-4">
                <ScrollArea className="h-[60vh]">
                  <div className="space-y-6 px-1">
                    <div>
                      <h3 className="text-lg font-medium mb-3">Training Data Overview</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                            CSRs Used
                          </h4>
                          <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                            3,021
                          </p>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Therapeutic Areas
                          </h4>
                          <p className="text-2xl font-semibold text-gray-900 dark:text-white">34</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Sponsors
                          </h4>
                          <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                            412
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-medium mb-3">Model Training Process</h3>
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                        <div className="space-y-6">
                          <div>
                            <h4 className="text-sm font-medium mb-2">Data Preprocessing</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              CSRs are processed through NLP pipeline for text extraction,
                              structured data generation, and feature engineering. The process
                              includes entity extraction, relationship mapping, and semantic
                              normalization across different document formats.
                            </p>
                          </div>

                          <div>
                            <h4 className="text-sm font-medium mb-2">Model Architecture</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Models use transformers architecture with domain-specific pre-training
                              on medical and clinical trial literature. Specialized heads are
                              trained for each prediction task (protocol success, enrollment
                              optimization, etc.).
                            </p>
                          </div>

                          <div>
                            <h4 className="text-sm font-medium mb-2">Training & Validation</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              80/20 split for training and validation sets with rigorous
                              cross-validation. Hyperparameter optimization performed via Bayesian
                              methods. Each model undergoes validation against historical trial
                              outcomes before deployment.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-medium mb-3">Training Data Distribution</h3>
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <h4 className="text-sm font-medium mb-3">By Phase</h4>
                            <div className="space-y-2">
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-sm">Phase 1</span>
                                  <span className="text-sm">423 CSRs</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-blue-500 h-full rounded-full"
                                    style={{ width: '14%' }}
                                  ></div>
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-sm">Phase 2</span>
                                  <span className="text-sm">986 CSRs</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-blue-500 h-full rounded-full"
                                    style={{ width: '32.6%' }}
                                  ></div>
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-sm">Phase 3</span>
                                  <span className="text-sm">1,342 CSRs</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-blue-500 h-full rounded-full"
                                    style={{ width: '44.4%' }}
                                  ></div>
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-sm">Phase 4</span>
                                  <span className="text-sm">270 CSRs</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-blue-500 h-full rounded-full"
                                    style={{ width: '9%' }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div>
                            <h4 className="text-sm font-medium mb-3">By Outcome</h4>
                            <div className="space-y-2">
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-sm">Successful</span>
                                  <span className="text-sm">1,783 CSRs</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-emerald-500 h-full rounded-full"
                                    style={{ width: '59%' }}
                                  ></div>
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-sm">Limited Success</span>
                                  <span className="text-sm">724 CSRs</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-yellow-500 h-full rounded-full"
                                    style={{ width: '24%' }}
                                  ></div>
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-sm">Unsuccessful</span>
                                  <span className="text-sm">514 CSRs</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="bg-red-500 h-full rounded-full"
                                    style={{ width: '17%' }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            )}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BenchmarkDetailsModal;
