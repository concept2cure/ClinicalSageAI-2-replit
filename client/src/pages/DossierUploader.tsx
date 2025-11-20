import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function DossierUploader() {
  const [summary, setSummary] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!summary && !file) {
      // toast call replaced
  // Original: toast({
        title: 'Missing Information',
        description: 'Please provide an asset summary or upload a draft protocol.',
        variant: 'destructive',
      })
  console.log('Toast would show:', {
        title: 'Missing Information',
        description: 'Please provide an asset summary or upload a draft protocol.',
        variant: 'destructive',
      });
      return;
    }
    
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('summary', summary);
      if (file) formData.append('file', file);

      await fetch('/api/dossier/submit', {
        method: 'POST',
        body: formData,
      });

      setSubmitted(true);
      // toast call replaced
  // Original: toast({
        title: 'Request Submitted Successfully',
        description: 'We\'ll email your custom dossier within 72 hours.',
        variant: 'default',
      })
  console.log('Toast would show:', {
        title: 'Request Submitted Successfully',
        description: 'We\'ll email your custom dossier within 72 hours.',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error submitting request:', error);
      // toast call replaced
  // Original: toast({
        title: 'Submission Failed',
        description: 'There was a problem submitting your request. Please try again.',
        variant: 'destructive',
      })
  console.log('Toast would show:', {
        title: 'Submission Failed',
        description: 'There was a problem submitting your request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-10 max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">📘 Premium Trial Design Dossier</h1>
        <p className="text-muted-foreground">
          Investor-ready, regulator-aligned trial design recommendations based on our database of 1,900+ clinical study reports. Delivered in 72 hours.
        </p>
      </div>

      <Card className="border-2 border-primary/20">
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <label className="text-base font-semibold">1. Paste your asset summary or study concept</label>
            <Textarea
              placeholder="e.g., A Phase 2 trial for XYZ, a novel inhibitor in non-small cell lung cancer with preliminary efficacy in preclinical models showing 40% tumor reduction..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={6}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Include the target indication, mechanism of action, and any preliminary data you have.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-base font-semibold">2. Or upload your draft protocol PDF</label>
            <Input 
              type="file" 
              accept=".pdf,.docx" 
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  setFile(e.target.files[0]);
                }
              }} 
            />
            <p className="text-xs text-muted-foreground">
              We'll analyze your existing protocol and provide expert enhancement recommendations.
            </p>
          </div>

          <div className="pt-2">
            <Button 
              onClick={handleSubmit} 
              disabled={loading} 
              size="lg"
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
                  Processing...
                </>
              ) : (
                'Request Premium Dossier ($2,500)'
              )}
            </Button>
          </div>

          {submitted && (
            <div className="bg-green-50 p-4 rounded-md border border-green-200">
              <p className="text-green-800 font-medium text-center">
                ✅ Request received! We'll email your custom dossier within 72 hours.
              </p>
            </div>
          )}

          <div className="border-t pt-4 mt-4">
            <h3 className="font-semibold mb-2">What you'll receive:</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Comprehensive trial design recommendations</li>
              <li>Endpoint selection with statistical power analysis</li>
              <li>Competitive analysis of similar trials</li>
              <li>Regulatory submission readiness assessment</li>
              <li>Expert comments from our clinical and statistical team</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}