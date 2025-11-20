// Toast notification system upgraded to SecureToast

// CopilotDrawer.jsx - Slide-over chat UI with agent suggestions
import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '../App';
import { X, Send, CheckCircle, XCircle, MessageSquare, Lightbulb } from 'lucide-react';

export default function CopilotDrawer({ isOpen, onClose, projectId = 1 }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [activeTab, setActiveTab] = useState('chat'); // chat or suggestions
  const messagesEndRef = useRef(null);
  const ws = useRef(null);

  // Connect to WebSocket on drawer open
  useEffect(() => {
    if (isOpen && !ws.current) {
      const socket = new WebSocket(
        `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/chat`
      );

      socket.onopen = () => {
        // Send initial connection message with project context
        socket.send(
          JSON.stringify({
            conversation_id: conversationId,
            project_id: projectId,
          })
        );
      };

      socket.onmessage = event => {
        const data = JSON.parse(event.data);

        if (data.type === 'connected') {
          // Store conversation ID from server
          setConversationId(data.conversation_id);
        } else if (data.type === 'message') {
          // Append to current assistant message
          setMessages(prev => {
            const updated = [...prev];
            const assistantMessageIndex = updated.findIndex(
              m => m.role === 'assistant' && m.isIncomplete
            );

            if (assistantMessageIndex >= 0) {
              updated[assistantMessageIndex].content += data.content || '';
            } else {
              updated.push({
                role: 'assistant',
                content: data.content || '',
                timestamp: new Date().toISOString(),
                isIncomplete: true,
              });
            }

            return updated;
          });
        } else if (data.type === 'tool_call') {
          // Show tool call in UI
          useToast().showToast(`Agent is calling: ${data.tool_name}`, 'info');
        } else if (data.type === 'tool_result') {
          // Show tool result in UI
          setMessages(prev => [
            ...prev,
            {
              role: 'tool',
              toolName: data.tool_name,
              content: data.content,
              timestamp: new Date().toISOString(),
            },
          ]);
        } else if (data.type === 'done') {
          // Mark the current assistant message as complete
          setMessages(prev => {
            const updated = [...prev];
            const assistantMessageIndex = updated.findIndex(m => m.isIncomplete);

            if (assistantMessageIndex >= 0) {
              updated[assistantMessageIndex].isIncomplete = false;
            }

            return updated;
          });

          setIsLoading(false);
        } else if (data.type === 'error') {
          useToast().showToast(`Error: ${data.content}`, 'error');
          setIsLoading(false);
        }
      };

      socket.onclose = () => {
        ws.current = null;
      };

      socket.onerror = error => {
        console.error('WebSocket error:', error);
        useToast().showToast('Connection error. Please try again.', 'error');
        setIsLoading(false);
      };

      ws.current = socket;
    }

    return () => {
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
    };
  }, [isOpen, conversationId, projectId]);

  // Load suggestions when drawer opens or tab changes
  useEffect(() => {
    if (isOpen && activeTab === 'suggestions') {
      loadSuggestions();
    }
  }, [isOpen, activeTab, projectId]);

  // Scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const loadSuggestions = async () => {
    try {
      const response = await fetch(`/api/agent/suggestions?project_id=${projectId}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data);
      } else {
        throw new Error('Failed to load suggestions');
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
      useToast().showToast('Failed to load suggestions', 'error');
    }
  };

  const sendMessage = () => {
    if (!inputValue.trim() || isLoading) return;

    // Add user message to UI
    setMessages(prev => [
      ...prev,
      {
        role: 'user',
        content: inputValue,
        timestamp: new Date().toISOString(),
      },
    ]);

    // Clear input
    setInputValue('');

    // Set loading state
    setIsLoading(true);

    // Send message to server
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          message: inputValue,
          conversation_id: conversationId,
          project_id: projectId,
        })
      );
    } else {
      // Fallback to HTTP if WebSocket is not available
      fetch('/api/agent/chat/stream', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputValue,
          conversation_id: conversationId,
          project_id: projectId,
        }),
      })
        .then(response => {
          if (!response.ok) {
            throw new Error('Network response was not ok');
          }
          // Handle streaming response
          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          function readStream() {
            reader
              .read()
              .then(({ done, value }) => {
                if (done) {
                  setIsLoading(false);
                  return;
                }

                const chunk = decoder.decode(value);
                // Parse SSE format
                const lines = chunk.split('\n\n');
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));

                    // Process in same way as WebSocket
                    if (data.type === 'message') {
                      setMessages(prev => {
                        const updated = [...prev];
                        const assistantMessageIndex = updated.findIndex(
                          m => m.role === 'assistant' && m.isIncomplete
                        );

                        if (assistantMessageIndex >= 0) {
                          updated[assistantMessageIndex].content += data.content || '';
                        } else {
                          updated.push({
                            role: 'assistant',
                            content: data.content || '',
                            timestamp: new Date().toISOString(),
                            isIncomplete: true,
                          });
                        }

                        return updated;
                      });
                    } else if (data.type === 'end') {
                      setIsLoading(false);
                      setMessages(prev => {
                        const updated = [...prev];
                        const assistantMessageIndex = updated.findIndex(m => m.isIncomplete);

                        if (assistantMessageIndex >= 0) {
                          updated[assistantMessageIndex].isIncomplete = false;
                        }

                        return updated;
                      });
                    }
                  }
                }

                readStream();
              })
              .catch(error => {
                console.error('Error reading stream:', error);
                useToast().showToast('Error reading response', 'error');
                setIsLoading(false);
              });
          }

          readStream();
        })
        .catch(error => {
          console.error('Error sending message:', error);
          useToast().showToast('Failed to send message', 'error');
          setIsLoading(false);
        });
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const executeSuggestion = async suggestion => {
    if (!suggestion.action) {
      useToast().showToast('This suggestion has no executable action', 'error');
      return;
    }

    try {
      // Send execute request
      const response = await fetch(
        `/api/agent/suggestions/execute/${suggestion.id}?project_id=${projectId}`,
        {
          method: 'POST',
        }
      );

      if (response.ok) {
        useToast().showToast('Action executed successfully', 'success');
        // Update suggestion status
        updateSuggestion(suggestion.id, 'accepted');
      } else {
        throw new Error('Failed to execute action');
      }
    } catch (error) {
      console.error('Error executing suggestion:', error);
      useToast().showToast('Failed to execute action', 'error');
    }
  };

  const updateSuggestion = async (id, status) => {
    try {
      const response = await fetch(`/api/agent/suggestions/${id}/status?project_id=${projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        // Update local state
        setSuggestions(prev => prev.map(s => (s.id === id ? { ...s, status } : s)));
      } else {
        throw new Error('Failed to update suggestion');
      }
    } catch (error) {
      console.error('Error updating suggestion:', error);
      useToast().showToast('Failed to update suggestion', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="position-fixed top-0 end-0 h-100 border-start shadow"
      style={{ width: '400px', zIndex: 1050, background: '#fff' }}
    >
      {/* Header */}
      <div className="p-3 border-bottom d-flex justify-content-between align-items-center">
        <h5 className="m-0">IND Copilot</h5>
        <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="nav nav-tabs">
        <button
          className={`nav-link ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={16} className="me-1" />
          Chat
        </button>
        <button
          className={`nav-link ${activeTab === 'suggestions' ? 'active' : ''}`}
          onClick={() => setActiveTab('suggestions')}
        >
          <Lightbulb size={16} className="me-1" />
          Suggestions
        </button>
      </div>

      {/* Content */}
      <div className="h-100 d-flex flex-column" style={{ maxHeight: 'calc(100% - 110px)' }}>
        {activeTab === 'chat' ? (
          <>
            {/* Messages */}
            <div className="flex-grow-1 overflow-auto p-3">
              {messages.map((message, index) => (
                <div key={index} className={`mb-3 ${message.role === 'user' ? 'text-end' : ''}`}>
                  <div
                    className={`d-inline-block p-3 rounded ${
                      message.role === 'user'
                        ? 'bg-primary text-white'
                        : message.role === 'tool'
                          ? 'bg-light border'
                          : 'bg-light border'
                    }`}
                    style={{ maxWidth: '80%', textAlign: 'left' }}
                  >
                    {message.role === 'tool' && (
                      <div className="mb-1 text-muted small">Tool: {message.toolName}</div>
                    )}
                    <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="text-center my-2">
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-top p-3">
              <div className="input-group">
                <textarea
                  className="form-control"
                  placeholder="Ask a question..."
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  rows={2}
                />
                <button
                  className="btn btn-primary"
                  onClick={sendMessage}
                  disabled={!inputValue.trim() || isLoading}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Suggestions */}
            <div className="flex-grow-1 overflow-auto p-3">
              {suggestions.length === 0 ? (
                <div className="text-center p-4 text-muted">
                  <Lightbulb size={24} className="mb-2" />
                  <p>No suggestions available</p>
                  <button className="btn btn-sm btn-outline-primary" onClick={loadSuggestions}>
                    Generate Suggestions
                  </button>
                </div>
              ) : (
                suggestions.map(suggestion => (
                  <div key={suggestion.id || Math.random()} className="card mb-3">
                    <div className="card-body">
                      <p className="card-text">{suggestion.text}</p>
                      {suggestion.status === 'pending' && (
                        <div className="d-flex gap-2">
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => executeSuggestion(suggestion)}
                            disabled={!suggestion.action}
                          >
                            Apply
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => updateSuggestion(suggestion.id, 'rejected')}
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                      {suggestion.status === 'accepted' && (
                        <span className="badge bg-success">
                          <CheckCircle size={12} className="me-1" />
                          Applied
                        </span>
                      )}
                      {suggestion.status === 'rejected' && (
                        <span className="badge bg-secondary">
                          <XCircle size={12} className="me-1" />
                          Dismissed
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
