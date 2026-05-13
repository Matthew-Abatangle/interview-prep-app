import os
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from supabase import create_client

router = APIRouter()

_supabase = None

def get_supabase():
    global _supabase
    if _supabase is None:
        _supabase = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        )
    return _supabase


class CreateSessionRequest(BaseModel):
    job_title: str
    job_description: str | None = None
    company_name: str | None = None
    source: str
    preset_role: str | None = None
    feedback_timing: str = "live"


class CreateSessionResponse(BaseModel):
    session_id: str


class UpdateSessionRequest(BaseModel):
    feedback_timing: str


@router.post("/api/sessions", response_model=CreateSessionResponse)
async def create_session(request: Request, body: CreateSessionRequest):
    # Extract user_id from JWT payload (set by auth middleware)
    user_id = request.state.user["sub"]

    # Validate source
    if body.source not in ("jd", "preset", "fallback"):
        raise HTTPException(status_code=422, detail="source must be 'jd', 'preset', or 'fallback'")

    # Validate feedback_timing
    if body.feedback_timing not in ("live", "end_only"):
        raise HTTPException(status_code=422, detail="feedback_timing must be 'live' or 'end_only'")

    # Validate job_title
    if not body.job_title or not body.job_title.strip():
        raise HTTPException(status_code=422, detail="job_title is required")

    # Rate limiting: max 3 sessions per user per day (UTC)
    today_midnight = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat()

    try:
        count_result = (
            get_supabase()
            .table("sessions")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .gte("created_at", today_midnight)
            .execute()
        )
        session_count = count_result.count if count_result.count is not None else 0
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create session. Please try again.")

    if session_count >= 100:
        raise HTTPException(
            status_code=429,
            detail="Daily session limit reached. Maximum 3 sessions per day."
        )

    try:
        result = get_supabase().table("sessions").insert({
            "user_id": user_id,
            "job_title": body.job_title.strip(),
            "company_name": body.company_name,
            "job_description": body.job_description[:3000] if body.job_description else None,
            "source": body.source,
            "preset_role": body.preset_role,
            "feedback_timing": body.feedback_timing,
            "status": "in_progress"
        }).execute()

        session_id = result.data[0]["id"]
        return CreateSessionResponse(session_id=session_id)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Failed to create session. Please try again."
        )


@router.patch("/api/sessions/{session_id}")
async def update_session(session_id: str, request: Request, body: UpdateSessionRequest):
    user_id = request.state.user["sub"]

    if body.feedback_timing not in ("live", "end_only"):
        raise HTTPException(status_code=400, detail="feedback_timing must be 'live' or 'end_only'")

    try:
        result = get_supabase().table("sessions").select("id, user_id, status").eq("id", session_id).execute()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch session.")

    if not result.data:
        raise HTTPException(status_code=400, detail="Session not found.")

    session = result.data[0]

    if session["user_id"] != user_id:
        raise HTTPException(status_code=400, detail="Session not found.")

    if session["status"] != "in_progress":
        raise HTTPException(status_code=400, detail="Session is not in progress.")

    try:
        responses = get_supabase().table("session_responses").select("session_id", count="exact").eq("session_id", session_id).execute()
        if responses.count and responses.count > 0:
            raise HTTPException(status_code=400, detail="Cannot change feedback timing after answers have been recorded.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to verify session state.")

    try:
        get_supabase().table("sessions").update({"feedback_timing": body.feedback_timing}).eq("id", session_id).execute()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update session.")

    return {"session_id": session_id, "feedback_timing": body.feedback_timing}