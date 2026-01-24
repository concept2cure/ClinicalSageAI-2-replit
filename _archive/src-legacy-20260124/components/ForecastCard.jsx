/**
 * ForecastCard Component
 *
 * This component displays predictive analytics for clinical trial outcomes,
 * including Monte Carlo simulations for enrollment and completion forecasts.
 *
 * Features:
 * 1. Visual representation of enrollment and study completion forecasts
 * 2. Confidence intervals for predictions
 * 3. Probability of success metrics
 * 4. Interactive control of simulation parameters
 */

import { useState, useEffect } from 'react';
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
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RefreshCw, TrendingUp, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * ForecastCard component for trial outcome predictions
 *
 * @param {Object} props - Component properties
 * @param {Object} props.studyData - Basic study data for prediction
 * @param {string} props.studyData.id - Study identifier
 * @param {string} props.studyData.title - Study title
 * @param {number} props.studyData.targetN - Target enrollment number
 * @param {string} props.studyData.phase - Study phase
 * @param {string} props.studyData.indication - Study indication/therapeutic area
 */
export default function ForecastCard({ studyData = {} }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [predictionData, setPredictionData] = useState(null);
  const [iterations, setIterations] = useState(1000);
  const [confidenceLevel, setConfidenceLevel] = useState(95);
  const { toast } = useToast();

  // Default study data if not provided
  const defaultStudyData = {
    id: 'STUDY-001',
    title: 'Phase II Clinical Trial',
    targetN: 200,
    currentN: 45,
    phase: 'Phase II',
    indication: 'Oncology',
  };

  // Use provided study data or defaults
  const study = {
    ...defaultStudyData,
    ...studyData,
  };

  // Run prediction on mount if studyData is provided
  useEffect(() => {
    if (Object.keys(studyData).length > 0) {
      runPrediction();
    }
  }, []);

  // Function to run the Monte Carlo prediction
  const runPrediction = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/predictor/monte-carlo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studyData: study,
          iterations,
          confidenceLevel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error running prediction');
      }

      if (data.success) {
        setPredictionData(data.result);
        toast({
          title: 'Prediction Complete',
          description: `Forecast updated with ${iterations} iterations`,
        });
      } else {
        throw new Error(data.message || 'Unknown error');
      }
    } catch (err) {
      console.error('Prediction error:', err);
      setError(err.message || 'Failed to run prediction');
      toast({
        title: 'Prediction Failed',
        description: err.message || 'An error occurred while generating the forecast',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Format a date X days from now
  const formatFutureDate = days => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Card className="w-full shadow-md">
      <CardHeader className="bg-gray-50 border-b">
        <CardTitle className="text-xl flex items-center">
          <TrendingUp className="h-5 w-5 mr-2 text-blue-500" />
          Trial Outcome Forecast
        </CardTitle>
        <CardDescription>
          Monte Carlo simulation for enrollment and completion projections
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6 pb-2">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Study Information</h3>
          <p className="text-base font-medium">{study.title}</p>
          <p className="text-sm text-gray-600">
            {study.phase} • {study.indication} • Target N: {study.targetN}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 p-3 rounded-md mb-4 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mr-2 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        <Tabs defaultValue="enrollment" className="mt-4">
          <TabsList className="w-full">
            <TabsTrigger value="enrollment" className="flex-1">
              Enrollment
            </TabsTrigger>
            <TabsTrigger value="completion" className="flex-1">
              Completion
            </TabsTrigger>
            <TabsTrigger value="probability" className="flex-1">
              Probability
            </TabsTrigger>
          </TabsList>

          <TabsContent value="enrollment" className="pt-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-2" />
                <p className="text-sm text-gray-500">Running simulation...</p>
              </div>
            ) : predictionData ? (
              <div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-blue-50 p-3 rounded-md">
                    <p className="text-xs text-blue-700 mb-1">Median Projection</p>
                    <p className="text-xl font-bold">{predictionData.median || 0}</p>
                    <p className="text-xs text-gray-500">participants</p>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-md">
                    <p className="text-xs text-gray-700 mb-1">Lower Bound</p>
                    <p className="text-xl font-semibold">
                      {predictionData.confidenceInterval?.[0] || 0}
                    </p>
                    <p className="text-xs text-gray-500">participants</p>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-md">
                    <p className="text-xs text-gray-700 mb-1">Upper Bound</p>
                    <p className="text-xl font-semibold">
                      {predictionData.confidenceInterval?.[1] || 0}
                    </p>
                    <p className="text-xs text-gray-500">participants</p>
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="flex justify-between mb-1">
                    <p className="text-xs text-gray-600">Current</p>
                    <p className="text-xs text-gray-600">Target</p>
                  </div>

                  <div className="relative h-3 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="absolute h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, (study.currentN / study.targetN) * 100)}%` }}
                    ></div>
                  </div>

                  <div className="flex justify-between mt-1">
                    <p className="text-xs font-medium">{study.currentN} participants</p>
                    <p className="text-xs font-medium">{study.targetN} participants</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-gray-500 mb-2">No forecast data available</p>
                <Button variant="outline" size="sm" onClick={runPrediction} disabled={isLoading}>
                  Run Initial Forecast
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="completion" className="pt-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-2" />
                <p className="text-sm text-gray-500">Calculating completion dates...</p>
              </div>
            ) : predictionData?.studyCompletion ? (
              <div>
                <div className="bg-blue-50 p-3 rounded-md mb-4">
                  <p className="text-xs text-blue-700 mb-1">Estimated Completion</p>
                  <p className="text-xl font-bold">
                    {formatFutureDate(predictionData.studyCompletion.estimatedDays || 0)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {predictionData.studyCompletion.estimatedDays || 0} days from today
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded-md">
                    <p className="text-xs text-gray-700 mb-1">Earliest</p>
                    <p className="text-lg font-semibold">
                      {formatFutureDate((predictionData.studyCompletion.estimatedDays || 0) - 30)}
                    </p>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-md">
                    <p className="text-xs text-gray-700 mb-1">Latest</p>
                    <p className="text-lg font-semibold">
                      {formatFutureDate((predictionData.studyCompletion.estimatedDays || 0) + 30)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-gray-500 mb-2">No completion data available</p>
                <Button variant="outline" size="sm" onClick={runPrediction} disabled={isLoading}>
                  Calculate Completion Dates
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="probability" className="pt-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-2" />
                <p className="text-sm text-gray-500">Calculating probabilities...</p>
              </div>
            ) : predictionData ? (
              <div>
                <div className="bg-blue-50 p-3 rounded-md mb-4">
                  <p className="text-xs text-blue-700 mb-1">Probability of Success</p>
                  <p className="text-xl font-bold">
                    {Math.round((predictionData.probabilityOfSuccess || 0) * 100)}%
                  </p>
                  <p className="text-xs text-gray-500">
                    Based on similar trials and current progress
                  </p>
                </div>

                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-xs text-gray-700 mb-1">Confidence Level</p>
                  <p className="text-sm mb-2">{confidenceLevel}%</p>
                  <Slider
                    value={[confidenceLevel]}
                    min={70}
                    max={99}
                    step={1}
                    onValueChange={values => setConfidenceLevel(values[0])}
                    disabled={isLoading}
                  />
                  <div className="flex justify-between mt-1">
                    <p className="text-xs text-gray-500">70%</p>
                    <p className="text-xs text-gray-500">99%</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-gray-500 mb-2">No probability data available</p>
                <Button variant="outline" size="sm" onClick={runPrediction} disabled={isLoading}>
                  Calculate Probabilities
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="flex justify-between bg-gray-50 border-t px-6 py-4">
        <div className="flex items-center">
          <p className="text-xs text-gray-500">
            {iterations} iterations • {confidenceLevel}% confidence
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={runPrediction}
          disabled={isLoading}
          className="flex items-center"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1" />
          )}
          Refresh
        </Button>
      </CardFooter>
    </Card>
  );
}
