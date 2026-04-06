import { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Search,
  X,
  SendHorizontal,
  Sparkles,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileSearch,
  Database,
  BookOpen,
  Lightbulb,
  Settings,
  ExternalLink,
  FilePlus,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Aurora Assistant Component
export default function AuroraAssistant({ isOpen, onClose, selectedModule }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'system',
      content:
        "Hello, I'm Aurora, your Digital Compliance Coach. I can help with GxP compliance questions, guide you through workflows, or execute commands. How can I assist you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [activeSuggestion, setActiveSuggestion] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [history, setHistory] = useState([
    {
      id: 1,
      query: 'Show me all open CAPAs assigned to me',
      timestamp: new Date(Date.now() - 86400000 * 2),
    },
    {
      id: 2,
      query: 'How do I initiate a CAPA for a lab deviation?',
      timestamp: new Date(Date.now() - 86400000),
    },
    {
      id: 3,
      query: 'Generate a report of overdue document reviews',
      timestamp: new Date(Date.now() - 7200000),
    },
  ]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Sample suggestions based on the current module
  useEffect(() => {
    if (selectedModule === 'document-management') {
      setSuggestions([
        'Find all documents requiring review this month',
        'Show me regulatory submission templates for EMA',
        'What are the requirements for inclusion in an IND?',
      ]);
    } else if (selectedModule === 'csr-intelligence') {
      setSuggestions([
        'Compare efficacy endpoints across oncology Phase 3 trials',
        'Find CSRs with similar adverse event profiles to our study',
        'What statistical methods are used for non-inferiority trials?',
      ]);
    } else if (selectedModule === 'enterprise-document-vault') {
      setSuggestions([
        'Show me all documents pending approval',
        'Find SOPs related to equipment calibration',
        'How many documents are out of compliance?',
      ]);
    } else {
      // Default suggestions
      setSuggestions([
        'Show me all open CAPAs assigned to me that are overdue',
        'How do I initiate a CAPA for a lab deviation?',
        'What are the 21 CFR Part 11 requirements for electronic signatures?',
      ]);
    }
  }, [selectedModule]);

  // Auto scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when assistant opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [isOpen]);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = {
      id: messages.length + 1,
      type: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    // Add to history
    setHistory(prev => [
      { id: prev.length + 1, query: input, timestamp: new Date() },
      ...prev.slice(0, 9), // Keep last 10 items
    ]);

    try {
      // Simulate AI processing
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Process user input and generate response
      const response = await processUserQuery(input, selectedModule);

      setMessages(prev => [
        ...prev,
        {
          id: prev.length + 1,
          type: 'assistant',
          content: response.content,
          actions: response.actions,
          data: response.data,
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error('Error processing request:', error);
      setMessages(prev => [
        ...prev,
        {
          id: prev.length + 1,
          type: 'system',
          content:
            'I apologize, but I encountered an error processing your request. Please try again.',
          error: true,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const processUserQuery = async (query, module) => {
    // This would connect to the backend AI service in production
    // For now, we'll use pattern matching for demo purposes

    const lowerQuery = query.toLowerCase();

    // CAPA related queries
    if (lowerQuery.includes('capa') && lowerQuery.includes('overdue')) {
      return {
        content: "I've found 3 overdue CAPAs assigned to you. Here they are:",
        data: {
          type: 'table',
          headers: ['CAPA ID', 'Description', 'Due Date', 'Status', 'Days Overdue'],
          rows: [
            ['CAPA-2025-042', 'Equipment calibration deviation', '2025-04-10', 'Open', '12'],
            [
              'CAPA-2025-039',
              'Temperature excursion investigation',
              '2025-04-15',
              'In Progress',
              '7',
            ],
            [
              'CAPA-2025-031',
              'Documentation error in batch record',
              '2025-04-18',
              'In Review',
              '4',
            ],
          ],
        },
        actions: [
          { label: 'View Details', icon: 'FileSearch', target: '/capa/details' },
          { label: 'Export Report', icon: 'Download', target: '/capa/export' },
        ],
      };
    }

    // Initiate CAPA workflow
    if (lowerQuery.includes('initiate') && lowerQuery.includes('capa')) {
      return {
        content:
          "I can help you initiate a CAPA for a lab deviation. Here's the process to follow:",
        data: {
          type: 'steps',
          steps: [
            'Document the deviation details including date, time, affected samples/processes',
            'Classify the deviation based on severity (critical, major, minor)',
            'Perform a root cause analysis using the 5-why methodology',
            'Develop corrective actions to address the immediate issue',
            'Establish preventative actions to prevent recurrence',
          ],
        },
        actions: [
          { label: 'Start CAPA Workflow', icon: 'FileText', target: '/capa/new' },
          { label: 'View SOP Reference', icon: 'BookOpen', target: '/docs/sop/CAPA-001' },
        ],
      };
    }

    // Document related queries
    if (
      lowerQuery.includes('document') &&
      (lowerQuery.includes('review') || lowerQuery.includes('approval'))
    ) {
      return {
        content: "I've generated a report of documents pending review or approval:",
        data: {
          type: 'chart',
          chartType: 'pie',
          labels: ['Pending Review', 'Pending Approval', 'With Comments', 'Recently Approved'],
          values: [12, 8, 5, 14],
        },
        actions: [
          { label: 'Review Urgent Documents', icon: 'AlertCircle', target: '/documents/urgent' },
          {
            label: 'View Full Document Dashboard',
            icon: 'BarChart2',
            target: '/documents/dashboard',
          },
        ],
      };
    }

    // Compliance requirements
    if (
      lowerQuery.includes('21 cfr part 11') ||
      lowerQuery.includes('electronic signature') ||
      lowerQuery.includes('compliance')
    ) {
      return {
        content:
          '21 CFR Part 11 establishes the FDA regulations on electronic records and electronic signatures. Here are the key requirements for electronic signatures:',
        data: {
          type: 'list',
          items: [
            'Electronic signatures must include the printed name of the signer',
            'The date and time when the signature was executed',
            'The meaning associated with the signature (approval, review, responsibility, etc.)',
            'Signatures must be linked to their respective records to prevent copying or transfer',
            'Each electronic signature must be unique to one individual and not reused or reassigned',
            'Identity verification before establishing an electronic signature',
          ],
        },
        actions: [
          {
            label: 'View Full Compliance Guide',
            icon: 'FileText',
            target: '/compliance/21-cfr-part-11',
          },
          { label: 'Run Compliance Check', icon: 'CheckSquare', target: '/compliance/validation' },
        ],
      };
    }

    // Module specific responses
    if (
      module === 'document-management' &&
      lowerQuery.includes('find') &&
      lowerQuery.includes('document')
    ) {
      return {
        content:
          "I've searched the document management system based on your criteria. Here are the relevant documents:",
        data: {
          type: 'documents',
          documents: [
            { name: 'Protocol Amendment 3', type: 'Clinical', date: '2025-04-12', status: 'Final' },
            {
              name: 'Statistical Analysis Plan',
              type: 'Biometrics',
              date: '2025-04-08',
              status: 'In Review',
            },
            {
              name: 'Clinical Study Report',
              type: 'Regulatory',
              date: '2025-03-30',
              status: 'Draft',
            },
          ],
        },
        actions: [
          { label: 'Open in Document Explorer', icon: 'Folder', target: '/documents/explorer' },
          {
            label: 'Create Semantic Collection',
            icon: 'FilePlus',
            target: '/documents/collections/new',
          },
        ],
      };
    }

    // Default response for other queries
    return {
      content:
        "I understand you're asking about " +
        query +
        ". Based on my training on GxP compliance and company SOPs, here's what I can tell you: This capability would be connected to the actual compliance database and knowledge base in production. For now, I can help with common queries about CAPAs, document management, regulatory requirements, and workflow guidance. Would you like me to explain any specific compliance area in more detail?",
      actions: [
        { label: 'View Related SOPs', icon: 'BookOpen', target: '/documents/sops' },
        { label: 'Contact Compliance Team', icon: 'Users', target: '/support/compliance' },
      ],
    };
  };

  const handleSuggestionClick = suggestion => {
    setInput(suggestion);
    inputRef.current?.focus();
  };

  const handleHistoryItemClick = query => {
    setInput(query);
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-20 z-50 flex items-end sm:items-center justify-center p-4">
      <div
        className="bg-white rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col w-full max-w-3xl h-[85vh] max-h-[800px] transform transition-all"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
              <Bot size={20} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Ask Aurora</h2>
              <p className="text-xs text-gray-500">Digital Compliance Coach • GxP Specialist</p>
            </div>
          </div>

          <div className="flex items-center">
            <button
              className="p-2 text-gray-500 hover:text-gray-700"
              onClick={() => setShowSuggestions(!showSuggestions)}
            >
              <Lightbulb size={18} />
            </button>
            <button
              className="p-2 text-gray-500 hover:text-gray-700"
              onClick={() => setHistoryExpanded(!historyExpanded)}
            >
              <Clock size={18} />
            </button>
            <button className="ml-2 p-2 text-gray-500 hover:text-gray-700" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Query History Panel */}
        {historyExpanded && (
          <div className="bg-gray-50 p-3 border-b border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-gray-700">Recent Queries</h3>
              <button
                className="text-xs text-gray-500 hover:text-gray-700"
                onClick={() => setHistoryExpanded(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="space-y-2">
              {history.map(item => (
                <div
                  key={item.id}
                  className="text-sm p-2 bg-white rounded border border-gray-200 cursor-pointer hover:bg-gray-50 flex justify-between items-center"
                  onClick={() => handleHistoryItemClick(item.query)}
                >
                  <span className="truncate">{item.query}</span>
                  <span className="text-xs text-gray-400 shrink-0 ml-2">
                    {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(message => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`rounded-lg p-3 max-w-[85%] ${
                  message.type === 'user'
                    ? 'bg-indigo-600 text-white'
                    : message.type === 'system'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                {/* Message header for assistant */}
                {message.type === 'assistant' && (
                  <div className="flex items-center mb-2">
                    <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center mr-2">
                      <Bot size={14} className="text-indigo-600" />
                    </div>
                    <span className="text-xs font-medium text-gray-500">Aurora</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {formatDistanceToNow(message.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                )}

                {/* Message content */}
                <div className="text-sm">
                  <p className={message.type === 'system' && message.error ? 'text-red-600' : ''}>
                    {message.content}
                  </p>

                  {/* Data visualization based on type */}
                  {message.data && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {message.data.type === 'table' && (
                        <div className="overflow-x-auto rounded border border-gray-200 mt-2 bg-white">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                {message.data.headers.map((header, i) => (
                                  <th
                                    key={i}
                                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                  >
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {message.data.rows.map((row, i) => (
                                <tr key={i}>
                                  {row.map((cell, j) => (
                                    <td
                                      key={j}
                                      className="px-3 py-2 whitespace-nowrap text-xs text-gray-800"
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {message.data.type === 'steps' && (
                        <div className="mt-2 space-y-2">
                          {message.data.steps.map((step, i) => (
                            <div key={i} className="flex items-start">
                              <div className="h-5 w-5 rounded-full bg-indigo-100 flex items-center justify-center mr-2 shrink-0 mt-0.5">
                                <span className="text-xs font-medium text-indigo-600">{i + 1}</span>
                              </div>
                              <span className="text-xs text-gray-800">{step}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {message.data.type === 'list' && (
                        <ul className="mt-2 space-y-1 text-xs text-gray-800 list-disc pl-4">
                          {message.data.items.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      )}

                      {message.data.type === 'chart' && (
                        <div className="mt-2 p-4 bg-white rounded-lg border border-gray-200">
                          <div className="h-40 flex items-center justify-center">
                            <div className="text-center text-sm text-gray-500">
                              <div className="font-semibold">Document Review Status</div>
                              <div className="flex items-center justify-center space-x-4 mt-2">
                                {message.data.labels.map((label, i) => (
                                  <div key={i} className="flex items-center">
                                    <div
                                      className="h-3 w-3 rounded-full mr-1"
                                      style={{
                                        backgroundColor: [
                                          '#8bb4d9',
                                          '#8bb4d9',
                                          '#f87171',
                                          '#8bb4d9',
                                        ][i],
                                      }}
                                    />
                                    <span className="text-xs">
                                      {label}: {message.data.values[i]}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {message.data.type === 'documents' && (
                        <div className="mt-2 space-y-2">
                          {message.data.documents.map((doc, i) => (
                            <div
                              key={i}
                              className="flex items-start p-2 bg-gray-50 rounded-lg border border-gray-200"
                            >
                              <div className="h-8 w-8 rounded bg-blue-100 flex items-center justify-center mr-2 shrink-0">
                                <FileSearch size={16} className="text-blue-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline">
                                  <h4 className="text-xs font-medium text-gray-900 truncate">
                                    {doc.name}
                                  </h4>
                                  <span
                                    className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                                      doc.status === 'Final'
                                        ? 'bg-green-100 text-green-800'
                                        : doc.status === 'Draft'
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-yellow-100 text-yellow-800'
                                    }`}
                                  >
                                    {doc.status}
                                  </span>
                                </div>
                                <div className="flex justify-between text-[11px] text-gray-500 mt-1">
                                  <span>{doc.type}</span>
                                  <span>{doc.date}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  {message.actions && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200">
                      {message.actions.map((action, i) => (
                        <button
                          key={i}
                          className="inline-flex items-center px-2.5 py-1.5 rounded text-xs font-medium bg-white hover:bg-gray-50 text-indigo-700 border border-indigo-200"
                        >
                          {getIconByName(action.icon, 12)}
                          <span className="ml-1">{action.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex justify-start">
              <div className="rounded-lg p-3 max-w-[85%] bg-white border border-gray-200 text-gray-800">
                <div className="flex items-center space-x-2">
                  <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Bot size={14} className="text-indigo-600" />
                  </div>
                  <div className="flex space-x-1.5">
                    <div
                      className="h-2 w-2 bg-gray-300 rounded-full animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    ></div>
                    <div
                      className="h-2 w-2 bg-gray-300 rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    ></div>
                    <div
                      className="h-2 w-2 bg-gray-300 rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center mb-2">
              <Sparkles size={14} className="text-indigo-500 mr-2" />
              <span className="text-xs font-medium text-gray-700">Suggested questions</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-full hover:bg-gray-50 text-gray-700"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="px-4 py-3 border-t border-gray-200">
          <form onSubmit={handleSubmit} className="flex items-end space-x-2">
            <div className="relative flex-1">
              <input
                type="text"
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask Aurora about compliance, workflows, or data..."
                className="w-full border border-gray-300 rounded-lg py-2 px-4 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                disabled={isProcessing}
              />
              {input && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setInput('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isProcessing}
              className={`flex items-center justify-center h-10 w-10 rounded-lg ${
                !input.trim() || isProcessing
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              <SendHorizontal size={18} />
            </button>
          </form>

          <div className="flex justify-center mt-2">
            <div className="text-xs text-gray-500 flex items-center">
              <Sparkles size={12} className="text-indigo-400 mr-1" />
              Fine-tuned on GxP compliance data and company SOPs
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to render icon by name
function getIconByName(name, size = 16) {
  const iconProps = { size };

  switch (name) {
    case 'FileSearch':
      return <FileSearch {...iconProps} />;
    case 'Download':
      return <FileSearch {...iconProps} />;
    case 'FileText':
      return <FileSearch {...iconProps} />;
    case 'BookOpen':
      return <BookOpen {...iconProps} />;
    case 'AlertCircle':
      return <AlertCircle {...iconProps} />;
    case 'BarChart2':
      return <FileSearch {...iconProps} />;
    case 'CheckSquare':
      return <ClipboardCheck {...iconProps} />;
    case 'Folder':
      return <Database {...iconProps} />;
    case 'FilePlus':
      return <FilePlus {...iconProps} />;
    case 'Users':
      return <FileSearch {...iconProps} />;
    default:
      return <ExternalLink {...iconProps} />;
  }
}
