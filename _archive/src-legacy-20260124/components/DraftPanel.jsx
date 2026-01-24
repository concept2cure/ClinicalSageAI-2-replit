import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, FileText, ClipboardCheck, Save, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * DraftPanel Component
 *
 * Allows users to generate and edit FDA forms, cover letters,
 * and other IND submission documents using AI assistance.
 */
export default function DraftPanel() {
  const [activeTab, setActiveTab] = useState('cover');
  const [coverLetter, setCoverLetter] = useState('');
  const [form1571, setForm1571] = useState('');
  const [loading, setLoading] = useState({
    cover: false,
    form1571: false,
  });
  const { toast } = useToast();

  // Generate cover letter using AI
  const generateCoverLetter = async () => {
    try {
      setLoading(prev => ({ ...prev, cover: true }));

      const response = await fetch('/api/ind/draft/cover');
      if (!response.ok) {
        throw new Error(`Error generating cover letter: ${response.statusText}`);
      }

      const content = await response.text();
      setCoverLetter(content);

      toast({
        title: 'Cover Letter Generated',
        description: 'AI-generated cover letter is ready for review and editing.',
      });
    } catch (error) {
      console.error('Error generating cover letter:', error);
      toast({
        title: 'Generation Failed',
        description: error.message || 'Could not generate cover letter. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(prev => ({ ...prev, cover: false }));
    }
  };

  // Generate Form 1571 using AI
  const generateForm1571 = async () => {
    try {
      setLoading(prev => ({ ...prev, form1571: true }));

      const response = await fetch('/api/ind/draft/1571');
      if (!response.ok) {
        throw new Error(`Error generating Form 1571: ${response.statusText}`);
      }

      const content = await response.text();
      setForm1571(content);

      toast({
        title: 'Form 1571 Generated',
        description: 'AI-generated FDA Form 1571 is ready for review and editing.',
      });
    } catch (error) {
      console.error('Error generating Form 1571:', error);
      toast({
        title: 'Generation Failed',
        description: error.message || 'Could not generate Form 1571. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(prev => ({ ...prev, form1571: false }));
    }
  };

  // Save the current draft
  const saveDraft = async () => {
    try {
      const content = activeTab === 'cover' ? coverLetter : form1571;
      const endpoint = `/api/ind/draft/${activeTab}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error(`Error saving draft: ${response.statusText}`);
      }

      toast({
        title: 'Draft Saved',
        description:
          activeTab === 'cover'
            ? 'Cover letter saved successfully.'
            : 'Form 1571 saved successfully.',
      });
    } catch (error) {
      console.error('Error saving draft:', error);
      toast({
        title: 'Save Failed',
        description: error.message || 'Could not save the draft. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Download the current draft
  const downloadDraft = () => {
    try {
      const content = activeTab === 'cover' ? coverLetter : form1571;
      const filename = activeTab === 'cover' ? 'CoverLetter.txt' : 'Form1571.xml';

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Download Started',
        description: `${filename} download has started.`,
      });
    } catch (error) {
      console.error('Error downloading draft:', error);
      toast({
        title: 'Download Failed',
        description: 'Could not download the file. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>IND Document Drafts</CardTitle>
        <CardDescription>
          Generate and edit FDA forms, cover letters, and other IND documents
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cover">
              <FileText className="h-4 w-4 mr-2" />
              Cover Letter
            </TabsTrigger>
            <TabsTrigger value="form1571">
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Form 1571
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cover" className="mt-4">
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <Button onClick={generateCoverLetter} disabled={loading.cover} className="w-1/3">
                  {loading.cover ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Generate Cover Letter'
                  )}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={saveDraft} disabled={!coverLetter}>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  <Button variant="secondary" onClick={downloadDraft} disabled={!coverLetter}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>

              <Textarea
                value={coverLetter}
                onChange={e => setCoverLetter(e.target.value)}
                placeholder="Generate or paste a cover letter draft here..."
                className="min-h-[400px] font-mono text-sm"
              />
            </div>
          </TabsContent>

          <TabsContent value="form1571" className="mt-4">
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <Button onClick={generateForm1571} disabled={loading.form1571} className="w-1/3">
                  {loading.form1571 ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Generate Form 1571'
                  )}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={saveDraft} disabled={!form1571}>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  <Button variant="secondary" onClick={downloadDraft} disabled={!form1571}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>

              <Textarea
                value={form1571}
                onChange={e => setForm1571(e.target.value)}
                placeholder="Generate or paste a Form 1571 draft here..."
                className="min-h-[400px] font-mono text-sm"
              />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
