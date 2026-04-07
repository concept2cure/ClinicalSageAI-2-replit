import React, { useState, useEffect } from 'react';
import { useToast } from '../../hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import {
  Loader2,
  Sparkles,
  Calculator,
  BarChart3,
  LineChart,
  Users,
  Clock,
  Check,
  Info,
  Download,
  Share2,
  AlertCircle,
  RefreshCw,
  Zap,
  ArrowRight,
  Copy,
} from 'lucide-react';

/**
 * Adaptive Design Simulator Component
 *
 * Runs Monte Carlo & Bayesian simulations on proposed study designs,
 * visualizes power curves, predicted enrollment timelines, and drop-out impact.
 */
const AdaptiveDesignSimulator = () => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [simulationResults, setSimulationResults] = useState(null);
  const [designType, setDesignType] = useState('parallel');
  const [activeTab, setActiveTab] = useState('design');

  // Form state
  const [formData, setFormData] = useState({
    numArms: 2,
    totalSampleSize: 200,
    treatmentAllocation: '1:1',
    primaryEndpoint: 'continuous',
    effectSize: 0.5,
    alpha: 0.05,
    power: 0.8,
    enrollmentRate: 10,
    dropoutRate: 0.1,
    interimAnalyses: 1,
    adaptations: ['sample_size'],
    simulationType: 'monte_carlo',
    numSimulations: 1000,
  });

  const { toast } = useToast();

  const handleValueChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCheckboxChange = (field, value) => {
    const currentValues = [...formData[field]];

    if (currentValues.includes(value)) {
      handleValueChange(
        field,
        currentValues.filter(v => v !== value)
      );
    } else {
      handleValueChange(field, [...currentValues, value]);
    }
  };

  const runSimulation = () => {
    // Validate required fields
    if (!formData.totalSampleSize || !formData.effectSize || !formData.alpha || !formData.power) {
      toast({
        title: 'Missing required parameters',
        description:
          'Please provide total sample size, effect size, significance level (alpha), and power.',
        variant: 'destructive',
      });
      return;
    }

    setIsSimulating(true);

    // Simulate delay for simulation running
    setTimeout(() => {
      const mockSimulationResults = generateSimulationResults();
      setSimulationResults(mockSimulationResults);
      setIsSimulating(false);
      setSimulationComplete(true);

      toast({
        title: 'Simulation Complete',
        description: `${formData.simulationType === 'monte_carlo' ? 'Monte Carlo' : 'Bayesian'} simulation completed successfully with ${formData.numSimulations.toLocaleString()} iterations.`,
        variant: 'default',
      });
    }, 3000);
  };

  const generateSimulationResults = () => {
    const power = formData.power;
    const sampleSize = formData.totalSampleSize;
    const effectSize = formData.effectSize;
    const dropoutRate = formData.dropoutRate;
    const enrollmentRate = formData.enrollmentRate;

    // This would be replaced with actual simulation results
    return {
      power: {
        overallPower: power,
        powerByEffect: [
          { effectSize: effectSize * 0.5, power: power * 0.65 },
          { effectSize: effectSize * 0.75, power: power * 0.85 },
          { effectSize: effectSize, power: power },
          { effectSize: effectSize * 1.25, power: power * 1.1 > 1 ? 1 : power * 1.1 },
          { effectSize: effectSize * 1.5, power: power * 1.15 > 1 ? 1 : power * 1.15 },
        ],
        powerByArm: Array(parseInt(formData.numArms))
          .fill()
          .map((_, i) => ({
            arm: `Arm ${i + 1}`,
            power:
              power * (0.95 + Math.random() * 0.1) > 1 ? 1 : power * (0.95 + Math.random() * 0.1),
          })),
      },
      timeline: {
        totalDuration:
          Math.ceil(sampleSize / enrollmentRate) + parseInt(formData.treatmentDuration || 12),
        enrollmentPeriod: Math.ceil(sampleSize / enrollmentRate),
        treatmentPeriod: parseInt(formData.treatmentDuration || 12),
        followUpPeriod: parseInt(formData.followUpDuration || 4),
        interimAnalyses:
          formData.interimAnalyses > 0
            ? Array(parseInt(formData.interimAnalyses))
                .fill()
                .map((_, i) => ({
                  number: i + 1,
                  timing:
                    Math.ceil(
                      ((sampleSize / (formData.interimAnalyses + 1)) * (i + 1)) / enrollmentRate
                    ) + Math.floor(parseInt(formData.treatmentDuration || 12) / 2),
                  sampleSizeAtInterim: Math.floor(
                    (sampleSize / (formData.interimAnalyses + 1)) * (i + 1)
                  ),
                }))
            : [],
      },
      dropoutImpact: {
        expectedCompletionRate: 1 - dropoutRate,
        effectOnPower: Math.max(0, power - dropoutRate * 0.5),
        adjustedSampleSize: Math.ceil(sampleSize / (1 - dropoutRate)),
        dropoutByArm: Array(parseInt(formData.numArms))
          .fill()
          .map((_, i) => ({
            arm: `Arm ${i + 1}`,
            dropoutRate: dropoutRate * (0.8 + Math.random() * 0.4),
          })),
      },
      sampleSizeOptions: [
        {
          power: 0.7,
          sampleSize: Math.floor(sampleSize * 0.8),
          perArm: Math.floor((sampleSize * 0.8) / formData.numArms),
        },
        {
          power: 0.8,
          sampleSize: sampleSize,
          perArm: Math.floor(sampleSize / formData.numArms),
        },
        {
          power: 0.9,
          sampleSize: Math.floor(sampleSize * 1.3),
          perArm: Math.floor((sampleSize * 1.3) / formData.numArms),
        },
      ],
      adaptiveDesignRecommendations: [
        {
          type: 'Interim Analysis',
          description: `Conduct ${formData.interimAnalyses} interim ${formData.interimAnalyses === 1 ? 'analysis' : 'analyses'} when approximately ${Math.floor(sampleSize / (formData.interimAnalyses + 1))} subjects have completed the primary endpoint assessment.`,
          impact:
            'Allows early stopping for futility or efficacy, potentially reducing study duration and cost.',
        },
        {
          type: 'Sample Size Re-estimation',
          description: `Based on observed effect size at interim, sample size may be adjusted to maintain ${Math.round(power * 100)}% power for the final analysis.`,
          impact: 'Increases likelihood of study success by adapting to actual observed data.',
        },
        {
          type: 'Allocation Ratio Adjustment',
          description:
            'Consider response-adaptive randomization to allocate more subjects to better-performing arms as data accumulates.',
          impact:
            'Maximizes treatment of subjects with the most effective intervention while maintaining study validity.',
        },
      ],
    };
  };

  // PowerCurveChart component
  const PowerCurveChart = ({ data }) => {
    // This is a simplified visual representation that would be replaced with a proper chart library
    return (
      <div className="h-64 bg-white p-4 rounded-md border">
        <div className="flex justify-between items-center mb-4">
          <div className="font-medium text-sm">Power Curve by Effect Size</div>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
        </div>
        <div className="flex flex-col h-[calc(100%-2rem)] space-y-3 justify-end relative">
          <div className="absolute top-0 left-0 h-full w-full">
            {/* Y-axis line */}
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-200"></div>

            {/* X-axis line */}
            <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-200"></div>

            {/* Y-axis labels */}
            <div className="absolute left-2 top-0 text-xs text-gray-500">1.0</div>
            <div className="absolute left-2 top-1/4 text-xs text-gray-500">0.75</div>
            <div className="absolute left-2 top-2/4 text-xs text-gray-500">0.50</div>
            <div className="absolute left-2 top-3/4 text-xs text-gray-500">0.25</div>

            {/* Reference line for target power */}
            <div
              className="absolute left-0 right-0 border-t border-dashed border-blue-300"
              style={{ top: `${100 - data.overallPower * 100}%` }}
            ></div>
            <div
              className="absolute right-2 text-xs text-blue-500 bg-white px-1"
              style={{ top: `${100 - data.overallPower * 100 - 2}%` }}
            >
              Target Power ({Math.round(data.overallPower * 100)}%)
            </div>

            {/* Power curve (simplified representation) */}
            <svg className="absolute inset-0 p-6" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path
                d={`
                  M 0,${100 - data.powerByEffect[0].power * 100}
                  L 25,${100 - data.powerByEffect[1].power * 100}
                  L 50,${100 - data.powerByEffect[2].power * 100}
                  L 75,${100 - data.powerByEffect[3].power * 100}
                  L 100,${100 - data.powerByEffect[4].power * 100}
                `}
                stroke="#6a9bcc"
                strokeWidth="2"
                fill="none"
              />

              {/* Data points */}
              {data.powerByEffect.map((point, index) => {
                const x = index * 25;
                const y = 100 - point.power * 100;
                return <circle key={index} cx={x} cy={y} r="2" fill="#6a9bcc" />;
              })}
            </svg>
          </div>

          {/* X-axis labels */}
          <div className="flex justify-between relative z-10 pb-2">
            {data.powerByEffect.map((point, index) => (
              <div key={index} className="text-xs text-gray-500">
                {point.effectSize.toFixed(2)}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // TimelineChart component
  const TimelineChart = ({ data }) => {
    return (
      <div className="h-64 bg-white p-4 rounded-md border">
        <div className="flex justify-between items-center mb-4">
          <div className="font-medium text-sm">Study Timeline Projection</div>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
        </div>
        <div className="flex flex-col h-[calc(100%-2rem)] justify-center">
          <div className="relative h-24 mt-4">
            {/* Total timeline */}
            <div className="absolute top-0 left-0 right-0 h-8 bg-gray-100 rounded-md"></div>

            {/* Enrollment period */}
            <div
              className="absolute top-0 left-0 h-8 bg-blue-100 rounded-l-md border-r border-white"
              style={{ width: `${(data.enrollmentPeriod / data.totalDuration) * 100}%` }}
            >
              <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-blue-800">
                Enrollment ({data.enrollmentPeriod} weeks)
              </div>
            </div>

            {/* Treatment period */}
            <div
              className="absolute top-0 h-8 bg-green-100 border-r border-white"
              style={{
                left: `${(data.enrollmentPeriod / data.totalDuration) * 100}%`,
                width: `${(data.treatmentPeriod / data.totalDuration) * 100}%`,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-green-800">
                Treatment ({data.treatmentPeriod} weeks)
              </div>
            </div>

            {/* Follow-up period */}
            <div
              className="absolute top-0 h-8 bg-purple-100 rounded-r-md"
              style={{
                left: `${((data.enrollmentPeriod + data.treatmentPeriod) / data.totalDuration) * 100}%`,
                width: `${(data.followUpPeriod / data.totalDuration) * 100}%`,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-purple-800">
                Follow-up ({data.followUpPeriod} weeks)
              </div>
            </div>

            {/* Interim analyses */}
            {data.interimAnalyses.map((interim, index) => (
              <div
                key={index}
                className="absolute top-10 mt-2 flex flex-col items-center"
                style={{ left: `${(interim.timing / data.totalDuration) * 100}%` }}
              >
                <div className="h-4 w-0.5 bg-red-500"></div>
                <div className="bg-red-100 text-red-800 text-xs font-medium px-2 py-0.5 rounded mt-1">
                  Interim #{interim.number}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Week {interim.timing}</div>
              </div>
            ))}
          </div>

          {/* Timeline markers */}
          <div className="flex justify-between mt-16">
            <div className="text-xs text-gray-500">Week 0</div>
            <div className="text-xs text-gray-500">Week {Math.floor(data.totalDuration / 2)}</div>
            <div className="text-xs text-gray-500">Week {data.totalDuration}</div>
          </div>
        </div>
      </div>
    );
  };

  const handleDownloadResults = () => {
    toast({
      title: 'Downloading Simulation Results',
      description: 'Your simulation results are being prepared for download.',
      variant: 'default',
    });

    // Simulate download delay
    setTimeout(() => {
      toast({
        title: 'Download Complete',
        description: 'Simulation results have been downloaded as PDF and CSV files.',
        variant: 'default',
      });
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl">Adaptive Design Simulator</CardTitle>
              <CardDescription>
                Simulate and visualize study power, enrollment timelines, and adaptive design
                strategies
              </CardDescription>
            </div>
            <Badge variant="outline" className="flex items-center">
              <Calculator className="h-3.5 w-3.5 mr-1 text-blue-500" />
              Advanced Simulation
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!simulationComplete ? (
            <div className="space-y-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="design">Study Design</TabsTrigger>
                  <TabsTrigger value="statistics">Statistical Parameters</TabsTrigger>
                  <TabsTrigger value="enrollment">Enrollment & Timeline</TabsTrigger>
                  <TabsTrigger value="adaptations">Adaptive Elements</TabsTrigger>
                </TabsList>

                <TabsContent value="design" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-base">Design Type</Label>
                      <RadioGroup
                        defaultValue="parallel"
                        className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2"
                        value={designType}
                        onValueChange={setDesignType}
                      >
                        <div className="flex items-center space-x-2 border rounded-md p-3 hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="parallel" id="parallel" />
                          <Label htmlFor="parallel" className="font-normal cursor-pointer">
                            Parallel Group
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2 border rounded-md p-3 hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="crossover" id="crossover" />
                          <Label htmlFor="crossover" className="font-normal cursor-pointer">
                            Crossover
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2 border rounded-md p-3 hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="factorial" id="factorial" />
                          <Label htmlFor="factorial" className="font-normal cursor-pointer">
                            Factorial
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="numArms">Number of Arms</Label>
                        <Select
                          value={formData.numArms.toString()}
                          onValueChange={value => handleValueChange('numArms', parseInt(value))}
                        >
                          <SelectTrigger id="numArms">
                            <SelectValue placeholder="Select number of arms" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2">2 arms</SelectItem>
                            <SelectItem value="3">3 arms</SelectItem>
                            <SelectItem value="4">4 arms</SelectItem>
                            <SelectItem value="5">5 arms</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="totalSampleSize">Total Sample Size</Label>
                        <Input
                          id="totalSampleSize"
                          type="number"
                          min="10"
                          step="10"
                          value={formData.totalSampleSize}
                          onChange={e =>
                            handleValueChange('totalSampleSize', parseInt(e.target.value))
                          }
                          placeholder="e.g., 200"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="treatmentAllocation">Treatment Allocation</Label>
                        <Select
                          value={formData.treatmentAllocation}
                          onValueChange={value => handleValueChange('treatmentAllocation', value)}
                        >
                          <SelectTrigger id="treatmentAllocation">
                            <SelectValue placeholder="Select allocation ratio" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1:1">Equal (1:1)</SelectItem>
                            <SelectItem value="2:1">2:1 (Treatment:Control)</SelectItem>
                            <SelectItem value="3:1">3:1 (Treatment:Control)</SelectItem>
                            <SelectItem value="adaptive">Adaptive Allocation</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="primaryEndpoint">Primary Endpoint Type</Label>
                        <Select
                          value={formData.primaryEndpoint}
                          onValueChange={value => handleValueChange('primaryEndpoint', value)}
                        >
                          <SelectTrigger id="primaryEndpoint">
                            <SelectValue placeholder="Select endpoint type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="continuous">Continuous</SelectItem>
                            <SelectItem value="binary">Binary</SelectItem>
                            <SelectItem value="time-to-event">Time-to-Event</SelectItem>
                            <SelectItem value="count">Count</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="statistics" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="effectSize">
                        Expected Effect Size
                        <span className="text-xs text-gray-500 ml-2">
                          {formData.primaryEndpoint === 'continuous'
                            ? "(Cohen's d)"
                            : formData.primaryEndpoint === 'binary'
                              ? '(Risk Ratio)'
                              : formData.primaryEndpoint === 'time-to-event'
                                ? '(Hazard Ratio)'
                                : ''}
                        </span>
                      </Label>
                      <Input
                        id="effectSize"
                        type="number"
                        step="0.05"
                        min="0.1"
                        max="2"
                        value={formData.effectSize}
                        onChange={e => handleValueChange('effectSize', parseFloat(e.target.value))}
                        placeholder="e.g., 0.5"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="alpha">Significance Level (Alpha)</Label>
                      <Select
                        value={formData.alpha.toString()}
                        onValueChange={value => handleValueChange('alpha', parseFloat(value))}
                      >
                        <SelectTrigger id="alpha">
                          <SelectValue placeholder="Select alpha level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0.01">0.01 (1%)</SelectItem>
                          <SelectItem value="0.025">0.025 (2.5%)</SelectItem>
                          <SelectItem value="0.05">0.05 (5%)</SelectItem>
                          <SelectItem value="0.1">0.1 (10%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="power">Target Power</Label>
                      <div className="flex items-center space-x-4">
                        <div className="flex-1">
                          <Slider
                            value={[formData.power * 100]}
                            step={5}
                            min={50}
                            max={95}
                            onValueChange={values => handleValueChange('power', values[0] / 100)}
                          />
                        </div>
                        <div className="w-12 text-right font-medium">
                          {Math.round(formData.power * 100)}%
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="simulationType">Simulation Type</Label>
                      <Select
                        value={formData.simulationType}
                        onValueChange={value => handleValueChange('simulationType', value)}
                      >
                        <SelectTrigger id="simulationType">
                          <SelectValue placeholder="Select simulation type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monte_carlo">Monte Carlo</SelectItem>
                          <SelectItem value="bayesian">Bayesian</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="numSimulations">Number of Simulations</Label>
                      <Select
                        value={formData.numSimulations.toString()}
                        onValueChange={value =>
                          handleValueChange('numSimulations', parseInt(value))
                        }
                      >
                        <SelectTrigger id="numSimulations">
                          <SelectValue placeholder="Select number of simulations" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="100">100 (Quick)</SelectItem>
                          <SelectItem value="1000">1,000 (Standard)</SelectItem>
                          <SelectItem value="5000">5,000 (Detailed)</SelectItem>
                          <SelectItem value="10000">10,000 (High Precision)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="enrollment" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="enrollmentRate">Enrollment Rate (subjects/week)</Label>
                      <Input
                        id="enrollmentRate"
                        type="number"
                        min="1"
                        value={formData.enrollmentRate}
                        onChange={e =>
                          handleValueChange('enrollmentRate', parseInt(e.target.value))
                        }
                        placeholder="e.g., 10"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dropoutRate">Expected Dropout Rate</Label>
                      <div className="flex items-center space-x-4">
                        <div className="flex-1">
                          <Slider
                            value={[formData.dropoutRate * 100]}
                            step={1}
                            min={0}
                            max={40}
                            onValueChange={values =>
                              handleValueChange('dropoutRate', values[0] / 100)
                            }
                          />
                        </div>
                        <div className="w-12 text-right font-medium">
                          {Math.round(formData.dropoutRate * 100)}%
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="treatmentDuration">Treatment Duration (weeks)</Label>
                      <Input
                        id="treatmentDuration"
                        type="number"
                        min="1"
                        value={formData.treatmentDuration || ''}
                        onChange={e => handleValueChange('treatmentDuration', e.target.value)}
                        placeholder="e.g., 12"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="followUpDuration">Follow-up Duration (weeks)</Label>
                      <Input
                        id="followUpDuration"
                        type="number"
                        min="0"
                        value={formData.followUpDuration || ''}
                        onChange={e => handleValueChange('followUpDuration', e.target.value)}
                        placeholder="e.g., 4"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="adaptations" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="interimAnalyses">Number of Interim Analyses</Label>
                      <Select
                        value={formData.interimAnalyses.toString()}
                        onValueChange={value =>
                          handleValueChange('interimAnalyses', parseInt(value))
                        }
                      >
                        <SelectTrigger id="interimAnalyses">
                          <SelectValue placeholder="Select number of interim analyses" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0 (No interim analyses)</SelectItem>
                          <SelectItem value="1">1 interim analysis</SelectItem>
                          <SelectItem value="2">2 interim analyses</SelectItem>
                          <SelectItem value="3">3 interim analyses</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="mb-2 block">Adaptive Design Elements</Label>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="adaptSampleSize"
                            className="rounded"
                            checked={formData.adaptations.includes('sample_size')}
                            onChange={() => handleCheckboxChange('adaptations', 'sample_size')}
                          />
                          <label htmlFor="adaptSampleSize" className="text-sm">
                            Sample Size Re-estimation
                          </label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="adaptAllocation"
                            className="rounded"
                            checked={formData.adaptations.includes('allocation')}
                            onChange={() => handleCheckboxChange('adaptations', 'allocation')}
                          />
                          <label htmlFor="adaptAllocation" className="text-sm">
                            Adaptive Randomization
                          </label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="adaptEarlyStop"
                            className="rounded"
                            checked={formData.adaptations.includes('early_stop')}
                            onChange={() => handleCheckboxChange('adaptations', 'early_stop')}
                          />
                          <label htmlFor="adaptEarlyStop" className="text-sm">
                            Early Stopping Rules
                          </label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="adaptPopulation"
                            className="rounded"
                            checked={formData.adaptations.includes('population')}
                            onChange={() => handleCheckboxChange('adaptations', 'population')}
                          />
                          <label htmlFor="adaptPopulation" className="text-sm">
                            Population Enrichment
                          </label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="adaptEndpoints"
                            className="rounded"
                            checked={formData.adaptations.includes('endpoints')}
                            onChange={() => handleCheckboxChange('adaptations', 'endpoints')}
                          />
                          <label htmlFor="adaptEndpoints" className="text-sm">
                            Adaptive Endpoints
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="bg-blue-50 p-3 rounded-md">
                      <div className="flex items-start">
                        <Info className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
                        <div className="text-sm text-blue-700">
                          <p className="font-medium">Adaptive Design Guidance</p>
                          <p className="mt-1">
                            Simulations will help determine optimal adaptation rules based on your
                            selected design elements. Ensure all design choices comply with
                            regulatory guidance (e.g., FDA's "Adaptive Designs for Clinical Trials"
                            guidance).
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {isSimulating && (
                <div className="flex flex-col items-center py-4">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-2" />
                  <p className="text-sm font-medium text-gray-700">
                    Running {formData.simulationType === 'monte_carlo' ? 'Monte Carlo' : 'Bayesian'}{' '}
                    simulations...
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Simulating {formData.numSimulations.toLocaleString()} iterations
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {simulationResults && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="border rounded-md p-4 bg-blue-50">
                      <div className="flex items-center mb-2">
                        <BarChart3 className="h-5 w-5 text-blue-500 mr-2" />
                        <h3 className="font-medium">Statistical Power</h3>
                      </div>
                      <div className="text-3xl font-bold text-blue-700">
                        {Math.round(simulationResults.power.overallPower * 100)}%
                      </div>
                      <p className="text-sm text-blue-700 mt-1">
                        Target power achieved with n={formData.totalSampleSize}
                      </p>
                    </div>

                    <div className="border rounded-md p-4 bg-green-50">
                      <div className="flex items-center mb-2">
                        <Clock className="h-5 w-5 text-green-500 mr-2" />
                        <h3 className="font-medium">Study Duration</h3>
                      </div>
                      <div className="text-3xl font-bold text-green-700">
                        {simulationResults.timeline.totalDuration} weeks
                      </div>
                      <p className="text-sm text-green-700 mt-1">
                        Enrollment: {simulationResults.timeline.enrollmentPeriod} weeks, Treatment:{' '}
                        {simulationResults.timeline.treatmentPeriod} weeks
                      </p>
                    </div>

                    <div className="border rounded-md p-4 bg-yellow-50">
                      <div className="flex items-center mb-2">
                        <Users className="h-5 w-5 text-yellow-500 mr-2" />
                        <h3 className="font-medium">Dropout Impact</h3>
                      </div>
                      <div className="text-3xl font-bold text-yellow-700">
                        {Math.round(simulationResults.dropoutImpact.expectedCompletionRate * 100)}%
                      </div>
                      <p className="text-sm text-yellow-700 mt-1">
                        Expected completion rate with {Math.round(formData.dropoutRate * 100)}%
                        dropout
                      </p>
                    </div>
                  </div>

                  <Tabs defaultValue="power">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="power">Power Analysis</TabsTrigger>
                      <TabsTrigger value="timeline">Timeline & Enrollment</TabsTrigger>
                      <TabsTrigger value="adaptations">Adaptive Recommendations</TabsTrigger>
                    </TabsList>

                    <TabsContent value="power" className="mt-4 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <PowerCurveChart data={simulationResults.power} />

                        <div className="space-y-4">
                          <h3 className="text-lg font-medium">Sample Size Recommendations</h3>
                          <div className="space-y-3">
                            {simulationResults.sampleSizeOptions.map((option, i) => (
                              <div key={i} className="border rounded-md p-3">
                                <div className="flex justify-between items-center">
                                  <div className="font-medium">
                                    {Math.round(option.power * 100)}% Power
                                  </div>
                                  <Badge
                                    className={
                                      option.power === 0.8
                                        ? 'bg-green-100 text-green-800'
                                        : option.power > 0.8
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-yellow-100 text-yellow-800'
                                    }
                                  >
                                    {option.power === 0.8
                                      ? 'Recommended'
                                      : option.power > 0.8
                                        ? 'Conservative'
                                        : 'Minimal'}
                                  </Badge>
                                </div>
                                <div className="mt-2 text-sm text-gray-700">
                                  <div>
                                    Total sample size:{' '}
                                    <span className="font-medium">{option.sampleSize}</span>
                                  </div>
                                  <div>
                                    Per arm: <span className="font-medium">{option.perArm}</span>{' '}
                                    subjects
                                  </div>
                                </div>
                                {option.power === 0.8 && (
                                  <Button variant="outline" size="sm" className="mt-2 w-full">
                                    <Check className="h-4 w-4 mr-1" />
                                    Use This Size
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="bg-blue-50 p-3 rounded-md">
                            <div className="flex items-start">
                              <Info className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
                              <div className="text-sm text-blue-700">
                                <p>
                                  Power calculations are based on the specified effect size of{' '}
                                  {formData.effectSize} and significance level of {formData.alpha}.
                                </p>
                                <p className="mt-1">
                                  Consider sensitivity analyses with smaller effect sizes to ensure
                                  robustness.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="border rounded-md p-4">
                        <h3 className="text-lg font-medium mb-3">Dropout Sensitivity Analysis</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-sm font-medium mb-2">Impact on Power</h4>
                            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-md mb-2">
                              <span className="text-sm">Expected Power with No Dropout:</span>
                              <span className="text-sm font-medium">
                                {Math.round(formData.power * 100)}%
                              </span>
                            </div>
                            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-md mb-2">
                              <span className="text-sm">
                                Adjusted Power with {Math.round(formData.dropoutRate * 100)}%
                                Dropout:
                              </span>
                              <span className="text-sm font-medium">
                                {Math.round(simulationResults.dropoutImpact.effectOnPower * 100)}%
                              </span>
                            </div>
                            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-md">
                              <span className="text-sm">Power Reduction:</span>
                              <span className="text-sm font-medium text-red-600">
                                {Math.round(
                                  (formData.power - simulationResults.dropoutImpact.effectOnPower) *
                                    100
                                )}
                                %
                              </span>
                            </div>
                          </div>

                          <div>
                            <h4 className="text-sm font-medium mb-2">Adjusted Sample Size</h4>
                            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-md mb-2">
                              <span className="text-sm">Original Sample Size:</span>
                              <span className="text-sm font-medium">
                                {formData.totalSampleSize}
                              </span>
                            </div>
                            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-md mb-2">
                              <span className="text-sm">
                                Adjusted for {Math.round(formData.dropoutRate * 100)}% Dropout:
                              </span>
                              <span className="text-sm font-medium">
                                {simulationResults.dropoutImpact.adjustedSampleSize}
                              </span>
                            </div>
                            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-md">
                              <span className="text-sm">Additional Subjects Needed:</span>
                              <span className="text-sm font-medium text-blue-600">
                                {simulationResults.dropoutImpact.adjustedSampleSize -
                                  formData.totalSampleSize}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3">
                          <Button variant="outline" size="sm">
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Recalculate with Adjusted Size
                          </Button>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="timeline" className="mt-4 space-y-6">
                      <TimelineChart data={simulationResults.timeline} />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="border rounded-md p-4">
                          <h3 className="text-md font-medium mb-3">Enrollment Projections</h3>
                          <div className="space-y-2">
                            <div className="flex justify-between p-2 bg-gray-50 rounded-md">
                              <span className="text-sm">Enrollment Rate:</span>
                              <span className="text-sm font-medium">
                                {formData.enrollmentRate} subjects/week
                              </span>
                            </div>
                            <div className="flex justify-between p-2 bg-gray-50 rounded-md">
                              <span className="text-sm">Time to Full Enrollment:</span>
                              <span className="text-sm font-medium">
                                {simulationResults.timeline.enrollmentPeriod} weeks
                              </span>
                            </div>
                            <div className="flex justify-between p-2 bg-gray-50 rounded-md">
                              <span className="text-sm">50% Enrollment Milestone:</span>
                              <span className="text-sm font-medium">
                                Week {Math.ceil(simulationResults.timeline.enrollmentPeriod / 2)}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3">
                            <div className="text-sm font-medium mb-2">
                              Enrollment Rate Sensitivity
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between p-2 bg-blue-50 rounded-md">
                                <span className="text-sm">
                                  At {Math.round(formData.enrollmentRate * 0.5)} subjects/week:
                                </span>
                                <span className="text-sm font-medium">
                                  {Math.ceil(simulationResults.timeline.enrollmentPeriod * 2)} weeks
                                </span>
                              </div>
                              <div className="flex justify-between p-2 bg-green-50 rounded-md">
                                <span className="text-sm">
                                  At {Math.round(formData.enrollmentRate * 1.5)} subjects/week:
                                </span>
                                <span className="text-sm font-medium">
                                  {Math.ceil(simulationResults.timeline.enrollmentPeriod / 1.5)}{' '}
                                  weeks
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="border rounded-md p-4">
                          <h3 className="text-md font-medium mb-3">Interim Analysis Planning</h3>
                          {simulationResults.timeline.interimAnalyses.length > 0 ? (
                            <div className="space-y-3">
                              {simulationResults.timeline.interimAnalyses.map((interim, index) => (
                                <div key={index} className="border rounded-md p-3">
                                  <div className="flex justify-between items-center">
                                    <div className="font-medium">
                                      Interim Analysis #{interim.number}
                                    </div>
                                    <Badge className="bg-blue-100 text-blue-800">
                                      Week {interim.timing}
                                    </Badge>
                                  </div>
                                  <div className="mt-2 text-sm">
                                    <div className="flex justify-between mb-1">
                                      <span>Enrolled subjects:</span>
                                      <span className="font-medium">
                                        {interim.sampleSizeAtInterim}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Percent of total:</span>
                                      <span className="font-medium">
                                        {Math.round(
                                          (interim.sampleSizeAtInterim / formData.totalSampleSize) *
                                            100
                                        )}
                                        %
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="bg-yellow-50 p-3 rounded-md">
                              <div className="flex items-start">
                                <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 mr-2 flex-shrink-0" />
                                <div className="text-sm text-yellow-700">
                                  <p>No interim analyses are currently planned.</p>
                                  <p className="mt-1">
                                    Consider adding at least one interim analysis to enable adaptive
                                    design elements.
                                  </p>
                                </div>
                              </div>
                              <Button size="sm" className="mt-2">
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Add Interim Analysis
                              </Button>
                            </div>
                          )}

                          <div className="mt-4">
                            <h4 className="text-sm font-medium mb-2">Key Milestones</h4>
                            <div className="space-y-2">
                              <div className="flex justify-between p-2 bg-gray-50 rounded-md">
                                <span className="text-sm">First Patient In:</span>
                                <span className="text-sm font-medium">Week 0</span>
                              </div>
                              <div className="flex justify-between p-2 bg-gray-50 rounded-md">
                                <span className="text-sm">Last Patient In:</span>
                                <span className="text-sm font-medium">
                                  Week {simulationResults.timeline.enrollmentPeriod}
                                </span>
                              </div>
                              <div className="flex justify-between p-2 bg-gray-50 rounded-md">
                                <span className="text-sm">Last Patient Last Visit:</span>
                                <span className="text-sm font-medium">
                                  Week {simulationResults.timeline.totalDuration}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="adaptations" className="mt-4 space-y-6">
                      <div className="bg-blue-50 p-4 rounded-md mb-4">
                        <div className="flex items-start">
                          <Sparkles className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
                          <div>
                            <h3 className="text-md font-medium text-blue-800">
                              Adaptive Design Recommendations
                            </h3>
                            <p className="text-sm text-blue-700 mt-1">
                              Based on your simulation parameters, the following adaptive design
                              strategies are recommended to optimize your study design for
                              efficiency and success probability.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {simulationResults.adaptiveDesignRecommendations.map((rec, index) => (
                          <div key={index} className="border rounded-md p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center">
                                <Badge className="bg-purple-100 text-purple-800 mr-3">
                                  {rec.type}
                                </Badge>
                              </div>
                              <Button variant="ghost" size="sm" className="h-8 text-xs">
                                <Copy className="h-3.5 w-3.5 mr-1" />
                                Copy to Protocol
                              </Button>
                            </div>

                            <div className="mt-3 space-y-3">
                              <div>
                                <div className="text-sm font-medium mb-1">Recommendation:</div>
                                <div className="text-sm bg-gray-50 p-2 rounded-md">
                                  {rec.description}
                                </div>
                              </div>

                              <div>
                                <div className="text-sm font-medium mb-1">Expected Impact:</div>
                                <div className="text-sm bg-gray-50 p-2 rounded-md">
                                  {rec.impact}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="border rounded-md p-4">
                        <h3 className="text-md font-medium mb-3">
                          Recommended Statistical Approach
                        </h3>
                        <div className="space-y-3">
                          <div>
                            <div className="text-sm font-medium mb-1">Primary Analysis Method:</div>
                            <div className="text-sm bg-gray-50 p-2 rounded-md">
                              {formData.adaptations.includes('early_stop')
                                ? "Group sequential design with O'Brien-Fleming boundaries for efficacy and futility stopping."
                                : 'Standard fixed design analysis using traditional statistical methods.'}
                            </div>
                          </div>

                          <div>
                            <div className="text-sm font-medium mb-1">
                              Sample Size Re-estimation:
                            </div>
                            <div className="text-sm bg-gray-50 p-2 rounded-md">
                              {formData.adaptations.includes('sample_size')
                                ? 'Blinded sample size re-estimation based on aggregate variance at interim analysis.'
                                : 'Fixed sample size without re-estimation.'}
                            </div>
                          </div>

                          <div>
                            <div className="text-sm font-medium mb-1">Randomization Strategy:</div>
                            <div className="text-sm bg-gray-50 p-2 rounded-md">
                              {formData.adaptations.includes('allocation')
                                ? 'Response-adaptive randomization after interim analysis, favoring better-performing arms.'
                                : 'Fixed randomization ratio of ' +
                                  formData.treatmentAllocation +
                                  ' throughout the study.'}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4">
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-1" />
                            Export Statistical Plan
                          </Button>
                        </div>
                      </div>

                      <div className="bg-yellow-50 p-4 rounded-md">
                        <div className="flex items-start">
                          <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 mr-2 flex-shrink-0" />
                          <div>
                            <h3 className="text-md font-medium text-yellow-800">
                              Regulatory Considerations
                            </h3>
                            <div className="text-sm text-yellow-700 mt-1 space-y-2">
                              <p>
                                The adaptive design elements recommended above should be discussed
                                with regulatory authorities early in the development process.
                              </p>
                              <p>
                                Ensure that the statistical analysis plan clearly specifies all
                                adaptation rules and control of Type I error according to FDA and
                                EMA guidance.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          {!simulationComplete ? (
            <>
              <Button variant="outline">Reset</Button>
              <Button onClick={runSimulation} disabled={isSimulating}>
                {isSimulating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Simulating...
                  </>
                ) : (
                  <>
                    <Calculator className="mr-2 h-4 w-4" />
                    Run Simulation
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setSimulationComplete(false);
                  setSimulationResults(null);
                }}
              >
                New Simulation
              </Button>
              <div className="space-x-2">
                <Button variant="outline" onClick={handleDownloadResults}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Results
                </Button>
                <Button>
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Apply to Protocol
                </Button>
              </div>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default AdaptiveDesignSimulator;
