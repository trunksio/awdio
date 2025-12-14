"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type WebSocketMessage = {
  type: string;
  [key: string]: unknown;
};

export interface UseWebSocketOptions {
  url: string;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
}

export interface UseWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  send: (message: WebSocketMessage) => void;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    reconnect = true,
    reconnectInterval = 3000,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }
    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    intentionalDisconnectRef.current = false;
    setIsConnecting(true);
    setError(null);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        optionsRef.current.onConnect?.();
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        optionsRef.current.onDisconnect?.();

        // Only reconnect if not intentionally disconnected
        if (!intentionalDisconnectRef.current && optionsRef.current.reconnect !== false) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

      ws.onerror = (wsEvent) => {
        setError("WebSocket connection error");
        setIsConnecting(false);
        optionsRef.current.onError?.(wsEvent);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          optionsRef.current.onMessage?.(message);
        } catch (e) {
          console.error("Failed to parse WebSocket message:", e);
        }
      };
    } catch (e) {
      console.error("WebSocket creation failed:", e);
      setError(`Failed to connect: ${e}`);
      setIsConnecting(false);
    }
  }, [url, reconnectInterval]);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const send = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Memoize return value to prevent unnecessary re-renders
  return useMemo(() => ({
    isConnected,
    isConnecting,
    error,
    send,
    connect,
    disconnect,
  }), [isConnected, isConnecting, error, send, connect, disconnect]);
}
