import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';

import {
  Bot,
  Send,
  Clipboard,
  BookOpen,
  FileText,
  Lightbulb,
  Sparkles,
  CheckSquare,
  AlertCircle,
  Upload,
  Copy,
  X,
  Loader2,
  Brain,
  Settings,
  RotateCw,
} from 'lucide-react';

/**
 * Chat Message Component
 *
 * @param {Object} props - Component props
 * @param {Object} props.message - The message object
 */
const ChatMessage = ({ message }) => {
  const isUser = message.isUser;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex-shrink-0 flex items-start pt-1 ${isUser ? 'ml-2' : 'mr-2'}`}>
          {isUser ? (
            <div className="h-8 w-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
              <span className="text-xs font-medium">You</span>
            </div>
          ) : (
            <div className="h-8 w-8 bg-teal-100 rounded-full flex items-center justify-center text-teal-600">
              <Bot size={18} />
            </div>
          )}
        </div>

        <div
          className={`rounded-lg py-2 px-3 ${
            isUser ? 'bg-indigo-50 text-indigo-900' : 'bg-gray-50 text-gray-800'
          }`}
        >
          {message.loading ? (
            <div className="flex items-center h-6">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              <span className="text-sm text-gray-500">Generating response...</span>
            </div>
          ) : (
            <div className="prose-sm max-w-none whitespace-pre-wrap">{message.content}</div>
          )}

          {!isUser && !message.loading && (
            <div className="flex justify-end mt-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-gray-400 hover:text-gray-700"
                      onClick={() => {
                        navigator.clipboard.writeText(message.content);
                        toast({
                          title: 'Copied to clipboard',
                          description: 'The message has been copied to your clipboard',
                        });
                      }}
                    >
                      <Copy size={14} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Copy to clipboard</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Suggested Query Button
 *
 * @param {Object} props - Component props
 * @param {string} props.text - The suggested query text
 * @param {Function} props.onClick - Click handler
 */
const SuggestedQuery = ({ text, onClick }) => (
  <Button
    variant="outline"
    size="sm"
    className="text-xs px-3 py-1 h-auto whitespace-normal text-left justify-start font-normal"
    onClick={() => onClick(text)}
  >
    <Lightbulb className="h-3 w-3 mr-2 flex-shrink-0" />
    <span className="line-clamp-1">{text}</span>
  </Button>
);

/**
 * Chat Panel Component
 *
 * Provides a chat interface for interacting with the TrialSage AI assistant
 * for regulatory document analysis and guidance.
 *
 * @param {Object} props - Component props
 * @param {string} props.context - The chat context (csr, protocol, ind, etc.)
 * @param {string} props.documentId - Optional document ID for document-specific queries
 * @param {boolean} props.showSuggestions - Whether to show suggested queries
 */
export default function ChatPanel({
  context = 'general',
  documentId = null,
  showSuggestions = true,
}) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      content: `Hello! I'm your TrialSage AI assistant. How can I help you with your regulatory and clinical documentation today?`,
      isUser: false,
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState('chat');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Context-specific suggested queries
  const suggestedQueries = {
    general: [
      'What are the key components of a clinical study report?',
      'How does ICH E3 guidance structure CSR content?',
      'What are the FDA requirements for IND submissions?',
      'What safety information should be included in a CSR?',
      'How should I structure the efficacy results section?',
    ],
    csr: [
      'What should be included in the CSR synopsis?',
      'How do I present adverse events data effectively?',
      'What statistical methods should I include?',
      'How to handle protocol deviations in a CSR?',
      'What tables are required in a CSR?',
    ],
    protocol: [
      'What are the essential elements of a protocol?',
      'How to write effective inclusion/exclusion criteria?',
      'What safety monitoring procedures should be included?',
      'How to determine appropriate sample size?',
      'What endpoints should I consider for my study?',
    ],
    ind: [
      'What modules are required for an IND submission?',
      'How detailed should the CMC section be in an initial IND?',
      'What preclinical data is needed for a first-in-human study?',
      "How to structure the Investigator's Brochure?",
      'What should be included in the clinical protocol for IND?',
    ],
  };

  // Scroll to bottom of chat when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle sending a message
  const handleSendMessage = async () => {
    if (!input.trim()) return;

    // Add user message to chat
    const userMessage = {
      id: `user-${Date.now()}`,
      content: input.trim(),
      isUser: true,
      timestamp: new Date().toISOString(),
    };

    // Add loading message as placeholder for AI response
    const loadingMessage = {
      id: `ai-${Date.now()}`,
      content: '',
      isUser: false,
      loading: true,
      timestamp: new Date().toISOString(),
    };

    setMessages(msgs => [...msgs, userMessage, loadingMessage]);
    setInput('');
    setLoading(true);

    try {
      // Get the last 10 messages for context (excluding the loading message)
      const recentMessages = messages.slice(-10).map(msg => ({
        isUser: msg.isUser,
        content: msg.content,
      }));

      // Make API request
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: input.trim(),
          context,
          history: recentMessages,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json();

      // Update the loading message with the actual response
      setMessages(msgs =>
        msgs.map(msg =>
          msg.id === loadingMessage.id
            ? {
                ...msg,
                content: data.response,
                loading: false,
              }
            : msg
        )
      );
    } catch (error) {
      console.error('Error sending message:', error);

      // Update the loading message with an error
      setMessages(msgs =>
        msgs.map(msg =>
          msg.id === loadingMessage.id
            ? {
                ...msg,
                content: "I'm sorry, I couldn't process your request. Please try again later.",
                loading: false,
                error: true,
              }
            : msg
        )
      );

      toast({
        title: 'Error',
        description: 'Failed to get a response. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle suggested query click
  const handleSuggestedQueryClick = query => {
    setInput(query);
  };

  // Handle key press (Enter to send)
  const handleKeyPress = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Clear chat history
  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome-new',
        content: 'Chat history cleared. How can I help you today?',
        isUser: false,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  return (
    <Card className="w-full flex flex-col h-full max-h-[80vh]">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center">
              <Brain className="h-5 w-5 mr-2 text-teal-600" />
              TrialSage Chat Assistant
            </CardTitle>
            <CardDescription>AI-powered regulatory guidance and document assistant</CardDescription>
          </div>
          <Badge variant="outline" className="flex items-center space-x-1">
            <Sparkles className="h-3 w-3 mr-1 text-teal-600" />
            <span>GPT-4o</span>
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex justify-between items-center">
            <TabsList className="grid w-60 grid-cols-2">
              <TabsTrigger value="chat">
                <Bot className="h-4 w-4 mr-1" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="documents">
                <FileText className="h-4 w-4 mr-1" />
                Documents
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-500 hover:text-gray-900"
                      onClick={handleClearChat}
                    >
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clear chat history</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-500 hover:text-gray-900"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Chat settings</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </Tabs>
      </CardHeader>

      <CardContent className="flex-grow overflow-hidden">
        <TabsContent value="chat" className="h-full flex flex-col mt-0">
          <div className="flex-grow overflow-y-auto p-1 min-h-[300px]">
            {messages.map(message => (
              <ChatMessage key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {showSuggestions && messages.length <= 3 && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">Try asking:</p>
              <div className="grid grid-cols-1 gap-2">
                {suggestedQueries[context]?.slice(0, 3).map((query, i) => (
                  <SuggestedQuery key={i} text={query} onClick={handleSuggestedQueryClick} />
                ))}
              </div>
            </div>
          )}

          <Separator className="my-3" />

          <div className="relative">
            <Textarea
              className="pr-12 min-h-[80px] resize-none"
              placeholder="Type your message here..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={loading}
            />
            <Button
              size="icon"
              className="absolute right-2 bottom-2"
              onClick={handleSendMessage}
              disabled={!input.trim() || loading}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex justify-between mt-2">
            <div className="text-xs text-gray-500 flex items-center">
              <BookOpen className="h-3 w-3 mr-1" />
              <span>
                {context === 'general'
                  ? 'General Regulatory Assistant'
                  : context === 'csr'
                    ? 'CSR Assistant'
                    : context === 'protocol'
                      ? 'Protocol Assistant'
                      : context === 'ind'
                        ? 'IND Assistant'
                        : 'Document Assistant'}
              </span>
            </div>
            {process.env.NODE_ENV === 'development' && (
              <Badge variant="outline" className="text-xs bg-amber-50">
                DEV MODE
              </Badge>
            )}
          </div>
        </TabsContent>

        <TabsContent value="documents" className="h-full flex flex-col mt-0">
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-4">
              <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-700 mb-2">Document Analysis</h3>
              <p className="text-sm text-gray-500 mb-4">
                Upload a document to analyze and chat about its contents
              </p>
              <Button className="mx-auto">
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            </div>
          </div>
        </TabsContent>
      </CardContent>

      <CardFooter className="py-2 text-xs text-gray-500 border-t flex justify-between">
        <div className="flex items-center">
          <CheckSquare className="h-3 w-3 mr-1 text-green-600" />
          <span>21 CFR Part 11 Compliant</span>
        </div>
        <div className="flex items-center">
          <AlertCircle className="h-3 w-3 mr-1 text-amber-600" />
          <span>Not for clinical decision making</span>
        </div>
      </CardFooter>
    </Card>
  );
}
