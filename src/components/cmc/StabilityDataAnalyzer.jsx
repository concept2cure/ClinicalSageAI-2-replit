import React, { useState, useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
} from 'recharts';
import { ArrowRight, Calculator, CheckCircle2 } from 'lucide-react';

const StabilityDataAnalyzer = () => {
  const [activeTab, setActiveTab] = useState('long-term');
  const [storageCondition, setStorageCondition] = useState('25C/60%RH');
  const [timePoints, setTimePoints] = useState([0, 3, 6, 9, 12, 18, 24, 36]);
  const [assayValues, setAssayValues] = useState([100, 99.5, 99.1, 98.7, 98.3, 97.8, 97.4, 96.9]);
  const [impurityValues, setImpurityValues] = useState([0, 0.2, 0.4, 0.5, 0.6, 0.8, 0.9, 1.1]);
  const [acceleratedData, setAcceleratedData] = useState({
    timePoints: [0, 1, 2, 3, 6],
    assayValues: [100, 99.2, 98.5, 97.8, 96.4],
    impurityValues: [0, 0.3, 0.6, 0.9, 1.5],
  });
  const [shelfLifeEstimate, setShelfLifeEstimate] = useState(null);
  const [arrhenius, setArrhenius] = useState({
    activationEnergy: 83.14, // kJ/mol
    temperature: 25, // °C
    acceleratedTemperature: 40, // °C
  });

  const handleAssayChange = (index, value) => {
    const newValues = [...assayValues];
    newValues[index] = parseFloat(value);
    setAssayValues(newValues);
  };

  const handleImpurityChange = (index, value) => {
    const newValues = [...impurityValues];
    newValues[index] = parseFloat(value);
    setImpurityValues(newValues);
  };

  const calculateShelfLife = () => {
    // Simple linear regression to determine shelf life
    const x = timePoints;
    const y = assayValues;

    // Calculate slope and intercept
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;
    const n = x.length;

    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate shelf life based on 95% of label claim (assuming 100% initial)
    const shelfLife = (95 - intercept) / Math.abs(slope);

    // Calculate R-squared
    let sse = 0;
    let sst = 0;
    const yMean = sumY / n;

    for (let i = 0; i < n; i++) {
      const yPred = intercept + slope * x[i];
      sse += Math.pow(y[i] - yPred, 2);
      sst += Math.pow(y[i] - yMean, 2);
    }

    const rSquared = 1 - sse / sst;

    setShelfLifeEstimate({
      months: Math.floor(shelfLife),
      slope,
      intercept,
      rSquared,
      equation: `y = ${slope.toFixed(4)}x + ${intercept.toFixed(2)}`,
    });
  };

  const calculateArrheniusShelfLife = () => {
    // Arrhenius equation: k = A * exp(-Ea/RT)
    // For relative degradation rates between two temperatures
    const R = 8.314 / 1000; // Gas constant in kJ/(mol·K)
    const T1 = 273.15 + arrhenius.temperature; // Kelvin
    const T2 = 273.15 + arrhenius.acceleratedTemperature; // Kelvin
    const Ea = arrhenius.activationEnergy;

    // Calculate acceleration factor
    const accelerationFactor = Math.exp((Ea / R) * (1 / T1 - 1 / T2));

    // Use accelerated data to predict long-term stability
    // Assuming linear degradation
    const accelTimePoints = acceleratedData.timePoints;
    const accelAssayValues = acceleratedData.assayValues;

    // Calculate degradation rate from accelerated data
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;
    const n = accelTimePoints.length;

    for (let i = 0; i < n; i++) {
      sumX += accelTimePoints[i];
      sumY += accelAssayValues[i];
      sumXY += accelTimePoints[i] * accelAssayValues[i];
      sumX2 += accelTimePoints[i] * accelTimePoints[i];
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Scale the degradation rate by the acceleration factor
    const longTermSlope = slope / accelerationFactor;

    // Calculate shelf life based on 95% of label claim
    const shelfLife = (95 - intercept) / Math.abs(longTermSlope);

    setShelfLifeEstimate({
      months: Math.floor(shelfLife),
      slope: longTermSlope,
      intercept,
      accelerationFactor,
      equation: `y = ${longTermSlope.toFixed(5)}x + ${intercept.toFixed(2)} (projected)`,
      arrheniusBased: true,
    });
  };

  const longTermData = timePoints.map((time, index) => ({
    time,
    assay: assayValues[index],
    impurity: impurityValues[index],
  }));

  const accData = acceleratedData.timePoints.map((time, index) => ({
    time,
    assay: acceleratedData.assayValues[index],
    impurity: acceleratedData.impurityValues[index],
  }));

  // Generate prediction line data based on shelf life estimate
  const generatePredictionData = () => {
    if (!shelfLifeEstimate) return [];

    const predictionData = [];
    const maxTime = Math.max(...timePoints, shelfLifeEstimate.months + 6);

    for (let i = 0; i <= maxTime; i += 3) {
      predictionData.push({
        time: i,
        predicted: shelfLifeEstimate.intercept + shelfLifeEstimate.slope * i,
      });
    }

    return predictionData;
  };

  const predictionData = generatePredictionData();

  useEffect(() => {
    // Reset shelf life estimate when data changes
    setShelfLifeEstimate(null);
  }, [timePoints, assayValues, acceleratedData]);

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle>Stability Data Analyzer</CardTitle>
        <CardDescription>
          Analyze stability data and predict shelf life using linear regression and Arrhenius models
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="long-term">Long-term Stability</TabsTrigger>
            <TabsTrigger value="accelerated">Accelerated Stability</TabsTrigger>
            <TabsTrigger value="results">Analysis Results</TabsTrigger>
          </TabsList>

          <TabsContent value="long-term">
            <div className="space-y-6">
              <div>
                <Label htmlFor="storageCondition">Storage Condition</Label>
                <Select value={storageCondition} onValueChange={setStorageCondition}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select storage condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25C/60%RH">25°C/60% RH (Long-term)</SelectItem>
                    <SelectItem value="30C/65%RH">30°C/65% RH (Intermediate)</SelectItem>
                    <SelectItem value="5C">5°C (Refrigerated)</SelectItem>
                    <SelectItem value="-20C">-20°C (Freezer)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Time Point (Months)</Label>
                </div>
                <div>
                  <Label>Assay (%)</Label>
                </div>
                <div>
                  <Label>Total Impurities (%)</Label>
                </div>

                {timePoints.map((time, index) => (
                  <React.Fragment key={index}>
                    <div>
                      <Input
                        type="number"
                        value={time}
                        onChange={e => {
                          const newTimePoints = [...timePoints];
                          newTimePoints[index] = parseFloat(e.target.value);
                          setTimePoints(newTimePoints);
                        }}
                      />
                    </div>
                    <div>
                      <Input
                        type="number"
                        step="0.1"
                        value={assayValues[index]}
                        onChange={e => handleAssayChange(index, e.target.value)}
                      />
                    </div>
                    <div>
                      <Input
                        type="number"
                        step="0.1"
                        value={impurityValues[index]}
                        onChange={e => handleImpurityChange(index, e.target.value)}
                      />
                    </div>
                  </React.Fragment>
                ))}
              </div>

              <div className="h-64 mt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={longTermData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      label={{ value: 'Time (months)', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis label={{ value: 'Value (%)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="assay"
                      stroke="#8884d8"
                      name="Assay %"
                      activeDot={{ r: 8 }}
                    />
                    <Line type="monotone" dataKey="impurity" stroke="#82ca9d" name="Impurities %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="flex justify-center mt-4">
                <Button onClick={calculateShelfLife} className="flex items-center gap-2">
                  <Calculator size={16} />
                  Calculate Shelf Life
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="accelerated">
            <div className="space-y-6">
              <div>
                <Label htmlFor="acceleratedCondition">Accelerated Condition</Label>
                <Select defaultValue="40C/75%RH">
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select accelerated condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="40C/75%RH">40°C/75% RH (Accelerated)</SelectItem>
                    <SelectItem value="50C/ambient">50°C/Ambient (Stress)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Time Point (Months)</Label>
                </div>
                <div>
                  <Label>Assay (%)</Label>
                </div>
                <div>
                  <Label>Total Impurities (%)</Label>
                </div>

                {acceleratedData.timePoints.map((time, index) => (
                  <React.Fragment key={index}>
                    <div>
                      <Input
                        type="number"
                        value={time}
                        onChange={e => {
                          const newTimePoints = [...acceleratedData.timePoints];
                          newTimePoints[index] = parseFloat(e.target.value);
                          setAcceleratedData({ ...acceleratedData, timePoints: newTimePoints });
                        }}
                      />
                    </div>
                    <div>
                      <Input
                        type="number"
                        step="0.1"
                        value={acceleratedData.assayValues[index]}
                        onChange={e => {
                          const newValues = [...acceleratedData.assayValues];
                          newValues[index] = parseFloat(e.target.value);
                          setAcceleratedData({ ...acceleratedData, assayValues: newValues });
                        }}
                      />
                    </div>
                    <div>
                      <Input
                        type="number"
                        step="0.1"
                        value={acceleratedData.impurityValues[index]}
                        onChange={e => {
                          const newValues = [...acceleratedData.impurityValues];
                          newValues[index] = parseFloat(e.target.value);
                          setAcceleratedData({ ...acceleratedData, impurityValues: newValues });
                        }}
                      />
                    </div>
                  </React.Fragment>
                ))}
              </div>

              <div className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="activationEnergy">Activation Energy (kJ/mol)</Label>
                  <Input
                    id="activationEnergy"
                    type="number"
                    step="0.1"
                    value={arrhenius.activationEnergy}
                    onChange={e =>
                      setArrhenius({ ...arrhenius, activationEnergy: parseFloat(e.target.value) })
                    }
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Typical values: 50-120 kJ/mol for pharmaceuticals
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="storageTemp">Long-term Storage Temperature (°C)</Label>
                    <Input
                      id="storageTemp"
                      type="number"
                      value={arrhenius.temperature}
                      onChange={e =>
                        setArrhenius({ ...arrhenius, temperature: parseFloat(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="acceleratedTemp">Accelerated Temperature (°C)</Label>
                    <Input
                      id="acceleratedTemp"
                      type="number"
                      value={arrhenius.acceleratedTemperature}
                      onChange={e =>
                        setArrhenius({
                          ...arrhenius,
                          acceleratedTemperature: parseFloat(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="h-64 mt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={accData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      label={{ value: 'Time (months)', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis label={{ value: 'Value (%)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="assay"
                      stroke="#ff7300"
                      name="Assay %"
                      activeDot={{ r: 8 }}
                    />
                    <Line type="monotone" dataKey="impurity" stroke="#00C49F" name="Impurities %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="flex justify-center mt-4">
                <Button onClick={calculateArrheniusShelfLife} className="flex items-center gap-2">
                  <Calculator size={16} />
                  Calculate Shelf Life with Arrhenius
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="results">
            {shelfLifeEstimate ? (
              <div className="space-y-6">
                <div className="bg-green-50 p-4 rounded-md border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <h3 className="text-lg font-medium text-green-800">Shelf Life Estimate</h3>
                  </div>
                  <p className="text-xl font-bold">{shelfLifeEstimate.months} months</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Based on{' '}
                    {shelfLifeEstimate.arrheniusBased ? 'Arrhenius equation' : 'linear regression'}{' '}
                    with data from{' '}
                    {shelfLifeEstimate.arrheniusBased
                      ? 'accelerated stability studies'
                      : 'long-term stability studies'}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-md font-medium mb-2">Statistical Details</h3>
                    <div className="bg-gray-50 p-4 rounded-md">
                      <p>
                        <strong>Regression Equation:</strong> {shelfLifeEstimate.equation}
                      </p>
                      <p>
                        <strong>Slope:</strong> {shelfLifeEstimate.slope.toFixed(6)} %/month
                      </p>
                      <p>
                        <strong>Intercept:</strong> {shelfLifeEstimate.intercept.toFixed(2)} %
                      </p>
                      {shelfLifeEstimate.rSquared && (
                        <p>
                          <strong>R²:</strong> {shelfLifeEstimate.rSquared.toFixed(4)}
                        </p>
                      )}
                      {shelfLifeEstimate.accelerationFactor && (
                        <p>
                          <strong>Acceleration Factor:</strong>{' '}
                          {shelfLifeEstimate.accelerationFactor.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-md font-medium mb-2">Regulatory Considerations</h3>
                    <div className="bg-blue-50 p-4 rounded-md">
                      <ul className="space-y-2 list-disc pl-4">
                        <li>
                          ICH Q1A guideline requires minimum 12 months long-term data for shelf life
                          up to 24 months
                        </li>
                        <li>Consider batch-to-batch variability in your final assessment</li>
                        <li>
                          Statistical analysis should include 95% confidence intervals for
                          regulatory submissions
                        </li>
                        <li>
                          Extrapolation beyond observed data should not exceed 2x the real-time data
                          period
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="h-64 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="time"
                        type="number"
                        domain={[0, 'dataMax + 6']}
                        label={{ value: 'Time (months)', position: 'insideBottom', offset: -5 }}
                      />
                      <YAxis
                        domain={[90, 102]}
                        label={{ value: 'Assay (%)', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip />
                      <Legend />

                      {/* Actual data points */}
                      <Line
                        data={shelfLifeEstimate.arrheniusBased ? accData : longTermData}
                        type="monotone"
                        dataKey="assay"
                        stroke="#8884d8"
                        name="Observed Data"
                        activeDot={{ r: 8 }}
                      />

                      {/* Prediction line */}
                      <Line
                        data={predictionData}
                        type="monotone"
                        dataKey="predicted"
                        stroke="#ff7300"
                        name="Predicted Trend"
                        strokeDasharray="5 5"
                      />

                      {/* Shelf life point */}
                      <Scatter
                        data={[{ time: shelfLifeEstimate.months, predicted: 95 }]}
                        name="Shelf Life"
                        fill="#FF0000"
                        line={false}
                      ></Scatter>

                      {/* 95% line */}
                      <Line
                        data={[
                          { time: 0, limit: 95 },
                          {
                            time: Math.max(...timePoints, shelfLifeEstimate.months + 6),
                            limit: 95,
                          },
                        ]}
                        type="monotone"
                        dataKey="limit"
                        stroke="#FF0000"
                        name="95% Limit"
                        strokeDasharray="3 3"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="text-center">
                  <p className="text-lg text-gray-600 mb-4">No analysis results yet</p>
                  <p className="text-sm text-gray-500 mb-6">
                    Enter stability data and run the analysis from the Long-term or Accelerated tabs
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab('long-term')}
                    className="flex items-center gap-2"
                  >
                    Go to Data Entry <ArrowRight size={16} />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between bg-gray-50 rounded-b-md">
        <div className="text-sm text-gray-600">
          <span className="font-medium">ICH Q1:</span> Stability Testing of New Drug Substances and
          Products
        </div>
        <div className="text-sm text-gray-600">
          Analysis based on linear regression and Arrhenius models
        </div>
      </CardFooter>
    </Card>
  );
};

export default StabilityDataAnalyzer;
