import os
from fastapi import APIRouter, HTTPException
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
    user_id: str
    job_title: str
    job_description: str | None = None
    company_name: str | None = None
    source: str
    preset_role: str | None = None
    feedback_timing: str = "live"


class CreateSessionResponse(BaseModel):
    session_id: str


@router.post("/api/sessions", response_model=CreateSessionResponse)
async def create_session(request: CreateSessionRequest):
    # Validate source
    if request.source not in ("jd", "preset", "fallback"):
        raise HTTPException(status_code=422, detail="source must be 'jd', 'preset', or 'fallback'")

    # Validate feedback_timing
    if request.feedback_timing not in ("live", "end_only"):
        raise HTTPException(status_code=422, detail="feedback_timing must be 'live' or 'end_only'")

    # Validate job_title
    if not request.job_title or not request.job_title.strip():
        raise HTTPException(status_code=422, detail="job_title is required")

    try:
        result = get_supabase().table("sessions").insert({
            "user_id": request.user_id,
            "job_title": request.job_title.strip(),
            "company_name": request.company_name,
            "job_description": request.job_description[:3000] if request.job_description else None,
            "source": request.source,
            "preset_role": request.preset_role,
            "feedback_timing": request.feedback_timing,
            "status": "in_progress"
        }).execute()

        session_id = result.data[0]["id"]
        return CreateSessionResponse(session_id=session_id)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Failed to create session. Please try again."
        )
