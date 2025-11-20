import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { FileIcon, FileTextIcon, FileDownIcon } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

/**
 * Report510kGenerator component
 *
 * This component provides an interface for generating and downloading
 * FDA-compliant 510(k) submission examples in different formats.
 */
export default function Report510kGenerator() {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('html');

  // Function to handle example report generation and download
  const generateExample = async format => {
    try {
      setIsGenerating(true);
      setProgress(25);

      // Simulate progress for better user experience
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + 15;
          return newProgress < 90 ? newProgress : prev;
        });
      }, 500);

      // Get the example report URL
      const response = await apiRequest('/api/document-assembly/example/510k', {
        method: 'GET',
        params: { format },
      });

      clearInterval(progressInterval);
      setProgress(100);

      // Create a download link for the user
      const link = document.createElement('a');
      link.href = `/api/document-assembly/example/510k?format=${format}`;
      link.setAttribute('download', `Example_510k_Submission.${format}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Report Generated',
        description: `Your example 510(k) report has been generated in ${format.toUpperCase()} format.`,
        variant: 'default',
      });

      // Reset progress after a short delay
      setTimeout(() => {
        setProgress(0);
        setIsGenerating(false);
      }, 1000);
    } catch (error) {
      console.error('Error generating example report:', error);
      toast({
        title: 'Generation Failed',
        description: 'Failed to generate the example report. Please try again.',
        variant: 'destructive',
      });
      setProgress(0);
      setIsGenerating(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-md">
      <CardHeader>
        <CardTitle>510(k) Submission Generator</CardTitle>
        <CardDescription>
          Generate FDA-compliant 510(k) submission examples in various formats. These examples
          follow proper FDA formatting requirements for regulatory submissions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="html" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="html">HTML/PDF Format</TabsTrigger>
            <TabsTrigger value="docx">MS Word Format</TabsTrigger>
          </TabsList>

          <TabsContent value="html" className="space-y-4">
            <div className="flex items-center space-x-2">
              <FileTextIcon className="h-8 w-8 text-blue-500" />
              <div>
                <h3 className="font-medium">HTML/PDF Format</h3>
                <p className="text-sm text-muted-foreground">
                  HTML format with proper styling for printing to PDF. Includes FDA-required
                  margins, headers, and formatting.
                </p>
              </div>
            </div>
            {progress > 0 && <Progress value={progress} className="my-2" />}
          </TabsContent>

          <TabsContent value="docx" className="space-y-4">
            <div className="flex items-center space-x-2">
              <FileIcon className="h-8 w-8 text-blue-700" />
              <div>
                <h3 className="font-medium">MS Word Format</h3>
                <p className="text-sm text-muted-foreground">
                  Word-compatible format with proper section structure and formatting. Copy and
                  paste into Word for FDA submissions.
                </p>
              </div>
            </div>
            {progress > 0 && <Progress value={progress} className="my-2" />}
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter>
        <Button
          onClick={() => generateExample(activeTab)}
          disabled={isGenerating}
          className="w-full"
        >
          <FileDownIcon className="mr-2 h-4 w-4" />
          {isGenerating ? 'Generating...' : `Generate Example ${activeTab.toUpperCase()} Report`}
        </Button>
      </CardFooter>
    </Card>
  );
}
