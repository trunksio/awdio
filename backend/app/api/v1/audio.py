from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from minio.error import S3Error

from app.services.storage_service import StorageService

router = APIRouter(prefix="/audio", tags=["audio"])


@router.get("/{bucket}/{path:path}")
async def stream_audio(bucket: str, path: str):
    """
    Stream audio file from storage.

    The path should match the audio_path in the manifest, e.g.:
    /api/v1/audio/awdio/podcasts/{podcast_id}/episodes/{episode_id}/segments/0000.wav
    """
    storage = StorageService()

    # Reconstruct the object path
    object_path = path

    try:
        # Get the object from MinIO
        response = storage.client.get_object(bucket, object_path)

        # Determine content type from extension
        content_type = "audio/wav"
        if path.endswith(".mp3"):
            content_type = "audio/mpeg"
        elif path.endswith(".ogg"):
            content_type = "audio/ogg"

        # Stream the response
        def iterfile():
            try:
                for chunk in response.stream(1024 * 1024):  # 1MB chunks
                    yield chunk
            finally:
                response.close()
                response.release_conn()

        return StreamingResponse(
            iterfile(),
            media_type=content_type,
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
            },
        )

    except S3Error as e:
        if e.code == "NoSuchKey":
            raise HTTPException(status_code=404, detail="Audio file not found")
        raise HTTPException(status_code=500, detail=f"Storage error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stream audio: {e}")


@router.head("/{bucket}/{path:path}")
async def audio_head(bucket: str, path: str):
    """Get audio file metadata without downloading the full file."""
    storage = StorageService()

    try:
        stat = storage.client.stat_object(bucket, path)

        content_type = "audio/wav"
        if path.endswith(".mp3"):
            content_type = "audio/mpeg"
        elif path.endswith(".ogg"):
            content_type = "audio/ogg"

        return StreamingResponse(
            iter([]),
            media_type=content_type,
            headers={
                "Content-Length": str(stat.size),
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
            },
        )

    except S3Error as e:
        if e.code == "NoSuchKey":
            raise HTTPException(status_code=404, detail="Audio file not found")
        raise HTTPException(status_code=500, detail=f"Storage error: {e}")
