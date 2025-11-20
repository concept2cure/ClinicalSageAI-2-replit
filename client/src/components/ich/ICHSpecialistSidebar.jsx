import React, { useState, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Send,
  Lightbulb,
  BookOpen,
  CheckSquare,
  FileText,
  List,
  Search,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

/**
 * ICH Specialist Sidebar Component
 *
 * This component provides a sidebar interface for the ICH Specialist service,
 * allowing users to query for ICH regulatory guidance and receive AI-powered
 * answers with citations and suggested tasks.
 */
const ICHSpecialistSidebar = ({
  documentType = 'protocol',
  moduleContext = null,
  currentContent = '',
  onAddTask = () => {},
  className = '',
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState(null);
  const [activeTab, setActiveTab] = useState('answer');
  const inputRef = useRef(null);

  // Handle query submission
  const handleSubmit = async e => {
    e.preventDefault();

    if (!query.trim() && !currentContent.trim()) {
      toast({
        title: 'Empty query',
        description: 'Please enter a question or provide document content to analyze.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      // Use the current content if available, otherwise use the query
      const textToAnalyze = currentContent.trim() ? currentContent : query;

      const response = await fetch('/api/ich-agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: textToAnalyze,
          document_type: documentType,
          module: moduleContext,
          generate_tasks: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json();
      setResponse(data);

      // Switch to the answer tab
      setActiveTab('answer');
    } catch (error) {
      console.error('Error querying ICH Agent:', error);
      toast({
        title: 'Error',
        description: `Failed to get guidance: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle adding a task to the project
  const handleAddTask = task => {
    onAddTask(task);
    toast({
      title: 'Task added',
      description: `"${task.title}" has been added to your project tasks.`,
    });
  };

  // Clear the response and query
  const handleClear = () => {
    setQuery('');
    setResponse(null);
    setActiveTab('answer');
    // Focus the input
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className={`flex flex-col w-full h-full bg-card border-l ${className}`}>
      <CardHeader className="px-4 pt-4 pb-2">
        <CardTitle className="text-lg font-semibold flex items-center">
          <BookOpen className="w-5 h-5 mr-2 text-primary" />
          ICH Specialist
        </CardTitle>
        <CardDescription>AI-powered ICH guidance co-pilot</CardDescription>
      </CardHeader>

      {/* Query Input */}
      <form onSubmit={handleSubmit} className="px-4 py-2">
        <div className="flex space-x-2">
          <Textarea
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={
              currentContent
                ? 'Analyze current document or ask a question...'
                : 'Ask about ICH guidelines...'
            }
            className="min-h-10"
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>

      {/* Context Info */}
      {(documentType || moduleContext) && (
        <div className="flex flex-wrap gap-2 px-4 py-2">
          {documentType && (
            <Badge variant="outline" className="bg-muted/50">
              {documentType.toUpperCase()}
            </Badge>
          )}
          {moduleContext && (
            <Badge variant="outline" className="bg-muted/50">
              ICH {moduleContext.toUpperCase()}
            </Badge>
          )}
        </div>
      )}

      {response ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs
            defaultValue="answer"
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col"
          >
            <div className="border-b px-4">
              <TabsList className="h-10">
                <TabsTrigger value="answer" className="gap-2">
                  <Lightbulb className="h-4 w-4" />
                  <span>Guidance</span>
                </TabsTrigger>
                <TabsTrigger value="citations" className="gap-2">
                  <FileText className="h-4 w-4" />
                  <span>Citations ({response.citations.length})</span>
                </TabsTrigger>
                <TabsTrigger value="tasks" className="gap-2">
                  <CheckSquare className="h-4 w-4" />
                  <span>Tasks ({response.tasks.length})</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1">
              <TabsContent value="answer" className="m-0 p-4 h-full">
                <div className="prose dark:prose-invert prose-sm max-w-none">
                  <div className="flex items-center gap-2 mb-3">
                    <Avatar className="w-8 h-8 rounded-full bg-primary/10">
                      <BookOpen className="w-5 h-5 text-primary" />
                    </Avatar>
                    <div className="font-medium">ICH Specialist</div>
                  </div>
                  {response.answer
                    .split('\n')
                    .map((paragraph, i) =>
                      paragraph ? <p key={i}>{paragraph}</p> : <br key={i} />
                    )}
                </div>
              </TabsContent>

              <TabsContent value="citations" className="m-0 p-0 h-full">
                <div className="p-4">
                  <h3 className="text-sm font-medium mb-2">Citations from ICH Guidelines</h3>
                  <Accordion type="single" collapsible className="w-full">
                    {response.citations.map((citation, index) => (
                      <AccordionItem value={`citation-${index}`} key={index}>
                        <AccordionTrigger className="text-sm hover:no-underline">
                          <div className="flex items-start">
                            <Badge
                              variant="outline"
                              className="mr-2 bg-primary/10 hover:bg-primary/20"
                            >
                              {Math.round(citation.relevance_score * 100)}%
                            </Badge>
                            <span className="text-left font-medium">{citation.source}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {citation.text}
                          </p>
                          {citation.url && (
                            <a
                              href={citation.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline mt-2 inline-block"
                            >
                              View source
                            </a>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              </TabsContent>

              <TabsContent value="tasks" className="m-0 p-0 h-full">
                <div className="p-4">
                  <h3 className="text-sm font-medium mb-2">Suggested Tasks</h3>
                  {response.tasks.map((task, index) => (
                    <Card key={index} className="mb-3">
                      <CardHeader className="p-3 pb-0">
                        <CardTitle className="text-sm font-medium flex items-start">
                          <CheckSquare className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0 text-primary" />
                          {task.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-2">
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant="outline" className="bg-muted/50">
                            {task.priority} priority
                          </Badge>
                          <Badge variant="outline" className="bg-muted/50">
                            {task.estimated_effort}
                          </Badge>
                          {task.assignee_role && (
                            <Badge variant="outline" className="bg-muted/50">
                              {task.assignee_role}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                      <CardFooter className="p-3 pt-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-auto"
                          onClick={() => handleAddTask(task)}
                        >
                          Add to Tasks
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <div className="p-3 border-t">
            <div className="flex justify-between items-center">
              <div className="text-xs text-muted-foreground">
                Generated in {response.processing_time.toFixed(2)}s
              </div>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                New Query
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-muted-foreground">
          <Search className="h-12 w-12 mb-4 text-muted-foreground/50" />
          <h3 className="font-medium mb-1">Ask a question about ICH guidelines</h3>
          <p className="text-sm max-w-md">
            Get AI-powered guidance on regulatory compliance, protocol design, CSR structure, and
            more based on ICH E2-E10, M4, Q1-Q12 and other guidelines.
          </p>
        </div>
      )}
    </div>
  );
};

export default ICHSpecialistSidebar;
