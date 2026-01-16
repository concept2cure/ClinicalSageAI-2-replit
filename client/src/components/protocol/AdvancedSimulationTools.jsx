import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger, } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Download, BookOpen, BarChart4, Activity, Share2, ChevronRight, FileText, Loader2, HelpCircle, PlusCircle, Settings, Save, Repeat, Clipboard, Sparkles, Zap, BookMarked, Grid3X3, Boxes, FileBarChart2, LayoutGrid, PanelLeft, Lightbulb } from 'lucide-react'

/**
 * Advanced Simulation Tools Component
 *
 * Provides multi-dimensional analysis capabilities for comprehensive clinical trial design
 * with sophisticated Monte Carlo simulation features and export options.
 */
const AdvancedSimulationTools = ({ results, parameters, simulationSettings }) => {
  const [activeTab, setActiveTab] = useState('multi');
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [advancedParameters, setAdvancedParameters] = useState({
    distributionType: 'normal',
    variabilityFactor: 1.0,
    missingDataStrategy: 'locf',
    dropoutModel: 'random',
    interimAnalyses: 1,
    adaptationRules: 'none',
    populations: ['itt', 'pp'],
    subgroups: [],
  });
  const [dimensionSettings, setDimensionSettings] = useState({
    dim1: 'effectSize',
    dim2: 'variability',
    dim1Range: [0.2, 0.3, 0.4, 0.5, 0.6],
    dim2Range: [0.8, 1.0, 1.2, 1.4, 1.6],
  });

  const { toast } = useToast();

  // Run advanced multi-dimensional analysis
  const runMultiDimensionalAnalysis = () => {
    setIsRunningAnalysis(true);
    setAnalysisProgress(0);

    // Simulate progress updates
    const interval = setInterval(() => {
      setAnalysisProgress(prev => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return prev + Math.floor(Math.random() * 5) + 1;
      });
    }, 300);

    // Simulate completion after 5 seconds
    setTimeout(() => {
      clearInterval(interval);
      setAnalysisProgress(100);

      setTimeout(() => {
        setIsRunningAnalysis(false);
        toast({
          title: 'Analysis Complete',
          description: 'Multi-dimensional analysis has completed successfully.',
          variant: 'default',
        });
      }, 500);
    }, 5000);
  };

  // Export analysis results
  const exportResults = format => {
    toast({
      title: `Exporting as ${format.toUpperCase()}`,
      description: 'Your analysis results are being prepared for export.',
      variant: 'default',
    });
  };

  // Generate visual heatmap of multi-dimensional analysis
  const renderHeatmap = () => {
    const rows = dimensionSettings.dim1Range;
    const cols = dimensionSettings.dim2Range;

    // Helper to determine cell color based on synthetic power value
    const getCellColor = (row, col) => {
      // Create a deterministic but varied pattern
      const baseValue = (parseFloat(row) * 100 + parseFloat(col) * 50) % 100;
      const adjustedValue = Math.min(95, Math.max(50, baseValue));

      // Color spectrum from yellow to dark green
      if (adjustedValue < 60) return 'bg-yellow-100 border-yellow-200';
      if (adjustedValue < 70) return 'bg-yellow-200 border-yellow-300';
      if (adjustedValue < 80) return 'bg-green-100 border-green-200';
      if (adjustedValue < 90) return 'bg-green-200 border-green-300';
      return 'bg-green-300 border-green-400';
    };

    // Create synthetic power values for the heatmap
    const getPowerValue = (row, col) => {
      const baseValue = (parseFloat(row) * 100 + parseFloat(col) * 50) % 100;
      const adjustedValue = Math.min(95, Math.max(55, baseValue));
      return (adjustedValue / 100).toFixed(2);
    };

    return (
      <div className="mt-6">
        <div className="flex flex-col">
          <div className="text-sm font-medium mb-2 text-blue-800">
            {dimensionSettings.dim1 === 'effectSize'
              ? 'Effect Size'
              : dimensionSettings.dim1 === 'variability'
                ? 'Standard Deviation'
                : dimensionSettings.dim1 === 'dropout'
                  ? 'Dropout Rate'
                  : 'Dimension 1'}
          </div>
          <div className="border rounded-md overflow-hidden">
            <div className="flex">
              {/* Column headers */}
              <div className="w-20 bg-gray-100 flex items-center justify-center border-r border-b p-2 font-medium text-sm">
                {dimensionSettings.dim2 === 'effectSize'
                  ? 'Effect Size'
                  : dimensionSettings.dim2 === 'variability'
                    ? 'Std Dev'
                    : dimensionSettings.dim2 === 'dropout'
                      ? 'Dropout'
                      : 'Dim 2'}
              </div>
              {cols.map((col, i) => (
                <div
                  key={i}
                  className="flex-1 bg-gray-100 border-b p-2 font-medium text-sm text-center"
                >
                  {col}
                </div>
              ))}
            </div>

            {/* Rows with data */}
            {rows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex">
                <div className="w-20 bg-gray-100 flex items-center justify-center border-r p-2 font-medium text-sm">
                  {row}
                </div>
                {cols.map((col, colIndex) => (
                  <div
                    key={colIndex}
                    className={`flex-1 ${getCellColor(row, col)} p-2 text-center font-medium border-r border-b hover:bg-blue-50 cursor-pointer transition-colors`}
                    title={`Power: ${getPowerValue(row, col)}, Sample Size: ${Math.round(250 * parseFloat(row) * parseFloat(col))}`}
                  >
                    {getPowerValue(row, col)}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500 mt-2 italic text-right">
            Cell values represent statistical power at target sample size
          </div>
        </div>
      </div>
    );
  };

  // Render distribution visualization
  const renderDistributionPlot = () => {
    return (
      <div className="border rounded-md p-4 bg-gray-50 mt-4">
        <div className="flex justify-center">
          <div className="w-full h-60 relative">
            {/* Normal distribution curve */}
            <div className="absolute left-0 right-0 top-4 bottom-4 flex items-center justify-center">
              <svg viewBox="0 0 200 100" className="w-full h-full" preserveAspectRatio="none">
                <path
                  d="M0,90 C40,90 40,10 100,10 C160,10 160,90 200,90"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                />
                <path
                  d="M0,90 C40,90 40,30 100,30 C160,30 160,90 200,90"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeDasharray="4"
                />
                <line
                  x1="100"
                  y1="0"
                  x2="100"
                  y2="100"
                  stroke="#94a3b8"
                  strokeWidth="1"
                  strokeDasharray="4"
                />
              </svg>
            </div>

            {/* Labels */}
            <div className="absolute bottom-0 w-full flex justify-between px-4 text-xs text-gray-500">
              <span>Control</span>
              <span>Treatment</span>
            </div>

            <div className="absolute top-0 left-4 text-xs font-medium">
              <span className="flex items-center">
                <span className="inline-block w-3 h-1 bg-blue-500 mr-1"></span>
                Treatment
              </span>
            </div>
            <div className="absolute top-0 right-4 text-xs font-medium">
              <span className="flex items-center">
                <span className="inline-block w-3 h-1 bg-red-500 mr-1 border-dashed"></span>
                Placebo
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="multi" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 mb-6">
          <TabsTrigger value="multi">
            <Grid3X3 className="h-4 w-4 mr-2" />
            Multi-dimensional Analysis
          </TabsTrigger>
          <TabsTrigger value="adaptive">
            <Settings className="h-4 w-4 mr-2" />
            Adaptive Design Settings
          </TabsTrigger>
          <TabsTrigger value="report">
            <FileBarChart2 className="h-4 w-4 mr-2" />
            Analysis Report
          </TabsTrigger>
        </TabsList>

        {/* Multi-dimensional Analysis Tab */}
        <TabsContent value="multi" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg flex items-center">
                      <Grid3X3 className="h-5 w-5 text-blue-600 mr-2" />
                      Multi-dimensional Simulation
                    </CardTitle>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <HelpCircle className="h-5 w-5 text-blue-600" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>
                            Multi-dimensional analysis allows you to observe how your study's
                            statistical power and required sample size varies across multiple
                            parameters simultaneously.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <CardDescription>
                    Simulate how different parameter combinations affect your trial outcomes
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="dim1" className="mb-2 block">
                          Dimension 1 (Rows)
                        </Label>
                        <Select
                          value={dimensionSettings.dim1}
                          onValueChange={value =>
                            setDimensionSettings({ ...dimensionSettings, dim1: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select parameter" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="effectSize">Effect Size</SelectItem>
                            <SelectItem value="variability">Standard Deviation</SelectItem>
                            <SelectItem value="dropout">Dropout Rate</SelectItem>
                            <SelectItem value="alpha">Alpha Level</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="dim2" className="mb-2 block">
                          Dimension 2 (Columns)
                        </Label>
                        <Select
                          value={dimensionSettings.dim2}
                          onValueChange={value =>
                            setDimensionSettings({ ...dimensionSettings, dim2: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select parameter" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="effectSize">Effect Size</SelectItem>
                            <SelectItem value="variability">Standard Deviation</SelectItem>
                            <SelectItem value="dropout">Dropout Rate</SelectItem>
                            <SelectItem value="alpha">Alpha Level</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {activeTab === 'multi' && renderHeatmap()}

                    {isRunningAnalysis && (
                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Running multi-dimensional analysis...</span>
                          <span>{analysisProgress}%</span>
                        </div>
                        <Progress value={analysisProgress} className="h-2" />
                        <div className="text-xs text-gray-500 italic text-right">
                          Analyzing {dimensionSettings.dim1Range.length} x{' '}
                          {dimensionSettings.dim2Range.length} ={' '}
                          {dimensionSettings.dim1Range.length * dimensionSettings.dim2Range.length}{' '}
                          parameter combinations
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-4 border-t">
                      <div className="text-sm text-gray-500">
                        {dimensionSettings.dim1Range.length * dimensionSettings.dim2Range.length}{' '}
                        parameter combinations
                      </div>
                      <Button onClick={runMultiDimensionalAnalysis} disabled={isRunningAnalysis}>
                        {isRunningAnalysis ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <Zap className="mr-2 h-4 w-4" />
                            Run Analysis
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <Card>
                <CardHeader className="bg-gradient-to-r from-orange-50 to-orange-100">
                  <CardTitle className="text-lg flex items-center">
                    <Settings className="h-5 w-5 text-orange-600 mr-2" />
                    Advanced Settings
                  </CardTitle>
                  <CardDescription>
                    Configure specialized parameters for more realistic simulations
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="distributions">
                      <AccordionTrigger className="text-sm font-medium">
                        Response Distributions
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4">
                          <div>
                            <Label className="mb-2 block text-sm">Distribution Type</Label>
                            <Select
                              value={advancedParameters.distributionType}
                              onValueChange={value =>
                                setAdvancedParameters({
                                  ...advancedParameters,
                                  distributionType: value,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="normal">Normal</SelectItem>
                                <SelectItem value="t">Student's t</SelectItem>
                                <SelectItem value="skewed">Skewed Normal</SelectItem>
                                <SelectItem value="mixture">Mixture</SelectItem>
                              </SelectContent>
                            </Select>
                            {renderDistributionPlot()}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="missing">
                      <AccordionTrigger className="text-sm font-medium">
                        Missing Data & Dropout
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4">
                          <div>
                            <Label className="mb-2 block text-sm">Missing Data Strategy</Label>
                            <Select
                              value={advancedParameters.missingDataStrategy}
                              onValueChange={value =>
                                setAdvancedParameters({
                                  ...advancedParameters,
                                  missingDataStrategy: value,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="locf">
                                  Last Observation Carried Forward
                                </SelectItem>
                                <SelectItem value="mi">Multiple Imputation</SelectItem>
                                <SelectItem value="mm">Mixed Models</SelectItem>
                                <SelectItem value="cca">Complete Case Analysis</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="mb-2 block text-sm">Dropout Model</Label>
                            <Select
                              value={advancedParameters.dropoutModel}
                              onValueChange={value =>
                                setAdvancedParameters({
                                  ...advancedParameters,
                                  dropoutModel: value,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="random">Completely Random (MCAR)</SelectItem>
                                <SelectItem value="mar">Random Given Observed (MAR)</SelectItem>
                                <SelectItem value="mnar">Non-Random (MNAR)</SelectItem>
                                <SelectItem value="treatment">Treatment-dependent</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="subgroups">
                      <AccordionTrigger className="text-sm font-medium">
                        Population & Subgroups
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4">
                          <div className="flex flex-wrap gap-2">
                            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">
                              ITT Population
                              <button className="ml-1 opacity-70 hover:opacity-100">✕</button>
                            </Badge>
                            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">
                              Per Protocol
                              <button className="ml-1 opacity-70 hover:opacity-100">✕</button>
                            </Badge>
                            <Button variant="outline" size="sm" className="p-1 h-6">
                              <PlusCircle className="h-3 w-3 mr-1" />
                              <span className="text-xs">Add</span>
                            </Button>
                          </div>

                          <div className="border rounded-md p-3 bg-gray-50">
                            <div className="text-sm font-medium mb-2">Subgroup Analyses</div>
                            <div className="space-y-2">
                              <div className="flex items-center">
                                <input type="checkbox" id="sg1" className="mr-2" />
                                <Label htmlFor="sg1" className="text-sm">
                                  Age Group (≥65 years)
                                </Label>
                              </div>
                              <div className="flex items-center">
                                <input type="checkbox" id="sg2" className="mr-2" />
                                <Label htmlFor="sg2" className="text-sm">
                                  Sex (Female/Male)
                                </Label>
                              </div>
                              <div className="flex items-center">
                                <input type="checkbox" id="sg3" className="mr-2" />
                                <Label htmlFor="sg3" className="text-sm">
                                  Disease Severity (Mild/Moderate/Severe)
                                </Label>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="flex items-center text-xs"
                              >
                                <PlusCircle className="h-3 w-3 mr-1" />
                                Add Custom Subgroup
                              </Button>
                            </div>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
                <CardFooter className="flex justify-end border-t pt-4">
                  <Button variant="outline" className="mr-2">
                    <Repeat className="mr-2 h-4 w-4" />
                    Reset Defaults
                  </Button>
                  <Button>
                    <Save className="mr-2 h-4 w-4" />
                    Apply Settings
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100">
              <CardTitle className="text-lg flex items-center">
                <FileBarChart2 className="h-5 w-5 text-blue-600 mr-2" />
                Simulation Sensitivity Analysis
              </CardTitle>
              <CardDescription>
                Understanding how variations in assumptions affect study conclusions
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-6">
                <div>
                  <div className="font-medium mb-2 flex items-center">
                    <BarChart4 className="h-4 w-4 text-blue-600 mr-2" />
                    Power by Effect Size
                  </div>
                  <div className="bg-gray-50 border rounded-md p-4 h-40 flex items-center justify-center">
                    Power Curve Plot
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    80% power achieved at effect size &gt; 0.42
                  </div>
                </div>

                <div>
                  <div className="font-medium mb-2 flex items-center">
                    <BarChart4 className="h-4 w-4 text-green-600 mr-2" />
                    Power by Sample Size
                  </div>
                  <div className="bg-gray-50 border rounded-md p-4 h-40 flex items-center justify-center">
                    Power Curve Plot
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    80% power achieved at N &gt; 210 subjects
                  </div>
                </div>

                <div>
                  <div className="font-medium mb-2 flex items-center">
                    <BarChart4 className="h-4 w-4 text-orange-600 mr-2" />
                    Power by Dropout Rate
                  </div>
                  <div className="bg-gray-50 border rounded-md p-4 h-40 flex items-center justify-center">
                    Power Curve Plot
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    Power drops below 80% when dropout &gt; 22%
                  </div>
                </div>
              </div>

              <div className="border-t pt-6 mt-4">
                <div className="font-medium mb-4 flex items-center">
                  <Lightbulb className="h-5 w-5 text-amber-500 mr-2" />
                  Sensitivity Analysis Insights
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
                    <div className="font-medium text-amber-800 mb-2">Critical Parameters</div>
                    <ul className="list-disc ml-5 space-y-1 text-sm">
                      <li>Effect size has the most substantial impact on power</li>
                      <li>
                        Standard deviation assumption is critical - 20% higher variability reduces
                        power to 65%
                      </li>
                      <li>Dropout rates above 22% significantly compromise study integrity</li>
                    </ul>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                    <div className="font-medium text-blue-800 mb-2">
                      Optimization Recommendations
                    </div>
                    <ul className="list-disc ml-5 space-y-1 text-sm">
                      <li>
                        Consider increasing sample size to 290 for robustness against variability
                      </li>
                      <li>Implement enhanced retention strategies to minimize dropout</li>
                      <li>Employ covariate adjustment to reduce outcome variability</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t pt-4">
              <div className="text-sm text-gray-500 flex items-center">
                <Sparkles className="h-4 w-4 text-blue-500 mr-1" />
                Advanced simulations provide deeper insights into trial robustness
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => exportResults('csv')}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
                <Button onClick={() => exportResults('pdf')}>
                  <FileText className="mr-2 h-4 w-4" />
                  Generate Report
                </Button>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Adaptive Design Settings Tab */}
        <TabsContent value="adaptive" className="space-y-6">
          <Card>
            <CardHeader className="bg-gradient-to-r from-violet-50 to-violet-100">
              <CardTitle className="text-lg flex items-center">
                <Settings className="h-5 w-5 text-violet-600 mr-2" />
                Adaptive Design Configuration
              </CardTitle>
              <CardDescription>
                Configure adaptive trial design elements for increased efficiency
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-medium mb-4 flex items-center">
                    <Activity className="h-4 w-4 text-violet-600 mr-2" />
                    Interim Analysis Settings
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <Label className="mb-2 block">Number of Interim Analyses</Label>
                      <Select
                        value={advancedParameters.interimAnalyses.toString()}
                        onValueChange={value =>
                          setAdvancedParameters({
                            ...advancedParameters,
                            interimAnalyses: parseInt(value),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">None (Fixed Design)</SelectItem>
                          <SelectItem value="1">1 Interim Analysis</SelectItem>
                          <SelectItem value="2">2 Interim Analyses</SelectItem>
                          <SelectItem value="3">3 Interim Analyses</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="mb-2 block">Alpha Spending Function</Label>
                      <Select defaultValue="obf">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="obf">O'Brien-Fleming</SelectItem>
                          <SelectItem value="pocock">Pocock</SelectItem>
                          <SelectItem value="wang">Wang-Tsiatis</SelectItem>
                          <SelectItem value="haybittle">Haybittle-Peto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="mb-2 block">Timing of Interim Analyses</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Input type="text" placeholder="33%" defaultValue="33%" />
                        <Input type="text" placeholder="67%" defaultValue="67%" />
                        <Input type="text" placeholder="100%" defaultValue="100%" />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Percentage of total information/events
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-4 flex items-center">
                    <Repeat className="h-4 w-4 text-violet-600 mr-2" />
                    Adaptation Rules
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <Label className="mb-2 block">Adaptation Type</Label>
                      <Select
                        value={advancedParameters.adaptationRules}
                        onValueChange={value =>
                          setAdvancedParameters({ ...advancedParameters, adaptationRules: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None (Fixed Design)</SelectItem>
                          <SelectItem value="ssr">Sample Size Re-estimation</SelectItem>
                          <SelectItem value="treatment">Treatment Selection</SelectItem>
                          <SelectItem value="population">Population Enrichment</SelectItem>
                          <SelectItem value="endpoint">Endpoint Selection</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="mb-2 block">Futility Boundary</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Input type="text" placeholder="0.05" defaultValue="0.05" />
                        <Input type="text" placeholder="0.10" defaultValue="0.10" />
                        <Input type="text" placeholder="N/A" defaultValue="N/A" />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Conditional power thresholds for stopping
                      </p>
                    </div>

                    <div>
                      <Label className="mb-2 block">Early Efficacy Boundary</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Input type="text" placeholder="0.001" defaultValue="0.001" />
                        <Input type="text" placeholder="0.005" defaultValue="0.005" />
                        <Input type="text" placeholder="0.025" defaultValue="0.025" />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        p-value thresholds for early stopping
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t">
                <h3 className="font-medium mb-4 flex items-center">
                  <Boxes className="h-4 w-4 text-violet-600 mr-2" />
                  Simulated Operating Characteristics
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border rounded-md bg-gray-50 p-4">
                    <div className="text-sm font-medium mb-2">Type I Error Rate</div>
                    <div className="text-2xl font-bold">0.0497</div>
                    <div className="text-xs text-gray-500 mt-1">vs. nominal α=0.05</div>
                  </div>

                  <div className="border rounded-md bg-gray-50 p-4">
                    <div className="text-sm font-medium mb-2">Power</div>
                    <div className="text-2xl font-bold">0.832</div>
                    <div className="text-xs text-gray-500 mt-1">at specified effect size</div>
                  </div>

                  <div className="border rounded-md bg-gray-50 p-4">
                    <div className="text-sm font-medium mb-2">Expected Sample Size</div>
                    <div className="text-2xl font-bold">212</div>
                    <div className="text-xs text-gray-500 mt-1">vs. 250 in fixed design</div>
                  </div>

                  <div className="border rounded-md bg-gray-50 p-4">
                    <div className="text-sm font-medium mb-2">Early Stopping %</div>
                    <div className="text-2xl font-bold">38%</div>
                    <div className="text-xs text-gray-500 mt-1">for efficacy or futility</div>
                  </div>

                  <div className="border rounded-md bg-gray-50 p-4">
                    <div className="text-sm font-medium mb-2">Avg. Study Duration</div>
                    <div className="text-2xl font-bold">14.2</div>
                    <div className="text-xs text-gray-500 mt-1">months (15% reduction)</div>
                  </div>

                  <div className="border rounded-md bg-gray-50 p-4">
                    <div className="text-sm font-medium mb-2">Probability of Increase</div>
                    <div className="text-2xl font-bold">22%</div>
                    <div className="text-xs text-gray-500 mt-1">sample size increase needed</div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t pt-4">
              <Button variant="outline" className="mr-2">
                <Repeat className="mr-2 h-4 w-4" />
                Run Simulation
              </Button>
              <Button>
                <Save className="mr-2 h-4 w-4" />
                Save Design
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Analysis Report Tab */}
        <TabsContent value="report" className="space-y-6">
          <Card>
            <CardHeader className="bg-gradient-to-r from-green-50 to-green-100">
              <CardTitle className="text-lg flex items-center">
                <FileBarChart2 className="h-5 w-5 text-green-600 mr-2" />
                Analysis Report Generation
              </CardTitle>
              <CardDescription>
                Generate comprehensive statistical reports based on your simulation results
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-medium mb-3">Report Components</h3>
                    <div className="border rounded-md p-4 bg-gray-50 space-y-2">
                      <div className="flex items-center">
                        <input type="checkbox" id="comp1" className="mr-2" defaultChecked />
                        <Label htmlFor="comp1" className="text-sm">
                          Executive Summary
                        </Label>
                      </div>
                      <div className="flex items-center">
                        <input type="checkbox" id="comp2" className="mr-2" defaultChecked />
                        <Label htmlFor="comp2" className="text-sm">
                          Study Design Overview
                        </Label>
                      </div>
                      <div className="flex items-center">
                        <input type="checkbox" id="comp3" className="mr-2" defaultChecked />
                        <Label htmlFor="comp3" className="text-sm">
                          Sample Size Justification
                        </Label>
                      </div>
                      <div className="flex items-center">
                        <input type="checkbox" id="comp4" className="mr-2" defaultChecked />
                        <Label htmlFor="comp4" className="text-sm">
                          Power Analysis Results
                        </Label>
                      </div>
                      <div className="flex items-center">
                        <input type="checkbox" id="comp5" className="mr-2" defaultChecked />
                        <Label htmlFor="comp5" className="text-sm">
                          Sensitivity Analysis
                        </Label>
                      </div>
                      <div className="flex items-center">
                        <input type="checkbox" id="comp6" className="mr-2" defaultChecked />
                        <Label htmlFor="comp6" className="text-sm">
                          Statistical Methodology
                        </Label>
                      </div>
                      <div className="flex items-center">
                        <input type="checkbox" id="comp7" className="mr-2" />
                        <Label htmlFor="comp7" className="text-sm">
                          Adaptive Design Details
                        </Label>
                      </div>
                      <div className="flex items-center">
                        <input type="checkbox" id="comp8" className="mr-2" />
                        <Label htmlFor="comp8" className="text-sm">
                          References & Citations
                        </Label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-3">Export Format</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border rounded-md p-4 bg-blue-50 flex flex-col items-center text-center cursor-pointer hover:bg-blue-100 transition-colors">
                        <FileText className="h-10 w-10 text-blue-600 mb-2" />
                        <div className="font-medium">Microsoft Word</div>
                        <div className="text-xs text-gray-500 mt-1">DOCX Format</div>
                      </div>

                      <div className="border rounded-md p-4 bg-gray-50 flex flex-col items-center text-center cursor-pointer hover:bg-gray-100 transition-colors">
                        <FileText className="h-10 w-10 text-gray-600 mb-2" />
                        <div className="font-medium">PDF Document</div>
                        <div className="text-xs text-gray-500 mt-1">PDF Format</div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <h3 className="font-medium mb-3">Report Customization</h3>
                      <div className="space-y-3">
                        <div>
                          <Label className="text-sm mb-1 block">Protocol Number</Label>
                          <Input placeholder="e.g., ABC-123" defaultValue="ENZ-FORTE-2025-01" />
                        </div>
                        <div>
                          <Label className="text-sm mb-1 block">Sponsor Name</Label>
                          <Input
                            placeholder="e.g., Pharma Company Inc."
                            defaultValue="Concept2Cure Biopharmaceuticals"
                          />
                        </div>
                        <div>
                          <Label className="text-sm mb-1 block">Report Title</Label>
                          <Input
                            placeholder="Statistical Analysis Report"
                            defaultValue="Enzymax Forte Statistical Design Report"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6 mt-4">
                  <h3 className="font-medium mb-4">Report Preview</h3>
                  <div className="border rounded-md p-6 bg-white">
                    <div className="text-center mb-6">
                      <h3 className="text-lg font-bold">Enzymax Forte Statistical Design Report</h3>
                      <p className="text-sm text-gray-500">Protocol: ENZ-FORTE-2025-01</p>
                      <p className="text-sm text-gray-500">
                        Generated: {new Date().toLocaleDateString()}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold text-sm">Executive Summary</h4>
                        <p className="text-sm mt-1">
                          This report presents the statistical design and power analysis for the
                          Enzymax Forte Phase 2b study. Based on comprehensive Monte Carlo
                          simulations and sensitivity analyses, we recommend a sample size of 290
                          subjects to achieve 85% power for detecting a clinically meaningful
                          treatment effect.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-bold text-sm">Sample Size Justification</h4>
                        <p className="text-sm mt-1">
                          The primary endpoint is change from baseline in Disease Activity Score
                          (DAS) at Week 24. Assuming an effect size of 0.45, standard deviation of
                          1.0, and two-sided alpha of 0.05, a sample size of 250 subjects provides
                          85% power for the primary analysis. Accounting for an anticipated dropout
                          rate of 15%, the total enrollment target is 290 subjects.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-bold text-sm">Sensitivity Analysis</h4>
                        <p className="text-sm mt-1">
                          Sensitivity analyses indicate that the proposed design is robust to
                          moderate variations in effect size and standard deviation assumptions.
                          Power remains above 80% with effect sizes as low as 0.42 or standard
                          deviations up to 1.1. However, dropout rates exceeding 22% would
                          significantly impact power, necessitating enhanced retention strategies.
                        </p>
                      </div>
                    </div>

                    <div className="text-center text-xs text-gray-400 mt-8">
                      Preview | Page 1 of 8
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t pt-4">
              <div>
                <Button variant="outline">
                  <Clipboard className="mr-2 h-4 w-4" />
                  Copy Text
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline">
                  <PanelLeft className="mr-2 h-4 w-4" />
                  Preview Full Report
                </Button>
                <Button className="bg-green-600 hover:bg-green-700">
                  <Download className="mr-2 h-4 w-4" />
                  Generate Report
                </Button>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvancedSimulationTools;
