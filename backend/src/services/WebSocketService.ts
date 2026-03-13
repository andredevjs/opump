import type HyperExpress from '@btc-vision/hyper-express';
import type { Websocket } from '@btc-vision/hyper-express/types/components/ws/Websocket.js';

interface ClientMessage {
  action: 'subscribe' | 'unsubscribe';
  channel: string;
  filter?: string;
}

interface ServerMessage {
  channel: string;
  event: string;
  data: unknown;
  timestamp: number;
}

export class WebSocketService {
  private static readonly MAX_CONNECTIONS = 1000;
  private static readonly MAX_SUBSCRIPTIONS_PER_CLIENT = 50;

  private subscriptions = new Map<Websocket, Set<string>>();
  private channelSubscribers = new Map<string, Set<Websocket>>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private app: HyperExpress.Server) {}

  /**
   * Initialize WebSocket handler on the HyperExpress server.
   */
  init(): void {
    this.app.ws('/ws', (ws: Websocket) => {
      if (this.subscriptions.size >= WebSocketService.MAX_CONNECTIONS) {
        ws.close(1013, 'Max connections reached');
        return;
      }
      this.subscriptions.set(ws, new Set());
      console.log('[WS] Client connected');

      ws.on('message', (message: Buffer | ArrayBuffer | Uint8Array) => {
        try {
          const text = new TextDecoder().decode(message);
          const msg: ClientMessage = JSON.parse(text);
          this.handleMessage(ws, msg);
        } catch {
          this.sendToClient(ws, {
            channel: 'error',
            event: 'subscription_error',
            data: { message: 'Invalid message format' },
            timestamp: Date.now(),
          });
        }
      });

      ws.on('close', () => {
        this.cleanup(ws);
        console.log('[WS] Client disconnected');
      });
    });

    // Heartbeat every 30s
    this.heartbeatInterval = setInterval(() => {
      for (const ws of this.subscriptions.keys()) {
        try {
          ws.ping();
        } catch {
          this.cleanup(ws);
        }
      }
    }, 30_000);

    console.log('[WS] WebSocket service initialized on /ws');
  }

  /**
   * Broadcast a message to all subscribers of a channel.
   */
  broadcast(channel: string, event: string, data: unknown): void {
    const message: ServerMessage = {
      channel,
      event,
      data,
      timestamp: Date.now(),
    };

    const json = JSON.stringify(message);
    const subscribers = this.channelSubscribers.get(channel);
    if (!subscribers) return;

    for (const ws of subscribers) {
      try {
        ws.send(json);
      } catch {
        this.cleanup(ws);
      }
    }
  }

  /**
   * Get the number of active connections.
   */
  getConnectionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Stop the heartbeat interval.
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  private handleMessage(ws: Websocket, msg: ClientMessage): void {
    // Resolve channel name (e.g., "token:price" + filter "addr" → "token:price:addr")
    const channel = msg.filter ? `${msg.channel}:${msg.filter}` : msg.channel;

    if (msg.action === 'subscribe') {
      this.subscribe(ws, channel);
    } else if (msg.action === 'unsubscribe') {
      this.unsubscribe(ws, channel);
    }
  }

  private subscribe(ws: Websocket, channel: string): void {
    // Add to client's subscriptions
    const clientSubs = this.subscriptions.get(ws);
    if (clientSubs && clientSubs.size >= WebSocketService.MAX_SUBSCRIPTIONS_PER_CLIENT) {
      this.sendToClient(ws, { channel: 'error', event: 'subscription_error', data: { message: 'Max subscriptions reached' }, timestamp: Date.now() });
      return;
    }
    if (clientSubs) clientSubs.add(channel);

    // Add to channel's subscribers
    let channelSubs = this.channelSubscribers.get(channel);
    if (!channelSubs) {
      channelSubs = new Set();
      this.channelSubscribers.set(channel, channelSubs);
    }
    channelSubs.add(ws);
  }

  private unsubscribe(ws: Websocket, channel: string): void {
    const clientSubs = this.subscriptions.get(ws);
    if (clientSubs) clientSubs.delete(channel);

    const channelSubs = this.channelSubscribers.get(channel);
    if (channelSubs) {
      channelSubs.delete(ws);
      if (channelSubs.size === 0) {
        this.channelSubscribers.delete(channel);
      }
    }
  }

  private cleanup(ws: Websocket): void {
    const clientSubs = this.subscriptions.get(ws);
    if (clientSubs) {
      for (const channel of clientSubs) {
        const channelSubs = this.channelSubscribers.get(channel);
        if (channelSubs) {
          channelSubs.delete(ws);
          if (channelSubs.size === 0) {
            this.channelSubscribers.delete(channel);
          }
        }
      }
    }
    this.subscriptions.delete(ws);
  }

  private sendToClient(ws: Websocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      this.cleanup(ws);
    }
  }
}
