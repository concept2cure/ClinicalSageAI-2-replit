import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Download } from 'lucide-react';

interface CompetitiveIntelligenceFormProps {
  protocol: string;
}

const CompetitiveIntelligenceForm: React.FC<CompetitiveIntelligenceFormProps> = ({ protocol }) => {
  const [indication, setIndication] = useState('');
  const [phase, setPhase] = useState('');
  const [comparator, setComparator] = useState('');
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const runAnalysis = async () => {
    if (!protocol) {
      // toast call replaced
  // Original: toast({
        title: "Missing Information",
        description: "Please provide a protocol summary",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing Information",
        description: "Please provide a protocol summary",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    
    try {
      // Adapting to use our existing API
      const response = await apiRequest("POST", "/api/strategy/analyze", {
        protocolSummary: protocol,
        indication,
        phase,
        sponsor: comparator // Using sponsor as comparator
      });
      
      const data = await response.json();
      
      if (data.success && data.analysisResult) {
        setReport(data.analysisResult.analysis.fullText);
      } else {
        throw new Error(data.message || "Failed to generate competitive analysis");
      }
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate competitive analysis",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate competitive analysis",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = (content: string, filename: string) => {
    const element = document.createElement("a");
    const file = new Blob([content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${filename}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="space-y-6 p-4">
      <h2 className="text-xl font-bold text-blue-900">🔍 Competitive Intelligence Report</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input 
          placeholder="Indication (e.g. Obesity)" 
          value={indication} 
          onChange={(e) => setIndication(e.target.value)} 
        />
        <Input 
          placeholder="Phase (e.g. Phase 2)" 
          value={phase} 
          onChange={(e) => setPhase(e.target.value)} 
        />
        <Input 
          placeholder="Comparator drug (optional)" 
          value={comparator} 
          onChange={(e) => setComparator(e.target.value)} 
        />
      </div>

      <Textarea 
        readOnly 
        className="min-h-[100px]" 
        value={protocol} 
      />

      <div className="flex gap-2">
        <Button 
          onClick={runAnalysis} 
          disabled={loading} 
          className="bg-blue-700 text-white"
        >
          {loading ? 'Analyzing...' : 'Generate Competitive Strategy'}
        </Button>

        {report && (
          <Button 
            onClick={() => downloadReport(report, 'Competitive_Report')}
            variant="outline"
          >
            <Download className="mr-2 h-4 w-4" />
            Download Report as PDF
          </Button>
        )}
      </div>

      {report && (
        <Card className="border-green-800">
          <CardContent className="space-y-3 mt-4">
            <p className="text-sm font-semibold text-green-700">✅ Strategic Report:</p>
            <p className="whitespace-pre-wrap text-sm">{report}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CompetitiveIntelligenceForm;