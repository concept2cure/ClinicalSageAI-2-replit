import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  Calculator,
  BarChart,
  LineChart,
  Upload,
  Download,
  ArrowRight,
  CalendarClock,
  Thermometer,
  FileSpreadsheet,
} from 'lucide-react';
import { Link } from 'wouter';

/**
 * Shelf Life Predictor Stub Page
 *
 * This page provides a UI for:
 * - Uploading stability data
 * - Running Arrhenius equation-based shelf-life predictions
 * - Visualizing degradation curves
 * - Generating shelf-life reports
 */
const ShelfLifePredictorStubPage = () => {
  const [activeTab, setActiveTab] = useState('input');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedAttribute, setAttribute] = useState('');
  const [temperature, setTemperature] = useState(25);
  const [humidity, setHumidity] = useState(60);
  const [confidenceInterval, setConfidenceInterval] = useState(95);
  const [isCalculating, setIsCalculating] = useState(false);
  const [predictionResults, setPredictionResults] = useState(null);

  // Mock product options
  const productOptions = [
    { id: 'P001', name: 'Neuromax Tablets 10mg' },
    { id: 'P002', name: 'Cardiostat Capsules 25mg' },
    { id: 'P003', name: 'Immunoboost Injection' },
  ];

  // Mock stability attributes
  const attributeOptions = [
    { id: 'A001', name: 'Assay (%)' },
    { id: 'A002', name: 'Related Substance A (%)' },
    { id: 'A003', name: 'Dissolution at 45 min (%)' },
    { id: 'A004', name: 'Water Content (%)' },
    { id: 'A005', name: 'pH' },
  ];

  // Mock stability data that would normally come from database
  const mockStabilityData = {
    P001: {
      A001: [
        { time: 0, temp: 25, rh: 60, value: 100.2 },
        { time: 3, temp: 25, rh: 60, value: 99.8 },
        { time: 6, temp: 25, rh: 60, value: 99.3 },
        { time: 0, temp: 30, rh: 65, value: 100.2 },
        { time: 3, temp: 30, rh: 65, value: 99.4 },
        { time: 6, temp: 30, rh: 65, value: 98.6 },
        { time: 0, temp: 40, rh: 75, value: 100.2 },
        { time: 1, temp: 40, rh: 75, value: 99.1 },
        { time: 2, temp: 40, rh: 75, value: 98.3 },
        { time: 3, temp: 40, rh: 75, value: 97.2 },
        { time: 6, temp: 40, rh: 75, value: 94.8 },
      ],
      A002: [
        { time: 0, temp: 25, rh: 60, value: 0.05 },
        { time: 3, temp: 25, rh: 60, value: 0.08 },
        { time: 6, temp: 25, rh: 60, value: 0.12 },
        { time: 0, temp: 30, rh: 65, value: 0.05 },
        { time: 3, temp: 30, rh: 65, value: 0.15 },
        { time: 6, temp: 30, rh: 65, value: 0.24 },
        { time: 0, temp: 40, rh: 75, value: 0.05 },
        { time: 1, temp: 40, rh: 75, value: 0.12 },
        { time: 2, temp: 40, rh: 75, value: 0.23 },
        { time: 3, temp: 40, rh: 75, value: 0.35 },
        { time: 6, temp: 40, rh: 75, value: 0.62 },
      ],
    },
    P002: {
      A001: [
        { time: 0, temp: 25, rh: 60, value: 99.8 },
        { time: 3, temp: 25, rh: 60, value: 99.5 },
        { time: 6, temp: 25, rh: 60, value: 99.0 },
        { time: 0, temp: 40, rh: 75, value: 99.8 },
        { time: 1, temp: 40, rh: 75, value: 99.1 },
        { time: 3, temp: 40, rh: 75, value: 97.5 },
        { time: 6, temp: 40, rh: 75, value: 95.2 },
      ],
    },
  };

  // Function to run prediction calculation
  const runPrediction = () => {
    if (!selectedProduct || !selectedAttribute) {
      return;
    }

    setIsCalculating(true);

    // Simulate API call with timeout
    setTimeout(() => {
      // Determine shelf life based on the selected attribute and product
      let shelfLife;
      let specLimit;

      if (selectedProduct === 'P001' && selectedAttribute === 'A001') {
        shelfLife = 24;
        specLimit = 95.0;
      } else if (selectedProduct === 'P001' && selectedAttribute === 'A002') {
        shelfLife = 18;
        specLimit = 0.5;
      } else if (selectedProduct === 'P002' && selectedAttribute === 'A001') {
        shelfLife = 30;
        specLimit = 95.0;
      } else {
        shelfLife = 24;
        specLimit = 95.0;
      }

      // Generate mock prediction results with some variation based on temperature
      // Higher temperatures = shorter shelf life
      const tempFactor = 1 - (temperature - 25) * 0.03;
      const adjustedShelfLife = Math.round(shelfLife * tempFactor);

      // Generate prediction results
      setPredictionResults({
        product: productOptions.find(p => p.id === selectedProduct)?.name,
        attribute: attributeOptions.find(a => a.id === selectedAttribute)?.name,
        specLimit: selectedAttribute === 'A002' ? `NMT ${specLimit}%` : `NLT ${specLimit}%`,
        predictedShelfLife: adjustedShelfLife,
        confidenceInterval: confidenceInterval,
        lowerBound: Math.max(0, Math.round(adjustedShelfLife * 0.85)),
        upperBound: Math.round(adjustedShelfLife * 1.15),
        temperature: temperature,
        humidity: humidity,
        activationEnergy: (Math.random() * 20 + 70).toFixed(2), // Random value between 70-90 kJ/mol
        rSquared: (0.95 + Math.random() * 0.04).toFixed(4), // Random R² value near 0.95-0.99
        predictedValues: [
          { time: 0, value: selectedAttribute === 'A002' ? 0.05 : 100.0 },
          { time: 6, value: selectedAttribute === 'A002' ? 0.15 : 98.9 },
          { time: 12, value: selectedAttribute === 'A002' ? 0.25 : 97.8 },
          { time: 18, value: selectedAttribute === 'A002' ? 0.35 : 96.7 },
          { time: 24, value: selectedAttribute === 'A002' ? 0.45 : 95.6 },
          { time: 30, value: selectedAttribute === 'A002' ? 0.55 : 94.5 },
          { time: 36, value: selectedAttribute === 'A002' ? 0.65 : 93.4 },
        ],
      });

      setIsCalculating(false);
      setActiveTab('results');
    }, 1500); // Simulate calculation time of 1.5 seconds
  };

  // Handle file upload simulation
  const handleFileUpload = e => {
    e.preventDefault();
    setIsCalculating(true);

    // Simulate processing time for file upload
    setTimeout(() => {
      setIsCalculating(false);
      // For a real implementation, this would extract data from the file
      // and update state accordingly
      alert('File processed successfully! Data would be imported here in a real implementation.');
    }, 1000);
  };

  return (
    <div className="shelf-life-predictor-page p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Shelf-Life Predictor</h1>
          <p className="text-muted-foreground">
            Calculate shelf-life predictions using ICH Q1E Arrhenius modeling
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/stability">
            <Button variant="outline" className="flex items-center">
              <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
              Back to Stability Studies
            </Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="input" value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="w-full max-w-md mx-auto">
          <TabsTrigger value="input" className="flex-1">
            <Calculator className="h-4 w-4 mr-2" />
            Input Data
          </TabsTrigger>
          <TabsTrigger value="results" className="flex-1" disabled={!predictionResults}>
            <BarChart className="h-4 w-4 mr-2" />
            Prediction Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="input" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Data Selection</CardTitle>
                <CardDescription>Select stability data for prediction</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="product">Product</Label>
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger id="product">
                      <SelectValue placeholder="Select a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {productOptions.map(product => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="attribute">Stability Attribute</Label>
                  <Select
                    value={selectedAttribute}
                    onValueChange={setAttribute}
                    disabled={!selectedProduct}
                  >
                    <SelectTrigger id="attribute">
                      <SelectValue placeholder="Select an attribute" />
                    </SelectTrigger>
                    <SelectContent>
                      {attributeOptions
                        .filter(attr => {
                          // Only show attributes for which we have data
                          return (
                            selectedProduct &&
                            mockStabilityData[selectedProduct] &&
                            mockStabilityData[selectedProduct][attr.id]
                          );
                        })
                        .map(attr => (
                          <SelectItem key={attr.id} value={attr.id}>
                            {attr.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Or import data from file</span>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full flex items-center justify-center"
                    onClick={handleFileUpload}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import Stability Data
                  </Button>
                </div>

                {selectedProduct &&
                  selectedAttribute &&
                  mockStabilityData[selectedProduct] &&
                  mockStabilityData[selectedProduct][selectedAttribute] && (
                    <div className="mt-4 border rounded-md p-3">
                      <h4 className="text-sm font-medium mb-2">Available Data Points</h4>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="pb-1 text-left">Time (months)</th>
                            <th className="pb-1 text-left">Temp (°C)</th>
                            <th className="pb-1 text-left">RH (%)</th>
                            <th className="pb-1 text-right">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mockStabilityData[selectedProduct][selectedAttribute]
                            .sort((a, b) => a.temp - b.temp || a.time - b.time)
                            .map((point, index) => (
                              <tr key={index} className="border-b last:border-0">
                                <td className="py-1">{point.time}</td>
                                <td className="py-1">{point.temp}°C</td>
                                <td className="py-1">{point.rh}%</td>
                                <td className="py-1 text-right">{point.value}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Prediction Parameters</CardTitle>
                <CardDescription>Adjust settings for shelf-life calculation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <Label htmlFor="temperature">Storage Temperature (°C)</Label>
                      <span className="text-sm font-medium">{temperature}°C</span>
                    </div>
                    <Slider
                      id="temperature"
                      min={5}
                      max={40}
                      step={1}
                      value={[temperature]}
                      onValueChange={value => setTemperature(value[0])}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>5°C</span>
                      <span>25°C</span>
                      <span>40°C</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <Label htmlFor="humidity">Relative Humidity (%)</Label>
                      <span className="text-sm font-medium">{humidity}%</span>
                    </div>
                    <Slider
                      id="humidity"
                      min={10}
                      max={80}
                      step={5}
                      value={[humidity]}
                      onValueChange={value => setHumidity(value[0])}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>10%</span>
                      <span>60%</span>
                      <span>80%</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <Label htmlFor="confidence">Confidence Interval (%)</Label>
                      <span className="text-sm font-medium">{confidenceInterval}%</span>
                    </div>
                    <Slider
                      id="confidence"
                      min={90}
                      max={99}
                      step={1}
                      value={[confidenceInterval]}
                      onValueChange={value => setConfidenceInterval(value[0])}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>90%</span>
                      <span>95%</span>
                      <span>99%</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-6">
                  <Thermometer className="h-5 w-5 text-amber-500" />
                  <div className="text-sm">
                    <p className="font-medium">Arrhenius Equation</p>
                    <p className="text-muted-foreground">
                      k = A·e<sup>-Ea/RT</sup>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-blue-500" />
                  <div className="text-sm">
                    <p className="font-medium">ICH Q1E Compliant</p>
                    <p className="text-muted-foreground">
                      Statistical extrapolation with appropriate limits
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={runPrediction}
                  className="w-full"
                  disabled={isCalculating || !selectedProduct || !selectedAttribute}
                >
                  {isCalculating ? (
                    <>
                      <span className="animate-spin h-4 w-4 mr-2 border-2 border-white border-opacity-50 border-t-transparent rounded-full"></span>
                      Calculating...
                    </>
                  ) : (
                    <>
                      <Calculator className="h-4 w-4 mr-2" />
                      Run Prediction
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="results" className="mt-6">
          {predictionResults && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle>Prediction Summary</CardTitle>
                  <CardDescription>Based on Arrhenius model analysis</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Product</div>
                    <div className="font-medium">{predictionResults.product}</div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground">Stability Attribute</div>
                    <div className="font-medium">{predictionResults.attribute}</div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground">Specification Limit</div>
                    <div className="font-medium">{predictionResults.specLimit}</div>
                  </div>

                  <div className="p-4 border rounded-md bg-blue-50">
                    <div className="text-sm text-blue-700 mb-1">Predicted Shelf Life</div>
                    <div className="flex items-end gap-2">
                      <div className="text-3xl font-bold text-blue-700">
                        {predictionResults.predictedShelfLife}
                      </div>
                      <div className="text-xl font-medium text-blue-600 mb-0.5">months</div>
                    </div>
                    <div className="text-sm text-blue-600 mt-1">
                      {predictionResults.lowerBound} - {predictionResults.upperBound} months
                      <span className="text-xs ml-1">
                        ({predictionResults.confidenceInterval}% CI)
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground">Storage Condition</div>
                    <div className="font-medium">
                      {predictionResults.temperature}°C / {predictionResults.humidity}% RH
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground">Activation Energy</div>
                    <div className="font-medium">{predictionResults.activationEnergy} kJ/mol</div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground">Model Fit (R²)</div>
                    <div className="font-medium">{predictionResults.rSquared}</div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button variant="outline" onClick={() => setActiveTab('input')}>
                    Edit Inputs
                  </Button>
                  <Button className="flex items-center">
                    <Download className="h-4 w-4 mr-2" />
                    Export Report
                  </Button>
                </CardFooter>
              </Card>

              <Card className="col-span-1 lg:col-span-2">
                <CardHeader>
                  <CardTitle>Degradation Analysis</CardTitle>
                  <CardDescription>Projected stability trend over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="aspect-[16/9] border rounded-md bg-gray-50 flex items-center justify-center">
                    <div className="text-center p-6">
                      <LineChart className="h-20 w-20 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">
                        Degradation curve visualization would appear here
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        The visualization would show the projected values over time with confidence
                        intervals
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h4 className="text-sm font-medium mb-2">
                      Predicted Values at {predictionResults.temperature}°C
                    </h4>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="pb-2 text-left">Time (months)</th>
                          <th className="pb-2 text-right">Predicted Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {predictionResults.predictedValues.map((point, index) => (
                          <tr
                            key={index}
                            className={`border-b last:border-0 ${
                              (predictionResults.attribute.includes('Related') &&
                                point.value > 0.5) ||
                              (!predictionResults.attribute.includes('Related') &&
                                point.value < 95.0)
                                ? 'text-red-600'
                                : ''
                            }`}
                          >
                            <td className="py-2">{point.time}</td>
                            <td className="py-2 text-right">{point.value.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
                <CardFooter>
                  <div className="w-full">
                    <h4 className="text-sm font-medium mb-2">Prediction Note</h4>
                    <div className="text-sm text-muted-foreground p-3 border rounded-md">
                      Based on the Arrhenius model analysis with an activation energy of{' '}
                      {predictionResults.activationEnergy} kJ/mol, the predicted shelf life for{' '}
                      {predictionResults.product} with respect to{' '}
                      {predictionResults.attribute.toLowerCase()}
                      at {predictionResults.temperature}°C / {predictionResults.humidity}% RH is
                      approximately {predictionResults.predictedShelfLife} months. This prediction
                      is made with a statistical confidence level of{' '}
                      {predictionResults.confidenceInterval}%.
                    </div>
                  </div>
                </CardFooter>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ShelfLifePredictorStubPage;
