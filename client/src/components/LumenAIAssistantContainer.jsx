import React, { useState } from 'react';

const LumenAIAssistantContainer = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');

  const sendMessage = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    const userMessage = { role: 'user', content: input };
    setMessages([...messages, userMessage]);
    setInput('');

    try {
      const res = await fetch('/api/assistant/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, mode: 'pm', documentSection: '' }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '⚠️ Error contacting assistant.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = event => {
    const file = event.target.files[0];
    setSelectedFile(file);
    if (file) {
      setUploadStatus(`Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      setUploadStatus('❌ No file selected');
      return;
    }

    setUploadStatus('📤 Uploading...');
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setUploadStatus('✅ File uploaded and analyzed!');
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `📁 **File Analysis: "${result.file.originalName}"**\n\n${result.analysis}\n\n*File uploaded successfully and is now available for further discussion.*`,
          },
        ]);
        setSelectedFile(null);
      } else {
        setUploadStatus(`❌ Upload failed: ${result.error}`);
      }
    } catch (error) {
      setUploadStatus('⚠️ Error uploading file');
      console.error('Upload error:', error);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        fontFamily: '"Poppins", Arial, sans-serif',
        backgroundColor: '#ffffff',
      }}
    >
      {/* Left Panel - Chat Interface */}
      <div
        style={{
          width: '50%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #e5e7eb',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#0B6E4F',
            }}
          >
            AnA v1.0 — RI Co-pilot
          </h2>
          <p
            style={{
              margin: '0.25rem 0 0 0',
              fontSize: '0.875rem',
              color: '#6b7280',
            }}
          >
            Coding & Regulatory Assistant
          </p>
        </div>

        {/* Messages Area */}
        <div
          style={{
            flex: 1,
            padding: '1rem',
            overflowY: 'auto',
            backgroundColor: '#ffffff',
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                color: '#9ca3af',
                marginTop: '2rem',
                fontSize: '0.875rem',
              }}
            >
              <p>👋 Welcome! Ask me anything about coding or regulatory matters.</p>
              <p style={{ marginTop: '0.5rem' }}>
                Upload documents for analysis or start a conversation.
              </p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  backgroundColor: msg.role === 'user' ? '#f3f4f6' : '#f0f9ff',
                  border: msg.role === 'user' ? '1px solid #e5e7eb' : '1px solid #bae6fd',
                }}
              >
                <div
                  style={{
                    fontWeight: '600',
                    fontSize: '0.875rem',
                    color: msg.role === 'user' ? '#374151' : '#0369a1',
                    marginBottom: '0.5rem',
                  }}
                >
                  {msg.role === 'user' ? '👤 You' : '🤖 Assistant'}
                </div>
                <div
                  style={{
                    fontSize: '0.875rem',
                    lineHeight: '1.5',
                    color: '#374151',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div
              style={{
                padding: '1rem',
                textAlign: 'center',
                color: '#6b7280',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ display: 'inline-block' }}>🤖 Assistant is thinking...</div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div
          style={{
            padding: '1rem',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
          }}
        >
          {/* File Upload Section */}
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              backgroundColor: '#ffffff',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
            }}
          >
            <div
              style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                marginBottom: '0.5rem',
                color: '#374151',
              }}
            >
              📎 Upload Document
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls"
                style={{
                  fontSize: '0.75rem',
                  flex: 1,
                }}
              />
              <button
                onClick={handleFileUpload}
                disabled={!selectedFile}
                style={{
                  padding: '0.375rem 0.75rem',
                  backgroundColor: selectedFile ? '#0B6E4F' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  cursor: selectedFile ? 'pointer' : 'not-allowed',
                  transition: 'background-color 0.2s',
                }}
              >
                Upload
              </button>
            </div>
            {uploadStatus && (
              <div
                style={{
                  fontSize: '0.75rem',
                  color: '#6b7280',
                  marginTop: '0.5rem',
                }}
              >
                {uploadStatus}
              </div>
            )}
          </div>

          {/* Message Input */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              style={{
                flex: 1,
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              placeholder="Ask something or upload a document..."
              onFocus={e => (e.target.style.borderColor = '#0B6E4F')}
              onBlur={e => (e.target.style.borderColor = '#d1d5db')}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: isLoading || !input.trim() ? '#9ca3af' : '#0B6E4F',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              {isLoading ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel - Real-time Output */}
      <div
        style={{
          width: '50%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#f8fafc',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: '1rem',
              fontWeight: '600',
              color: '#374151',
            }}
          >
            📊 Real-time Output
          </h3>
          <p
            style={{
              margin: '0.25rem 0 0 0',
              fontSize: '0.75rem',
              color: '#6b7280',
            }}
          >
            Code previews, analysis results, and AI outputs
          </p>
        </div>

        {/* Content Area */}
        <div
          style={{
            flex: 1,
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              textAlign: 'center',
              maxWidth: '300px',
            }}
          >
            <div
              style={{
                fontSize: '3rem',
                marginBottom: '1rem',
              }}
            >
              🚀
            </div>
            <h4
              style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '0.5rem',
              }}
            >
              Ready for Action
            </h4>
            <p
              style={{
                fontSize: '0.875rem',
                color: '#6b7280',
                lineHeight: '1.5',
                marginBottom: '1rem',
              }}
            >
              This panel will show:
            </p>
            <ul
              style={{
                fontSize: '0.8rem',
                color: '#6b7280',
                textAlign: 'left',
                lineHeight: '1.6',
                margin: 0,
                paddingLeft: '1.25rem',
              }}
            >
              <li>🔍 Document analysis results</li>
              <li>💻 Generated code previews</li>
              <li>📋 Task lists and workflows</li>
              <li>📊 Data visualizations</li>
              <li>⚡ Live AI suggestions</li>
            </ul>
          </div>
        </div>

        {/* Status Bar */}
        <div
          style={{
            padding: '0.75rem 1rem',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
            fontSize: '0.75rem',
            color: '#6b7280',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>🟢 Connected</span>
          <span>Ready for commands</span>
        </div>
      </div>
    </div>
  );
};

export default LumenAIAssistantContainer;
