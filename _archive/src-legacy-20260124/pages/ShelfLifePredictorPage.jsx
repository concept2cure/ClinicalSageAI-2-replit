import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
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
import { Loader2, ArrowLeft, Calculator, Thermometer, Clock } from 'lucide-react';
import { Link } from 'wouter';

const ShelfLifePredictorPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('predict');

  // Prediction parameters
  const [predictionParams, setPredictionParams] = useState({
    initialContent: 100,
    limit: 90,
    activationEnergy: 80,
    frequencyFactor: 1e9,
    referenceTemperature: 25,
    temperatures: [5, 25, 30, 40],
    reactionOrder: 1,
  });

  // Estimation parameters (for determining Arrhenius parameters from data)
  const [estimationData, setEstimationData] = useState([
    { temperature: 25, initialContent: 100, finalContent: 98, time: 6 },
    { temperature: 30, initialContent: 100, finalContent: 96, time: 6 },
    { temperature: 40, initialContent: 100, finalContent: 92, time: 6 },
  ]);

  // Handle prediction parameter change
  const handlePredictionParamChange = e => {
    const { name, value } = e.target;
    setPredictionParams({
      ...predictionParams,
      [name]:
        name === 'temperatures'
          ? value.split(',').map(t => parseFloat(t.trim()))
          : parseFloat(value),
    });
  };

  // Handle estimation data change
  const handleEstimationDataChange = (index, field, value) => {
    const newData = [...estimationData];
    newData[index][field] = parseFloat(value);
    setEstimationData(newData);
  };

  // Add new data point for estimation
  const addDataPoint = () => {
    setEstimationData([
      ...estimationData,
      { temperature: 30, initialContent: 100, finalContent: 95, time: 6 },
    ]);
  };

  // Remove data point from estimation
  const removeDataPoint = index => {
    if (estimationData.length <= 2) {
      toast({
        title: 'Cannot Remove',
        description: 'At least two data points are required for Arrhenius estimation',
        variant: 'destructive',
      });
      return;
    }

    const newData = [...estimationData];
    newData.splice(index, 1);
    setEstimationData(newData);
  };

  // Predict shelf life mutation
  const predictMutation = useMutation({
    mutationFn: async data => {
      const response = await fetch('/api/arrhenius/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to predict shelf life');
      }

      return response.json();
    },
    onSuccess: data => {
      toast({
        title: 'Prediction Complete',
        description: `Predicted shelf life: ${data.summary.proposedShelfLife} months`,
      });
      setResults(data);
    },
    onError: error => {
      toast({
        title: 'Prediction Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Estimate Arrhenius parameters mutation
  const estimateMutation = useMutation({
    mutationFn: async data => {
      const response = await fetch('/api/arrhenius/estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data }),
      });

      if (!response.ok) {
        throw new Error('Failed to estimate Arrhenius parameters');
      }

      return response.json();
    },
    onSuccess: data => {
      toast({
        title: 'Estimation Complete',
        description: `Estimated activation energy: ${data.parameters.activationEnergy.toFixed(1)} kJ/mol`,
      });

      // Update prediction parameters with estimated values
      setPredictionParams({
        ...predictionParams,
        activationEnergy: data.parameters.activationEnergy,
        frequencyFactor: data.parameters.frequencyFactor,
      });

      setEstimationResults(data);
      setActiveTab('predict');
    },
    onError: error => {
      toast({
        title: 'Estimation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Results state
  const [results, setResults] = useState(null);
  const [estimationResults, setEstimationResults] = useState(null);

  // Handle prediction submit
  const handlePredictSubmit = e => {
    e.preventDefault();
    predictMutation.mutate(predictionParams);
  };

  // Handle estimation submit
  const handleEstimateSubmit = e => {
    e.preventDefault();
    estimateMutation.mutate(estimationData);
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center mb-6">
        <Button variant="outline" className="mr-4" asChild>
          <Link href="/stability">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Stability Studies
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shelf-Life Predictor</h1>
          <p className="text-muted-foreground">
            Use Arrhenius kinetics to predict product shelf-life from accelerated stability data
          </p>
        </div>
      </div>

      <Separator className="my-6" />

      <Tabs defaultValue="predict" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="predict">
            <Calculator className="mr-2 h-4 w-4" /> Predict Shelf Life
          </TabsTrigger>
          <TabsTrigger value="estimate">
            <Thermometer className="mr-2 h-4 w-4" /> Estimate Parameters
          </TabsTrigger>
        </TabsList>

        <TabsContent value="predict">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Arrhenius Parameters</CardTitle>
                <CardDescription>
                  Enter degradation parameters to predict shelf life
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePredictSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="initialContent">Initial Content (%)</Label>
                      <Input
                        id="initialContent"
                        name="initialContent"
                        type="number"
                        step="0.1"
                        value={predictionParams.initialContent}
                        onChange={handlePredictionParamChange}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="limit">Shelf Life Limit (%)</Label>
                      <Input
                        id="limit"
                        name="limit"
                        type="number"
                        step="0.1"
                        value={predictionParams.limit}
                        onChange={handlePredictionParamChange}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="activationEnergy">Activation Energy (kJ/mol)</Label>
                    <Input
                      id="activationEnergy"
                      name="activationEnergy"
                      type="number"
                      step="0.1"
                      value={predictionParams.activationEnergy}
                      onChange={handlePredictionParamChange}
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      Typical range: 50-120 kJ/mol for pharmaceuticals
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="frequencyFactor">Frequency Factor (1/time)</Label>
                    <Input
                      id="frequencyFactor"
                      name="frequencyFactor"
                      type="number"
                      step="1e7"
                      value={predictionParams.frequencyFactor}
                      onChange={handlePredictionParamChange}
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      Typically expressed in scientific notation (e.g., 1e9)
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="referenceTemperature">Reference Temperature (°C)</Label>
                      <Input
                        id="referenceTemperature"
                        name="referenceTemperature"
                        type="number"
                        value={predictionParams.referenceTemperature}
                        onChange={handlePredictionParamChange}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reactionOrder">Reaction Order</Label>
                      <Input
                        id="reactionOrder"
                        name="reactionOrder"
                        type="number"
                        min="0"
                        max="2"
                        step="1"
                        value={predictionParams.reactionOrder}
                        onChange={handlePredictionParamChange}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="temperatures">Temperatures to Calculate (°C)</Label>
                    <Input
                      id="temperatures"
                      name="temperatures"
                      value={predictionParams.temperatures.join(', ')}
                      onChange={handlePredictionParamChange}
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      Comma-separated list of temperatures (e.g., 5, 25, 30, 40)
                    </p>
                  </div>

                  <Button type="submit" className="w-full" disabled={predictMutation.isPending}>
                    {predictMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Predict Shelf Life
                  </Button>
                </form>
              </CardContent>
              <CardFooter className="flex justify-between">
                <p className="text-sm text-muted-foreground">
                  Need to estimate parameters from data?
                </p>
                <Button variant="outline" onClick={() => setActiveTab('estimate')}>
                  Estimate from Data
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Prediction Results</CardTitle>
                <CardDescription>
                  {results
                    ? `Proposed shelf life: ${results.summary.proposedShelfLife} months at ${results.input.referenceTemperature}°C`
                    : 'Run a prediction to see results'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {predictMutation.isPending ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : results ? (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Degradation Curves</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart
                          data={results.predictions.flatMap(p =>
                            p.degradationCurve
                              .filter((_, i) => i % 3 === 0)
                              .map(point => ({
                                ...point,
                                temperature: p.temperature,
                              }))
                          )}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="month"
                            label={{
                              value: 'Time (months)',
                              position: 'insideBottomRight',
                              offset: -5,
                            }}
                          />
                          <YAxis
                            label={{ value: 'Content (%)', angle: -90, position: 'insideLeft' }}
                            domain={['auto', 'auto']}
                          />
                          <Tooltip
                            formatter={(value, name) => [value.toFixed(2) + '%', `${name}°C`]}
                            labelFormatter={label => `Month ${label}`}
                          />
                          <Legend />
                          {results.predictions.map(p => (
                            <Line
                              key={p.temperature}
                              type="monotone"
                              dataKey="remaining"
                              name={`${p.temperature}°C`}
                              stroke={
                                p.temperature === results.input.referenceTemperature
                                  ? '#7c3aed'
                                  : p.temperature < results.input.referenceTemperature
                                    ? '#3b82f6'
                                    : '#ef4444'
                              }
                              strokeWidth={
                                p.temperature === results.input.referenceTemperature ? 3 : 1
                              }
                              dot={false}
                            />
                          ))}
                          <Line
                            type="monotone"
                            dataKey="limit"
                            name="Limit"
                            stroke="#475569"
                            strokeDasharray="5 5"
                            dot={false}
                            data={[
                              { month: 0, limit: results.input.limit },
                              { month: 36, limit: results.input.limit },
                            ]}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold mb-2">Shelf Life Summary</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {results.predictions.map(p => (
                          <Card key={p.temperature}>
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <Thermometer className="mr-2 h-5 w-5 text-muted-foreground" />
                                  <span className="font-medium">{p.temperature}°C</span>
                                </div>
                                <div className="flex items-center">
                                  <Clock className="mr-2 h-5 w-5 text-muted-foreground" />
                                  <span className="font-medium">
                                    {Math.floor(p.shelfLife)} months
                                  </span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Calculator className="h-16 w-16 mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">No Prediction Results</h3>
                    <p className="text-muted-foreground mb-4 max-w-md">
                      Fill in the Arrhenius parameters and run a prediction to see shelf life
                      estimates
                    </p>
                    <Button
                      variant="default"
                      onClick={() => document.getElementById('initialContent').focus()}
                    >
                      Enter Parameters
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="estimate">
          <Card>
            <CardHeader>
              <CardTitle>Estimate Arrhenius Parameters</CardTitle>
              <CardDescription>
                Enter stability data points to estimate activation energy and frequency factor
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEstimateSubmit} className="space-y-6">
                <div className="space-y-4">
                  {estimationData.map((point, index) => (
                    <div key={index} className="grid grid-cols-5 gap-2 items-end">
                      <div className="space-y-2">
                        <Label>Temperature (°C)</Label>
                        <Input
                          type="number"
                          value={point.temperature}
                          onChange={e =>
                            handleEstimationDataChange(index, 'temperature', e.target.value)
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Initial Content (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={point.initialContent}
                          onChange={e =>
                            handleEstimationDataChange(index, 'initialContent', e.target.value)
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Final Content (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={point.finalContent}
                          onChange={e =>
                            handleEstimationDataChange(index, 'finalContent', e.target.value)
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Time (months)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={point.time}
                          onChange={e => handleEstimationDataChange(index, 'time', e.target.value)}
                          required
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeDataPoint(index)}
                      >
                        &times;
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={addDataPoint}>
                    Add Data Point
                  </Button>
                  <Button
                    type="submit"
                    disabled={estimationData.length < 2 || estimateMutation.isPending}
                  >
                    {estimateMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Estimate Parameters
                  </Button>
                </div>
              </form>

              {estimationResults && (
                <div className="mt-6 p-4 border rounded-md">
                  <h3 className="text-lg font-semibold mb-2">Estimation Results</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium">Activation Energy:</p>
                      <p className="text-lg">
                        {estimationResults.parameters.activationEnergy.toFixed(2)} kJ/mol
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Frequency Factor:</p>
                      <p className="text-lg">
                        {estimationResults.parameters.frequencyFactor.toExponential(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">R² Value:</p>
                      <p className="text-lg">{estimationResults.parameters.rsquared.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Quality of Fit:</p>
                      <p className="text-lg">{estimationResults.interpretation.qualityOfFit}</p>
                    </div>
                  </div>
                  <Button className="mt-4 w-full" onClick={() => setActiveTab('predict')}>
                    Use These Parameters
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ShelfLifePredictorPage;
