from fastapi import APIRouter

from app.api.v1 import audio, awdios, health, knowledge_bases, listeners, podcasts, presenters, voices

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(podcasts.router)
api_router.include_router(knowledge_bases.router)
api_router.include_router(voices.router)
api_router.include_router(audio.router)
api_router.include_router(presenters.router)
api_router.include_router(presenters.podcast_presenters_router)
api_router.include_router(listeners.router)
api_router.include_router(awdios.router)
