"""Connection manager for Awdio WebSocket sessions."""

import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket


@dataclass
class AwdioConnectionState:
    """State for an Awdio WebSocket connection."""

    websocket: WebSocket
    awdio_id: uuid.UUID
    session_id: uuid.UUID
    slide_deck_id: uuid.UUID | None = None
    current_segment_index: int = 0
    current_slide_index: int = 0
    is_interrupted: bool = False
    interrupted_slide_index: int | None = None  # Store slide when Q&A started
    listener_name: str | None = None
    listener_id: uuid.UUID | None = None
    created_at: float = field(default_factory=lambda: asyncio.get_event_loop().time())


class AwdioConnectionManager:
    """Manages WebSocket connections for Awdio sessions."""

    def __init__(self):
        self.active_connections: dict[str, AwdioConnectionState] = {}

    async def connect(
        self,
        websocket: WebSocket,
        connection_id: str,
        awdio_id: uuid.UUID,
        session_id: uuid.UUID,
        slide_deck_id: uuid.UUID | None = None,
        listener_name: str | None = None,
        listener_id: uuid.UUID | None = None,
    ) -> None:
        """Accept a new WebSocket connection."""
        await websocket.accept()
        self.active_connections[connection_id] = AwdioConnectionState(
            websocket=websocket,
            awdio_id=awdio_id,
            session_id=session_id,
            slide_deck_id=slide_deck_id,
            listener_name=listener_name,
            listener_id=listener_id,
        )

    def disconnect(self, connection_id: str) -> None:
        """Remove a WebSocket connection."""
        if connection_id in self.active_connections:
            del self.active_connections[connection_id]

    def get_connection(self, connection_id: str) -> AwdioConnectionState | None:
        """Get connection state by ID."""
        return self.active_connections.get(connection_id)

    def update_segment(self, connection_id: str, segment_index: int) -> None:
        """Update the current segment index for a connection."""
        if connection_id in self.active_connections:
            self.active_connections[connection_id].current_segment_index = segment_index

    def update_slide(self, connection_id: str, slide_index: int) -> None:
        """Update the current slide index for a connection."""
        if connection_id in self.active_connections:
            self.active_connections[connection_id].current_slide_index = slide_index

    def set_interrupted(
        self,
        connection_id: str,
        interrupted: bool,
        store_slide: bool = True,
    ) -> None:
        """Set the interruption state for a connection."""
        conn = self.active_connections.get(connection_id)
        if conn:
            if interrupted and store_slide:
                # Store current slide index when interruption starts
                conn.interrupted_slide_index = conn.current_slide_index
            elif not interrupted:
                # Clear stored slide when interruption ends
                conn.interrupted_slide_index = None
            conn.is_interrupted = interrupted

    async def send_json(self, connection_id: str, data: dict[str, Any]) -> bool:
        """Send JSON data to a specific connection."""
        conn = self.active_connections.get(connection_id)
        if conn:
            try:
                await conn.websocket.send_json(data)
                return True
            except Exception as e:
                print(f"[Awdio WS] Failed to send JSON to {connection_id}: {e}")
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


# Global awdio connection manager instance
awdio_manager = AwdioConnectionManager()
