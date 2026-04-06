import React, { useState, useRef, useEffect } from 'react';
import { cerApiService } from '@/services/CerAPIService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/toaster';
import { MessageSquare, Send, X, RefreshCw, Sparkles, FileText, AlertCircle } from 'lucide-react';

/**
 * CER Assistant Panel
 *
 * A knowledge-aware assistant that can answer questions about regulatory requirements,
 * CER content, and provide guidance based on the current report state.
 */
export default function CerAssistantPanel({
 sections = [],
 title = 'Clinical Evaluation Report',
 faers = [],
}) {
 const [messages, setMessages] = useState([
 {
 role: 'assistant',
 content:
 'Hello! I am your CER Assistant. Ask me any questions about your Clinical Evaluation Report, regulatory requirements, or how to improve your documentation. I can also explain FAERS data or help interpret compliance results.',
 },
 ]);

 const [userInput, setUserInput] = useState('');
 const [isLoading, setIsLoading] = useState(false);
 const [selectedSection, setSelectedSection] = useState(null);
 const messagesEndRef = useRef(null);
 const { toast } = useToast();

 // Scroll to bottom of messages when new messages are added
 useEffect(() => {
 if (messagesEndRef.current) {
 messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
 }
 }, [messages]);

 const handleSendMessage = async () => {
 if (!userInput.trim()) return;

 // Add the user's message to the chat
 const userMessage = { role: 'user', content: userInput };
 setMessages(prev => [...prev, userMessage]);
 setUserInput('');
 setIsLoading(true);

 try {
 // Prepare context for the AI
 const context = {
 sections,
 title,
 faers,
 selectedSection,
 };

 // Send the message to the API
 const response = await cerApiService.askCerAssistant({
 question: userInput,
 context,
 });

 // Format and add the assistant's response
 let assistantContent = response.response || 'I encountered an issue processing your request.';

 // Add suggestions if available
 if (response.suggestions && response.suggestions.length > 0) {
 assistantContent += '\n\n**Suggested questions:**';
 response.suggestions.forEach(suggestion => {
 assistantContent += `\n- ${suggestion}`;
 });
 }

 setMessages(prev => [...prev, { role: 'assistant', content: assistantContent }]);
 } catch (error) {
 console.error('Error getting assistant response:', error);
 setMessages(prev => [
 ...prev,
 {
 role: 'assistant',
 content:
 'Sorry, I encountered an error while processing your request. Please try again later.',
 error: true,
 },
 ]);

 toast({
 title: 'Assistant Error',
 description: error.message || 'Failed to get a response from the assistant',
 variant: 'destructive',
 });
 } finally {
 setIsLoading(false);
 }
 };

 const handleKeyPress = e => {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 handleSendMessage();
 }
 };

 const clearChat = () => {
 setMessages([
 {
 role: 'assistant',
 content: 'Chat cleared. How else can I assist you with your Clinical Evaluation Report?',
 },
 ]);
 };

 return (
 <div className="space-y-4">
 {/* Main Chat Panel */}
 <div className="flex flex-col h-[calc(100vh-220px)] md:h-[calc(100vh-210px)] bg-white rounded border border-[#e8e6dc]">
 {/* Header */}
 <div className="flex justify-between items-center p-3 border-b border-[#e8e6dc]">
 <div className="flex items-center">
 <MessageSquare className="h-5 w-5 mr-2 text-[#292524]" />
 <h3 className="text-base font-semibold text-[#141413]">CER Regulatory Assistant</h3>
 </div>
 <Button
 variant="ghost"
 size="sm"
 onClick={clearChat}
 className="text-[#616161] hover:text-[#141413] hover:bg-[#F5F5F5]"
 >
 <X className="h-4 w-4 mr-1" />
 <span className="text-xs">Clear Chat</span>
 </Button>
 </div>

 {/* Messages */}
 <div className="flex-1 overflow-y-auto p-4 space-y-4">
 {messages.map((message, index) => (
 <div
 key={index}
 className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
 >
 <div
 className={`max-w-[80%] rounded-lg p-3 ${
 message.role === 'user'
 ? 'bg-[#faf0ec] text-[#141413]'
 : message.error
 ? 'bg-[#FDE7E9] text-[#141413] border border-[#1c1917]'
 : 'bg-[#F5F5F5] text-[#141413]'
 }`}
 >
 {message.role === 'assistant' && !message.error && (
 <div className="flex items-center mb-1">
 <Sparkles className="h-3.5 w-3.5 text-[#292524] mr-1.5" />
 <span className="text-xs font-medium text-[#292524]">CER Assistant</span>
 </div>
 )}

 {message.role === 'assistant' && message.error && (
 <div className="flex items-center mb-1">
 <AlertCircle className="h-3.5 w-3.5 text-[#1c1917] mr-1.5" />
 <span className="text-xs font-medium text-[#1c1917]">Error</span>
 </div>
 )}

 <div className="whitespace-pre-wrap text-sm">
 {message.content.split('\n\n').map((paragraph, i) => (
 <p key={i} className={i > 0 ? 'mt-2' : ''}>
 {paragraph.startsWith('**') && paragraph.includes(':**') ? (
 <>
 <span className="font-medium">
 {paragraph.split(':**')[0].replace('**', '')}
 </span>
 <span>:{paragraph.split(':**')[1]}</span>
 </>
 ) : paragraph.startsWith('- ') ? (
 <div className="pl-4 -mt-0.5 italic text-xs text-[#616161]">
 {paragraph}
 </div>
 ) : (
 paragraph
 )}
 </p>
 ))}
 </div>
 </div>
 </div>
 ))}
 <div ref={messagesEndRef} />
 </div>

 {/* Input */}
 <div className="border-t border-[#e8e6dc] p-3">
 <div className="flex space-x-2">
 <Input
 value={userInput}
 onChange={e => setUserInput(e.target.value)}
 onKeyDown={handleKeyPress}
 placeholder="Ask about regulatory requirements, CER content, or get guidance..."
 className="flex-1 border-[#e8e6dc] bg-white"
 disabled={isLoading}
 />
 <Button
 onClick={handleSendMessage}
 disabled={!userInput.trim() || isLoading}
 className="bg-[#292524] hover:bg-[#1c1917] text-white"
 >
 {isLoading ? (
 <RefreshCw className="h-4 w-4 animate-spin" />
 ) : (
 <Send className="h-4 w-4" />
 )}
 </Button>
 </div>
 </div>
 </div>

 {/* Context Panel */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <Card className="bg-white border-[#e8e6dc]">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium text-[#141413] flex items-center">
 <FileText className="h-4 w-4 mr-1.5 text-[#292524]" />
 Document Context
 </CardTitle>
 <CardDescription className="text-xs text-[#616161]">
 The assistant is aware of your report content
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="text-xs text-[#616161]">
 <div className="mb-1">
 <span className="font-medium">Title:</span> {title}
 </div>
 <div className="mb-1">
 <span className="font-medium">Sections:</span> {sections.length}
 </div>
 {sections.length > 0 && (
 <div className="mt-2">
 <div className="font-medium mb-1">Available sections:</div>
 <div className="max-h-24 overflow-y-auto">
 {sections.map((section, index) => (
 <div key={index} className="text-xs mb-0.5 truncate">
 - {section.title}
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 </CardContent>
 </Card>

 <Card className="bg-white border-[#e8e6dc]">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium text-[#141413]">
 Regulatory Knowledge
 </CardTitle>
 <CardDescription className="text-xs text-[#616161]">
 Standards and guidelines available
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="text-xs space-y-1 text-[#616161]">
 <div>• EU MDR (2017/745)</div>
 <div>• ISO 14155:2020</div>
 <div>• FDA 21 CFR 812</div>
 <div>• MDR Guidance MDCG 2020-13</div>
 <div>• MEDDEV 2.7/1 Rev 4</div>
 <div>• FDA Guidance Documents</div>
 </div>
 </CardContent>
 </Card>

 <Card className="bg-white border-[#e8e6dc]">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium text-[#141413]">Suggested Topics</CardTitle>
 <CardDescription className="text-xs text-[#616161]">
 Try asking about these topics
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="text-xs text-[#616161] space-y-2">
 <div
 className="p-1.5 bg-[#faf0ec] text-[#292524] rounded cursor-pointer hover:bg-[#faf0ec]"
 onClick={() => {
 setUserInput('What information should a state-of-the-art section contain?');
 }}
 >
 State-of-the-art requirements
 </div>
 <div
 className="p-1.5 bg-[#faf0ec] text-[#292524] rounded cursor-pointer hover:bg-[#faf0ec]"
 onClick={() => {
 setUserInput('How should I interpret FAERS data in my CER?');
 }}
 >
 Interpreting FAERS data
 </div>
 <div
 className="p-1.5 bg-[#faf0ec] text-[#292524] rounded cursor-pointer hover:bg-[#faf0ec]"
 onClick={() => {
 setUserInput('What benefit-risk section requirements are in EU MDR?');
 }}
 >
 Benefit-risk analysis
 </div>
 </div>
 </CardContent>
 </Card>
 </div>
 </div>
 );
}
