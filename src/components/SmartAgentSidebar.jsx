import React, { useState } from 'react';
import './SmartAgentSidebar.css';

function SmartAgentSidebar() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('pm');
  const [sectionText, setSectionText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    const userMessage = { role: 'user', content: input };
    setMessages([...messages, userMessage]);
    setInput('');

    const res = await fetch('/api/assistant/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: input, mode, documentSection: sectionText }),
    });
    const data = await res.json();
    setMessages([...messages, userMessage, { role: 'assistant', content: data.reply }]);
    setIsLoading(false);
  };

  return (
    <div className="smart-agent-sidebar">
      <div className="agent-header">
        <label>Mode:</label>
        <select value={mode} onChange={e => setMode(e.target.value)}>
          <option value="pm">Product Manager</option>
          <option value="compliance">Regulatory Compliance</option>
          <option value="developer">Developer</option>
        </select>
        <textarea
          value={sectionText}
          onChange={e => setSectionText(e.target.value)}
          placeholder="Paste current document section (optional)"
          rows={4}
          className="doc-section-box"
        />
      </div>
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`msg ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {isLoading && <div className="msg assistant">Typing...</div>}
      </div>
      <div className="input-row">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Ask something..."
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

export default SmartAgentSidebar;
