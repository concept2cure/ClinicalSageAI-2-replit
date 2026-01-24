import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const MethodValidationSimulator = () => {
  const [activeParameter, setActiveParameter] = useState('specificity');
  const [specificity, setSpecificity] = useState({
    interferingCompounds: 3,
    peakResolution: 1.8,
    signalToNoise: 25,
  });
  const [linearity, setLinearity] = useState({
    concentrations: [20, 40, 60, 80, 100, 120],
    responses: [210, 425, 630, 840, 1050, 1260],
  });
  const [precision, setPrecision] = useState({
    repeatability: 0.8,
    intermediate: 1.2,
    reproducibility: 1.5,
  });

  const [simulationResult, setSimulationResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false); // Add loading state
  const [results, setResults] = useState(null); // State to hold simulation results

  const linearityData = linearity.concentrations.map((conc, index) => ({
    concentration: conc,
    response: linearity.responses[index],
  }));

  const calculateRSquared = () => {
    const n = linearity.concentrations.length;

    // Calculate means
    const xMean = linearity.concentrations.reduce((a, b) => a + b, 0) / n;
    const yMean = linearity.responses.reduce((a, b) => a + b, 0) / n;

    // Calculate sum of squares
    let ssxy = 0,
      ssxx = 0,
      ssyy = 0;
    for (let i = 0; i < n; i++) {
      const x = linearity.concentrations[i];
      const y = linearity.responses[i];
      ssxy += (x - xMean) * (y - yMean);
      ssxx += (x - xMean) * (x - xMean);
      ssyy += (y - yMean) * (y - yMean);
    }

    const rSquared = Math.pow(ssxy, 2) / (ssxx * ssyy);
    return rSquared.toFixed(4);
  };

  const runSimulation = () => {
    setIsLoading(true);
    setSimulationResult(null); // Clear previous results

    // Simulate API call delay
    setTimeout(() => {
      let result = {
        status: '',
        message: '',
        details: {},
      };

      switch (activeParameter) {
        case 'specificity':
          const specificityOk = specificity.peakResolution > 1.5 && specificity.signalToNoise > 10;
          result = {
            status: specificityOk ? 'pass' : 'fail',
            message: specificityOk ? 'Specificity criteria met' : 'Specificity criteria not met',
            details: {
              peakResolutionStatus: specificity.peakResolution > 1.5 ? 'pass' : 'fail',
              signalToNoiseStatus: specificity.signalToNoise > 10 ? 'pass' : 'fail',
            },
          };
          break;
        case 'linearity':
          const rSquared = calculateRSquared();
          const linearityOk = parseFloat(rSquared) > 0.995;
          result = {
            status: linearityOk ? 'pass' : 'fail',
            message: linearityOk ? 'Linearity criteria met' : 'Linearity criteria not met',
            details: {
              rSquared,
              linearityEquation: 'y = 10.5x + 0.5',
              status: linearityOk ? 'pass' : 'fail',
            },
          };
          break;
        case 'precision':
          const precisionOk =
            precision.repeatability < 2.0 &&
            precision.intermediate < 3.0 &&
            precision.reproducibility < 5.0;
          result = {
            status: precisionOk ? 'pass' : 'fail',
            message: precisionOk ? 'Precision criteria met' : 'Precision criteria not met',
            details: {
              repeatabilityStatus: precision.repeatability < 2.0 ? 'pass' : 'fail',
              intermediateStatus: precision.intermediate < 3.0 ? 'pass' : 'fail',
              reproducibilityStatus: precision.reproducibility < 5.0 ? 'pass' : 'fail',
            },
          };
          break;
        default:
          break;
      }

      setSimulationResult(result);
      setIsLoading(false);

      // Show success notification
      if (result && result.status === 'pass') {
        // You can replace this with your toast system if available
        const notification = document.createElement('div');
        notification.className =
          'fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded z-50';
        notification.innerHTML = `<strong>Success!</strong> Simulation completed successfully.`;
        document.body.appendChild(notification);

        setTimeout(() => {
          notification.style.opacity = '0';
          notification.style.transition = 'opacity 0.5s';
          setTimeout(() => document.body.removeChild(notification), 500);
        }, 3000);
      }
    }, 1500);
  };

  const handleLinearityChange = (idx, field, value) => {
    const newValues = [...linearity[field]];
    newValues[idx] = parseFloat(value);
    setLinearity({ ...linearity, [field]: newValues });
  };

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle>Method Validation Simulator</CardTitle>
        <CardDescription>
          Simulate and visualize analytical method validation parameters
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeParameter} onValueChange={setActiveParameter}>
          <TabsList className="mb-4">
            <TabsTrigger value="specificity">Specificity</TabsTrigger>
            <TabsTrigger value="linearity">Linearity</TabsTrigger>
            <TabsTrigger value="precision">Precision</TabsTrigger>
          </TabsList>

          <TabsContent value="specificity">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="interferingCompounds">
                  Number of Potential Interfering Compounds
                </Label>
                <Input
                  id="interferingCompounds"
                  type="number"
                  value={specificity.interferingCompounds}
                  onChange={e =>
                    setSpecificity({
                      ...specificity,
                      interferingCompounds: parseInt(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="peakResolution">Peak Resolution (Rs)</Label>
                <Input
                  id="peakResolution"
                  type="number"
                  step="0.1"
                  value={specificity.peakResolution}
                  onChange={e =>
                    setSpecificity({ ...specificity, peakResolution: parseFloat(e.target.value) })
                  }
                />
                <p className="text-sm text-muted-foreground mt-1">Target: more than 1.5</p>
              </div>
              <div>
                <Label htmlFor="signalToNoise">Signal-to-Noise Ratio</Label>
                <Input
                  id="signalToNoise"
                  type="number"
                  value={specificity.signalToNoise}
                  onChange={e =>
                    setSpecificity({ ...specificity, signalToNoise: parseFloat(e.target.value) })
                  }
                />
                <p className="text-sm text-muted-foreground mt-1">Target: more than 10</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="linearity">
            <div className="mb-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label>Concentration (%)</Label>
                </div>
                <div>
                  <Label>Response (mAU)</Label>
                </div>
                {linearity.concentrations.map((conc, idx) => (
                  <React.Fragment key={idx}>
                    <div>
                      <Input
                        type="number"
                        value={conc}
                        onChange={e => handleLinearityChange(idx, 'concentrations', e.target.value)}
                      />
                    </div>
                    <div>
                      <Input
                        type="number"
                        value={linearity.responses[idx]}
                        onChange={e => handleLinearityChange(idx, 'responses', e.target.value)}
                      />
                    </div>
                  </React.Fragment>
                ))}
              </div>
              <div className="h-64 mt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={linearityData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="concentration"
                      label={{ value: 'Concentration (%)', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis
                      label={{ value: 'Response (mAU)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="response"
                      stroke="#8884d8"
                      activeDot={{ r: 8 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">R² Target: more than 0.995</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="precision">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="repeatability">Repeatability RSD (%)</Label>
                <Input
                  id="repeatability"
                  type="number"
                  step="0.1"
                  value={precision.repeatability}
                  onChange={e =>
                    setPrecision({ ...precision, repeatability: parseFloat(e.target.value) })
                  }
                />
                <p className="text-sm text-muted-foreground mt-1">Target: less than 2.0%</p>
              </div>
              <div>
                <Label htmlFor="intermediate">Intermediate Precision RSD (%)</Label>
                <Input
                  id="intermediate"
                  type="number"
                  step="0.1"
                  value={precision.intermediate}
                  onChange={e =>
                    setPrecision({ ...precision, intermediate: parseFloat(e.target.value) })
                  }
                />
                <p className="text-sm text-muted-foreground mt-1">Target: less than 3.0%</p>
              </div>
              <div>
                <Label htmlFor="reproducibility">Reproducibility RSD (%)</Label>
                <Input
                  id="reproducibility"
                  type="number"
                  step="0.1"
                  value={precision.reproducibility}
                  onChange={e =>
                    setPrecision({ ...precision, reproducibility: parseFloat(e.target.value) })
                  }
                />
                <p className="text-sm text-muted-foreground mt-1">Target: less than 5.0%</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6">
          <Button onClick={runSimulation} disabled={isLoading}>
            {isLoading ? 'Running Simulation...' : 'Run Simulation'}
          </Button>
        </div>

        {simulationResult && (
          <div className="mt-6 p-4 border rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-medium">Simulation Result:</h3>
              <Badge variant={simulationResult.status === 'pass' ? 'success' : 'destructive'}>
                {simulationResult.status === 'pass' ? 'PASSED' : 'FAILED'}
              </Badge>
            </div>
            <p>{simulationResult.message}</p>

            {activeParameter === 'specificity' && (
              <div className="mt-4 grid gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      simulationResult.details.peakResolutionStatus === 'pass'
                        ? 'outline'
                        : 'destructive'
                    }
                  >
                    Peak Resolution
                  </Badge>
                  <span>{specificity.peakResolution} (Target: more than 1.5)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      simulationResult.details.signalToNoiseStatus === 'pass'
                        ? 'outline'
                        : 'destructive'
                    }
                  >
                    Signal-to-Noise
                  </Badge>
                  <span>{specificity.signalToNoise} (Target: more than 10)</span>
                </div>
              </div>
            )}

            {activeParameter === 'linearity' && (
              <div className="mt-4 grid gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={simulationResult.details.status === 'pass' ? 'outline' : 'destructive'}
                  >
                    R²
                  </Badge>
                  <span>{simulationResult.details.rSquared} (Target: more than 0.995)</span>
                </div>
                <div>
                  <p className="text-sm">Equation: {simulationResult.details.linearityEquation}</p>
                </div>
              </div>
            )}

            {activeParameter === 'precision' && (
              <div className="mt-4 grid gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      simulationResult.details.repeatabilityStatus === 'pass'
                        ? 'outline'
                        : 'destructive'
                    }
                  >
                    Repeatability
                  </Badge>
                  <span>{precision.repeatability}% (Target: less than 2.0%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      simulationResult.details.intermediateStatus === 'pass'
                        ? 'outline'
                        : 'destructive'
                    }
                  >
                    Intermediate Precision
                  </Badge>
                  <span>{precision.intermediate}% (Target: less than 3.0%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      simulationResult.details.reproducibilityStatus === 'pass'
                        ? 'outline'
                        : 'destructive'
                    }
                  >
                    Reproducibility
                  </Badge>
                  <span>{precision.reproducibility}% (Target: less than 5.0%)</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline">Reset</Button>
        <Button variant="outline">Export Results</Button>
      </CardFooter>
    </Card>
  );
};

export default MethodValidationSimulator;
