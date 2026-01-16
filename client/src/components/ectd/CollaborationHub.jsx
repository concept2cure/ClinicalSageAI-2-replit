import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Users, MessageCircle, Circle, Send, Lock, Eye } from 'lucide-react'

// Mock Active Users
const MOCK_USERS = [
  { id: 'u1', name: 'Dr. Sarah Smith', role: 'Lead Author', status: 'online', location: 'Section 2.5', color: 'bg-blue-500' },
  { id: 'u2', name: 'James Wilson', role: 'Reviewer', status: 'online', location: 'Section 2.7.3', color: 'bg-green-500' },
  { id: 'u3', name: 'Emily Chen', role: 'Regulatory Ops', status: 'away', location: 'Viewing', color: 'bg-amber-500' },
];

// Mock Chat Messages
const MOCK_MESSAGES = [
  { id: 'm1', user: 'James Wilson', text: 'I added comments to the efficacy section.', time: '10:30 AM' },
  { id: 'm2', user: 'Dr. Sarah Smith', text: 'Thanks James, I will review them shortly.', time: '10:32 AM' },
];

export default function CollaborationHub() {
  const [users, setUsers] = useState(MOCK_USERS);
  const [messages, setMessages] = useState(MOCK_MESSAGES);
  const [newMessage, setNewMessage] = useState('');

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    const msg = {
      id: Date.now().toString(),
      user: 'You',
      text: newMessage,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages([...messages, msg]);
    setNewMessage('');
  };

  return (
    <div className="h-full flex flex-col border-l bg-white w-80 shadow-lg fixed right-0 top-0 bottom-0 z-50 transform transition-transform duration-300 ease-in-out translate-x-0">
      {/* Header */}
      <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
        <div>
          <h3 className="font-semibold flex items-center gap-2 text-slate-800">
            <Users className="h-4 w-4 text-blue-600" /> Team Hub
          </h3>
          <p className="text-xs text-slate-500">{users.filter(u => u.status === 'online').length} active now</p>
        </div>
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
          <Circle className="h-2 w-2 fill-green-500 text-green-500" /> Live
        </Badge>
      </div>

      {/* Active Users List */}
      <div className="p-4 border-b">
        <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">Active Collaborators</h4>
        <div className="space-y-3">
          {users.map(user => (
            <div key={user.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Avatar className="h-8 w-8 border-2 border-white shadow-sm">
                    <AvatarFallback className={`${user.color} text-white text-xs`}>
                      {user.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${
                    user.status === 'online' ? 'bg-green-500' : 'bg-amber-500'
                  }`} />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-800">{user.name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    {user.location === 'Viewing' ? <Eye className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {user.location}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-3 border-b bg-slate-50">
          <h4 className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-2">
            <MessageCircle className="h-3 w-3" /> Document Chat
          </h4>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex flex-col ${msg.user === 'You' ? 'items-end' : 'items-start'}`}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-medium text-slate-700">{msg.user}</span>
                  <span className="text-[10px] text-slate-400">{msg.time}</span>
                </div>
                <div className={`p-2 rounded-lg text-sm max-w-[85%] ${
                  msg.user === 'You' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-slate-100 text-slate-800 rounded-tl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        
        {/* Input Area */}
        <div className="p-3 border-t bg-white">
          <div className="flex gap-2">
            <Input 
              placeholder="Type a message..." 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              className="text-sm"
            />
            <Button size="icon" onClick={handleSendMessage} className="shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
