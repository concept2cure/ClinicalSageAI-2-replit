import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, } from 'recharts';
import { Calculator, Brain, LineChart, FileCheck, MousePointerClick } from 'lucide-react'

/**
 * EnzymaxStudyDesign component for calculating and visualizing sample size requirements
 * based on the FDA biostatistician's approach for functional dyspepsia and chronic pancreatitis studies
 */
const EnzymaxStudyDesign = () => {
  // State for study options
  const [indication, setIndication] = useState('functional-dyspepsia');
  const [approach, setApproach] = useState('superiority');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [results, setResults] = useState(null);
  const [powerCurve, setPowerCurve] = useState([]);

  // State for study parameters - Functional Dyspepsia
  const [testReduction, setTestReduction] = useState(-5);
  const [controlReduction, setControlReduction] = useState(5);
  const [standardDeviation, setStandardDeviation] = useState(18);
  const [nonInferiorityMargin, setNonInferiorityMargin] = useState(-10);
  const [alpha, setAlpha] = useState(0.05);
  const [power, setPower] = useState(0.8);
  const [dropoutRate, setDropoutRate] = useState(0.2);

  // State for study parameters - Chronic Pancreatitis
  const [testCfaChange, setTestCfaChange] = useState(26);
  const [controlCfaChange, setControlCfaChange] = useState(4);
  const [cfaStandardDeviation, setCfaStandardDeviation] = useState(15);
  const [cfaNonInferiorityMargin, setCfaNonInferiorityMargin] = useState(-5);

  // Reference scenarios from the FDA document
  const referenceScenarios = {
    'functional-dyspepsia': {
      superiority: [
        { test: -5, control: -1, sd: 19, n: 355 },
        { test: -5, control: 0, sd: 19, n: 228 },
        { test: -5, control: 1, sd: 19, n: 159 },
        { test: -5, control: 2, sd: 19, n: 117 },
        { test: -5, control: 3, sd: 19, n: 90 },
        { test: -5, control: 4, sd: 19, n: 71 },
        { test: -5, control: 5, sd: 19, n: 58 },
      ],
      'non-inferiority': [
        { reference: 5, test: 5, diff: 0, sd: 18, margin: -10, n: 52 },
        { reference: 5, test: 4, diff: -1, sd: 18, margin: -10, n: 64 },
        { reference: 5, test: 3, diff: -2, sd: 18, margin: -10, n: 81 },
        { reference: 5, test: 2, diff: -3, sd: 18, margin: -10, n: 105 },
      ],
    },
    'chronic-pancreatitis': {
      superiority: [
        { test: 26, control: 4, sd: 15, n: 8 },
        { test: 20, control: 4, sd: 15, n: 13 },
        { test: 15, control: 4, sd: 15, n: 22 },
      ],
    },
  };

  // Calculate sample size using analytical formula
  const calculateSampleSize = () => {
    setIsCalculating(true);

    setTimeout(() => {
      try {
        let n = 0;
        let meanDiff = 0;
        let stdDev = 0;
        let margin = 0;

        if (indication === 'functional-dyspepsia') {
          meanDiff = testReduction - controlReduction;
          stdDev = standardDeviation;
          margin = nonInferiorityMargin;
        } else {
          // chronic-pancreatitis
          meanDiff = testCfaChange - controlCfaChange;
          stdDev = cfaStandardDeviation;
          margin = cfaNonInferiorityMargin;
        }

        if (approach === 'superiority') {
          // Critical values for two-sided test
          const zAlpha = 1.96; // 95% confidence (alpha=0.05)
          const zBeta = 0.84; // 80% power

          // Sample size formula for two-sample t-test
          n = (2 * (zAlpha + zBeta) ** 2 * stdDev ** 2) / meanDiff ** 2;
        } else {
          // non-inferiority
          // Critical values (one-sided test for non-inferiority)
          const zAlpha = 1.645; // 95% confidence one-sided (alpha=0.05)
          const zBeta = 0.84; // 80% power

          // Adjusted difference accounting for non-inferiority margin
          const adjustedDiff = meanDiff - margin;

          // Sample size formula for non-inferiority
          n = (2 * (zAlpha + zBeta) ** 2 * stdDev ** 2) / adjustedDiff ** 2;
        }

        // Round up to nearest integer
        n = Math.ceil(n);

        // Generate power curve data
        const curveData = [];
        for (let i = 10; i <= Math.max(400, n * 1.5); i += Math.max(5, Math.floor(n / 20))) {
          let curveN = i;
          let curvePower = 0;

          if (approach === 'superiority') {
            const ncp = meanDiff / (stdDev * Math.sqrt(2 / curveN));
            curvePower = 1 - 0.5 * (1 + erf((1.96 - ncp) / Math.sqrt(2)));
          } else {
            const adjustedDiff = meanDiff - margin;
            const ncp = adjustedDiff / (stdDev * Math.sqrt(2 / curveN));
            curvePower = 1 - 0.5 * (1 + erf((1.645 - ncp) / Math.sqrt(2)));
          }

          curveData.push({
            sampleSize: curveN,
            power: curvePower,
          });
        }

        setPowerCurve(curveData);

        // Calculate with dropouts
        const totalN = n * 2;
        const totalWithDropouts = Math.ceil(totalN / (1 - dropoutRate));

        setResults({
          sampleSizePerArm: n,
          totalSampleSize: totalN,
          totalWithDropouts: totalWithDropouts,
          power: power,
          alpha: alpha,
          approach: approach,
          meanDifference: meanDiff,
          standardDeviation: stdDev,
          nonInferiorityMargin: approach === 'non-inferiority' ? margin : null,
        });

        setIsCalculating(false);
      } catch (error) {
        console.error('Calculation error:', error);
        setIsCalculating(false);
      }
    }, 500);
  };

  // Helper function for error function (erf)
  function erf(x) {
    // Constants
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    // Save the sign of x
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    // A&S formula 7.1.26
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  // Load reference scenario
  const loadReferenceScenario = index => {
    const scenarios = referenceScenarios[indication][approach];
    if (scenarios && scenarios[index]) {
      const scenario = scenarios[index];

      if (indication === 'functional-dyspepsia') {
        if (approach === 'superiority') {
          setTestReduction(scenario.test);
          setControlReduction(scenario.control);
          setStandardDeviation(scenario.sd);
        } else {
          setTestReduction(scenario.test);
          setControlReduction(scenario.reference);
          setStandardDeviation(scenario.sd);
          setNonInferiorityMargin(scenario.margin);
        }
      } else {
        // chronic-pancreatitis
        setTestCfaChange(scenario.test);
        setControlCfaChange(scenario.control);
        setCfaStandardDeviation(scenario.sd);
      }
    }
  };

  // Reset form when indication or approach changes
  useEffect(() => {
    // Reset results
    setResults(null);
    setPowerCurve([]);

    // Load the first reference scenario
    if (
      referenceScenarios[indication] &&
      referenceScenarios[indication][approach] &&
      referenceScenarios[indication][approach].length > 0
    ) {
      loadReferenceScenario(0);
    }
  }, [indication, approach]);

  return (
    <Card className="w-full">
      <CardHeader className="bg-gradient-to-r from-orange-100 to-orange-50 border-b">
        <CardTitle className="flex items-center gap-2 text-2xl font-bold text-orange-800">
          <Calculator className="h-6 w-6" />
          Enzymax Study Design & Sample Size Calculator
        </CardTitle>
        <CardDescription>
          Based on FDA biostatistician recommendations for clinical trial design with superiority
          and non-inferiority approaches
        </CardDescription>
      </CardHeader>

      <CardContent className="p-6">
        <Tabs defaultValue="calculator" className="w-full">
          <TabsList className="grid grid-cols-2 md:grid-cols-4 mb-6">
            <TabsTrigger value="calculator" className="flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              <span>Calculator</span>
            </TabsTrigger>
            <TabsTrigger value="power-curve" className="flex items-center gap-2">
              <LineChart className="h-4 w-4" />
              <span>Power Curve</span>
            </TabsTrigger>
            <TabsTrigger value="scenarios" className="flex items-center gap-2">
              <FileCheck className="h-4 w-4" />
              <span>Reference Scenarios</span>
            </TabsTrigger>
            <TabsTrigger value="explanation" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              <span>Explanation</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calculator" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="indication">Indication</Label>
                  <Select value={indication} onValueChange={setIndication}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select indication" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="functional-dyspepsia">Functional Dyspepsia</SelectItem>
                      <SelectItem value="chronic-pancreatitis">Chronic Pancreatitis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="approach">Study Approach</Label>
                  <Select value={approach} onValueChange={setApproach}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select approach" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="superiority">Superiority (vs Placebo)</SelectItem>
                      <SelectItem value="non-inferiority">
                        Non-Inferiority (vs Reference)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {indication === 'functional-dyspepsia' ? (
                  <div className="space-y-4 border rounded-lg p-4 bg-orange-50">
                    <h3 className="font-medium">Functional Dyspepsia Parameters</h3>

                    <div className="space-y-2">
                      <Label htmlFor="testReduction">
                        {approach === 'superiority'
                          ? 'Test Product NDI SF Score Change'
                          : 'Test Product NDI SF Score Change'}
                      </Label>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="testReduction"
                          type="number"
                          step="1"
                          value={testReduction}
                          onChange={e => setTestReduction(parseFloat(e.target.value))}
                        />
                        <span className="text-sm text-gray-500">
                          (-5 = improvement of 5 points)
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="controlReduction">
                        {approach === 'superiority'
                          ? 'Placebo NDI SF Score Change'
                          : 'Reference Product NDI SF Score Change'}
                      </Label>
                      <Input
                        id="controlReduction"
                        type="number"
                        step="1"
                        value={controlReduction}
                        onChange={e => setControlReduction(parseFloat(e.target.value))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="standardDeviation">Standard Deviation</Label>
                      <Input
                        id="standardDeviation"
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={standardDeviation}
                        onChange={e => setStandardDeviation(parseFloat(e.target.value))}
                      />
                    </div>

                    {approach === 'non-inferiority' && (
                      <div className="space-y-2">
                        <Label htmlFor="nonInferiorityMargin">Non-Inferiority Margin</Label>
                        <Input
                          id="nonInferiorityMargin"
                          type="number"
                          step="1"
                          value={nonInferiorityMargin}
                          onChange={e => setNonInferiorityMargin(parseFloat(e.target.value))}
                        />
                        <p className="text-sm text-gray-500">
                          Negative value indicates maximum acceptable difference
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 border rounded-lg p-4 bg-orange-50">
                    <h3 className="font-medium">Chronic Pancreatitis Parameters (CFA)</h3>

                    <div className="space-y-2">
                      <Label htmlFor="testCfaChange">
                        {approach === 'superiority'
                          ? 'Test Product CFA Change'
                          : 'Test Product CFA Change'}
                      </Label>
                      <Input
                        id="testCfaChange"
                        type="number"
                        step="0.1"
                        value={testCfaChange}
                        onChange={e => setTestCfaChange(parseFloat(e.target.value))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="controlCfaChange">
                        {approach === 'superiority'
                          ? 'Placebo CFA Change'
                          : 'Reference Product CFA Change'}
                      </Label>
                      <Input
                        id="controlCfaChange"
                        type="number"
                        step="0.1"
                        value={controlCfaChange}
                        onChange={e => setControlCfaChange(parseFloat(e.target.value))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cfaStandardDeviation">Standard Deviation</Label>
                      <Input
                        id="cfaStandardDeviation"
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={cfaStandardDeviation}
                        onChange={e => setCfaStandardDeviation(parseFloat(e.target.value))}
                      />
                    </div>

                    {approach === 'non-inferiority' && (
                      <div className="space-y-2">
                        <Label htmlFor="cfaNonInferiorityMargin">Non-Inferiority Margin</Label>
                        <Input
                          id="cfaNonInferiorityMargin"
                          type="number"
                          step="0.1"
                          value={cfaNonInferiorityMargin}
                          onChange={e => setCfaNonInferiorityMargin(parseFloat(e.target.value))}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Switch
                    id="advancedOptions"
                    checked={showAdvancedOptions}
                    onCheckedChange={setShowAdvancedOptions}
                  />
                  <Label htmlFor="advancedOptions">Show Advanced Options</Label>
                </div>

                {showAdvancedOptions && (
                  <div className="space-y-4 border rounded-lg p-4">
                    <h3 className="font-medium">Statistical Parameters</h3>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label htmlFor="alpha">Alpha (Type I Error)</Label>
                        <span className="text-sm font-medium">{alpha}</span>
                      </div>
                      <Slider
                        id="alpha"
                        min={0.01}
                        max={0.1}
                        step={0.01}
                        value={[alpha]}
                        onValueChange={value => setAlpha(value[0])}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label htmlFor="power">Power (1 - Type II Error)</Label>
                        <span className="text-sm font-medium">{power}</span>
                      </div>
                      <Slider
                        id="power"
                        min={0.7}
                        max={0.95}
                        step={0.05}
                        value={[power]}
                        onValueChange={value => setPower(value[0])}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label htmlFor="dropoutRate">Dropout Rate</Label>
                        <span className="text-sm font-medium">{dropoutRate * 100}%</span>
                      </div>
                      <Slider
                        id="dropoutRate"
                        min={0}
                        max={0.4}
                        step={0.05}
                        value={[dropoutRate]}
                        onValueChange={value => setDropoutRate(value[0])}
                      />
                    </div>
                  </div>
                )}

                <Button
                  className="w-full bg-orange-600 hover:bg-orange-700"
                  onClick={calculateSampleSize}
                  disabled={isCalculating}
                >
                  {isCalculating ? 'Calculating...' : 'Calculate Sample Size'}
                </Button>
              </div>

              <div className="border rounded-lg p-4">
                <h3 className="font-medium mb-4">Sample Size Results</h3>

                {results ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-orange-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-500">Per Arm</p>
                        <p className="text-3xl font-bold text-orange-800">
                          {results.sampleSizePerArm}
                        </p>
                        <p className="text-xs text-gray-500">Subjects</p>
                      </div>

                      <div className="bg-orange-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-500">Total</p>
                        <p className="text-3xl font-bold text-orange-800">
                          {results.totalSampleSize}
                        </p>
                        <p className="text-xs text-gray-500">Subjects</p>
                      </div>
                    </div>

                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-500">With {dropoutRate * 100}% Dropout</p>
                      <p className="text-3xl font-bold text-blue-800">
                        {results.totalWithDropouts}
                      </p>
                      <p className="text-xs text-gray-500">Total subjects to enroll</p>
                    </div>

                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="font-medium">Study approach:</span>{' '}
                        {results.approach === 'superiority' ? 'Superiority' : 'Non-inferiority'}
                      </p>
                      <p>
                        <span className="font-medium">Mean difference:</span>{' '}
                        {results.meanDifference.toFixed(2)}
                      </p>
                      <p>
                        <span className="font-medium">Standard deviation:</span>{' '}
                        {results.standardDeviation.toFixed(2)}
                      </p>
                      {results.nonInferiorityMargin !== null && (
                        <p>
                          <span className="font-medium">Non-inferiority margin:</span>{' '}
                          {results.nonInferiorityMargin.toFixed(2)}
                        </p>
                      )}
                      <p>
                        <span className="font-medium">Alpha:</span> {results.alpha}
                      </p>
                      <p>
                        <span className="font-medium">Power:</span> {results.power}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                    <Calculator className="h-12 w-12 mb-2" />
                    <p>Enter parameters and click calculate</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="power-curve">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Power Analysis Curve</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={calculateSampleSize}
                  disabled={isCalculating}
                >
                  Calculate Power Curve
                </Button>
              </div>

              {powerCurve.length > 0 ? (
                <div className="h-96 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={powerCurve}
                      margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="sampleSize"
                        label={{
                          value: 'Sample Size (per arm)',
                          position: 'insideBottomRight',
                          offset: -10,
                        }}
                      />
                      <YAxis
                        domain={[0, 1]}
                        label={{ value: 'Power (1-β)', angle: -90, position: 'insideLeft' }}
                        tickFormatter={value => value.toFixed(1)}
                      />
                      <Tooltip
                        formatter={(value, name) => [value.toFixed(3), 'Power']}
                        labelFormatter={value => `Sample Size: ${value} per arm`}
                      />
                      <ReferenceLine y={0.8} stroke="red" strokeDasharray="3 3" />
                      <ReferenceLine y={0.9} stroke="blue" strokeDasharray="3 3" />
                      <Area
                        type="monotone"
                        dataKey="power"
                        stroke="#ff9800"
                        fill="#ffcc80"
                        activeDot={{ r: 8 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center space-x-8 mt-2 text-sm">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-red-500 mr-1"></div>
                      <span>80% Power</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-blue-500 mr-1"></div>
                      <span>90% Power</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 border rounded-lg">
                  <LineChart className="h-12 w-12 mb-2" />
                  <p>Click "Calculate Power Curve" to generate the visualization</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="scenarios">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Reference Scenarios from FDA Biostatistician</h3>
                <Select value={indication} onValueChange={setIndication}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Select indication" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="functional-dyspepsia">Functional Dyspepsia</SelectItem>
                    <SelectItem value="chronic-pancreatitis">Chronic Pancreatitis</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Tabs defaultValue="superiority">
                <TabsList className="grid grid-cols-2 mb-4">
                  <TabsTrigger value="superiority" onClick={() => setApproach('superiority')}>
                    Superiority
                  </TabsTrigger>
                  <TabsTrigger
                    value="non-inferiority"
                    onClick={() => setApproach('non-inferiority')}
                  >
                    Non-inferiority
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="superiority">
                  <div className="rounded-md border">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {indication === 'functional-dyspepsia' ? (
                            <>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Test NDI SF
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Placebo NDI SF
                              </th>
                            </>
                          ) : (
                            <>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Test CFA Change
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Placebo CFA Change
                              </th>
                            </>
                          )}
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Std. Dev.
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Sample Size per Arm
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {referenceScenarios[indication]?.superiority?.map((scenario, index) => (
                          <tr key={index}>
                            {indication === 'functional-dyspepsia' ? (
                              <>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {scenario.test}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {scenario.control}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {scenario.test}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {scenario.control}
                                </td>
                              </>
                            )}
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {scenario.sd}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {scenario.n}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => loadReferenceScenario(index)}
                                className="text-orange-600 hover:text-orange-900"
                              >
                                <MousePointerClick className="h-4 w-4 mr-1" />
                                Use
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                <TabsContent value="non-inferiority">
                  <div className="rounded-md border">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {indication === 'functional-dyspepsia' ? (
                            <>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Reference NDI SF
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Test NDI SF
                              </th>
                            </>
                          ) : (
                            <>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Reference CFA
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Test CFA
                              </th>
                            </>
                          )}
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Diff
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Std. Dev.
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Margin
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Sample Size
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {referenceScenarios[indication]?.['non-inferiority']?.map(
                          (scenario, index) => (
                            <tr key={index}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {scenario.reference}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {scenario.test}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {scenario.diff}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {scenario.sd}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {scenario.margin}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {scenario.n}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => loadReferenceScenario(index)}
                                  className="text-orange-600 hover:text-orange-900"
                                >
                                  <MousePointerClick className="h-4 w-4 mr-1" />
                                  Use
                                </Button>
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>

          <TabsContent value="explanation">
            <div className="space-y-4 prose max-w-none">
              <h3>Study Design Approaches Explained</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-orange-50 p-4 rounded-lg">
                  <h4 className="text-orange-800 font-medium">Superiority Design</h4>
                  <p className="text-sm">
                    Superiority trials aim to demonstrate that the test product is better than a
                    control (usually placebo). The required sample size depends on:
                  </p>
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    <li>Expected difference between test and control (effect size)</li>
                    <li>Variability of the outcome measure (standard deviation)</li>
                    <li>Statistical significance level (alpha, usually 0.05)</li>
                    <li>Desired statistical power (usually 0.8 or 0.9)</li>
                  </ul>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="text-blue-800 font-medium">Non-Inferiority Design</h4>
                  <p className="text-sm">
                    Non-inferiority trials aim to show that the test product is not meaningfully
                    worse than a reference product (active control). Key considerations include:
                  </p>
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    <li>Expected difference between test and reference</li>
                    <li>Non-inferiority margin (maximum acceptable difference)</li>
                    <li>Variability of the outcome measure</li>
                    <li>One-sided statistical test (usually alpha=0.025 or 0.05)</li>
                  </ul>
                </div>
              </div>

              <h3>Indication-Specific Information</h3>

              <div className="space-y-4">
                <div className="bg-orange-50 p-4 rounded-lg">
                  <h4 className="text-orange-800 font-medium">Functional Dyspepsia</h4>
                  <p className="text-sm">
                    For functional dyspepsia studies, the Nepean Dyspepsia Index (NDI) Short Form is
                    commonly used to assess symptoms. Key statistics from reference studies:
                  </p>
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    <li>
                      <strong>Ullah et al</strong>: Test NDI SF score change = -5, Placebo = +5, SD
                      = 19, Sample size = 58 per arm
                    </li>
                    <li>
                      <strong>Majeed et al</strong>: Test NDI SF score change = -11, Placebo = -6,
                      SD = 7, Sample size = 32 per arm
                    </li>
                  </ul>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="text-blue-800 font-medium">Chronic Pancreatitis</h4>
                  <p className="text-sm">
                    For chronic pancreatitis studies, the Coefficient of Fat Absorption (CFA) is the
                    standard primary endpoint. Reference data shows:
                  </p>
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    <li>Typical CFA improvements for enzyme therapy: 20-30 percentage points</li>
                    <li>Placebo response: 0-5 percentage points</li>
                    <li>Standard deviation: 15 (approximate)</li>
                  </ul>
                </div>
              </div>

              <h3>Statistical Calculations</h3>

              <p className="text-sm">Sample size calculations use standard statistical formulas:</p>

              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm font-medium">Superiority Design:</p>
                <p className="text-sm font-mono">
                  n = 2 * ((z<sub>α/2</sub> + z<sub>β</sub>)² * σ²) / Δ²
                </p>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  <li>n = sample size per group</li>
                  <li>
                    z<sub>α/2</sub> = 1.96 for two-sided α=0.05
                  </li>
                  <li>
                    z<sub>β</sub> = 0.84 for power=0.8
                  </li>
                  <li>σ = standard deviation</li>
                  <li>Δ = expected difference between groups</li>
                </ul>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg mt-4">
                <p className="text-sm font-medium">Non-Inferiority Design:</p>
                <p className="text-sm font-mono">
                  n = 2 * ((z<sub>α</sub> + z<sub>β</sub>)² * σ²) / (Δ - M)²
                </p>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  <li>n = sample size per group</li>
                  <li>
                    z<sub>α</sub> = 1.645 for one-sided α=0.05
                  </li>
                  <li>
                    z<sub>β</sub> = 0.84 for power=0.8
                  </li>
                  <li>σ = standard deviation</li>
                  <li>Δ = expected difference between test and reference</li>
                  <li>M = non-inferiority margin</li>
                </ul>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="bg-gradient-to-r from-orange-50 to-orange-100 border-t px-6 py-4">
        <div className="text-sm text-gray-500">
          <p>
            Based on FDA biostatistician methodology for Enzymax Forte clinical trial design. Power
            calculations use analytical formulas for t-tests.
          </p>
        </div>
      </CardFooter>
    </Card>
  );
};

export default EnzymaxStudyDesign;
