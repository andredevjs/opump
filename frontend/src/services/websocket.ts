type MessageHandler = (event: string, data: unknown) => void;
type ConnectionListener = (connected: boolean) => void;

interface ServerMessage {
  channel: string;
  event: string;
  data: unknown;
  timestamp: number;
}

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:9850/ws';
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, Set<MessageHandler>>();
  private connectionListeners = new Set<ConnectionListener>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private _intentionalDisconnect = false;

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this._intentionalDisconnect = false;

    try {
      this.ws = new WebSocket(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emitConnectionChange();

      // Re-subscribe to all active channels
      for (const channel of this.subscriptions.keys()) {
        this.sendSubscribe(channel);
      }
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        const handlers = this.subscriptions.get(msg.channel);
        if (handlers) {
          for (const handler of handlers) {
            handler(msg.event, msg.data);
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.emitConnectionChange();
      console.log('[WS] Disconnected');
      if (!this._intentionalDisconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  disconnect(): void {
    this._intentionalDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.reconnectAttempts = 0;
    this.emitConnectionChange();
  }

  subscribe(channel: string, filter: string | undefined, handler: MessageHandler): () => void {
    const fullChannel = filter ? `${channel}:${filter}` : channel;

    if (!this.subscriptions.has(fullChannel)) {
      this.subscriptions.set(fullChannel, new Set());
    }
    this.subscriptions.get(fullChannel)!.add(handler);

    // Send subscribe if connected
    if (this.connected) {
      this.sendSubscribe(fullChannel);
    }

    // Return unsubscribe function
    return () => {
      const handlers = this.subscriptions.get(fullChannel);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.subscriptions.delete(fullChannel);
          if (this.connected) {
            this.sendUnsubscribe(fullChannel);
          }
        }
      }
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  private emitConnectionChange(): void {
    for (const listener of this.connectionListeners) {
      listener(this.connected);
    }
  }

  private sendSubscribe(channel: string): void {
    this.send({ action: 'subscribe', channel });
  }

  private sendUnsubscribe(channel: string): void {
    this.send({ action: 'unsubscribe', channel });
  }

  private send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

// Singleton instance
export const wsClient = new WebSocketClient();
