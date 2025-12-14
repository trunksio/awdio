from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from minio.error import S3Error

from app.services.storage_service import StorageService

router = APIRouter(prefix="/audio", tags=["audio"])


def get_content_type(path: str) -> str:
    """Determine content type from file extension."""
    if path.endswith(".mp3"):
        return "audio/mpeg"
    elif path.endswith(".wav"):
        return "audio/wav"
    elif path.endswith(".ogg"):
        return "audio/ogg"
    elif path.endswith(".png"):
        return "image/png"
    elif path.endswith(".jpg") or path.endswith(".jpeg"):
        return "image/jpeg"
    elif path.endswith(".gif"):
        return "image/gif"
    elif path.endswith(".webp"):
        return "image/webp"
    return "application/octet-stream"


@router.get("/{bucket}/{path:path}")
async def stream_audio(bucket: str, path: str, request: Request):
    """
    Stream audio/image file from storage with Range request support.

    The path should match the audio_path in the manifest, e.g.:
    /api/v1/audio/awdio/podcasts/{podcast_id}/episodes/{episode_id}/segments/0000.wav
    """
    storage = StorageService()
    object_path = path
    content_type = get_content_type(path)

    try:
        # Get file stats first
        stat = storage.client.stat_object(bucket, object_path)
        file_size = stat.size

        # Parse Range header
        range_header = request.headers.get("range")

        if range_header:
            # Parse range like "bytes=0-1000"
            range_spec = range_header.replace("bytes=", "")
            range_parts = range_spec.split("-")
            start = int(range_parts[0]) if range_parts[0] else 0
            end = int(range_parts[1]) if range_parts[1] else file_size - 1

            # Clamp to file size
            end = min(end, file_size - 1)
            content_length = end - start + 1

            # Get partial object from MinIO
            response = storage.client.get_object(
                bucket, object_path, offset=start, length=content_length
            )

            def iterfile():
                try:
                    for chunk in response.stream(1024 * 1024):  # 1MB chunks
                        yield chunk
                finally:
                    response.close()
                    response.release_conn()

            return StreamingResponse(
                iterfile(),
                status_code=206,
                media_type=content_type,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Content-Length": str(content_length),
                    "Accept-Ranges": "bytes",
                    "Cache-Control": "public, max-age=3600",
                },
            )
        else:
            # Full file request
            response = storage.client.get_object(bucket, object_path)

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
                    "Content-Length": str(file_size),
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
    """Get file metadata without downloading the full file."""
    storage = StorageService()

    try:
        stat = storage.client.stat_object(bucket, path)
        content_type = get_content_type(path)

        return Response(
            content=b"",
            media_type=content_type,
            headers={
                "Content-Length": str(stat.size),
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
            },
        )

    except S3Error as e:
        if e.code == "NoSuchKey":
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=f"Storage error: {e}")
