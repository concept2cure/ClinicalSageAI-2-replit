// client/src/components/protocol/ProtocolUploadPanel.jsx
import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  FileText,
  Upload,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Clipboard,
  ClipboardCheck,
  Download,
  BarChart4,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  FileOutput,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const RiskLevel = ({ level, children }) => {
  const colors = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-green-100 text-green-800 border-green-200',
  };

  return <div className={`p-3 rounded-md border ${colors[level]} mb-3`}>{children}</div>;
};

export default function ProtocolUploadPanel() {
  const [file, setFile] = useState(null);
  const [pastingText, setPastingText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('upload');
  const [uploadMessage, setUploadMessage] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [clipboard, setClipboard] = useState({ copied: false, text: '' });

  // Handle file selection
  const handleFileChange = e => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      // Check file type
      if (
        ![
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
        ].includes(selectedFile.type)
      ) {
        // toast call replaced
        // Original: toast({
        //   title: "Invalid file type",
        //   description: "Please upload a PDF or Word document",
        //   variant: "destructive",
        // });
        console.log('Toast would show:', {
          title: 'Invalid file type',
          description: 'Please upload a PDF or Word document',
          variant: 'destructive',
        });
        return;
      }

      // Check file size (10MB limit)
      if (selectedFile.size > 10 * 1024 * 1024) {
        // toast call replaced
        // Original: toast({
        //   title: "File too large",
        //   description: "Please upload a file smaller than 10MB",
        //   variant: "destructive",
        // });
        console.log('Toast would show:', {
          title: 'File too large',
          description: 'Please upload a file smaller than 10MB',
          variant: 'destructive',
        });
        return;
      }

      setFile(selectedFile);
      setUploadMessage(`Selected: ${selectedFile.name}`);
    }
  };

  // Upload and analyze file
  const handleFileUpload = async () => {
    if (!file) {
      // toast call replaced
      // Original: toast({
      //   title: "No file selected",
      //   description: "Please select a file to upload",
      //   variant: "destructive",
      // });
      console.log('Toast would show:', {
        title: 'No file selected',
        description: 'Please select a file to upload',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Indeterminate progress — never fabricate upload percentages.
      const progressInterval = null;

      const response = await fetch('/api/analytics/upload-protocol', {
        method: 'POST',
        body: formData,
      });

      if (progressInterval) clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      setUploading(false);
      setAnalyzing(true);

      const data = await response.json();
      setAnalysisResult(data);

      // toast call replaced
      // Original: toast({
      //   title: "Analysis complete",
      //   description: "Protocol has been analyzed successfully.",
      // });
      console.log('Toast would show:', {
        title: 'Analysis complete',
        description: 'Protocol has been analyzed successfully.',
      });
    } catch (error) {
      console.error('Upload error:', error);
      // toast call replaced
      // Original: toast({
      //   title: "Analysis failed",
      //   description: "There was an error analyzing your protocol. Please try again.",
      //   variant: "destructive",
      // });
      console.log('Toast would show:', {
        title: 'Analysis failed',
        description: 'There was an error analyzing your protocol. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setAnalyzing(false);
      setProgress(0);
    }
  };

  // Analyze pasted text
  const handleAnalyzePasted = async () => {
    if (!pastingText.trim()) {
      // toast call replaced
      // Original: toast({
      //   title: "No text provided",
      //   description: "Please paste protocol text to analyze",
      //   variant: "destructive",
      // });
      console.log('Toast would show:', {
        title: 'No text provided',
        description: 'Please paste protocol text to analyze',
        variant: 'destructive',
      });
      return;
    }

    setAnalyzing(true);
    setProgress(30);

    try {
      const response = await fetch('/api/analytics/analyze-protocol-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: pastingText }),
      });

      setProgress(90);

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const data = await response.json();
      setAnalysisResult(data);
      setProgress(100);

      // toast call replaced
      // Original: toast({
      //   title: "Analysis complete",
      //   description: "Protocol text has been analyzed successfully.",
      // });
      console.log('Toast would show:', {
        title: 'Analysis complete',
        description: 'Protocol text has been analyzed successfully.',
      });
    } catch (error) {
      console.error('Analysis error:', error);
      // toast call replaced
      // Original: toast({
      //   title: "Analysis failed",
      //   description: "There was an error analyzing your protocol text. Please try again.",
      //   variant: "destructive",
      // });
      console.log('Toast would show:', {
        title: 'Analysis failed',
        description: 'There was an error analyzing your protocol text. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setAnalyzing(false);
      setProgress(0);
    }
  };

  // Copy to clipboard
  const copyToClipboard = text => {
    navigator.clipboard.writeText(text).then(
      () => {
        setClipboard({ copied: true, text });
        setTimeout(() => setClipboard({ copied: false, text: '' }), 3000);
        // toast call replaced
        // Original: toast({
        //   title: "Copied to clipboard",
        //   description: "Analysis summary copied to clipboard",
        // });
        console.log('Toast would show:', {
          title: 'Copied to clipboard',
          description: 'Analysis summary copied to clipboard',
        });
      },
      err => {
        console.error('Could not copy text: ', err);
        // toast call replaced
        // Original: toast({
        //   title: "Failed to copy",
        //   description: "Could not copy to clipboard",
        //   variant: "destructive",
        // });
        console.log('Toast would show:', {
          title: 'Failed to copy',
          description: 'Could not copy to clipboard',
          variant: 'destructive',
        });
      }
    );
  };

  // Generate export summary
  const generateSummary = () => {
    if (!analysisResult) return '';

    // Include confidence score data if available
    const confidenceSection = analysisResult.confidence_score
      ? `## Protocol Confidence Assessment
Confidence Score: ${analysisResult.confidence_score}/100
Verdict: ${analysisResult.confidence_verdict || 'Not assessed'}
${analysisResult.confidence_issues?.length > 0 ? '\nIssues Identified:' : ''}
${analysisResult.confidence_issues?.map(issue => `- ${issue}`).join('\n') || 'None identified'}
`
      : '';

    return `# Protocol Analysis Summary
Date: ${new Date().toLocaleDateString()}

## Protocol Details
Title: ${analysisResult.title || 'Not specified'}
Indication: ${analysisResult.indication || 'Not specified'}
Phase: ${analysisResult.phase || 'Not specified'}
Sample Size: ${analysisResult.sample_size || 'Not specified'}
Duration: ${analysisResult.duration_weeks ? `${analysisResult.duration_weeks} weeks` : 'Not specified'}

${confidenceSection}
## Risk Factors (${analysisResult.risk_factors?.length || 0})
${analysisResult.risk_factors?.map(risk => `- ${risk.description} (${risk.severity.toUpperCase()})`).join('\n') || 'None identified'}

## CSR Precedents (${analysisResult.matching_csrs?.length || 0})
${analysisResult.matching_csrs?.map(csr => `- ${csr.title} (${csr.id})`).join('\n') || 'None found'}

## Recommended Improvements
${analysisResult.recommendations || 'No recommendations provided'}`;
  };

  // Download analysis report
  const downloadReport = () => {
    if (!analysisResult) return;

    // If PDF link is available, use it directly
    if (analysisResult.pdf_link) {
      window.open(analysisResult.pdf_link, '_blank');
      return;
    }

    // Fallback to text report if PDF is not available
    const summary = generateSummary();
    const blob = new Blob([summary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `protocol-analysis-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          <FileText className="h-5 w-5 text-primary mr-2" />
          Protocol Analysis
        </CardTitle>
        <CardDescription>
          Upload a protocol document or paste text for AI-powered analysis
        </CardDescription>
      </CardHeader>

      <CardContent>
        {/* Upload Tabs */}
        {!analysisResult && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">Upload File</TabsTrigger>
              <TabsTrigger value="paste">Paste Text</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-4">
              <div className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center flex flex-col items-center justify-center gap-2">
                  <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Drag and drop or click to upload a protocol document
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Supports PDF and Word documents up to 10MB
                  </p>
                  <input
                    type="file"
                    id="protocol-file"
                    accept=".pdf,.docx,.doc"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById('protocol-file').click()}
                    className="mt-2"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Choose File
                  </Button>
                </div>

                {uploadMessage && <p className="text-sm text-muted-foreground">{uploadMessage}</p>}

                <Button
                  onClick={handleFileUpload}
                  disabled={!file || uploading || analyzing}
                  className="w-full"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : analyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Analyze Protocol
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="paste" className="mt-4">
              <div className="space-y-4">
                <Textarea
                  placeholder="Paste protocol text here..."
                  value={pastingText}
                  onChange={e => setPastingText(e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                />

                <Button
                  onClick={handleAnalyzePasted}
                  disabled={!pastingText.trim() || analyzing}
                  className="w-full"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Analyze Protocol Text
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* Progress indicator */}
        {(uploading || analyzing) && progress > 0 && (
          <div className="mt-4 space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-center text-muted-foreground">
              {uploading ? 'Uploading and extracting text...' : 'Analyzing protocol content...'}
            </p>
          </div>
        )}

        {/* Analysis Results */}
        {analysisResult && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Analysis Results</h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAnalysisResult(null);
                    setFile(null);
                    setPastingText('');
                    setUploadMessage('');
                  }}
                >
                  Analyze Another
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(generateSummary())}
                >
                  {clipboard.copied ? (
                    <ClipboardCheck className="h-4 w-4 mr-1" />
                  ) : (
                    <Clipboard className="h-4 w-4 mr-1" />
                  )}
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={downloadReport}>
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </div>
            </div>

            {/* Protocol Overview Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Protocol Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Title</p>
                    <p className="font-medium">{analysisResult.title || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Indication</p>
                    <p className="font-medium">{analysisResult.indication || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phase</p>
                    <p className="font-medium">{analysisResult.phase || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Sample Size</p>
                    <p className="font-medium">{analysisResult.sample_size || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Duration</p>
                    <p className="font-medium">
                      {analysisResult.duration_weeks
                        ? `${analysisResult.duration_weeks} weeks`
                        : 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Design</p>
                    <p className="font-medium">{analysisResult.design_type || 'Not specified'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Confidence Score Card */}
            {analysisResult.confidence_score && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Protocol Confidence Assessment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Confidence Score</span>
                      <span className="text-sm font-bold">
                        {analysisResult.confidence_score}/100
                      </span>
                    </div>
                    <Progress
                      value={analysisResult.confidence_score}
                      className="h-2"
                      indicatorClassName={
                        analysisResult.confidence_score >= 80
                          ? 'bg-green-600'
                          : analysisResult.confidence_score >= 60
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                      }
                    />
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex-shrink-0">
                      {analysisResult.confidence_score >= 80 ? (
                        <ShieldCheck className="h-6 w-6 text-green-600" />
                      ) : analysisResult.confidence_score >= 60 ? (
                        <ShieldAlert className="h-6 w-6 text-amber-600" />
                      ) : (
                        <ShieldX className="h-6 w-6 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {analysisResult.confidence_verdict ||
                          (analysisResult.confidence_score >= 80
                            ? 'Strong protocol design'
                            : analysisResult.confidence_score >= 60
                              ? 'Acceptable protocol with room for improvement'
                              : 'Protocol requires significant revisions')}
                      </p>
                    </div>
                  </div>

                  {analysisResult.confidence_issues?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Issues Identified:</p>
                      <ul className="space-y-1 text-sm">
                        {analysisResult.confidence_issues.map((issue, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                            <span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Risk Factors */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Risk Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                {analysisResult.risk_factors?.length > 0 ? (
                  <div className="space-y-4">
                    {analysisResult.risk_factors.map((risk, i) => (
                      <RiskLevel key={i} level={risk.severity || 'medium'}>
                        <div className="flex items-start">
                          {risk.severity === 'high' ? (
                            <AlertTriangle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                          ) : risk.severity === 'medium' ? (
                            <AlertTriangle className="h-5 w-5 text-amber-600 mr-2 flex-shrink-0 mt-0.5" />
                          ) : (
                            <CheckCircle className="h-5 w-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                          )}
                          <div>
                            <p className="font-medium">{risk.title || `Risk Factor ${i + 1}`}</p>
                            <p className="text-sm">{risk.description}</p>
                            {risk.recommendation && (
                              <p className="text-sm mt-1 italic">
                                Recommendation: {risk.recommendation}
                              </p>
                            )}
                          </div>
                        </div>
                      </RiskLevel>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No significant risk factors identified.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* CSR Precedents */}
            {analysisResult.matching_csrs?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Related CSR Precedents</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analysisResult.matching_csrs.map((csr, i) => (
                      <div key={i} className="p-3 border rounded-md">
                        <div className="flex justify-between">
                          <p className="font-medium">{csr.title}</p>
                          <Badge>{csr.id}</Badge>
                        </div>
                        {csr.similarity_score && (
                          <div className="flex items-center mt-1">
                            <span className="text-xs text-muted-foreground mr-2">Similarity:</span>
                            <Progress value={csr.similarity_score} className="h-1.5 w-24" />
                            <span className="text-xs ml-2">{csr.similarity_score}%</span>
                          </div>
                        )}
                        {csr.key_learnings && <p className="text-sm mt-2">{csr.key_learnings}</p>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recommendations */}
            {analysisResult.recommendations && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Improvement Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analysisResult.recommendations.split('\n').map((rec, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm">{rec}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Generate Blueprint Button */}
            <Alert className="bg-blue-50 border border-blue-200">
              <div className="flex items-start">
                <FileOutput className="h-5 w-5 text-blue-600 mt-0.5 mr-3" />
                <div>
                  <AlertTitle>Ready for Blueprint Generation</AlertTitle>
                  <AlertDescription className="mt-1">
                    Use this analysis to generate an optimized protocol blueprint based on
                    identified patterns and precedents.
                  </AlertDescription>
                  <Button className="mt-3 bg-blue-600 hover:bg-blue-700">
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Protocol Blueprint
                  </Button>
                </div>
              </div>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
