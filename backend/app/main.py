import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import settings
from app.database import async_session_maker
from app.websocket import InterruptionHandler, manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


app = FastAPI(
    title="Awdio API",
    description="Voice-driven podcast platform API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix="/api/v1")


# WebSocket endpoint for podcast listening with Q&A
@app.websocket("/ws/listen/{podcast_id}/{episode_id}")
async def websocket_listen(
    websocket: WebSocket,
    podcast_id: str,
    episode_id: str,
):
    """
    WebSocket endpoint for real-time podcast listening with voice Q&A.

    Messages from client:
    - {"type": "segment_update", "segment_index": 0}
    - {"type": "start_interruption"}
    - {"type": "question", "question": "What is machine learning?"}
    - {"type": "cancel_interruption"}
    - {"type": "ping"}

    Messages from server:
    - {"type": "interruption_started", "status": "listening"}
    - {"type": "question_received", "question": "..."}
    - {"type": "answer_text", "text": "...", "sources": [...], "confidence": 0.8}
    - {"type": "synthesizing_audio"}
    - {"type": "answer_audio", "audio": "<base64>", "format": "wav"}
    - {"type": "bridge_audio", "text": "...", "audio": "<base64>", "format": "wav"}
    - {"type": "ready_to_resume"}
    - {"type": "error", "error": "..."}
    - {"type": "pong"}
    """
    connection_id = str(uuid.uuid4())

    try:
        podcast_uuid = uuid.UUID(podcast_id)
        episode_uuid = uuid.UUID(episode_id)
    except ValueError:
        await websocket.close(code=4000, reason="Invalid podcast or episode ID")
        return

    await manager.connect(websocket, connection_id, podcast_uuid, episode_uuid)

    try:
        async with async_session_maker() as session:
            handler = InterruptionHandler(session, manager, connection_id)

            # Send initial connection confirmation
            await manager.send_json(
                connection_id,
                {
                    "type": "connected",
                    "connection_id": connection_id,
                    "podcast_id": podcast_id,
                    "episode_id": episode_id,
                },
            )

            while True:
                data = await websocket.receive_json()
                await handler.handle_message(data)
                await session.commit()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        import traceback
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"WebSocket error: {error_msg}")
        print(traceback.format_exc())
        await manager.send_json(
            connection_id,
            {"type": "error", "error": error_msg},
        )
    finally:
        manager.disconnect(connection_id)
