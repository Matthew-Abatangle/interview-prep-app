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

    if session_count >= 3:
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


@router.get("/api/sessions")
async def get_user_sessions(request: Request):
    user_id = request.state.user["sub"]
    db = get_supabase()
    sessions_res = db.table("sessions") \
        .select("id, job_title, company_name, source, status, completed_at") \
        .eq("user_id", user_id) \
        .eq("status", "completed") \
        .order("completed_at", desc=True) \
        .execute()
    sessions = sessions_res.data or []
    if not sessions:
        return {"sessions": []}
    session_ids = [s["id"] for s in sessions]
    debrief_res = db.table("session_debrief") \
        .select("session_id, overall_score, star_avg") \
        .in_("session_id", session_ids) \
        .execute()
    debrief_map = {d["session_id"]: d for d in (debrief_res.data or [])}
    for s in sessions:
        d = debrief_map.get(s["id"], {})
        s["overall_score"] = d.get("overall_score")
        s["star_avg"] = d.get("star_avg")
    return {"sessions": sessions}


@router.get("/api/sessions/today-count")
async def get_today_session_count(request: Request):
    user_id = request.state.user["sub"]
    db = get_supabase()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    res = db.table("sessions") \
        .select("id") \
        .eq("user_id", user_id) \
        .gte("created_at", f"{today}T00:00:00Z") \
        .lte("created_at", f"{today}T23:59:59Z") \
        .execute()
    return {"count": len(res.data or []), "limit": 3}


@router.get("/api/sessions/{session_id}/detail")
async def get_session_detail(session_id: str, request: Request):
    user_id = request.state.user["sub"]
    db = get_supabase()

    session_res = db.table("sessions").select("*").eq("id", session_id).eq("user_id", user_id).execute()
    if not session_res.data:
        raise HTTPException(status_code=403, detail="Session not found or access denied.")
    session = session_res.data[0]

    questions_res = db.table("session_questions").select("*").eq("session_id", session_id).execute()
    questions = questions_res.data or []

    debrief_res = db.table("session_debrief").select("*").eq("session_id", session_id).execute()
    if not debrief_res.data:
        raise HTTPException(status_code=404, detail="Debrief not found for this session.")
    debrief = debrief_res.data[0]

    responses_res = db.table("session_responses").select("*").eq("session_id", session_id).execute()
    responses = responses_res.data or []
    response_map = {r["question_id"]: r for r in responses}

    per_q = debrief.get("per_question_scores") or []
    for q in per_q:
        r = response_map.get(q.get("id"), {})
        q["filler_word_count"] = r.get("filler_word_count", 0)
        q["words_per_minute"] = r.get("words_per_minute", 0)
        q["answer_duration_seconds"] = r.get("answer_duration_seconds", 0)

    return {
        "session_id": session_id,
        "overall_score": debrief["overall_score"],
        "dimension_averages": {
            "star": debrief.get("star_avg"),
            "content": debrief.get("content_avg"),
            "relevance": debrief.get("relevance_avg"),
            "jd_alignment": debrief.get("jd_alignment_avg"),
        },
        "top_weaknesses": debrief.get("top_weaknesses", []),
        "summary_text": debrief.get("summary_text", ""),
        "questions": per_q,
        "session_source": session.get("source", "jd"),
        "session_questions": questions,
    }