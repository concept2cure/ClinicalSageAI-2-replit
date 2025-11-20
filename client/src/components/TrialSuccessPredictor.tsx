import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Loader2, Download, ArrowUp, ArrowDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Define the form schema with validation
const formSchema = z.object({
  sample_size: z.coerce.number().min(10, 'Sample size must be at least 10').max(10000, 'Sample size must be less than 10,000'),
  duration_weeks: z.coerce.number().min(1, 'Duration must be at least 1 week').max(520, 'Duration must be less than 10 years (520 weeks)'),
  dropout_rate: z.coerce.number().min(0, 'Dropout rate must be at least 0%').max(100, 'Dropout rate cannot exceed 100%'),
  protocol_id: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// Feature contribution type
interface FeatureContribution {
  feature: string;
  contribution: number;
}

export default function TrialSuccessPredictor() {
  const [prediction, setPrediction] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [features, setFeatures] = useState<FeatureContribution[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  
  const { toast } = useToast();

  // Define the form using react-hook-form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sample_size: 200,
      duration_weeks: 52,
      dropout_rate: 15,
      protocol_id: `TS-${Math.floor(Math.random() * 10000)}`,
    },
  });

  // Prediction mutation
  const predictMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const response = await apiRequest('POST', '/api/ai/predict-success', values);
      return response.json();
    },
    onSuccess: (data) => {
      setPrediction(data.success_probability);
      setConfidence(data.confidence);
      
      // Format feature importance
      const featuresList: FeatureContribution[] = [
        { feature: 'Sample Size', contribution: data.feature_importance.sample_size },
        { feature: 'Duration (weeks)', contribution: data.feature_importance.duration_weeks },
        { feature: 'Dropout Rate', contribution: data.feature_importance.dropout_rate },
      ];
      
      // Sort by contribution
      featuresList.sort((a, b) => b.contribution - a.contribution);
      setFeatures(featuresList);
      
      // toast call replaced
  // Original: toast({
        title: "Prediction Complete",
        description: `Success probability: ${(data.success_probability * 100)
  console.log('Toast would show:', {
        title: "Prediction Complete",
        description: `Success probability: ${(data.success_probability * 100).toFixed(1)}%`,
      });
    },
    onError: (error) => {
      // toast call replaced
  // Original: toast({
        title: "Prediction Failed",
        description: "There was an error running the prediction model. Please try again.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Prediction Failed",
        description: "There was an error running the prediction model. Please try again.",
        variant: "destructive",
      });
      console.error('Prediction error:', error);
    },
  });

  // Export PDF mutation
  const exportPdfMutation = useMutation({
    mutationFn: async (values: FormValues & { success_rate: number }) => {
      const response = await apiRequest('POST', '/api/export/success-summary', values);
      return response.json();
    },
    onSuccess: (data) => {
      setPdfUrl(data.pdfUrl);
      
      // toast call replaced
  // Original: toast({
        title: "Export Complete",
        description: "PDF report has been generated successfully.",
      })
  console.log('Toast would show:', {
        title: "Export Complete",
        description: "PDF report has been generated successfully.",
      });
    },
    onError: (error) => {
      // toast call replaced
  // Original: toast({
        title: "Export Failed",
        description: "There was an error generating the PDF report. Please try again.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Export Failed",
        description: "There was an error generating the PDF report. Please try again.",
        variant: "destructive",
      });
      console.error('Export error:', error);
    },
  });

  const onSubmit = (values: FormValues) => {
    predictMutation.mutate(values);
  };

  const exportPdf = () => {
    if (prediction === null) return;
    
    const values = form.getValues();
    exportPdfMutation.mutate({
      ...values,
      success_rate: prediction,
    });
  };

  return (
    <div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Trial Success Predictor</CardTitle>
          <CardDescription>
            Enter trial parameters to predict the likelihood of success using our ML model.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="protocol_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Protocol ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter protocol ID" {...field} />
                    </FormControl>
                    <FormDescription>
                      Used for reference in exports and reports.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="sample_size"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sample Size</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormDescription>
                      Total number of participants in the trial.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="duration_weeks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (weeks)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormDescription>
                      Length of the trial in weeks.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="dropout_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dropout Rate (%)</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Slider
                          defaultValue={[field.value]}
                          max={100}
                          step={1}
                          onValueChange={(vals) => field.onChange(vals[0])}
                        />
                        <Input type="number" {...field} className="w-20 inline-block" />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Expected participant dropout percentage.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex gap-4">
                <Button type="submit" disabled={predictMutation.isPending}>
                  {predictMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Predicting...
                    </>
                  ) : (
                    'Predict Success'
                  )}
                </Button>
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={exportPdf}
                  disabled={prediction === null || exportPdfMutation.isPending}
                >
                  {exportPdfMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Export PDF
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {prediction !== null && (
        <Tabs defaultValue="prediction">
          <TabsList className="mb-4">
            <TabsTrigger value="prediction">Prediction Results</TabsTrigger>
            <TabsTrigger value="features">Feature Analysis</TabsTrigger>
            {pdfUrl && <TabsTrigger value="report">Generated Report</TabsTrigger>}
          </TabsList>
          
          <TabsContent value="prediction">
            <Card>
              <CardHeader>
                <CardTitle>Success Prediction</CardTitle>
                <CardDescription>
                  Based on your input parameters, our ML model has made the following prediction:
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">Success Probability</span>
                      <span className="font-bold">{(prediction * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={prediction * 100} className="h-4" />
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">Prediction Confidence</span>
                      <span>{confidence !== null ? `${(confidence * 100).toFixed(1)}%` : 'N/A'}</span>
                    </div>
                    <Progress value={confidence !== null ? confidence * 100 : 0} className="h-2" />
                  </div>
                  
                  <Alert className={prediction > 0.7 ? "bg-green-50 border-green-200" : 
                                      prediction > 0.5 ? "bg-blue-50 border-blue-200" : 
                                      "bg-red-50 border-red-200"}>
                    <AlertTitle>
                      {prediction > 0.7 ? "High Success Probability" : 
                        prediction > 0.5 ? "Moderate Success Probability" : 
                        "Low Success Probability"}
                    </AlertTitle>
                    <AlertDescription>
                      {prediction > 0.7 ? "This trial design has a high probability of success. The parameters are well balanced to achieve the desired outcomes." : 
                        prediction > 0.5 ? "This trial has a moderate chance of success. Consider adjusting parameters to improve probability." : 
                        "This trial design has a relatively low probability of success. Consider significant adjustments to improve outcomes."}
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="features">
            <Card>
              <CardHeader>
                <CardTitle>Feature Importance Analysis</CardTitle>
                <CardDescription>
                  Breakdown of how each parameter influences the prediction.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Contribution</TableHead>
                      <TableHead>Impact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {features.map((feature) => (
                      <TableRow key={feature.feature}>
                        <TableCell className="font-medium">{feature.feature}</TableCell>
                        <TableCell>
                          {feature.feature === 'Sample Size' ? form.getValues('sample_size') : 
                           feature.feature === 'Duration (weeks)' ? form.getValues('duration_weeks') : 
                           `${form.getValues('dropout_rate')}%`}
                        </TableCell>
                        <TableCell>{(feature.contribution * 100).toFixed(1)}%</TableCell>
                        <TableCell>
                          {feature.feature === 'Dropout Rate' ? (
                            <div className="flex items-center text-red-500">
                              <ArrowDown className="h-4 w-4 mr-1" />
                              Negative
                            </div>
                          ) : (
                            <div className="flex items-center text-green-500">
                              <ArrowUp className="h-4 w-4 mr-1" />
                              Positive
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                <div className="mt-6 space-y-4">
                  <h4 className="font-medium">Recommendations</h4>
                  <ul className="list-disc pl-5 space-y-2">
                    {prediction < 0.7 && features.some(f => f.feature === 'Sample Size' && f.contribution > 0.3) && (
                      <li>Consider increasing sample size to improve statistical power.</li>
                    )}
                    {prediction < 0.7 && features.some(f => f.feature === 'Duration (weeks)' && f.contribution > 0.3) && (
                      <li>Longer trial duration may be beneficial for capturing more robust outcomes.</li>
                    )}
                    {prediction < 0.7 && features.some(f => f.feature === 'Dropout Rate' && f.contribution > 0.2) && (
                      <li>Implement stronger participant retention strategies to reduce dropout rate.</li>
                    )}
                    {prediction >= 0.7 && (
                      <li>Current parameters are well optimized for success. Maintain these design choices.</li>
                    )}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {pdfUrl && (
            <TabsContent value="report">
              <Card>
                <CardHeader>
                  <CardTitle>Generated Report</CardTitle>
                  <CardDescription>
                    PDF report has been successfully generated.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <a 
                      href={pdfUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-block"
                    >
                      <Button>
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF Report
                      </Button>
                    </a>
                    <p className="mt-4 text-sm text-muted-foreground">
                      The report includes detailed analysis, recommendations, and is formatted for inclusion in regulatory submissions.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}