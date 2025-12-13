import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket


@dataclass
class ConnectionState:
    """State for a WebSocket connection."""

    websocket: WebSocket
    podcast_id: uuid.UUID
    episode_id: uuid.UUID
    current_segment_index: int = 0
    is_interrupted: bool = False
    listener_name: str | None = None
    listener_id: uuid.UUID | None = None
    created_at: float = field(default_factory=lambda: asyncio.get_event_loop().time())


class ConnectionManager:
    """Manages WebSocket connections for podcast listening sessions."""

    def __init__(self):
        self.active_connections: dict[str, ConnectionState] = {}

    async def connect(
        self,
        websocket: WebSocket,
        connection_id: str,
        podcast_id: uuid.UUID,
        episode_id: uuid.UUID,
        listener_name: str | None = None,
        listener_id: uuid.UUID | None = None,
    ) -> None:
        """Accept a new WebSocket connection."""
        await websocket.accept()
        self.active_connections[connection_id] = ConnectionState(
            websocket=websocket,
            podcast_id=podcast_id,
            episode_id=episode_id,
            listener_name=listener_name,
            listener_id=listener_id,
        )

    def disconnect(self, connection_id: str) -> None:
        """Remove a WebSocket connection."""
        if connection_id in self.active_connections:
            del self.active_connections[connection_id]

    def get_connection(self, connection_id: str) -> ConnectionState | None:
        """Get connection state by ID."""
        return self.active_connections.get(connection_id)

    def update_segment(self, connection_id: str, segment_index: int) -> None:
        """Update the current segment index for a connection."""
        if connection_id in self.active_connections:
            self.active_connections[connection_id].current_segment_index = segment_index

    def set_interrupted(self, connection_id: str, interrupted: bool) -> None:
        """Set the interruption state for a connection."""
        if connection_id in self.active_connections:
            self.active_connections[connection_id].is_interrupted = interrupted

    async def send_json(self, connection_id: str, data: dict[str, Any]) -> bool:
        """Send JSON data to a specific connection."""
        conn = self.active_connections.get(connection_id)
        if conn:
            try:
                await conn.websocket.send_json(data)
                return True
            except Exception:
                self.disconnect(connection_id)
                return False
        return False

    async def send_bytes(self, connection_id: str, data: bytes) -> bool:
        """Send binary data to a specific connection."""
        conn = self.active_connections.get(connection_id)
        if conn:
            try:
                await conn.websocket.send_bytes(data)
                return True
            except Exception:
                self.disconnect(connection_id)
                return False
        return False

    async def broadcast_json(self, data: dict[str, Any]) -> None:
        """Send JSON data to all connections."""
        disconnected = []
        for conn_id, conn in self.active_connections.items():
            try:
                await conn.websocket.send_json(data)
            except Exception:
                disconnected.append(conn_id)

        for conn_id in disconnected:
            self.disconnect(conn_id)


# Global connection manager instance
manager = ConnectionManager()
