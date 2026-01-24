import React, { useState } from 'react';
import { Sparkles, X, Send, Bot, MessageSquare, ChevronRight, ExternalLink } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

/**
 * Lument ASSISTANT Component
 *
 * An AI assistant that provides context-aware help for regulatory documents and workflows.
 * This component can be used in both a collapsed sidebar mode and an expanded full view mode.
 */
const LumentAssistant = ({ context = {}, active = false }) => {
  const [isExpanded, setIsExpanded] = useState(active);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState([
    {
      type: 'system',
      content:
        "I'm Lument ASSISTANT, your regulatory AI guide. I can help with document creation, regulatory requirements, and workflow guidance. How can I assist you today?",
    },
  ]);

  // Toggle expanded view
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Handle form submission
  const handleSubmit = e => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    // Add user message
    setMessages([...messages, { type: 'user', content: inputValue }]);

    // Simulate AI response based on context and query
    setTimeout(() => {
      let response;

      // Generate contextual responses based on the active module and query
      if (context.module === 'cer2v' || inputValue.toLowerCase().includes('cer')) {
        response =
          'I can help with your Clinical Evaluation Report (CER). For CER generation, I recommend including sections on state of the art, clinical data evaluation, and risk-benefit analysis. Would you like me to help draft a specific section?';
      } else if (context.module === 'ind-wizard' || inputValue.toLowerCase().includes('ind')) {
        response =
          "For your IND application, make sure you've addressed all the required components in Modules 1-5. Looking at your current progress, Module 3 (CMC) seems to need additional attention. Would you like me to outline what's missing?";
      } else if (context.module === 'cmc-module' || inputValue.toLowerCase().includes('cmc')) {
        response =
          "For CMC documentation, ensure you've included details on manufacturing process, control strategy, and stability data. The latest FDA guidance requires additional controls for impurities above 0.1%. Would you like more detailed guidance?";
      } else if (context.module === 'reports' || inputValue.toLowerCase().includes('report')) {
        response =
          'I can help generate various regulatory reports. Based on your recent activities, you might need a trend analysis report for adverse events or a periodic safety update report. What type of report are you looking to create?';
      } else if (
        inputValue.toLowerCase().includes('requirements') ||
        inputValue.toLowerCase().includes('regulation')
      ) {
        response =
          'Current regulatory requirements for your product category include GMP compliance, post-market surveillance, and periodic safety reporting. The EU MDR has additional requirements for certain device classes. Would you like details on a specific regulation?';
      } else {
        response =
          "I understand you're asking about " +
          inputValue.split(' ').slice(0, 3).join(' ') +
          '...\n\nBased on your current context and recent activities, I can provide guidance on regulatory documentation, submission strategies, or compliance requirements. Could you specify which aspect you need help with?';
      }

      setMessages(prev => [...prev, { type: 'assistant', content: response }]);
    }, 1000);

    // Clear input
    setInputValue('');
  };

  // Render in collapsed side panel mode
  if (!isExpanded) {
    return (
      <Card className="border-indigo-200">
        <CardHeader className="pb-2 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <Sparkles className="h-5 w-5 mr-2 text-indigo-600" />
              <CardTitle className="text-lg font-medium text-indigo-800">
                Lument ASSISTANT
              </CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={toggleExpanded}>
              <ChevronRight size={16} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-sm text-gray-600 mb-4">
            Ask me anything about regulatory requirements, document creation, or workflow guidance.
          </p>
          <Button
            variant="outline"
            className="w-full justify-start text-indigo-600 border-indigo-200 hover:bg-indigo-50"
            onClick={toggleExpanded}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Start a conversation
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Render in expanded full view mode
  return (
    <Card className="border-indigo-200 shadow-lg">
      <CardHeader className="pb-2 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Sparkles className="h-5 w-5 mr-2 text-indigo-600" />
            <CardTitle className="text-lg font-medium text-indigo-800">Lument ASSISTANT</CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={toggleExpanded} className="h-8 w-8">
            <X size={16} />
          </Button>
        </div>
        <CardDescription className="text-indigo-700">
          Your AI-powered regulatory guidance assistant
        </CardDescription>
      </CardHeader>

      <ScrollArea className="h-[400px] p-4 bg-white">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.type !== 'user' && (
                <Avatar className="h-8 w-8 mr-2">
                  <AvatarImage src="/avatars/ai-assistant.png" />
                  <AvatarFallback className="bg-indigo-100 text-indigo-800">AI</AvatarFallback>
                </Avatar>
              )}

              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.type === 'user'
                    ? 'bg-indigo-500 text-white'
                    : message.type === 'system'
                      ? 'bg-gray-100 text-gray-800 border border-gray-200'
                      : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                }`}
              >
                <p className="text-sm whitespace-pre-line">{message.content}</p>

                {/* Contextual buttons for assistant messages */}
                {message.type === 'assistant' && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge
                      variant="outline"
                      className="bg-white text-indigo-700 cursor-pointer hover:bg-indigo-50"
                      onClick={() => setInputValue('Tell me more about this topic')}
                    >
                      Tell me more
                    </Badge>
                    <Badge
                      variant="outline"
                      className="bg-white text-indigo-700 cursor-pointer hover:bg-indigo-50"
                      onClick={() => setInputValue('What are best practices for this?')}
                    >
                      Best practices
                    </Badge>
                    <Badge
                      variant="outline"
                      className="bg-white text-indigo-700 cursor-pointer hover:bg-indigo-50"
                      onClick={() => setInputValue('Show regulatory references')}
                    >
                      Regulatory references
                    </Badge>
                  </div>
                )}
              </div>

              {message.type === 'user' && (
                <Avatar className="h-8 w-8 ml-2">
                  <AvatarImage src="/avatars/user.png" />
                  <AvatarFallback>JD</AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <CardFooter className="p-3 border-t border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50">
        <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
          <Input
            placeholder="Ask Lument ASSISTANT..."
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            className="flex-1 border-indigo-200 focus:border-indigo-400"
          />
          <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
            <Send size={16} className="mr-2" />
            Send
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
};

export default LumentAssistant;
