import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Enterprise Vault™ AI Assistant Component
 *
 * A sophisticated AI concierge for TrialSage Vault™ that provides
 * intelligent conversations about clinical document management,
 * regulatory compliance, and AI-powered features.
 */
export default function VaultAssistant() {
  // Core assistant state
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [collectContact, setCollectContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    company: '',
  });

  // Refs
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Initialize with welcome message
  useEffect(() => {
    const initialMessage = {
      role: 'assistant',
      content:
        '👋 Welcome to TrialSage Vault™ — your intelligent Clinical Document System. How can I help you today?',
    };
    setMessages([initialMessage]);

    // Initial suggestions
    setSuggestions([
      'Tell me about TrialSage Vault™',
      'How does AI tagging work?',
      'What makes Vault better than Veeva?',
      'Tell me about compliance features',
    ]);

    // Auto-open assistant after a short delay
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input when assistant opens
  useEffect(() => {
    if (isOpen && inputRef.current && !collectContact) {
      inputRef.current.focus();
    }
  }, [isOpen, collectContact]);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Submit user message
  const handleSendMessage = async (messageText = input) => {
    if (!messageText.trim()) return;

    // Add user message to state
    const userMessage = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Show typing indicator
    setIsTyping(true);

    try {
      // Call API
      const response = await axios.post('/api/vault-assistant', {
        message: messageText,
        sessionId,
      });

      // Add assistant response
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: response.data.message,
        },
      ]);

      // Update state with response data
      setSessionId(response.data.sessionId);
      setSuggestions(response.data.suggestions || []);
      setCollectContact(response.data.collectContact || false);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content:
            "I apologize, but I'm having trouble connecting to my knowledge base. Please try again in a moment.",
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = suggestion => {
    handleSendMessage(suggestion);
  };

  // Handle contact form submission
  const handleContactSubmit = async e => {
    e.preventDefault();

    // Validate form
    if (!contactForm.email || !contactForm.name) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content:
            'Please provide at least your name and email so we can contact you about the demo.',
        },
      ]);
      return;
    }

    // Show typing indicator
    setIsTyping(true);

    try {
      // Submit demo request
      const response = await axios.post('/api/vault-assistant/request-demo', {
        ...contactForm,
        sessionId,
      });

      // Add confirmation message
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: response.data.message,
        },
      ]);

      // Reset contact state
      setCollectContact(false);
      setSuggestions([
        'Tell me more about Vault features',
        'How quickly can we implement Vault?',
        'What security measures does Vault have?',
      ]);
    } catch (error) {
      console.error('Error submitting demo request:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content:
            'I apologize, but there was an issue processing your demo request. Please try again or contact us directly at sales@trialsage.com.',
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // Handle form input changes
  const handleFormChange = e => {
    const { name, value } = e.target;
    setContactForm(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  // Animation variants
  const containerVariants = {
    open: {
      opacity: 1,
      height: 'auto',
      width: 380,
      transition: { duration: 0.3 },
    },
    closed: {
      opacity: 0,
      height: 0,
      width: 0,
      transition: { duration: 0.3 },
    },
    icon: {
      opacity: 1,
      height: 60,
      width: 60,
      transition: { duration: 0.3 },
    },
  };

  const messageVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    exit: { opacity: 0, transition: { duration: 0.2 } },
  };

  // Render message content with links
  const renderMessageContent = content => {
    // Replace URLs with clickable links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return content.split(urlRegex).map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Main Assistant Container */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={containerVariants}
            initial="closed"
            animate="open"
            exit="closed"
            className="bg-white rounded-lg shadow-xl overflow-hidden flex flex-col border border-gray-200 max-h-[80vh]"
            style={{ width: 380 }}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-green-700 to-green-600 px-4 py-3 flex justify-between items-center">
              <div className="flex items-center">
                <div className="bg-white rounded-full p-1 mr-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-green-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-medium text-sm">Vault™ Assistant</h3>
                  <p className="text-green-100 text-xs">Clinical Document AI</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-white hover:text-green-200">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              <AnimatePresence>
                {messages.map((message, index) => (
                  <motion.div
                    key={index}
                    variants={messageVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className={`mb-4 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        message.role === 'user'
                          ? 'bg-green-600 text-white'
                          : 'bg-white shadow-sm border border-gray-200'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">
                        {renderMessageContent(message.content)}
                      </p>
                    </div>
                  </motion.div>
                ))}

                {/* Typing indicator */}
                {isTyping && (
                  <motion.div
                    variants={messageVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="flex justify-start mb-4"
                  >
                    <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-4 max-w-[80%]">
                      <div className="flex space-x-1">
                        <div
                          className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                          style={{ animationDelay: '0ms' }}
                        ></div>
                        <div
                          className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                          style={{ animationDelay: '150ms' }}
                        ></div>
                        <div
                          className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                          style={{ animationDelay: '300ms' }}
                        ></div>
                      </div>
                    </div>
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </AnimatePresence>
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="border-t border-gray-200 px-4 py-2 bg-white flex flex-wrap gap-2">
                {suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    className="text-xs bg-gray-100 hover:bg-gray-200 rounded-full px-3 py-1 text-gray-700 whitespace-nowrap transition"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* Input or Contact Form */}
            {collectContact ? (
              <form
                onSubmit={handleContactSubmit}
                className="border-t border-gray-200 p-4 bg-white"
              >
                <h4 className="font-medium text-sm mb-2">Request a Demo</h4>
                <p className="text-xs text-gray-500 mb-3">
                  Please provide your contact information to schedule a personalized demo.
                </p>

                <div className="space-y-3">
                  <div>
                    <label htmlFor="name" className="block text-xs font-medium text-gray-700 mb-1">
                      Name*
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={contactForm.name}
                      onChange={handleFormChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                      placeholder="Jane Smith"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-xs font-medium text-gray-700 mb-1">
                      Email*
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={contactForm.email}
                      onChange={handleFormChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                      placeholder="jane.smith@company.com"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="company"
                      className="block text-xs font-medium text-gray-700 mb-1"
                    >
                      Company
                    </label>
                    <input
                      type="text"
                      id="company"
                      name="company"
                      value={contactForm.company}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                      placeholder="Biotech Inc."
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-green-600 text-white font-medium py-2 rounded-md hover:bg-green-700 transition mt-2"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            ) : (
              <div className="border-t border-gray-200 p-3 bg-white flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  placeholder="Ask me about Vault™..."
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleSendMessage();
                    }
                  }}
                />
                <button
                  onClick={() => handleSendMessage()}
                  className="bg-green-600 text-white p-2 rounded-md hover:bg-green-700 transition"
                  aria-label="Send message"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                  </svg>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Button (only visible when chat is closed) */}
      {!isOpen && (
        <motion.button
          variants={containerVariants}
          initial="icon"
          animate="icon"
          className="bg-green-600 text-white rounded-full p-4 shadow-lg hover:bg-green-700 transition flex items-center justify-center"
          onClick={() => setIsOpen(true)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </motion.button>
      )}
    </div>
  );
}
