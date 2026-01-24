// client/src/components/advisor/AskLumenCopilot.jsx
import { useState, useEffect, useRef } from 'react';
import { Send, PlusCircle, Paperclip, Trash2, Bot, User } from 'lucide-react';

export default function AskLumenCopilot({ readinessData, playbook }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hello, I'm Lumen, your Regulatory Intelligence Advisor. I can help you navigate your ${playbook} submission strategy. What would you like to know about your regulatory readiness or submission requirements?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeMode, setActiveMode] = useState('strategic'); // strategic, timeline, financial, or compliance
  const messagesEndRef = useRef(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mode labels and descriptions
  const modes = {
    strategic: {
      label: 'Strategic',
      description: 'Focuses on overall submission strategy and approach',
    },
    timeline: {
      label: 'Timeline',
      description: 'Prioritizes speed of filing and critical path items',
    },
    financial: {
      label: 'Financial',
      description: 'Optimizes for cost savings and delay reduction',
    },
    compliance: {
      label: 'Compliance',
      description: 'Focused on regulatory requirements and rejection risk',
    },
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

    // Simulate AI response generation
    setTimeout(() => {
      // Generate AI response based on user query and current advisor data
      const aiResponse = generateResponse(input, readinessData, playbook, activeMode);

      // Add AI response
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
      setIsTyping(false);
    }, 1500);
  };

  // Function to generate intelligent responses based on the query, advisor data, and active mode
  const generateResponse = (query, data, playbook, mode) => {
    // Default responses based on common queries
    const responses = {
      strategic: {
        readiness: `Based on your current ${data.readinessScore}% readiness score, your ${playbook} strategy is on track but requires attention to several key documents. I recommend focusing on completing the ${data.missingSections.slice(0, 3).join(', ')} as your top priorities.`,
        timeline: `Your current submission timeline projects ${data.estimatedSubmissionDate || 'approximately 3-4 months from now'}. The critical path items that could delay this timeline are ${data.missingSections.slice(0, 2).join(' and ')}.`,
        requirements: `For a complete ${playbook} submission, you'll need to address all ${data.missingSections.length} missing sections, with highest priority given to ${data.missingSections.slice(0, 3).join(', ')}.`,
        risks: `The key risks to your regulatory strategy are related to ${data.riskLevel} risk areas, particularly around missing ${data.missingSections.slice(0, 2).join(' and ')} documentation.`,
      },
      timeline: {
        readiness: `From a timeline perspective, your ${data.readinessScore}% readiness score translates to approximately ${data.estimatedDelayDays} days of potential delay. To accelerate your submission, focus on completing ${data.missingSections[0]} first, which could reduce delay by 25-40%.`,
        timeline: `To optimize your submission timeline, I recommend an aggressive 6-week plan focusing on ${data.missingSections.slice(0, 3).join(', ')}. This could advance your target date by 3-4 weeks.`,
        requirements: `To meet the fastest submission timeline for ${playbook}, prioritize only the absolutely required sections: ${data.missingSections.slice(0, 4).join(', ')}. Secondary documents can be submitted in later amendments.`,
        risks: `The timeline risks are primarily related to ${data.missingSections[0]} and ${data.missingSections[1]}. Delays in these areas could push back your submission by 30+ days.`,
      },
      financial: {
        readiness: `Your ${data.readinessScore}% readiness score has financial implications of approximately $${(data.estimatedDelayDays * 50000).toLocaleString()} in potential delay costs. Each 1% improvement saves approximately $${(50000).toLocaleString()}.`,
        timeline: `Financially speaking, each day of delay costs approximately $50,000. Your current timeline projects ${data.estimatedDelayDays} days of delay, resulting in $${(data.estimatedDelayDays * 50000).toLocaleString()} of potential financial impact.`,
        requirements: `The most cost-efficient approach to your ${playbook} is to focus first on ${data.missingSections[0]}, which represents approximately $${(30 * 50000).toLocaleString()} of financial risk if delayed.`,
        risks: `From a financial perspective, your greatest risks are in delayed market access due to incomplete ${data.missingSections.slice(0, 2).join(' and ')} documentation. This represents 60% of your total financial risk.`,
      },
      compliance: {
        readiness: `From a compliance standpoint, your ${data.readinessScore}% readiness score indicates significant regulatory gaps. The ${data.riskLevel} risk areas in ${data.missingSections.slice(0, 3).join(', ')} could trigger FDA RTF (Refuse to File) responses.`,
        timeline: `Compliance considerations may extend your timeline beyond the current ${data.estimatedDelayDays} day estimate if ${data.missingSections[0]} does not meet regulatory standards on first review.`,
        requirements: `For a compliant ${playbook} submission, you must address all regulatory deficiencies in ${data.missingSections.slice(0, 4).join(', ')}. Particular attention should be paid to CMC documentation and clinical safety reporting.`,
        risks: `Your compliance risks are primarily in ${data.missingSections.slice(0, 2).join(' and ')}. Be aware that FDA/EMA reviewers have been increasingly strict on these areas in recent submissions.`,
      },
    };

    // Keywords to match against for common queries
    const keywords = {
      readiness: [
        'readiness',
        'ready',
        'prepared',
        'status',
        'progress',
        'how are we doing',
        'where do we stand',
      ],
      timeline: [
        'timeline',
        'schedule',
        'when',
        'date',
        'time',
        'long',
        'submission date',
        'target date',
        'deadline',
      ],
      requirements: [
        'requirement',
        'need',
        'necessary',
        'mandatory',
        'required',
        'must have',
        'essential',
        'what documents',
      ],
      risks: [
        'risk',
        'danger',
        'concern',
        'issue',
        'problem',
        'worry',
        'challenge',
        'obstacle',
        'barrier',
      ],
    };

    // Check for document-specific questions
    const documentQuestions = data.missingSections.some(section =>
      query.toLowerCase().includes(section.toLowerCase())
    );

    if (documentQuestions) {
      // Find the specific document mentioned
      const mentionedSection = data.missingSections.find(section =>
        query.toLowerCase().includes(section.toLowerCase())
      );

      return `Regarding ${mentionedSection}, this is a critical document for your ${playbook} submission with ${data.riskLevel.toLowerCase()} risk impact. Completing this document could improve your readiness score by approximately 5-10% and reduce your timeline by 14-21 days. I recommend prioritizing this document in your next sprint.`;
    }

    // Check for submission or filing questions
    if (
      query.toLowerCase().includes('submit') ||
      query.toLowerCase().includes('file') ||
      query.toLowerCase().includes('filing')
    ) {
      return `Based on current readiness (${data.readinessScore}%), your ${playbook} submission is projected for ${data.estimatedSubmissionDate || 'approximately 3-4 months from now'}. To accelerate this timeline, focus on completing the critical missing documentation: ${data.missingSections.slice(0, 3).join(', ')}.`;
    }

    // Check for general timeline questions
    for (const [category, terms] of Object.entries(keywords)) {
      if (terms.some(term => query.toLowerCase().includes(term))) {
        return responses[mode][category];
      }
    }

    // Default response if no specific patterns are matched
    return `Based on your ${data.readinessScore}% readiness score and ${data.riskLevel.toLowerCase()} risk level for ${playbook}, I recommend focusing on the ${data.missingSections.slice(0, 3).join(', ')}. These are your highest priority items that will have the greatest impact on your regulatory timeline and success.`;
  };

  // Quick questions that users can click to ask
  const quickQuestions = [
    "What's our current readiness status?",
    'What are our highest priority documents?',
    'How can we improve our timeline?',
    'What are our biggest regulatory risks?',
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-4">Ask Lumen AI</h2>

      <div className="bg-white border border-gray-200 rounded-lg mb-4">
        {/* Chat Mode Selector */}
        <div className="border-b border-gray-200 px-4 py-2 flex flex-wrap gap-2">
          {Object.entries(modes).map(([key, { label, description }]) => (
            <button
              key={key}
              onClick={() => setActiveMode(key)}
              className={`px-3 py-1 text-xs rounded-full ${
                activeMode === key
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                  : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
              }`}
              title={description}
            >
              {label} Mode
            </button>
          ))}
        </div>

        {/* Chat Messages Area */}
        <div className="h-96 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-3/4 rounded-lg p-3 ${
                  message.role === 'assistant'
                    ? 'bg-indigo-50 text-gray-800'
                    : 'bg-blue-600 text-white'
                }`}
              >
                <div className="flex items-start mb-1">
                  <div className="rounded-full w-6 h-6 flex items-center justify-center mr-2">
                    {message.role === 'assistant' ? (
                      <Bot size={16} className="text-indigo-600" />
                    ) : (
                      <User size={16} className="text-white" />
                    )}
                  </div>
                  <span className="text-xs font-semibold">
                    {message.role === 'assistant'
                      ? `Lumen (${modes[activeMode].label} Mode)`
                      : 'You'}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="max-w-3/4 bg-indigo-50 rounded-lg p-3">
                <div className="flex space-x-1">
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
        <div className="border-t border-gray-200 p-3 flex flex-wrap gap-2">
          {quickQuestions.map((question, idx) => (
            <button
              key={idx}
              onClick={() => {
                setInput(question);
                // Auto-submit after a brief delay
                setTimeout(() => {
                  const event = new Event('submit', { cancelable: true });
                  document.getElementById('chat-form').dispatchEvent(event);
                }, 100);
              }}
              className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full"
            >
              {question}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form id="chat-form" onSubmit={handleSubmit} className="border-t border-gray-200 p-3 flex">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={`Ask about your ${playbook} strategy...`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isTyping}
            />
            <div className="absolute right-2 top-2 flex space-x-1">
              <button type="button" className="text-gray-400 hover:text-gray-600">
                <Paperclip size={16} />
              </button>
              <button
                type="button"
                onClick={() => setInput('')}
                className={`text-gray-400 hover:text-gray-600 ${!input ? 'hidden' : ''}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className={`ml-2 p-2 rounded-md ${
              !input.trim() || isTyping
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            <Send size={18} />
          </button>
        </form>
      </div>

      {/* Advisor Capabilities */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center">
        <div className="bg-indigo-50 p-3 rounded-lg">
          <h3 className="text-xs font-medium text-indigo-700 mb-1">Strategic Guidance</h3>
          <p className="text-xs text-indigo-600">
            Personalized regulatory strategy based on your submission requirements
          </p>
        </div>
        <div className="bg-indigo-50 p-3 rounded-lg">
          <h3 className="text-xs font-medium text-indigo-700 mb-1">Document Prioritization</h3>
          <p className="text-xs text-indigo-600">
            Intelligent recommendations for highest-impact documents
          </p>
        </div>
        <div className="bg-indigo-50 p-3 rounded-lg">
          <h3 className="text-xs font-medium text-indigo-700 mb-1">Timeline Optimization</h3>
          <p className="text-xs text-indigo-600">
            Accelerate submission with tailored completion schedules
          </p>
        </div>
      </div>
    </div>
  );
}
