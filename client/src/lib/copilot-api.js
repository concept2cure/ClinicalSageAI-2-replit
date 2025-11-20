/**
 * IND Copilot API Client
 *
 * This module provides a client for interacting with the IND Copilot agent API.
 */

/**
 * Connect to the chat WebSocket and set up event handlers
 *
 * @param {Object} options - Connection options
 * @param {string} options.conversationId - Optional conversation ID for continuing a conversation
 * @param {number} options.projectId - Optional project ID for context
 * @param {Function} options.onMessage - Callback for message chunks
 * @param {Function} options.onToolCall - Callback for tool calls
 * @param {Function} options.onToolResult - Callback for tool results
 * @param {Function} options.onError - Callback for errors
 * @param {Function} options.onConnect - Callback for connection established
 * @param {Function} options.onDisconnect - Callback for connection closed
 * @returns {WebSocket} WebSocket connection
 */
export function connectToChatSocket({
  conversationId,
  projectId,
  onMessage,
  onToolCall,
  onToolResult,
  onError,
  onConnect,
  onDisconnect,
}) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/chat`;

  const socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    // Send initial connection message with context
    socket.send(
      JSON.stringify({
        conversation_id: conversationId,
        project_id: projectId,
      })
    );

    if (onConnect) {
      onConnect();
    }
  };

  socket.onmessage = event => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'connected') {
        // Connection acknowledged
        if (onConnect) {
          onConnect(data.conversation_id);
        }
      } else if (data.type === 'message') {
        // Message chunk
        if (onMessage) {
          onMessage(data.content || '');
        }
      } else if (data.type === 'tool_call') {
        // Tool call
        if (onToolCall) {
          onToolCall(data.tool_name, data.tool_args);
        }
      } else if (data.type === 'tool_result') {
        // Tool result
        if (onToolResult) {
          onToolResult(data.tool_name, data.content);
        }
      } else if (data.type === 'error') {
        // Error
        if (onError) {
          onError(data.content || 'Unknown error');
        }
      }
    } catch (e) {
      console.error('Error parsing WebSocket message:', e);
      if (onError) {
        onError('Error parsing message');
      }
    }
  };

  socket.onerror = error => {
    console.error('WebSocket error:', error);
    if (onError) {
      onError('Connection error');
    }
  };

  socket.onclose = () => {
    if (onDisconnect) {
      onDisconnect();
    }
  };

  return socket;
}

/**
 * Send a message through the chat WebSocket
 *
 * @param {WebSocket} socket - WebSocket connection
 * @param {string} message - Message to send
 * @param {string} conversationId - Conversation ID
 * @param {number} projectId - Project ID
 * @returns {boolean} Success status
 */
export function sendChatMessage(socket, message, conversationId, projectId) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.error('WebSocket not connected');
    return false;
  }

  socket.send(
    JSON.stringify({
      message,
      conversation_id: conversationId,
      project_id: projectId,
    })
  );

  return true;
}

/**
 * Fetch suggestions for a project
 *
 * @param {number} projectId - Project ID
 * @param {string} status - Optional filter by status
 * @returns {Promise<Array>} Array of suggestions
 */
export async function fetchSuggestions(projectId, status = null) {
  try {
    let url = `/api/agent/suggestions?project_id=${projectId}`;
    if (status) {
      url += `&status=${status}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch suggestions: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    throw error;
  }
}

/**
 * Update a suggestion's status
 *
 * @param {number} suggestionId - Suggestion ID
 * @param {number} projectId - Project ID
 * @param {string} status - New status ('accepted' or 'rejected')
 * @returns {Promise<Object>} Update result
 */
export async function updateSuggestionStatus(suggestionId, projectId, status) {
  try {
    const response = await fetch(
      `/api/agent/suggestions/${suggestionId}/status?project_id=${projectId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update suggestion: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating suggestion:', error);
    throw error;
  }
}

/**
 * Execute a suggested action
 *
 * @param {number} suggestionId - Suggestion ID
 * @param {number} projectId - Project ID
 * @returns {Promise<Object>} Execution result
 */
export async function executeSuggestion(suggestionId, projectId) {
  try {
    const response = await fetch(
      `/api/agent/suggestions/execute/${suggestionId}?project_id=${projectId}`,
      {
        method: 'POST',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to execute suggestion: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error executing suggestion:', error);
    throw error;
  }
}

/**
 * Generate new suggestions for a project
 *
 * @param {number} projectId - Project ID
 * @returns {Promise<Object>} Generation result
 */
export async function generateSuggestions(projectId) {
  try {
    const response = await fetch(`/api/agent/suggestions/generate?project_id=${projectId}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to generate suggestions: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error generating suggestions:', error);
    throw error;
  }
}
