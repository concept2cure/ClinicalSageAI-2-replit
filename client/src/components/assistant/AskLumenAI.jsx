// /client/src/components/assistant/AskLumenAI.jsx

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  UserRound,
  Bot,
  Sparkles,
  PieChart,
  Clock,
  Scale,
  Briefcase,
  XCircle,
  Minimize2,
  Maximize2,
  Paperclip,
  File,
  X,
} from 'lucide-react';
import { getAdvisorReadiness } from '../../lib/advisorService';

export default function AskLumenAI() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "I'm Lumen, your regulatory intelligence advisor. I have access to your submission readiness data and can help with strategic planning. What would you like to know about your regulatory strategy today?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeMode, setActiveMode] = useState('strategic'); // strategic, timeline, financial, or compliance
  const [advisorData, setAdvisorData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(true); // Set to true initially to show the panel
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [documentAnalysisActive, setDocumentAnalysisActive] = useState(false);
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fetch advisor data on load
  useEffect(() => {
    async function fetchAdvisorData() {
      setIsLoading(true);
      try {
        const data = await getAdvisorReadiness();
        setAdvisorData(data);
        console.log('API Response:', data);

        // Extract missing sections for readability
        if (data.missingSections) {
          console.log('Extracted missing sections:', data.missingSections);
        }
      } catch (error) {
        console.error('Error fetching advisor data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAdvisorData();
  }, []);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus on input when panel opens
  useEffect(() => {
    if (isPanelOpen) {
      chatInputRef.current?.focus();
    }
  }, [isPanelOpen]);

  // Mode labels and descriptions
  const modes = {
    strategic: {
      label: 'Strategic',
      description: 'Focuses on overall submission strategy and approach',
      icon: <Sparkles size={14} />,
    },
    timeline: {
      label: 'Timeline',
      description: 'Prioritizes speed of filing and critical path items',
      icon: <Clock size={14} />,
    },
    financial: {
      label: 'Financial',
      description: 'Optimizes for cost savings and delay reduction',
      icon: <PieChart size={14} />,
    },
    compliance: {
      label: 'Compliance',
      description: 'Focused on regulatory requirements and rejection risk',
      icon: <Scale size={14} />,
    },
  };

  // Generate response based on mode and context
  const generateResponse = userQuery => {
    const query = userQuery.toLowerCase();
    const playbookType = advisorData?.playbookUsed || 'Fast IND Playbook';
    const readiness = advisorData?.readinessScore || '65%';
    const missingDocs = advisorData?.missingSections || [
      'CMC Stability Study',
      'Clinical Study Reports',
    ];
    const riskLevel = advisorData?.riskLevel || 'Medium';
    const delayDays = advisorData?.estimatedDelayDays || 45;
    const submissionDate = advisorData?.estimatedSubmissionDate || 'August 15, 2025';
    const financialImpact = delayDays * 50000; // $50k per day rough estimate

    // Strategic Mode Responses
    if (activeMode === 'strategic') {
      if (
        query.includes('priority') ||
        query.includes('missing') ||
        query.includes('documents') ||
        query.includes('highest')
      ) {
        return `Based on my analysis, your highest priority documents for ${playbookType} are:
        
1. ${missingDocs[0]} (Critical Impact)
2. ${missingDocs[1]} (High Impact)
${missingDocs[2] ? `3. ${missingDocs[2]} (Medium Impact)` : ''}

Completing these will significantly improve your submission readiness score from the current ${readiness}%.`;
      }

      if (query.includes('strategy') || query.includes('recommend')) {
        return `For your ${playbookType} strategy, I recommend the following approach:

1. Focus first on completing ${missingDocs[0]} and ${missingDocs[1]} in the next 14 days
2. Accelerate review cycles on existing documents to reduce revision time
3. Consider parallel processing for Module 2 summaries while Module 3 technical details are being finalized
4. Establish daily review meetings to track progress on critical path items

This strategy addresses your current ${riskLevel} risk level while optimizing for your target submission date.`;
      }
    }

    // Timeline Mode Responses
    if (
      activeMode === 'timeline' ||
      query.includes('timeline') ||
      query.includes('delay') ||
      query.includes('improve')
    ) {
      if (query.includes('improve')) {
        return `To improve your timeline, I recommend:

1. Prioritize completing ${missingDocs[0]} which is currently on your critical path
2. Accelerate review cycles for ${missingDocs[1]} from 10 days to 5 days
3. Consider engaging additional regulatory experts for parallel document preparation
4. Schedule daily rapid review sessions for the next 2 weeks

I estimate these actions could reduce your current delay of ${delayDays} days by up to 40%, potentially moving your submission date from ${submissionDate} to approximately ${delayDays > 30 ? '30 days earlier' : '2 weeks earlier'}.`;
      }

      if (query.includes('projection') || query.includes('when')) {
        return `Based on current progress and document completion rates:

• Current Readiness: ${readiness}%
• Estimated Submission Date: ${submissionDate}
• Current Delay: ${delayDays} days
• Critical Path Item: ${missingDocs[0]}

Completing ${missingDocs[0]} could accelerate your timeline by up to ${Math.round(delayDays * 0.4)} days. Would you like a detailed timeline projection for specific documents?`;
      }
    }

    // Financial Mode Responses
    if (
      activeMode === 'financial' ||
      query.includes('financial') ||
      query.includes('cost') ||
      query.includes('money') ||
      query.includes('impact')
    ) {
      return `Financial Impact Analysis for your ${playbookType}:

• Current Delay: ${delayDays} days
• Estimated Financial Impact: $${financialImpact.toLocaleString()}
• Primary Cost Driver: ${missingDocs[0]}
• Secondary Cost Driver: ${missingDocs[1]}

Completing ${missingDocs[0]} could reduce financial impact by approximately $${(financialImpact * 0.4).toLocaleString()}.

Would you like a detailed cost-benefit analysis of accelerating specific documents?`;
    }

    // Compliance Mode Responses
    if (
      activeMode === 'compliance' ||
      query.includes('compliance') ||
      query.includes('regulatory') ||
      query.includes('requirements')
    ) {
      return `Compliance Analysis for your ${playbookType}:

• Current Risk Level: ${riskLevel}
• Risk Drivers: Missing ${missingDocs[0]} and ${missingDocs[1]}
• Potential Regulatory Concerns: 
  - Incomplete stability data may trigger FDA information request
  - Missing ${missingDocs[1]} could lead to clinical hold
  - ${missingDocs[2] ? `Inadequate ${missingDocs[2]} documentation increases rejection probability` : ''}

To improve compliance status, I recommend prioritizing ${missingDocs[0]} completion within the next 14 days.`;
    }

    // General response if no specific pattern is matched
    return `Based on my analysis of your ${playbookType}:

• Current Readiness: ${readiness}%
• Risk Level: ${riskLevel}
• Key Missing Documents: ${missingDocs.slice(0, 3).join(', ')}
• Estimated Delay: ${delayDays} days
• Target Submission: ${submissionDate}

What specific aspect of your regulatory strategy would you like to discuss? I can help with document prioritization, timeline optimization, financial impact analysis, or compliance requirements.`;
  };

  // Handle chat input submission
  const handleSubmit = e => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);

    // Clear input and show typing indicator
    setInput('');
    setIsTyping(true);

    // Use varying response times to simulate more natural interaction
    const responseTime = 1000 + Math.random() * 1500;

    // Generate AI response
    setTimeout(() => {
      const aiResponse = generateResponse(userMessage.content);
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
      setIsTyping(false);
    }, responseTime);
  };

  // Toggle the chat panel
  const togglePanel = () => {
    setIsPanelOpen(!isPanelOpen);
  };

  // Toggle expanded view
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Handle quick question click
  const handleQuickQuestion = question => {
    // Add user message
    const userMessage = { role: 'user', content: question };
    setMessages(prev => [...prev, userMessage]);

    // Show typing indicator
    setIsTyping(true);

    // Generate AI response with delay
    setTimeout(() => {
      const aiResponse = generateResponse(question);
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
      setIsTyping(false);
    }, 1200);
  };

  // Handle file attachment
  const handleFileAttachment = () => {
    fileInputRef.current?.click();
  };

  // Handle file input change
  const handleFileChange = e => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;

    // Add new files to existing attachments
    setAttachedFiles(prev => [...prev, ...selectedFiles]);

    // Show message about attached files
    const fileNames = selectedFiles.map(file => file.name).join(', ');
    setMessages(prev => [
      ...prev,
      {
        role: 'user',
        content: `I've attached the following documents for analysis: ${fileNames}`,
      },
    ]);

    // Show typing indicator
    setIsTyping(true);

    // Simulate document analysis
    setTimeout(() => {
      setDocumentAnalysisActive(true);

      // Generate response after "analysis"
      setTimeout(() => {
        const aiResponse = `I've analyzed the following documents: ${fileNames}

Based on my review, these documents appear to be related to ${selectedFiles[0].type.includes('pdf') ? 'regulatory submissions' : 'clinical research'}.

Would you like me to:
1. Extract key information from these documents
2. Compare these to your current submission requirements
3. Identify potential gaps or issues in the documentation
4. Suggest improvements based on regulatory standards`;

        setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
        setIsTyping(false);
        setDocumentAnalysisActive(false);
      }, 3000);
    }, 1500);
  };

  // Remove an attached file
  const handleRemoveFile = indexToRemove => {
    setAttachedFiles(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  // Handle mode change
  const handleModeChange = mode => {
    setActiveMode(mode);
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: `I've switched to ${modes[mode].label} mode. I'll now focus on ${modes[mode].description.toLowerCase()}.`,
      },
    ]);
  };

  // Quick questions that users can click to ask
  const quickQuestions = [
    'What are my highest priority documents?',
    'How can I improve our timeline?',
    "What's the current financial impact?",
    'Recommend a regulatory strategy',
  ];

  // Floating button when panel is closed
  if (!isPanelOpen) {
    return (
      <button
        onClick={togglePanel}
        className="fixed bottom-8 right-8 z-40 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-lg flex items-center justify-center"
        title="Ask Lumen AI"
      >
        <Bot size={24} />
      </button>
    );
  }

  // Render chat panel
  return (
    <div
      className={`fixed ${isExpanded ? 'inset-4' : 'bottom-4 right-4 w-96'} z-40 transition-all duration-300 ease-in-out`}
    >
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col h-full overflow-hidden">
        {/* Header with controls */}
        <div className="bg-indigo-600 text-white px-4 py-3 flex justify-between items-center">
          <div className="flex items-center">
            <Bot size={18} className="mr-2" />
            <h3 className="font-medium">
              Lumen AI Assistant
              {isLoading && <span className="ml-2 text-xs opacity-70">(Loading context...)</span>}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleExpanded}
              className="p-1 hover:bg-indigo-700 rounded"
              title={isExpanded ? 'Minimize' : 'Maximize'}
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button onClick={togglePanel} className="p-1 hover:bg-indigo-700 rounded" title="Close">
              <XCircle size={16} />
            </button>
          </div>
        </div>

        {/* Context Bar */}
        {advisorData && (
          <div className="bg-indigo-50 px-4 py-2 text-xs text-indigo-700 border-b border-indigo-100 flex justify-between">
            <span>
              <span className="font-medium">Playbook:</span> {advisorData.playbookUsed}
            </span>
            <span>
              <span className="font-medium">Readiness:</span> {advisorData.readinessScore}%
            </span>
            <span>
              <span className="font-medium">Risk:</span> {advisorData.riskLevel}
            </span>
          </div>
        )}

        {/* Chat Mode Selector */}
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
          <div className="flex flex-wrap gap-2">
            {Object.entries(modes).map(([key, { label, description, icon }]) => (
              <button
                key={key}
                onClick={() => handleModeChange(key)}
                title={description}
                className={`px-3 py-1 text-xs rounded-full flex items-center gap-1 ${
                  activeMode === key
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                }`}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Chat Messages */}
        <div
          className={`${isExpanded ? 'flex-grow' : 'h-96'} overflow-y-auto p-4 bg-gray-50 space-y-4`}
        >
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`flex items-start max-w-[80%] rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                <div
                  className={`rounded-full w-6 h-6 flex items-center justify-center mr-2 flex-shrink-0 ${
                    message.role === 'user' ? 'bg-indigo-500' : 'bg-indigo-100'
                  }`}
                >
                  {message.role === 'user' ? (
                    <UserRound size={14} className="text-white" />
                  ) : (
                    <Bot size={14} className="text-indigo-600" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">
                    {message.role === 'user' ? 'You' : `Lumen (${modes[activeMode].label})`}
                  </p>
                  <p className="text-sm whitespace-pre-line">{message.content}</p>
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex space-x-1 items-center">
                  <Bot size={14} className="text-indigo-600 mr-2" />
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Questions */}
        <div className="border-t border-gray-200 p-3 bg-gray-50 flex flex-wrap gap-2">
          {quickQuestions.map((question, idx) => (
            <button
              key={idx}
              onClick={() => handleQuickQuestion(question)}
              className="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full flex items-center gap-1"
            >
              <Sparkles size={12} />
              {question}
            </button>
          ))}
        </div>

        {/* Attached Files Section */}
        {attachedFiles.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-xs font-medium text-gray-700">
                Attached Documents ({attachedFiles.length})
              </h4>
              {documentAnalysisActive && (
                <div className="flex items-center text-xs text-indigo-600">
                  <div className="animate-spin mr-1 h-3 w-3 border-2 border-indigo-600 rounded-full border-t-transparent"></div>
                  Analyzing documents...
                </div>
              )}
            </div>
            <div className="space-y-2 max-h-24 overflow-y-auto">
              {attachedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-white p-2 rounded text-xs border border-gray-200"
                >
                  <div className="flex items-center">
                    <File size={14} className="text-indigo-500 mr-2" />
                    <span className="truncate max-w-[180px]">{file.name}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveFile(idx)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input Form */}
        <form
          id="chat-form"
          onSubmit={handleSubmit}
          className="border-t border-gray-200 p-3 flex items-center"
        >
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
          />

          {/* File attachment button */}
          <button
            type="button"
            onClick={handleFileAttachment}
            disabled={isTyping || documentAnalysisActive}
            className={`p-2 mr-1 rounded ${
              isTyping || documentAnalysisActive
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-indigo-600 hover:bg-indigo-50'
            }`}
            title="Attach documents for analysis"
          >
            <Paperclip size={18} />
          </button>

          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about your regulatory strategy..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
            disabled={isTyping || documentAnalysisActive}
            ref={chatInputRef}
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping || documentAnalysisActive}
            className={`px-4 py-2 rounded-r-md ${
              !input.trim() || isTyping || documentAnalysisActive
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
