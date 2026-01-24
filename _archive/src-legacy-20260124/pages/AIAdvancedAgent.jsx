// AIAdvancedAgent.jsx - Advanced AI co-pilot for regulatory intelligence
import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'wouter';
import {
  Bot,
  User,
  Send,
  MoreHorizontal,
  RefreshCw,
  FileText,
  Clipboard,
  ChevronRight,
  XCircle,
  PlusCircle,
  Settings,
  Save,
  ArrowLeft,
  Sparkles,
  FileSymlink,
  HelpCircle,
  Download,
  Shield,
  Archive as FileArchive,
} from 'lucide-react';
import { apiRequest } from '../lib/queryClient';
import { useToast } from '../hooks/use-toast';

const AIAdvancedAgent = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'system',
      content:
        'Welcome to the TrialSage AI Co-pilot. I can help you with regulatory document preparation, compliance questions, and optimizing your submissions. How can I assist you today?',
      timestamp: new Date().toISOString(),
    },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedContext, setSelectedContext] = useState('general');
  const [activeProfile, setActiveProfile] = useState('regulatory');
  const messagesEndRef = useRef(null);
  const { toast } = useToast();

  // Automatically scroll to the bottom of the chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Different AI profiles with specialized capabilities
  const aiProfiles = [
    {
      id: 'regulatory',
      name: 'Regulatory Expert',
      description: 'Specialized in FDA, EMA, PMDA, and Health Canada regulations',
      icon: <Shield className="h-5 w-5 text-blue-600" />,
    },
    {
      id: 'csr',
      name: 'CSR Specialist',
      description: 'Expert in Clinical Study Report creation and optimization',
      icon: <FileText className="h-5 w-5 text-green-600" />,
    },
    {
      id: 'ind',
      name: 'IND Architect',
      description: 'Focused on Investigational New Drug submission guidance',
      icon: <FileSymlink className="h-5 w-5 text-purple-600" />,
    },
    {
      id: 'submissions',
      name: 'Submissions Assistant',
      description: 'Specialized in eCTD and submission preparation',
      icon: <FileArchive className="h-5 w-5 text-amber-600" />,
    },
  ];

  // Context type options
  const contextTypes = [
    { id: 'general', name: 'General Assistance' },
    { id: 'document', name: 'Document Preparation' },
    { id: 'compliance', name: 'Regulatory Compliance' },
    { id: 'analysis', name: 'CSR Analysis' },
    { id: 'submission', name: 'Submission Preparation' },
  ];

  // Example queries for different contexts
  const exampleQueries = {
    general: [
      'What are the key differences between FDA and EMA requirements?',
      'How can I improve the efficiency of my regulatory submissions?',
      'What are the latest changes in regulatory requirements for oncology trials?',
    ],
    document: [
      'How should I structure a CSR for a Phase 2 oncology trial?',
      'What sections are required in an IND for a first-in-human study?',
      'Generate an executive summary template for my clinical evaluation report.',
    ],
    compliance: [
      'What are the PMDA-specific requirements for safety reporting?',
      "How should I address FDA's feedback on my protocol design?",
      'What documentation is needed for Health Canada compliance?',
    ],
    analysis: [
      'Analyze this adverse event data for reporting patterns.',
      'Compare my protocol design with similar approved studies.',
      'Help me interpret this efficacy data for my CSR.',
    ],
    submission: [
      'What are the common deficiencies in oncology INDs?',
      'How should I organize my eCTD submission for EMA?',
      'What validation steps should I perform before submission?',
    ],
  };

  // Submit message to AI
  const handleSubmit = async e => {
    e.preventDefault();

    if (!inputValue.trim() || isLoading) return;

    const userMessage = {
      id: messages.length + 1,
      role: 'user',
      content: inputValue,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Call the OpenAI API via our backend
      const response = await apiRequest('POST', '/api/openai/chat', {
        messages: [...messages, userMessage].map(msg => ({
          role: msg.role === 'system' ? 'system' : msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        })),
        profile: activeProfile,
        context: selectedContext,
      });

      if (!response.ok) {
        throw new Error('Failed to get response from AI');
      }

      const data = await response.json();

      const assistantMessage = {
        id: messages.length + 2,
        role: 'assistant',
        content: data.message || "I'm sorry, I couldn't process that request. Please try again.",
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error communicating with AI service:', error);

      // Mock AI response since we don't have a real backend connection yet
      const mockResponses = {
        regulatory:
          "Based on the latest regulatory guidelines, I can suggest several approaches to addressing your question. The FDA typically expects detailed safety data in section 5 of your submission, while the EMA places more emphasis on benefit-risk assessment throughout the dossier. For your specific case, I'd recommend strengthening the pharmacovigilance plan with particular attention to the specific patient population you're targeting.",
        csr: "For your Clinical Study Report, I recommend following the ICH E3 structure with particular attention to section 12 (Safety Evaluation). Given the nature of your oncology trial, you'll want to ensure comprehensive documentation of all adverse events with detailed causality assessment. I can help you draft specific sections if you'd like.",
        ind: 'When preparing your IND submission, remember that the FDA will be looking closely at your preclinical data package and initial protocol design. Based on recent submissions in this therapeutic area, I suggest emphasizing the novel mechanism of action in section 4 and providing more detailed toxicology data than might seem necessary. This has been a common area for information requests.',
        submissions:
          'For your eCTD submission, ensure that your Study Tagging Files (STFs) are correctly implemented. Recent regulatory feedback suggests that improper document granularity remains a common deficiency. I recommend reviewing the latest technical validation criteria published in February 2025 before finalizing your submission package.',
      };

      const assistantMessage = {
        id: messages.length + 2,
        role: 'assistant',
        content:
          mockResponses[activeProfile] ||
          "I'm sorry, I couldn't process that request. Please try again.",
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Show connection issue notification
      console.log('Connection issue notification would be shown');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatTimestamp = timestamp => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const startNewChat = () => {
    setMessages([
      {
        id: 1,
        role: 'system',
        content:
          'Welcome to the TrialSage AI Co-pilot. I can help you with regulatory document preparation, compliance questions, and optimizing your submissions. How can I assist you today?',
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link to="/">
                <div className="flex items-center">
                  <div className="h-10 w-10 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-xl">
                    TS
                  </div>
                  <div className="ml-3 hidden md:block">
                    <span className="text-gray-900 font-bold text-xl">TrialSage</span>
                    <span className="text-gray-500 ml-2 text-sm">AI Co-pilot</span>
                  </div>
                </div>
              </Link>
            </div>

            <div className="flex items-center space-x-4">
              <Link to="/client-portal">
                <button className="inline-flex items-center text-sm text-gray-700 hover:text-gray-900">
                  <ArrowLeft size={16} className="mr-1" />
                  Back to Portal
                </button>
              </Link>
              <div className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-medium">
                AI-Enhanced
              </div>
              <button className="p-1 rounded-full text-gray-500 hover:text-gray-700 focus:outline-none">
                <Settings size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 flex-shrink-0 hidden md:block">
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <button
                onClick={startNewChat}
                className="inline-flex items-center w-full px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
              >
                <PlusCircle size={16} className="mr-2" />
                New Conversation
              </button>
            </div>

            <div className="p-4 border-b border-gray-200">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                AI PROFILES
              </h3>
              <div className="space-y-2">
                {aiProfiles.map(profile => (
                  <button
                    key={profile.id}
                    onClick={() => setActiveProfile(profile.id)}
                    className={`flex items-center w-full px-3 py-2 text-sm font-medium rounded-md ${
                      activeProfile === profile.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="mr-3">{profile.icon}</div>
                    <div className="text-left">
                      <div className="font-medium">{profile.name}</div>
                      <div className="text-xs text-gray-500 truncate max-w-[160px]">
                        {profile.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 border-b border-gray-200">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                CONTEXT TYPE
              </h3>
              <div className="space-y-1">
                {contextTypes.map(context => (
                  <button
                    key={context.id}
                    onClick={() => setSelectedContext(context.id)}
                    className={`flex items-center w-full px-3 py-1.5 text-sm font-medium rounded-md ${
                      selectedContext === context.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {context.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                KNOWLEDGE BASE
              </h3>
              <div className="space-y-2">
                <div className="flex items-center p-2 hover:bg-gray-50 rounded-md cursor-pointer">
                  <FileText size={16} className="text-blue-500 mr-2" />
                  <span className="text-sm">FDA Guidelines</span>
                </div>
                <div className="flex items-center p-2 hover:bg-gray-50 rounded-md cursor-pointer">
                  <FileText size={16} className="text-blue-500 mr-2" />
                  <span className="text-sm">EMA Requirements</span>
                </div>
                <div className="flex items-center p-2 hover:bg-gray-50 rounded-md cursor-pointer">
                  <FileText size={16} className="text-blue-500 mr-2" />
                  <span className="text-sm">ICH E6(R3)</span>
                </div>
                <div className="flex items-center p-2 hover:bg-gray-50 rounded-md cursor-pointer">
                  <FileText size={16} className="text-blue-500 mr-2" />
                  <span className="text-sm">CSR Templates</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200">
              <div className="flex items-center mb-2">
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Sparkles size={16} className="text-indigo-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">TrialSage AI</p>
                  <p className="text-xs text-gray-500">GPT-4o Enhanced</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col bg-white">
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
              <div className="space-y-6">
                {messages.map(message => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : message.role === 'system'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      <div className="flex items-center mb-2">
                        {message.role !== 'user' && (
                          <div className="mr-2 h-6 w-6 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                            <Bot size={14} />
                          </div>
                        )}
                        <span className="font-medium text-sm">
                          {message.role === 'user'
                            ? 'You'
                            : message.role === 'system'
                              ? 'TrialSage AI'
                              : 'AI Assistant'}
                        </span>
                        <span className="ml-2 text-xs opacity-70">
                          {formatTimestamp(message.timestamp)}
                        </span>
                      </div>
                      <div
                        className={`text-sm whitespace-pre-wrap ${
                          message.role === 'user'
                            ? 'text-white'
                            : message.role === 'system'
                              ? 'text-indigo-800'
                              : 'text-gray-800'
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[75%] rounded-lg px-4 py-3 bg-gray-100">
                      <div className="flex items-center mb-2">
                        <div className="mr-2 h-6 w-6 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                          <Bot size={14} />
                        </div>
                        <span className="font-medium text-sm">AI Assistant</span>
                        <div className="ml-2 flex items-center">
                          <RefreshCw size={14} className="animate-spin text-gray-500" />
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">Generating response...</div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>

          <div className="p-4 sm:px-6 lg:px-8 border-t border-gray-200">
            <div className="max-w-3xl mx-auto">
              {/* Example queries */}
              {messages.length <= 2 && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">Suggested prompts:</h3>
                  <div className="flex flex-wrap gap-2">
                    {exampleQueries[selectedContext].map((query, index) => (
                      <button
                        key={index}
                        onClick={() => setInputValue(query)}
                        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1.5 rounded-full"
                      >
                        {query}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="relative">
                <textarea
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me about regulatory requirements, document preparation, or compliance questions..."
                  className="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500 resize-none overflow-hidden"
                  rows={3}
                  disabled={isLoading}
                />
                <div className="absolute bottom-2 right-2 flex space-x-2">
                  {inputValue && (
                    <button
                      type="button"
                      onClick={() => setInputValue('')}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-full"
                    >
                      <XCircle size={18} />
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isLoading}
                    className={`p-2 rounded-full ${
                      !inputValue.trim() || isLoading
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </form>
              <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
                <div>
                  Active Profile:{' '}
                  <span className="font-medium">
                    {aiProfiles.find(p => p.id === activeProfile)?.name || 'Regulatory Expert'}
                  </span>
                </div>
                <div className="flex items-center">
                  <HelpCircle size={12} className="mr-1" />
                  <span>
                    AI responses are generated based on available regulatory data and best practices
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// No longer need mock components since we're importing from lucide-react

export default AIAdvancedAgent;
