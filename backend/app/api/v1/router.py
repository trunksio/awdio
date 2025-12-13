from fastapi import APIRouter

from app.api.v1 import audio, health, knowledge_bases, podcasts, voices

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(podcasts.router)
api_router.include_router(knowledge_bases.router)
api_router.include_router(voices.router)
api_router.include_router(audio.router)
