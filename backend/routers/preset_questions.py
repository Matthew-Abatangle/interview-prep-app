import os
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
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


TIER_LIMITS = {
    "free": {"sessions_per_day": 3, "question_generations_per_day": 10},
    "pro":  {"sessions_per_day": 15, "question_generations_per_day": 50},
}

def get_user_tier(user_id: str) -> str:
    return "free"


_PRESET_BANK_PATH = os.path.join(os.path.dirname(__file__), "../data/preset_questions.json")

with open(_PRESET_BANK_PATH, "r") as _f:
    _PRESET_BANK = json.load(_f)


class PresetQuestionsRequest(BaseModel):
    preset_role: str
    session_id: str | None = None


@router.post("/api/preset-questions")
async def get_preset_questions(body: PresetQuestionsRequest, request: Request):
    # Rate limit: check question_generations_per_day before returning questions
    user = request.state.user
    tier = get_user_tier(user["sub"])
    daily_limit = TIER_LIMITS[tier]["question_generations_per_day"]
    today = datetime.utcnow().date().isoformat()

    try:
        gen_count_resp = get_supabase().rpc("count_user_generations_today", {
            "p_user_id": user["sub"],
            "p_date": today
        }).execute()
        gen_count = gen_count_resp.data or 0
    except Exception as e:
        print(f"[WARNING] Failed to check question generation rate limit: {e}")
        gen_count = 0

    if gen_count >= daily_limit:
        raise HTTPException(
            status_code=429,
            detail="You've reached your daily question generation limit. Try again tomorrow."
        )

    # Log this generation in the dedicated tracking table.
    # Non-blocking — a write failure does not prevent question retrieval.
    try:
        get_supabase().table("question_generations").insert({
            "user_id": user["sub"]
        }).execute()
    except Exception as e:
        print(f"[WARNING] Failed to log question generation: {e}")

    questions = _PRESET_BANK.get(body.preset_role)
    if not questions:
        raise HTTPException(
            status_code=404,
            detail="We don't have preset questions for this role yet. Please paste a job description instead."
        )

    # Write session_questions only when a session_id is provided.
    # In the new flow, questions are written via POST /api/sessions at Start Interview time.
    if body.session_id:
        rows = [
            {
                "session_id": body.session_id,
                "question_id": q["id"],
                "question_text": q["question"],
                "competency": q["competency"],
                "arc_position": q["arc_position"],
                "source": "preset",
            }
            for q in questions
        ]
        try:
            get_supabase().table("session_questions").insert(rows).execute()
        except Exception as e:
            print(f"[preset-questions] DB write failed: {e}")

    return {
        "session_id": body.session_id,
        "source": "preset",
        "questions": questions,
        "warning": None,
    }
