import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

export interface AgentEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

export interface StateChangeEvent {
  previousState: string;
  newState: string;
  reason?: string;
  timestamp: string;
}

export interface ToolCallEvent {
  toolName: string;
  args: unknown;
  timestamp: string;
}

export interface ToolCompleteEvent {
  toolName: string;
  result: unknown;
  success: boolean;
  timestamp: string;
}

export interface DeviceProgressEvent {
  deviceId: string;
  progress: number;
  status: string;
  message?: string;
  timestamp: string;
}

export type EventCallback<T> = (data: T) => void;

type EventMap = {
  'agent-event': AgentEvent;
  'agent-state-change': StateChangeEvent;
  'agent-tool-start': ToolCallEvent;
  'agent-tool-complete': ToolCompleteEvent;
  'device:progress': DeviceProgressEvent;
};

type EventName = keyof EventMap;

class WebSocketService {
  private socket: Socket | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  private subscribers: { [K in EventName]: Set<EventCallback<EventMap[K]>> } = {
    'agent-event': new Set(),
    'agent-state-change': new Set(),
    'agent-tool-start': new Set(),
    'agent-tool-complete': new Set(),
    'device:progress': new Set(),
  };

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connected && this.socket?.connected) {
        console.log('[WebSocket] 已经连接');
        resolve();
        return;
      }

      console.log('[WebSocket] 正在连接:', SOCKET_URL);

      this.socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
      });

      this.socket.on('connect', () => {
        console.log('[WebSocket] 连接成功, socket ID:', this.socket?.id);
        this.connected = true;
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('[WebSocket] 连接错误:', error.message);
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(new Error('连接失败，已尝试 ' + this.reconnectAttempts + ' 次'));
        }
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[WebSocket] 断开连接:', reason);
        this.connected = false;
        if (reason === 'io client disconnect') {
          this.cleanup();
        }
      });

      this.setupEventListeners();
    });
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('agent-event', (data: AgentEvent) => {
      this.notify('agent-event', data);
    });

    this.socket.on('agent-state-change', (data: StateChangeEvent) => {
      this.notify('agent-state-change', data);
    });

    this.socket.on('agent-tool-start', (data: ToolCallEvent) => {
      this.notify('agent-tool-start', data);
    });

    this.socket.on('agent-tool-complete', (data: ToolCompleteEvent) => {
      this.notify('agent-tool-complete', data);
    });

    this.socket.on('device:progress', (data: DeviceProgressEvent) => {
      this.notify('device:progress', data);
    });
  }

  private notify<K extends EventName>(event: K, data: EventMap[K]): void {
    const callbacks = this.subscribers[event] as Set<EventCallback<EventMap[K]>>;
    callbacks.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error('[WebSocket] 回调执行错误 (' + event + '):', error);
      }
    });
  }

  disconnect(): void {
    if (this.socket) {
      console.log('[WebSocket] 主动断开连接');
      this.socket.disconnect();
      this.cleanup();
    }
  }

  private cleanup(): void {
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
  }

  subscribe<K extends EventName>(
    event: K,
    callback: EventCallback<EventMap[K]>
  ): () => void {
    this.subscribers[event].add(callback);
    return () => {
      this.subscribers[event].delete(callback);
    };
  }

  onDeviceProgress(callback: EventCallback<DeviceProgressEvent>): () => void {
    return this.subscribe('device:progress', callback);
  }

  isConnected(): boolean {
    return this.connected && this.socket?.connected === true;
  }

  emit(event: string, data: unknown): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('[WebSocket] 未连接，无法发送事件:', event);
    }
  }
}

export const websocketService = new WebSocketService();

export const connect = () => websocketService.connect();
export const disconnect = () => websocketService.disconnect();
export const subscribe = websocketService.subscribe.bind(websocketService);
export const onDeviceProgress = websocketService.onDeviceProgress.bind(websocketService);
