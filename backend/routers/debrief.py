from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()


class DebriefRequest(BaseModel):
    session_id: str


@router.post("/api/debrief")
async def debrief(body: DebriefRequest, request: Request):
    # STUB — full scoring pipeline not yet implemented. Returns dummy data for UI smoke testing.
    return {
        "session_id": body.session_id,
        "overall_score": 7.4,
        "per_question_scores": [
            {"question_id": i + 1, "score": round(7.0 + i * 0.1, 1)} for i in range(5)
        ],
        "summary": "This is a placeholder debrief. Full scoring pipeline coming in the next sprint.",
    }
