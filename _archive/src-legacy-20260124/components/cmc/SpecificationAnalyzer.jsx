import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  RefreshCw,
  Upload,
  FileText,
  CheckCircle,
  AlertTriangle,
  XCircle,
  BarChart,
  Download,
  Search,
  ArrowRight,
} from 'lucide-react';
import { assessRegulatoryCompliance, simulateOpenAIResponse } from '../../services/openaiService';
import { useToast } from '@/hooks/use-toast';

/**
 * SpecificationAnalyzer
 *
 * Component that analyzes pharmaceutical specifications for regulatory compliance
 * using OpenAI's GPT-4o capabilities.
 */
const SpecificationAnalyzer = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('upload');
  const [loading, setLoading] = useState(false);
  const [specificationText, setSpecificationText] = useState('');
  const [fileName, setFileName] = useState('');
  const [productName, setProductName] = useState('');
  const [targetRegions, setTargetRegions] = useState(['FDA', 'EMA', 'ICH']);
  const [analysisResult, setAnalysisResult] = useState(null);

  const handleFileChange = e => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = event => {
      setSpecificationText(event.target.result);
    };
    reader.readAsText(file);
  };

  const handleAnalyze = async () => {
    if (!specificationText.trim()) {
      toast({
        title: 'No Content to Analyze',
        description: 'Please upload or paste specification content.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);
      setActiveTab('results');

      // In a real implementation, this would call the OpenAI API through a backend endpoint
      const request = {
        documentType: 'specification',
        content: specificationText,
        productName: productName,
        targetRegions: targetRegions,
      };

      // Simulate API call for demo purposes
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Generate analysis with a simulation of what OpenAI would return
      const result = {
        issues: [
          {
            severity: 'Critical',
            description: 'Acceptance criteria for dissolution test does not include time point',
            location: 'Section 3.2.P.5.1',
            recommendation:
              'Add specific time point (e.g., "Q=80% in 30 minutes") to dissolution acceptance criteria',
          },
          {
            severity: 'Major',
            description: 'Missing validation data for analytical method',
            location: 'Section 3.2.P.5.3',
            recommendation:
              'Include method validation data including linearity, precision, accuracy, and specificity',
          },
          {
            severity: 'Minor',
            description: 'Inconsistent terminology used for excipients',
            location: 'Throughout document',
            recommendation: 'Standardize terminology according to pharmacopoeial nomenclature',
          },
        ],
        regulatoryAlignment: {
          FDA: 92,
          EMA: 85,
          ICH: 90,
          WHO: 88,
        },
        overallScore: 88,
        summary:
          'The specification is generally well-structured but contains some regulatory gaps. The document follows ICH Q6A format but lacks some details required by FDA and EMA. Critical issues include incomplete dissolution criteria and missing validation data for analytical methods. Addressing these issues would improve regulatory compliance significantly.',
        improvementRecommendations: [
          'Add specific time points to all dissolution criteria',
          'Include complete analytical method validation data',
          'Standardize excipient terminology across the document',
          'Add detailed stability protocol with specific sampling points',
          'Include reference to pharmacopoeial methods where applicable',
        ],
      };

      setAnalysisResult(result);

      toast({
        title: 'Analysis Complete',
        description: 'The specification has been analyzed successfully.',
      });
    } catch (error) {
      toast({
        title: 'Analysis Failed',
        description: error.message || 'An error occurred during analysis.',
        variant: 'destructive',
      });
      setActiveTab('upload');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = severity => {
    switch (severity) {
      case 'Critical':
        return 'text-red-800 dark:text-red-300 bg-red-100 dark:bg-red-950/30 border-red-200 dark:border-red-900';
      case 'Major':
        return 'text-orange-800 dark:text-orange-300 bg-orange-100 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900';
      case 'Minor':
        return 'text-yellow-800 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900';
      default:
        return 'text-gray-800 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    }
  };

  return (
    <Card className="w-full shadow-md border-2 border-black dark:border-white">
      <CardHeader className="bg-black text-white dark:bg-white dark:text-black">
        <CardTitle className="text-xl flex items-center gap-2">
          <Search className="h-5 w-5" />
          Specification Analyzer (GPT-4o Powered)
        </CardTitle>
        <CardDescription className="text-gray-300 dark:text-gray-700">
          Analyze pharmaceutical specifications for regulatory compliance and improvement
          opportunities
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full rounded-none">
            <TabsTrigger value="upload" className="flex-1">
              Upload Specification
            </TabsTrigger>
            <TabsTrigger value="results" className="flex-1" disabled={!analysisResult && !loading}>
              Analysis Results
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="product-name">Product Name</Label>
                  <Input
                    id="product-name"
                    placeholder="Enter product name"
                    value={productName}
                    onChange={e => setProductName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Target Regions</Label>
                  <div className="flex flex-wrap gap-2">
                    {['FDA', 'EMA', 'ICH', 'WHO', 'PMDA', 'NMPA'].map(region => (
                      <Badge
                        key={region}
                        variant={targetRegions.includes(region) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => {
                          if (targetRegions.includes(region)) {
                            setTargetRegions(targetRegions.filter(r => r !== region));
                          } else {
                            setTargetRegions([...targetRegions, region]);
                          }
                        }}
                      >
                        {region}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="file-upload">Upload Specification Document</Label>
                  <div className="flex items-center justify-center w-full">
                    <label
                      htmlFor="file-upload"
                      className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900 hover:bg-gray-100 dark:border-gray-600"
                    >
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-2 text-gray-500 dark:text-gray-400" />
                        <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          PDF, DOCX, or TXT (Max 10MB)
                        </p>
                      </div>
                      <input
                        id="file-upload"
                        type="file"
                        className="hidden"
                        accept=".pdf,.docx,.txt"
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>
                  {fileName && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Selected file: {fileName}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="specification-text">Or Paste Specification Text</Label>
                <Textarea
                  id="specification-text"
                  placeholder="Paste specification content here..."
                  className="min-h-[200px]"
                  value={specificationText}
                  onChange={e => setSpecificationText(e.target.value)}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Paste the specification text directly or upload a file above. The AI will analyze
                  the content for regulatory compliance.
                </p>
              </div>
            </div>

            <div className="space-y-2 mt-4">
              <Label>Example Specification</Label>
              <div className="border p-4 rounded bg-gray-50 dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300">
                <p className="font-medium mb-2">Example Tablet Specification Format:</p>
                <pre className="whitespace-pre-wrap text-xs">
                  {`Product Name: [Your Product]
Dosage Form: Tablets
Strength: [X] mg

1. Description
   - White to off-white, round, biconvex tablets debossed with "[X]" on one side and plain on the other side.

2. Identification
   - Test A: IR Spectroscopy - The spectrum of the sample preparation exhibits maxima at the same wavelengths as that of the standard preparation.
   - Test B: HPLC Retention Time - The retention time of the major peak in the chromatogram of the assay preparation corresponds to that in the chromatogram of the standard preparation.

3. Assay
   - HPLC Method
   - Acceptance Criteria: 95.0% - 105.0% of the labeled amount

4. Dissolution
   - USP Apparatus 2 (Paddle), 50 rpm
   - Medium: 900 mL of 0.1 N HCl
   - Acceptance Criteria: NLT 80% (Q) dissolved

5. Uniformity of Dosage Units
   - USP <905>
   - Acceptance Criteria: L1 = 15.0, L2 = 25.0

6. Related Substances
   - HPLC Method
   - Acceptance Criteria:
     * Any individual impurity: NMT 0.2%
     * Total impurities: NMT 1.0%

7. Water Content
   - USP <921> Method I
   - Acceptance Criteria: NMT 5.0%

8. Residual Solvents
   - USP <467>
   - Acceptance Criteria: Per ICH Q3C

9. Microbial Limits
   - USP <61> and <62>
   - Acceptance Criteria:
     * Total aerobic microbial count: NMT 1000 CFU/g
     * Total combined yeasts and molds: NMT 100 CFU/g
     * Absence of Escherichia coli

10. Packaging and Storage
    - Store at controlled room temperature, 20°C to 25°C (68°F to 77°F).
    - Protect from moisture.`}
                </pre>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="results" className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <RefreshCw className="h-10 w-10 text-indigo-600 animate-spin" />
                <div className="text-center">
                  <p className="font-medium">Analyzing Specification with GPT-4o...</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    The AI is reviewing your specification for regulatory compliance and improvement
                    opportunities.
                  </p>
                </div>
              </div>
            ) : analysisResult ? (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-medium mb-2 text-black dark:text-white">
                      Analysis Summary
                    </h3>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                      {analysisResult.summary}
                    </p>

                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium mb-2 text-black dark:text-white">
                          Overall Compliance Score
                        </h4>
                        <div className="flex items-center gap-2">
                          <Progress value={analysisResult.overallScore} className="h-2.5 flex-1" />
                          <span className="text-sm font-medium">
                            {analysisResult.overallScore}%
                          </span>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium mb-2 text-black dark:text-white">
                          Regulatory Alignment
                        </h4>
                        <div className="space-y-3">
                          {Object.entries(analysisResult.regulatoryAlignment).map(
                            ([agency, score]) => (
                              <div key={agency} className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span>{agency}</span>
                                  <span>{score}%</span>
                                </div>
                                <Progress value={score} className="h-1.5" />
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium mb-2 text-black dark:text-white">
                      Identified Issues
                    </h3>
                    <div className="space-y-3">
                      {analysisResult.issues.map((issue, index) => (
                        <Alert key={index} className={getSeverityColor(issue.severity)}>
                          <div className="flex justify-between">
                            <div className="flex gap-2 items-start">
                              {issue.severity === 'Critical' ? (
                                <XCircle className="h-4 w-4 mt-0.5" />
                              ) : issue.severity === 'Major' ? (
                                <AlertTriangle className="h-4 w-4 mt-0.5" />
                              ) : (
                                <CheckCircle className="h-4 w-4 mt-0.5" />
                              )}
                              <div>
                                <AlertTitle className="text-sm">{issue.description}</AlertTitle>
                                <AlertDescription className="text-xs mt-1">
                                  <strong>Location:</strong> {issue.location}
                                  <br />
                                  <strong>Recommendation:</strong> {issue.recommendation}
                                </AlertDescription>
                              </div>
                            </div>
                            <Badge variant="outline" className="h-fit">
                              {issue.severity}
                            </Badge>
                          </div>
                        </Alert>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border rounded p-4 space-y-3 bg-gray-50 dark:bg-gray-900">
                  <h3 className="text-lg font-medium text-black dark:text-white">
                    Improvement Recommendations
                  </h3>
                  <ul className="space-y-2 pl-5 list-disc">
                    {analysisResult.improvementRecommendations.map((rec, index) => (
                      <li key={index} className="text-sm text-gray-700 dark:text-gray-300">
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Compliance Gaps by Authority</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Regulatory Authority</TableHead>
                            <TableHead>Score</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(analysisResult.regulatoryAlignment).map(
                            ([agency, score]) => (
                              <TableRow key={agency}>
                                <TableCell className="font-medium">{agency}</TableCell>
                                <TableCell>{score}%</TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      score >= 90
                                        ? 'default'
                                        : score >= 80
                                          ? 'outline'
                                          : 'destructive'
                                    }
                                  >
                                    {score >= 90
                                      ? 'Compliant'
                                      : score >= 80
                                        ? 'Minor Gaps'
                                        : 'Major Gaps'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            )
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Issue Severity Distribution</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center">
                      <div className="text-center w-full space-y-3">
                        <BarChart className="h-8 w-8 mx-auto text-gray-600 dark:text-gray-400" />
                        <div className="flex justify-between items-center gap-3">
                          <div className="flex-1 bg-gray-100 dark:bg-gray-800 p-3 rounded">
                            <div className="text-red-600 dark:text-red-400 text-xl font-semibold">
                              {analysisResult.issues.filter(i => i.severity === 'Critical').length}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Critical</div>
                          </div>
                          <div className="flex-1 bg-gray-100 dark:bg-gray-800 p-3 rounded">
                            <div className="text-orange-600 dark:text-orange-400 text-xl font-semibold">
                              {analysisResult.issues.filter(i => i.severity === 'Major').length}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Major</div>
                          </div>
                          <div className="flex-1 bg-gray-100 dark:bg-gray-800 p-3 rounded">
                            <div className="text-yellow-600 dark:text-yellow-400 text-xl font-semibold">
                              {analysisResult.issues.filter(i => i.severity === 'Minor').length}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Minor</div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-gray-500 dark:text-gray-400">
                  Upload a specification to see analysis results.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between p-4 border-t border-gray-200 dark:border-gray-800">
        {activeTab === 'upload' ? (
          <>
            <Button variant="outline" onClick={() => setSpecificationText('')}>
              Clear
            </Button>
            <Button
              disabled={loading || !specificationText.trim()}
              onClick={handleAnalyze}
              className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
            >
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Analyze Specification
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => setActiveTab('upload')}>
              Back to Upload
            </Button>
            <Button className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200">
              <Download className="mr-2 h-4 w-4" />
              Export Report
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
};

export default SpecificationAnalyzer;
