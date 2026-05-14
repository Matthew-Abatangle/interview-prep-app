import os
import re
import json
import asyncio
import httpx
from datetime import datetime, timezone
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


INJECTION_PATTERNS = [
    r'ignore\s+(all\s+|previous\s+|above\s+|your\s+)?instructions',
    r'you\s+are\s+now',
    r'new\s+persona',
    r'system\s*:',
    r'\[INST\]',
    r'disregard\s+(all\s+|your\s+)?',
    r'forget\s+(everything|all)',
    r'do\s+not\s+follow',
    r'override\s+(your\s+|all\s+)?',
]

def sanitize_jd(text: str) -> str:
    for pattern in INJECTION_PATTERNS:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE)
    # collapse any double spaces left by stripping
    text = re.sub(r'  +', ' ', text)
    return text.strip()


SYSTEM_PROMPT = """You are an expert behavioral interview coach evaluating a candidate's performance in a 5-question AI-scored behavioral interview. Your job is to produce a thorough, honest, and actionable debrief that tells the candidate exactly how they performed and precisely what to improve.

You will be given:
- The job title and (where available) company name and job description the session was personalized to
- All 5 interview questions, each tagged with the competency it was testing and its position in the interview arc
- The candidate's transcript for each answer, along with audio metrics: filler word count, words per minute, and answer duration in seconds

Your output is a single JSON object. No preamble, no explanation, no markdown code fences.

---

SCORING RULES

For each of the 5 questions, produce four dimension scores and one composite score, all on a 0.0–10.0 scale with up to one decimal place.

The four dimensions are:

1. STAR Adherence (weight: 25%)
   Did the candidate structure their answer using the Situation, Task, Action, Result format? Score based on how completely and clearly each component was present. A strong score requires all four components to be identifiable and balanced — not just present. A score of 10.0 means the STAR structure was textbook: clear setup, explicit task/challenge, detailed actions in first person, and a concrete, quantified result. A score of 0.0 means no discernible structure at all.

2. Content Quality (weight: 30%)
   Was the answer substantive, specific, and credible? Did the candidate provide real detail — names, numbers, outcomes, context — or was the answer vague and generic? A score of 10.0 means the answer was rich with specific detail, demonstrated genuine ownership, and would be compelling to an interviewer. A score of 0.0 means the answer was entirely generic, hypothetical, or contained no real content.

3. Relevance (weight: 30%)
   Did the candidate actually answer the question that was asked? Did their example connect to the competency being tested? A score of 10.0 means the answer was squarely on-topic and directly demonstrated the target competency. A score of 0.0 means the answer had no meaningful connection to the question or competency.

4. JD Alignment (weight: 15% on JD path; excluded on preset path)
   Did the candidate's answer connect to the specific role, responsibilities, or skills described in the job description? This is not about whether they mentioned the company — it's about whether their examples reflect the kind of work, environment, or skills the JD is asking for. A score of 10.0 means the answer directly and explicitly reflected the role context. A score of 0.0 means the answer could have been given for any job with no connection to this role.
   If session_source is "preset", set jd_alignment_score to null and exclude it from composite calculation entirely, redistributing its weight proportionally across the other three dimensions.

The composite score is a weighted synthesis — not a simple average. Apply the weights above. Use your judgment to ensure the composite reflects the overall quality of the answer.

Composite (JD path): (star × 0.25) + (content × 0.30) + (relevance × 0.30) + (jd_alignment × 0.15)
Composite (Preset path): (star × 0.2857) + (content × 0.3571) + (relevance × 0.3571)

Round all scores to one decimal place.

---

AUDIO METRICS

You will receive filler word count, words per minute, and answer duration for each response. These do not affect numeric scores. Use them as follows:

- If filler word count is notably high (context matters — 3 fillers in a 90-second answer is different from 15), mention it specifically in the written feedback for that question.
- If words per minute is outside a healthy range (roughly 120–180 WPM for interview context), call it out.
- If answer duration is very short (under 45 seconds) or very long (over 120 seconds), note it.
- If audio metrics are unremarkable, do not mention them.
- If a pattern holds across multiple questions, surface it as a top weakness at the session level.

---

WRITTEN FEEDBACK

For each question, write a feedback paragraph of 3–5 sentences. The paragraph must:
- Open with the most important observation about the answer (positive or negative — be honest)
- Address at least two of the four scoring dimensions directly and specifically
- Include at least one concrete, actionable instruction
- Mention audio metrics only where notable
- Never be generic — every sentence must be specific to this candidate's actual answer

Tone: direct, coach-like, not harsh.

---

SESSION-LEVEL OUTPUT

After scoring all 5 questions, produce:

1. overall_score (0.0–10.0): A holistic assessment of the full session. Not a simple average — factor in consistency, trajectory, and range across competencies.

2. top_weaknesses: An array of exactly 2–3 strings. Each string must be a specific, actionable weakness observed across the session.

3. summary_text: A paragraph of 4–6 sentences summarizing the full session. Cover: overall impression, strongest moment, most consistent weakness, and one direct piece of advice.

---

OUTPUT RULES

- Output ONLY a valid JSON object matching the schema exactly. No preamble, no explanation, no markdown code fences.
- All scores must be numbers (not strings).
- top_weaknesses must be an array of 2–3 strings.
- written_feedback must be present for every question, never null or empty.
- If a transcript is empty or under 10 words, score all dimensions 0.0, composite 0.0, jd_alignment_score null if preset, written_feedback = "No answer was recorded for this question."
- Do not hallucinate content. If the transcript is vague, score it as vague."""


def build_user_prompt(session, questions, responses, na_ids=None):
    job_title = session.get("job_title", "")
    company_name = session.get("company_name")
    job_description = session.get("job_description")
    session_source = session.get("source", "jd")

    # Truncate JD to 3000 chars
    if job_description and len(job_description) > 3000:
        job_description = job_description[:3000]
        print(f"[debrief] JD truncated to 3000 chars")

    # Sanitize JD for prompt injection patterns
    if job_description:
        original = job_description
        job_description = sanitize_jd(job_description)
        if job_description != original:
            print(f"[SECURITY] JD sanitization stripped content in debrief. session_id={session.get('id')}")

    lines = ["You are evaluating a behavioral interview session. Here is the full session context:", "", "---", "", "SESSION INFO"]
    lines.append(f"Job title: {job_title}")
    if company_name:
        lines.append(f"Company: {company_name}")
    lines.append(f"Session source: {session_source}")

    if job_description and session_source == "jd":
        lines.append("")
        lines.append("Job description:")
        lines.append(job_description)

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("QUESTIONS AND RESPONSES")
    lines.append("")

    if na_ids is None:
        na_ids = set()

    # Match responses by question_id
    response_map = {r["question_id"]: r for r in responses}

    for q in sorted(questions, key=lambda x: x["question_id"]):
        qid = q["question_id"]
        r = response_map.get(qid, {})
        transcript = "[No answer was recorded]" if qid in na_ids else (r.get("transcript") or "")
        filler = r.get("filler_word_count", 0)
        wpm = r.get("words_per_minute", 0)
        duration = r.get("answer_duration_seconds", 0)

        lines.append(f"Question {qid} — {q.get('arc_position', '')} | Competency: {q.get('competency', '')}")
        lines.append(f"Question: \"{q.get('question_text', '')}\"")
        lines.append("")
        lines.append("Transcript:")
        lines.append(transcript if transcript else "[No transcript recorded]")
        lines.append("")
        lines.append("Audio metrics:")
        lines.append(f"- Filler words: {filler}")
        lines.append(f"- Speaking pace: {wpm} WPM")
        lines.append(f"- Answer duration: {duration}s (limit: 120s)")
        lines.append("")
        lines.append("---")
        lines.append("")

    lines.append("Score and evaluate all 5 questions using the rules in your instructions. Then produce the session-level overall_score, top_weaknesses, and summary_text. Output only valid JSON matching the schema exactly.")

    return "\n".join(lines)


def compute_dimension_averages(questions_out, session_source, na_ids=None):
    if na_ids is None:
        na_ids = set()
    non_na = [q for q in questions_out if q.get("id") not in na_ids]

    def avg(lst):
        return round(sum(lst) / len(lst), 1) if lst else 0.0

    star_scores = [q["star_score"] for q in non_na if q.get("star_score") is not None]
    content_scores = [q["content_score"] for q in non_na if q.get("content_score") is not None]
    relevance_scores = [q["relevance_score"] for q in non_na if q.get("relevance_score") is not None]
    jd_scores = [q["jd_alignment_score"] for q in non_na if q.get("jd_alignment_score") is not None]

    return {
        "star": avg(star_scores),
        "content": avg(content_scores),
        "relevance": avg(relevance_scores),
        "jd_alignment": avg(jd_scores) if session_source == "jd" else None,
    }


def validate_and_clean(parsed, session_source):
    questions = parsed.get("questions", [])
    if len(questions) != 5:
        raise ValueError(f"Expected 5 questions, got {len(questions)}")

    for i, q in enumerate(questions):
        q["id"] = q.get("id", i + 1)  # preserve LLM id or fall back to 1-based index
        for field in ["star_score", "content_score", "relevance_score", "composite_score"]:
            val = q.get(field)
            if val is None:
                raise ValueError(f"Missing {field} on question {q.get('id')}")
            try:
                val = float(val)
            except (TypeError, ValueError):
                raise ValueError(f"{field} is not numeric on question {q.get('id')}")
            q[field] = round(max(0.0, min(10.0, val)), 1)

        # jd_alignment_score
        jd_val = q.get("jd_alignment_score")
        if jd_val is not None:
            try:
                jd_val = float(jd_val)
                q["jd_alignment_score"] = round(max(0.0, min(10.0, jd_val)), 1)
            except (TypeError, ValueError):
                q["jd_alignment_score"] = None

        if session_source == "preset":
            q["jd_alignment_score"] = None

        feedback = q.get("written_feedback", "")
        if not feedback or not feedback.strip():
            raise ValueError(f"Missing written_feedback on question {q.get('id')}")

    overall = parsed.get("overall_score")
    if overall is None:
        raise ValueError("Missing overall_score")
    try:
        overall = float(overall)
    except (TypeError, ValueError):
        raise ValueError("overall_score is not numeric")
    parsed["overall_score"] = round(max(0.0, min(10.0, overall)), 1)

    summary = parsed.get("summary_text", "")
    if not summary or not summary.strip():
        raise ValueError("Missing summary_text")

    weaknesses = parsed.get("top_weaknesses", [])
    if not isinstance(weaknesses, list) or len(weaknesses) == 0:
        raise ValueError("Missing top_weaknesses")
    if len(weaknesses) < 2 or len(weaknesses) > 3:
        print(f"[debrief] WARNING: top_weaknesses has {len(weaknesses)} items (expected 2-3)")

    return parsed


async def call_llm(user_prompt: str) -> dict:
    api_key = os.getenv("OPENAI_API_KEY")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "gpt-4o",
        "temperature": 0.4,
        "max_tokens": 4000,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    }

    async with httpx.AsyncClient(timeout=45) as client:
        res = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
        res.raise_for_status()
        content = res.json()["choices"][0]["message"]["content"]
        return json.loads(content)


class DebriefRequest(BaseModel):
    session_id: str


@router.post("/api/debrief")
async def generate_debrief(body: DebriefRequest, request: Request):
    session_id = body.session_id
    user_id = request.state.user["sub"]
    db = get_supabase()

    # Auth: verify session belongs to user
    session_res = db.table("sessions").select("*").eq("id", session_id).eq("user_id", user_id).execute()
    if not session_res.data:
        raise HTTPException(status_code=403, detail="Session not found or access denied.")
    session = session_res.data[0]

    # Check for cached debrief
    existing = db.table("session_debrief").select("*").eq("session_id", session_id).execute()
    if existing.data:
        cached = existing.data[0]
        per_q = cached.get("per_question_scores") or []
        # Fetch responses to re-attach audio metrics (not stored in per_question_scores jsonb)
        cached_responses_res = db.table("session_responses").select("*").eq("session_id", session_id).execute()
        cached_responses = cached_responses_res.data or []
        cached_response_map = {r["question_id"]: r for r in cached_responses}
        for q in per_q:
            r = cached_response_map.get(q.get("id"), {})
            q["filler_word_count"] = r.get("filler_word_count", 0)
            q["words_per_minute"] = r.get("words_per_minute", 0)
            q["answer_duration_seconds"] = r.get("answer_duration_seconds", 0)
        return {
            "session_id": session_id,
            "overall_score": cached["overall_score"],
            "dimension_averages": {
                "star": cached.get("star_avg"),
                "content": cached.get("content_avg"),
                "relevance": cached.get("relevance_avg"),
                "jd_alignment": cached.get("jd_alignment_avg"),
            },
            "top_weaknesses": cached.get("top_weaknesses", []),
            "summary_text": cached.get("summary_text", ""),
            "questions": per_q,
        }

    # Fetch questions
    questions_res = db.table("session_questions").select("*").eq("session_id", session_id).execute()
    questions = questions_res.data or []

    # Fetch responses — require all 5
    responses_res = db.table("session_responses").select("*").eq("session_id", session_id).execute()
    responses = responses_res.data or []
    if len(responses) < 5:
        raise HTTPException(
            status_code=422,
            detail="Not all answers have been processed yet. Please wait a moment and try again."
        )

    # Identify N/A questions (silent / too short)
    na_ids = {r["question_id"] for r in responses if r.get("is_na")}

    # Build prompt and call LLM (with one retry)
    user_prompt = build_user_prompt(session, questions, responses, na_ids=na_ids)
    session_source = session.get("source", "jd")

    parsed = None
    for attempt in range(2):
        try:
            raw = await call_llm(user_prompt)
            parsed = validate_and_clean(raw, session_source)
            break
        except Exception as e:
            print(f"[debrief] LLM attempt {attempt + 1} failed: {e}")
            if attempt == 1:
                raise HTTPException(
                    status_code=500,
                    detail="We had trouble generating your debrief. Your session has been saved — please try again in a moment."
                )

    questions_out = parsed["questions"]

    # Override scores for N/A questions
    for q in questions_out:
        if q.get("id") in na_ids:
            q["star_score"] = 0.0
            q["content_score"] = 0.0
            q["relevance_score"] = 0.0
            q["jd_alignment_score"] = None if session_source == "preset" else 0.0
            q["composite_score"] = 0.0
            q["written_feedback"] = "No answer was recorded for this question."

    # Merge audio metrics from session_responses into each question output
    response_map = {r["question_id"]: r for r in responses}
    for q in questions_out:
        r = response_map.get(q.get("id"), {})
        q["filler_word_count"] = r.get("filler_word_count", 0)
        q["words_per_minute"] = r.get("words_per_minute", 0)
        q["answer_duration_seconds"] = r.get("answer_duration_seconds", 0)

    top_weaknesses = parsed["top_weaknesses"]
    summary_text = parsed["summary_text"]
    dim_avgs = compute_dimension_averages(questions_out, session_source, na_ids=na_ids)

    # Recompute overall_score excluding N/A questions
    non_na_composites = [q["composite_score"] for q in questions_out if q.get("id") not in na_ids and q.get("composite_score") is not None]
    overall_score = round(sum(non_na_composites) / len(non_na_composites), 1) if non_na_composites else 0.0

    # Write to session_debrief (non-blocking on failure)
    try:
        db.table("session_debrief").insert({
            "session_id": session_id,
            "overall_score": overall_score,
            "star_avg": dim_avgs["star"],
            "content_avg": dim_avgs["content"],
            "relevance_avg": dim_avgs["relevance"],
            "jd_alignment_avg": dim_avgs["jd_alignment"],
            "top_weaknesses": top_weaknesses,
            "summary_text": summary_text,
            "per_question_scores": questions_out,
        }).execute()

        # Update sessions.status → completed
        db.table("sessions").update({
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", session_id).execute()

    except Exception as e:
        print(f"[debrief] WARNING: DB write failed (returning debrief anyway): {e}")

    return {
        "session_id": session_id,
        "overall_score": overall_score,
        "dimension_averages": dim_avgs,
        "top_weaknesses": top_weaknesses,
        "summary_text": summary_text,
        "questions": questions_out,
    }
