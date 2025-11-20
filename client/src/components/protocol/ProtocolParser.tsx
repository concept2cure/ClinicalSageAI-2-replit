import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileUploader, UploadedFile } from '@/components/ui/file-uploader';
import { AlertCircle, Upload, FileText, Zap, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ProtocolParserProps {
  onParseComplete: (data: any) => void;
}

export function ProtocolParser({ onParseComplete }: ProtocolParserProps) {
  const [protocolText, setProtocolText] = useState('');
  const [selectedTab, setSelectedTab] = useState<string>('upload');

  // File upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post('/api/protocol/parse-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: data => {
      console.log('Protocol file successfully parsed:', data);
      onParseComplete(data);
      console.log('Toast would show:', {
        title: 'Protocol parsed successfully',
        description: 'Your protocol has been processed',
        variant: 'default',
      });
    },
    onError: (error: any) => {
      console.error('Error parsing protocol file:', error);
      console.log('Toast would show:', {
        title: 'Error parsing protocol',
        description: error.response?.data?.message || 'Failed to parse protocol file',
        variant: 'destructive',
      });
    },
  });

  // Text parsing mutation
  const parseTextMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await axios.post('/api/protocol/parse-text', { text });
      return response.data;
    },
    onSuccess: data => {
      console.log('Protocol text successfully parsed:', data);
      onParseComplete(data);
      console.log('Toast would show:', {
        title: 'Protocol text parsed successfully',
        description: 'Your protocol has been processed',
        variant: 'default',
      });
    },
    onError: (error: any) => {
      console.error('Error parsing protocol text:', error);
      console.log('Toast would show:', {
        title: 'Error parsing protocol text',
        description: error.response?.data?.message || 'Failed to parse protocol text',
        variant: 'destructive',
      });
    },
  });

  // Deep analysis mutation
  const analyzeMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await axios.post('/api/protocol/deep-analyze', { text });
      return response.data;
    },
    onSuccess: data => {
      console.log('Protocol deeply analyzed:', data);
      onParseComplete(data);
      console.log('Toast would show:', {
        title: 'Deep analysis complete',
        description: 'Advanced protocol insights are ready',
        variant: 'default',
      });
    },
    onError: (error: any) => {
      console.error('Error analyzing protocol text:', error);
      console.log('Toast would show:', {
        title: 'Error in deep analysis',
        description: error.response?.data?.message || 'Failed to perform deep analysis',
        variant: 'destructive',
      });
    },
  });

  // Handle file upload
  const handleFileUpload = (files: UploadedFile[]) => {
    if (files.length > 0 && files[0].file) {
      uploadMutation.mutate(files[0].file);
    }
  };

  // Handle text parsing
  const handleParseText = () => {
    if (protocolText.trim()) {
      parseTextMutation.mutate(protocolText);
    } else {
      console.log('Toast would show:', {
        title: 'Empty input',
        description: 'Please enter protocol text to parse',
        variant: 'destructive',
      });
    }
  };

  // Handle deep analysis
  const handleDeepAnalyze = () => {
    if (protocolText.trim()) {
      analyzeMutation.mutate(protocolText);
    } else {
      console.log('Toast would show:', {
        title: 'Empty input',
        description: 'Please enter protocol text to analyze',
        variant: 'destructive',
      });
    }
  };

  const isPending =
    uploadMutation.isPending || parseTextMutation.isPending || analyzeMutation.isPending;

  return (
    <Card className="w-full max-w-3xl mx-auto p-4">
      <CardHeader className="p-2">
        <CardTitle className="text-lg">Protocol Intelligence Engine</CardTitle>
        <CardDescription className="text-sm">
          Upload your protocol document or paste text to extract key insights
        </CardDescription>
      </CardHeader>
      <CardContent className="p-2">
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid grid-cols-2 mb-2">
            <TabsTrigger value="upload">Upload File</TabsTrigger>
            <TabsTrigger value="text">Paste Text</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-2">
            <FileUploader
              accept="application/pdf"
              maxFiles={1}
              maxSize={10 * 1024 * 1024}
              onUpload={handleFileUpload}
              disabled={isPending}
              uploadMessage="Drag & drop your protocol file here or click to browse"
              className="h-48"
            />
            <div className="text-xs text-muted-foreground mt-1">
              Supported formats: PDF (max 10MB)
            </div>
          </TabsContent>

          <TabsContent value="text" className="space-y-2">
            <Textarea
              placeholder="Paste your protocol text here..."
              value={protocolText}
              onChange={e => setProtocolText(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
              disabled={isPending}
            />
            <div className="flex space-x-2">
              <Button
                onClick={handleParseText}
                disabled={isPending || !protocolText.trim()}
                className="flex-1"
              >
                {parseTextMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Parse Protocol
                  </>
                )}
              </Button>
              <Button
                onClick={handleDeepAnalyze}
                disabled={isPending || !protocolText.trim()}
                variant="outline"
                className="flex-1"
              >
                {analyzeMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Deep AI Analysis
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      {isPending && (
        <CardFooter className="border-t pt-2 pb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {uploadMutation.isPending
              ? 'Analyzing protocol file...'
              : parseTextMutation.isPending
                ? 'Parsing protocol text...'
                : 'Performing deep AI analysis...'}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
