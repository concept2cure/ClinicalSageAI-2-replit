import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FileText, Loader2 } from 'lucide-react'

export default function SimpleDocumentCreator() {
  const [title, setTitle] = useState('');
  const [module, setModule] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const handleCreateDocument = async () => {
    if (!title || !module) {
      toast({
        title: 'Missing Information',
        description: 'Please provide both a document title and select an eCTD module.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch('/api/v1/drafting/start_task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `Generate a comprehensive ${module} document titled "${title}"`,
          project_id: `doc_${Date.now()}`,
          ectd_section: module,
          document_type: module.startsWith('2.') ? 'summary' : 'detailed',
          organization_id: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.task_id) {
        toast({
          title: 'Document Creation Started',
          description: `Task ${result.task_id} is processing. Redirecting to editor...`,
        });

        // Navigate to document editor
        setTimeout(() => {
          window.location.href = `/editor?taskId=${result.task_id}`;
        }, 1000);
      } else {
        throw new Error('No task ID returned from server');
      }
    } catch (error) {
      console.error('Document creation error:', error);
      toast({
        title: 'Document Creation Failed',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Create New Document
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">
              Document Title
            </label>
            <Input
              id="title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Enter document title (e.g., Clinical Overview Module 2.5)"
              disabled={isCreating}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="module" className="text-sm font-medium">
              eCTD Module
            </label>
            <Select value={module} onValueChange={setModule} disabled={isCreating}>
              <SelectTrigger>
                <SelectValue placeholder="Select eCTD module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2.5">2.5 - Clinical Overview</SelectItem>
                <SelectItem value="2.7">2.7 - Clinical Summary</SelectItem>
                <SelectItem value="3.2">3.2 - Body of Data</SelectItem>
                <SelectItem value="4.1">4.1 - Clinical Study Reports</SelectItem>
                <SelectItem value="5.1">5.1 - Tabulated Summaries</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleCreateDocument}
            disabled={!title || !module || isCreating}
            className="w-full"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Document...
              </>
            ) : (
              'Create Document'
            )}
          </Button>

          {/* Debug info */}
          <div className="text-xs text-gray-500 mt-4 p-2 bg-gray-50 rounded">
            Debug: Title="{title}", Module="{module}", Ready={!!(title && module)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
