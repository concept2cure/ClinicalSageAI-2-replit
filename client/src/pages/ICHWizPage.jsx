import React, { useState, useEffect } from 'react';
import { Helmet } from '../lightweight-wrappers.js';
import { SplitPane } from '../lightweight-wrappers.js';
import { useToast } from '@/hooks/use-toast';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

// Icons
import {
  BookOpen,
  Search,
  FileText,
  UploadCloud,
  MessageSquare,
  Send,
  Info,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

// Style definitions
const globalStyles = {
  container: {
    height: 'calc(100vh - 64px)',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f8fafc',
  },
  splitPaneContainer: {
    flexGrow: 1,
  },
  splitPane: {
    position: 'relative',
  },
  sidebar: {
    padding: '1rem',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  mainContent: {
    padding: '1rem',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  commandBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  searchInput: {
    flexGrow: 1,
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    border: '1px solid #e2e8f0',
    fontSize: '0.875rem',
  },
  actionButtons: {
    display: 'flex',
    gap: '0.5rem',
  },
  citation: {
    marginTop: '0.5rem',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    backgroundColor: '#f1f5f9',
    fontSize: '0.875rem',
  },
  citationSource: {
    fontWeight: 'bold',
    fontSize: '0.75rem',
    color: '#64748b',
  },
  task: {
    marginTop: '0.5rem',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
  },
  taskHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.25rem',
  },
  taskTitle: {
    fontWeight: 'bold',
    fontSize: '0.875rem',
  },
  taskPriority: {
    fontSize: '0.75rem',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
    backgroundColor: '#e2e8f0',
  },
  highPriority: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
  },
  mediumPriority: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  lowPriority: {
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
  },
  chatContainer: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
  },
  chatMessages: {
    flexGrow: 1,
    overflowY: 'auto',
    marginBottom: '1rem',
    padding: '0.5rem',
  },
  message: {
    marginBottom: '1rem',
    maxWidth: '80%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#e0f2fe',
    borderRadius: '0.5rem 0.5rem 0 0.5rem',
    padding: '0.5rem 1rem',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    borderRadius: '0.5rem 0.5rem 0.5rem 0',
    padding: '0.5rem 1rem',
  },
  inputContainer: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.5rem',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e2e8f0',
  },
  input: {
    flexGrow: 1,
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    border: '1px solid #e2e8f0',
    fontSize: '0.875rem',
    resize: 'none',
  },
  uploadArea: {
    border: '2px dashed #e2e8f0',
    borderRadius: '0.5rem',
    padding: '2rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: '#f8fafc',
  },
  uploadAreaDragActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  documentList: {
    marginTop: '1rem',
  },
  documentItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    backgroundColor: '#f8fafc',
    marginBottom: '0.5rem',
    border: '1px solid #e2e8f0',
  },
  documentIcon: {
    marginRight: '0.5rem',
    color: '#64748b',
  },
  documentName: {
    fontSize: '0.875rem',
    fontWeight: 'medium',
  },
  documentActions: {
    display: 'flex',
    gap: '0.5rem',
  },
  navigationList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  navItemActive: {
    backgroundColor: '#e0f2fe',
  },
  navItemIcon: {
    marginRight: '0.5rem',
    color: '#64748b',
  },
  navItemText: {
    fontSize: '0.875rem',
  },
};

// Mock data
const mockCitations = [
  {
    source: 'ICH E6(R2) Good Clinical Practice',
    text: 'All clinical trial information should be recorded, handled, and stored in a way that allows its accurate reporting, interpretation, and verification.',
    relevance: 0.95,
  },
  {
    source: 'ICH M4E(R2) Common Technical Document',
    text: 'The Common Technical Document (CTD) is an internationally agreed format for the preparation of applications regarding new medical entities.',
    relevance: 0.87,
  },
  {
    source: 'ICH Q9 Quality Risk Management',
    text: 'Quality risk management is a systematic process for the assessment, control, communication and review of risks to the quality of the drug product.',
    relevance: 0.79,
  },
];

const mockTasks = [
  {
    task: 'Review ICH E6(R2) for clinical trial procedures',
    priority: 'high',
    rationale: 'Compliance with Good Clinical Practice is critical for trial validity.',
  },
  {
    task: 'Update documentation with CTD format requirements',
    priority: 'medium',
    rationale: 'Required for streamlined regulatory submissions.',
  },
  {
    task: 'Implement quality risk management protocol',
    priority: 'low',
    rationale: 'Will improve product quality and process efficiency.',
  },
];

const mockDocuments = [
  { name: 'ICH_E6R2_GCP_Guidelines.pdf', size: '2.4 MB', date: '2023-05-15' },
  { name: 'ICH_M4E_CTD_Overview.pdf', size: '1.7 MB', date: '2023-04-28' },
  { name: 'ICH_Q9_Risk_Management.pdf', size: '3.1 MB', date: '2023-03-10' },
];

const navigationItems = [
  { name: 'Chat with ICH Wiz', icon: <MessageSquare size={18} /> },
  { name: 'Browse Guidelines', icon: <BookOpen size={18} /> },
  { name: 'My Documents', icon: <FileText size={18} /> },
  { name: 'Upload Documents', icon: <UploadCloud size={18} /> },
];

// Component definition
const ICHWizPage = () => {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('chat');
  const [loading, setLoading] = useState(false);
  const [activeNavItem, setActiveNavItem] = useState('Chat with ICH Wiz');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hello, I'm ICH Wiz, your Digital Compliance Coach. I'm here to help you navigate ICH guidelines and ensure your regulatory documents comply with all requirements. How can I assist you today?",
    },
  ]);
  const { toast } = useToast();

  const handleSendMessage = () => {
    if (!query.trim()) return;

    // Add user message
    setMessages([...messages, { role: 'user', content: query }]);

    // Simulate processing
    setLoading(true);

    // Simulate AI response (would be replaced with actual API call)
    setTimeout(() => {
      setLoading(false);
      const mockResponse = {
        role: 'assistant',
        content:
          'Based on ICH guidelines, document formatting requirements for CTD submissions include proper pagination, margins of 2-3 cm, and standard fonts (Times New Roman 12pt or Arial 10pt). Additionally, all pages should be numbered sequentially, and electronic submissions should follow the eCTD specifications with properly bookmarked PDFs. Would you like more specific details about a particular module of the CTD?',
      };
      setMessages(prev => [...prev, mockResponse]);
      setQuery('');
    }, 1500);
  };

  const handleKeyPress = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleDocumentUpload = () => {
    toast({
      title: 'Document uploaded',
      description: 'Your document has been successfully uploaded and is being processed.',
    });
  };

  return (
    <div style={globalStyles.container}>
      <Helmet>
        <title>ICH Wiz | Digital Compliance Coach</title>
      </Helmet>

      <div style={globalStyles.splitPaneContainer}>
        <SplitPane split="vertical" defaultSizes={[250, 750]} style={globalStyles.splitPane}>
          <div style={globalStyles.sidebar}>
            <CardTitle className="mb-4">ICH Wiz Navigator</CardTitle>
            <CardDescription className="mb-6">
              Your Digital Compliance Coach for ICH Guidelines
            </CardDescription>

            <div style={globalStyles.navigationList}>
              {navigationItems.map((item, index) => (
                <div
                  key={index}
                  style={{
                    ...globalStyles.navItem,
                    ...(activeNavItem === item.name ? globalStyles.navItemActive : {}),
                  }}
                  onClick={() => setActiveNavItem(item.name)}
                >
                  <span style={globalStyles.navItemIcon}>{item.icon}</span>
                  <span style={globalStyles.navItemText}>{item.name}</span>
                </div>
              ))}
            </div>

            <Separator className="my-4" />

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="mt-auto">
                  <Info className="h-4 w-4 mr-2" />
                  About ICH Wiz
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>About ICH Wiz</AlertDialogTitle>
                  <AlertDialogDescription>
                    ICH Wiz is an advanced Digital Compliance Coach powered by AI. It provides
                    accurate, up-to-date guidance on ICH regulations and helps you ensure your
                    documents comply with all requirements.
                    <p className="mt-2">Version: 1.0.0</p>
                    <p>Last Updated: April 2025</p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogAction>Close</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div style={globalStyles.mainContent}>
            <Tabs
              defaultValue="chat"
              className="w-full h-full flex flex-col"
              onValueChange={setActiveTab}
            >
              <div style={globalStyles.commandBar}>
                <TabsList>
                  <TabsTrigger value="chat">Chat</TabsTrigger>
                  <TabsTrigger value="citations">Citations</TabsTrigger>
                  <TabsTrigger value="tasks">Suggested Tasks</TabsTrigger>
                </TabsList>

                {activeTab === 'chat' && (
                  <div className="ml-auto flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      <FileText className="h-4 w-4 mr-2" />
                      Save Chat
                    </Button>
                    <Button variant="outline" size="sm">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Report Issue
                    </Button>
                  </div>
                )}
              </div>

              <TabsContent value="chat" className="flex-grow flex flex-col mt-0">
                <Card className="flex-grow flex flex-col">
                  <CardContent className="pt-6 flex-grow flex flex-col">
                    <ScrollArea className="flex-grow pr-4 mb-4">
                      {messages.map((message, index) => (
                        <div
                          key={index}
                          className={`mb-4 ${message.role === 'user' ? 'text-right' : ''}`}
                        >
                          <div
                            className={`inline-block p-3 rounded-lg ${
                              message.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            }`}
                          >
                            {message.content}
                          </div>
                        </div>
                      ))}
                      {loading && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          ICH Wiz is thinking...
                        </div>
                      )}
                    </ScrollArea>

                    <div className="flex gap-2 mt-auto">
                      <Textarea
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Ask about ICH guidelines, regulatory requirements, or document formatting..."
                        className="min-h-[80px]"
                      />
                      <Button onClick={handleSendMessage} className="self-end">
                        <Send className="h-4 w-4 mr-2" />
                        Send
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="citations" className="flex-grow mt-0">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Citations</CardTitle>
                    <CardDescription>
                      Sources referenced in the current conversation
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {mockCitations.map((citation, index) => (
                      <div key={index} className="mb-4 p-3 bg-muted rounded-lg">
                        <div className="text-sm font-semibold text-primary mb-1">
                          {citation.source}
                        </div>
                        <div className="text-sm">{citation.text}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Relevance: {Math.round(citation.relevance * 100)}%
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="tasks" className="flex-grow mt-0">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Suggested Tasks</CardTitle>
                    <CardDescription>
                      Recommended actions based on your conversation
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {mockTasks.map((task, index) => (
                      <div key={index} className="mb-4 p-3 border rounded-lg">
                        <div className="flex justify-between items-center mb-1">
                          <div className="font-medium">{task.task}</div>
                          <div
                            className={`text-xs px-2 py-1 rounded ${
                              task.priority === 'high'
                                ? 'bg-red-100 text-red-800'
                                : task.priority === 'medium'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {task.priority.toUpperCase()}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">{task.rationale}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </SplitPane>
      </div>
    </div>
  );
};

export default ICHWizPage;
