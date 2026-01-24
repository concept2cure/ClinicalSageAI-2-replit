/**
 * WebSocket Utility for Replit Environment
 *
 * This module handles WebSocket connections with proper protocol detection
 * and error handling specifically designed for Replit's environment.
 */

export interface WebSocketConfig {
  path: string;
  onOpen?: (event: Event) => void;
  onMessage?: (event: MessageEvent) => void;
  onError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

export class EnhancedWebSocket {
  private socket: WebSocket | null = null;
  private path: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private autoReconnect: boolean;
  private callbacks: {
    onOpen?: (event: Event) => void;
    onMessage?: (event: MessageEvent) => void;
    onError?: (event: Event) => void;
    onClose?: (event: CloseEvent) => void;
  };

  constructor(config: WebSocketConfig) {
    this.path = config.path;
    this.callbacks = {
      onOpen: config.onOpen,
      onMessage: config.onMessage,
      onError: config.onError,
      onClose: config.onClose,
    };
    this.autoReconnect = config.autoReconnect ?? true;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 5;
  }

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    // Determine the correct protocol (ws/wss) based on the current page protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use the current host (important for Replit environment)
    const wsUrl = `${protocol}//${window.location.host}${this.path}`;

    console.log(`Attempting WebSocket connection to: ${wsUrl}`);

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = event => {
        console.log('WebSocket connection established');
        this.reconnectAttempts = 0;
        if (this.callbacks.onOpen) this.callbacks.onOpen(event);
      };

      this.socket.onmessage = event => {
        if (this.callbacks.onMessage) this.callbacks.onMessage(event);
      };

      this.socket.onerror = event => {
        console.error('WebSocket error:', event);
        if (this.callbacks.onError) this.callbacks.onError(event);
      };

      this.socket.onclose = event => {
        console.log(`WebSocket closed with code: ${event.code}, reason: ${event.reason}`);

        if (this.callbacks.onClose) this.callbacks.onClose(event);

        // Auto reconnect logic
        if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          console.log(
            `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`
          );

          setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
          }, delay);
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('Cannot send message, WebSocket is not connected');
      return false;
    }

    try {
      this.socket.send(data);
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.autoReconnect = false; // Prevent reconnection attempts
      this.socket.close();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

/**
 * Create a WebSocket connection with proper configuration for Replit
 */
export function createWebSocketConnection(config: WebSocketConfig): EnhancedWebSocket {
  const ws = new EnhancedWebSocket(config);
  ws.connect();
  return ws;
}

/**
 * Helper function to safely parse incoming WebSocket JSON messages
 */
export function parseWebSocketMessage<T>(event: MessageEvent): T | null {
  try {
    return JSON.parse(event.data) as T;
  } catch (error) {
    console.error('Failed to parse WebSocket message:', error);
    return null;
  }
}
