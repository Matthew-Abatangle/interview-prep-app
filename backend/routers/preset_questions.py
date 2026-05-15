import os
import json
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


_PRESET_BANK_PATH = os.path.join(os.path.dirname(__file__), "../data/preset_questions.json")

with open(_PRESET_BANK_PATH, "r") as _f:
    _PRESET_BANK = json.load(_f)


class PresetQuestionsRequest(BaseModel):
    preset_role: str
    session_id: str | None = None


@router.post("/api/preset-questions")
async def get_preset_questions(body: PresetQuestionsRequest, request: Request):
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
