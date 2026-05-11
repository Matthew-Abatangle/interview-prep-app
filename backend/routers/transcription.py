import os
import asyncio
import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from supabase import create_client

router = APIRouter()

_supabase_client = None


def get_supabase():
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        )
    return _supabase_client


FILLER_WORDS = {
    "uh", "um", "uh-huh", "mm-hmm", "hmm", "like", "you know",
    "actually", "basically", "literally", "right", "okay", "so", "well"
}


@router.post("/api/transcribe")
async def transcribe_audio(
    request: Request,
    session_id: str = Form(...),
    question_id: int = Form(...),
    audio: UploadFile = File(...)
):
    # Validate question_id
    if question_id < 1 or question_id > 5:
        raise HTTPException(status_code=422, detail="question_id must be between 1 and 5.")

    # Verify session belongs to authenticated user
    user_id = request.state.user["sub"]
    try:
        result = get_supabase().table("sessions").select("id").eq("id", session_id).eq("user_id", user_id).execute()
        if not result.data:
            raise HTTPException(status_code=403, detail="Session not found or access denied.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[WARNING] Failed to verify session ownership: {e}")
        raise HTTPException(status_code=403, detail="Session not found or access denied.")

    # Read audio bytes
    audio_bytes = await audio.read()

    # Transcribe via AssemblyAI REST API
    try:
        api_key = os.getenv("ASSEMBLYAI_API_KEY")
        headers = {"authorization": api_key}
        poll_data = {}

        async with httpx.AsyncClient() as client:
            # Step 1 — Upload audio
            upload_res = await client.post(
                "https://api.assemblyai.com/v2/upload",
                headers=headers,
                content=audio_bytes,
                timeout=30
            )
            upload_res.raise_for_status()
            upload_url = upload_res.json()["upload_url"]

            # Step 2 — Submit transcription job
            payload = {
                "audio_url": upload_url,
                "disfluencies": True,
                "speech_models": ["universal-2"]
            }
            transcript_res = await client.post(
                "https://api.assemblyai.com/v2/transcript",
                headers={**headers, "content-type": "application/json"},
                json=payload,
                timeout=30
            )
            if transcript_res.status_code != 200:
                print(f"[ERROR] AssemblyAI submit response: {transcript_res.text}")
            transcript_res.raise_for_status()
            transcript_id = transcript_res.json()["id"]

            # Step 3 — Poll for completion (inside the same client context)
            while True:
                poll_res = await client.get(
                    f"https://api.assemblyai.com/v2/transcript/{transcript_id}",
                    headers=headers,
                    timeout=30
                )
                poll_res.raise_for_status()
                poll_data = poll_res.json()
                status = poll_data.get("status")
                if status == "completed":
                    break
                elif status == "error":
                    raise Exception(f"AssemblyAI error: {poll_data.get('error')}")
                await asyncio.sleep(3)

        transcript_text = poll_data.get("text") or ""

        # Filler word count
        filler_word_count = 0
        try:
            words = poll_data.get("words") or []
            filler_word_count = sum(
                1 for w in words if w.get("text", "").lower().strip() in FILLER_WORDS
            )
        except Exception:
            filler_word_count = 0

        # Words per minute
        words_per_minute = 0
        try:
            audio_duration = poll_data.get("audio_duration") or 0
            word_count = len(poll_data.get("words") or [])
            if audio_duration > 0:
                words_per_minute = round((word_count / audio_duration) * 60)
        except Exception:
            words_per_minute = 0

        # Answer duration
        answer_duration_seconds = round(poll_data.get("audio_duration") or 0)

    except Exception as e:
        print(f"[ERROR] AssemblyAI transcription failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Transcription failed. Your answer has been saved — please try again."
        )

    # Upsert into session_responses
    try:
        get_supabase().table("session_responses").upsert({
            "session_id": session_id,
            "question_id": question_id,
            "transcript": transcript_text,
            "filler_word_count": filler_word_count,
            "words_per_minute": words_per_minute,
            "answer_duration_seconds": answer_duration_seconds
        }, on_conflict="session_id,question_id").execute()
    except Exception as e:
        print(f"[WARNING] Failed to write session_responses to Supabase: {e}")

    return {
        "session_id": session_id,
        "question_id": question_id,
        "transcript": transcript_text,
        "filler_word_count": filler_word_count,
        "words_per_minute": words_per_minute,
        "answer_duration_seconds": answer_duration_seconds
    }