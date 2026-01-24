import React, { useState } from 'react';
import { Sparkles, X, Volume2, Mic, BrainCircuit, Send } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * CMC CoPilot Component
 *
 * An intelligent assistant specifically for Chemistry, Manufacturing & Controls (CMC)
 * that provides contextual guidance, automations, and regulatory insights.
 */
const CMCCopilot = ({ open = false, onClose }) => {
  const [isOpen, setIsOpen] = useState(open);
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState([
    {
      type: 'system',
      content:
        "Hello! I'm your CMC CoPilot. I can help with everything from molecular structure analysis to regulatory submission preparation. What can I assist you with today?",
    },
  ]);

  // Toggle the CoPilot panel
  const togglePanel = () => {
    setIsOpen(!isOpen);
    if (onClose && !isOpen) {
      onClose();
    }
  };

  // Handle form submission
  const handleSubmit = e => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    // Add user message
    setMessages([...messages, { type: 'user', content: inputValue }]);

    // Simulate AI response
    setTimeout(() => {
      let response;

      if (
        inputValue.toLowerCase().includes('validation') ||
        inputValue.toLowerCase().includes('gap') ||
        inputValue.toLowerCase().includes('pmda')
      ) {
        response =
          'I found 3 critical validation gaps for the PMDA submission: (1) Missing stability data for drug product, (2) Incomplete process validation for Batch #247, (3) Required PMDA-specific documents not submitted.';
      } else if (
        inputValue.toLowerCase().includes('draft') ||
        inputValue.toLowerCase().includes('generate') ||
        inputValue.toLowerCase().includes('write')
      ) {
        response =
          "I can help draft that section. Based on your molecular structure and process parameters, I've generated a compliant draft for Module 3.2.S.4.1. Would you like me to show it or make any specific adjustments?";
      } else if (
        inputValue.toLowerCase().includes('search') ||
        inputValue.toLowerCase().includes('find') ||
        inputValue.toLowerCase().includes('where')
      ) {
        response =
          "I've searched across your CMC documentation and found 4 relevant files discussing that topic. The most recent version appears in 'Module3_3.2.P.3_Manufacturing_v2.docx' updated 3 days ago.";
      } else {
        response =
          "I understand you're asking about " +
          inputValue.split(' ').slice(0, 3).join(' ') +
          "...\n\nTo provide the most accurate response, I'll need to analyze your CMC data. Would you like me to proceed with a deeper analysis or do you need clarification on a specific regulatory aspect?";
      }

      setMessages(prev => [...prev, { type: 'assistant', content: response }]);
    }, 1000);

    // Clear input
    setInputValue('');
  };

  // Toggle voice input
  const toggleVoiceInput = () => {
    setIsListening(!isListening);

    if (!isListening) {
      // Simulate voice recognition after 2 seconds
      setTimeout(() => {
        setInputValue('Summarize all validation gaps before our PMDA submission');
        setIsListening(false);
      }, 2000);
    }
  };

  // Render floating button when closed
  if (!isOpen) {
    return (
      <Button
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-amber-500 hover:bg-amber-600 text-white p-0 flex items-center justify-center"
        onClick={togglePanel}
      >
        <BrainCircuit size={24} />
      </Button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 z-50">
      <Card className="border-amber-200 shadow-xl">
        <CardHeader className="pb-2 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <Sparkles className="h-5 w-5 mr-2 text-amber-600" />
              <CardTitle className="text-lg font-medium text-amber-800">CMC CoPilot™</CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={togglePanel} className="h-8 w-8">
              <X size={16} />
            </Button>
          </div>
          <CardDescription className="text-amber-700">
            Your 24/7 Intelligent Partner
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 max-h-80 overflow-y-auto bg-white">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.type === 'user'
                      ? 'bg-amber-500 text-white'
                      : message.type === 'system'
                        ? 'bg-gray-100 text-gray-800 border border-gray-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  <p className="text-sm whitespace-pre-line">{message.content}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>

        <CardFooter className="p-3 border-t border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50">
          <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`flex-shrink-0 ${isListening ? 'text-red-500 bg-red-50' : 'text-amber-600'}`}
              onClick={toggleVoiceInput}
            >
              <Mic size={18} />
            </Button>

            <div className="relative flex-1">
              <Input
                placeholder="Ask CMC CoPilot..."
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                className="pr-10 border-amber-200 focus:border-amber-400 bg-white"
              />
              {isListening && (
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <span className="flex space-x-1">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse delay-100"></span>
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse delay-200"></span>
                  </span>
                </span>
              )}
            </div>

            <Button
              type="submit"
              size="icon"
              className="flex-shrink-0 bg-amber-500 hover:bg-amber-600"
            >
              <Send size={18} />
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
};

export default CMCCopilot;
