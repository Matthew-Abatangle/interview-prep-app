import os
import re
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from openai import OpenAI
from supabase import create_client

router = APIRouter()

_openai_client = None
_supabase_client = None


def get_openai():
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _openai_client


def get_supabase():
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        )
    return _supabase_client

# TIER_LIMITS — single in-code source of truth for per-user daily limits.
# Spec source of truth: Notion Security & Safety page, Section 3.
# When Pro tier enforcement is added in V2, look up user's tier from the
# Stripe subscription table and select the appropriate limits from this dict.
# Do not hardcode these values anywhere else in the codebase.
TIER_LIMITS = {
    "free": {"sessions_per_day": 3, "question_generations_per_day": 10},
    "pro":  {"sessions_per_day": 15, "question_generations_per_day": 50},
}

# V1: all users are Free tier
def get_user_tier(user_id: str) -> str:
    return "free"


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

def _cleanup_session(session_id: str) -> None:
    try:
        get_supabase().table("sessions").delete().eq("id", session_id).execute()
    except Exception as e:
        print(f"[WARNING] Failed to delete orphaned session {session_id}: {e}")


def sanitize_jd(text: str) -> str:
    for pattern in INJECTION_PATTERNS:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE)
    # collapse any double spaces left by stripping
    text = re.sub(r'  +', ' ', text)
    return text.strip()


VALID_COMPETENCIES = {
    "motivation", "conflict_resolution", "leadership", "communication",
    "collaboration", "adaptability", "initiative", "analytical_thinking",
    "prioritization", "stakeholder_management", "failure_and_learning",
    "problem_solving"
}

VALID_ARC_POSITIONS = {
    "motivation", "general_behavioral", "role_context", "jd_specific", "depth"
}

SYSTEM_PROMPT = """You are an expert behavioral interview question designer for AI-scored remote first-round interviews (e.g. HireVue). Your job is to generate exactly 5 behavioral interview questions that feel like a real, structured interview — personalized to the specific role and job description, and ordered as a natural interview arc from warm to deep.

Rules you must follow without exception:

1. Every question must be behavioral in format — it must begin with or be paraphraseable as "Tell me about a time when..." or "Describe a situation where..." No hypotheticals ("What would you do if..."), no trivia, no domain-knowledge questions, no coding problems.

2. Questions must follow this exact arc — order matters:
   - Q1: A motivation question. If a company name is provided, ask "Why [Company Name]?" directly. If no company name, ask "Why [role/field]?" This always comes first.
   - Q2: A broad general behavioral question (leadership, communication, conflict, collaboration) that applies across roles. Ease the candidate in.
   - Q3: A behavioral question grounded in the type of work or environment described in the job description. Reference the role context without being overly narrow.
   - Q4: A question that directly references a specific responsibility, required skill, tool, or qualification from the job description text. This must feel like it came from reading the actual JD — not a generic question. A generic Q4 is a failure.
   - Q5: A deeper behavioral question testing self-awareness, maturity, or resilience — failure/learning, high-stakes decision-making, navigating ambiguity, or cross-functional challenge. Closes the interview with depth.

3. Q4 must be grounded in the actual job description text. Reference a specific element from the JD (a required skill, a listed responsibility, a tool or methodology mentioned).

4. If a company name is provided, use it in Q1. Do not fabricate a company name if one is not provided.

5. Questions for technical or analytical roles may reference specific tools or skills from the JD, but must stay behavioral in format.

6. Calibrate complexity to the seniority implied by the job title and description. Entry-level and intern roles get questions appropriate for 0-2 years of experience.

7. Do not repeat competencies across questions. Each question must test something meaningfully different.

8. The "competency" field must be exactly one of these 12 values — no other values are permitted:
   motivation, conflict_resolution, leadership, communication, collaboration, adaptability, initiative, analytical_thinking, prioritization, stakeholder_management, failure_and_learning, problem_solving

9. Output ONLY a valid JSON object. No preamble, no explanation, no markdown code fences. The JSON must match this schema exactly:

{
  "questions": [
    {
      "id": 1,
      "question": "...",
      "competency": "motivation",
      "arc_position": "motivation"
    }
  ]
}

arc_position values must be one of: "motivation", "general_behavioral", "role_context", "jd_specific", "depth"

If you cannot generate 5 high-quality questions, return as many as possible and include a top-level "warning" field explaining what was missing."""


def extract_company_name(job_description: str) -> str | None:
    """
    Simple regex heuristic to extract company name from JD text.
    Scans the first 300 characters for common patterns.
    Returns None if not detected — never guesses.
    """
    sample = job_description[:300]
    patterns = [
        r"(?:at|join|About)\s+([A-Z][a-zA-Z0-9&\s]{1,30}?)(?:\s*[,.\n]|$)",
        r"^([A-Z][a-zA-Z0-9&\s]{1,30}?)\s+is\s+(?:seeking|looking|hiring)",
    ]
    for pattern in patterns:
        match = re.search(pattern, sample, re.MULTILINE)
        if match:
            name = match.group(1).strip()
            # Filter out generic phrases that aren't company names
            generic = {"we", "our", "the team", "the company", "us", "you"}
            if name.lower() not in generic and len(name) > 1:
                return name
    return None


def build_user_prompt(job_title: str, job_description: str | None, company_name: str | None) -> str:
    if job_description:
        company_line = f"Company: {company_name}\n" if company_name else ""
        return (
            f"Job title: {job_title}\n"
            f"{company_line}"
            f"\nJob description:\n{job_description}\n\n"
            "Generate 5 behavioral interview questions for this role following the arc structure "
            "in your instructions exactly. Q4 must directly reference something specific from "
            "the job description above."
        )
    else:
        return (
            f"Job title: {job_title}\n\n"
            "No job description was provided. Generate 5 behavioral interview questions appropriate "
            f"for a typical entry-level {job_title} role. Follow the arc structure in your "
            "instructions exactly. For Q4, reference a well-known core responsibility or required "
            "skill commonly associated with this role."
        )


def validate_questions(questions: list) -> tuple[list, list]:
    """
    Validates each question object. Returns (valid_questions, warnings).
    """
    valid = []
    warnings = []
    seen_competencies = set()

    for q in questions:
        if not all(k in q for k in ("id", "question", "competency", "arc_position")):
            warnings.append(f"Question {q.get('id', '?')} missing required fields — skipped.")
            continue
        if not isinstance(q["question"], str) or not q["question"].strip():
            warnings.append(f"Question {q['id']} has empty question text — skipped.")
            continue
        if q["competency"] not in VALID_COMPETENCIES:
            warnings.append(f"Question {q['id']} has invalid competency '{q['competency']}' — logged.")
        if q["arc_position"] not in VALID_ARC_POSITIONS:
            warnings.append(f"Question {q['id']} has invalid arc_position '{q['arc_position']}' — logged.")
        if q["competency"] in seen_competencies:
            warnings.append(f"Question {q['id']} duplicates competency '{q['competency']}' — logged.")
        seen_competencies.add(q["competency"])
        valid.append(q)

    return valid, warnings


def call_llm(user_prompt: str) -> dict:
    """
    Makes the OpenAI call and parses the response.
    Raises ValueError on parse failure.
    """
    response = get_openai().chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        response_format={"type": "json_object"},
        temperature=0.8,
        max_tokens=1500,
        timeout=15
    )
    raw = response.choices[0].message.content
    return json.loads(raw)


class GenerateQuestionsRequest(BaseModel):
    job_title: str
    job_description: str | None = None
    session_id: str | None = None


class GenerateQuestionsResponse(BaseModel):
    session_id: str | None = None
    source: str
    questions: list
    warning: str | None = None


@router.post("/api/generate-questions", response_model=GenerateQuestionsResponse)
async def generate_questions(http_request: Request, request: GenerateQuestionsRequest):
    # Auth: user set by AuthMiddleware
    user = http_request.state.user

    # Rate limit: check question_generations_per_day before LLM call
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

    # Input validation
    job_title = request.job_title.strip()
    if not job_title:
        raise HTTPException(status_code=422, detail="Please enter a job title to continue.")

    job_description = request.job_description
    if job_description:
        job_description = job_description.strip()
        if len(job_description) < 50:
            job_description = None  # Too short — treat as fallback

    # Truncate JD if over 3000 chars
    if job_description and len(job_description) > 3000:
        job_description = job_description[:3000]

    # Sanitize JD for prompt injection patterns
    if job_description:
        original = job_description
        job_description = sanitize_jd(job_description)
        if job_description != original:
            print(f"[SECURITY] JD sanitization stripped content. session_id={request.session_id}")

    # Extract company name from JD
    company_name = extract_company_name(job_description) if job_description else None

    source = "jd" if job_description else "fallback"
    user_prompt = build_user_prompt(job_title, job_description, company_name)

    # LLM call with one retry on parse/structural failure
    parsed = None
    for attempt in range(2):
        try:
            parsed = call_llm(user_prompt)
            break
        except (ValueError, json.JSONDecodeError) as e:
            if attempt == 1:
                if request.session_id:
                    _cleanup_session(request.session_id)
                raise HTTPException(
                    status_code=500,
                    detail="We had trouble generating questions for this role. Please try again or adjust your job description."
                )

    if parsed is None or "questions" not in parsed:
        if request.session_id:
            _cleanup_session(request.session_id)
        raise HTTPException(
            status_code=500,
            detail="We had trouble generating questions for this role. Please try again or adjust your job description."
        )

    questions, validation_warnings = validate_questions(parsed.get("questions", []))
    llm_warning = parsed.get("warning")

    # Check we have enough valid questions
    if len(questions) < 3:
        if request.session_id:
            _cleanup_session(request.session_id)
        raise HTTPException(
            status_code=500,
            detail="We had trouble generating questions for this role. Please try again or adjust your job description."
        )

    # Combine warnings
    all_warnings = []
    if llm_warning:
        all_warnings.append(llm_warning)
    if validation_warnings:
        all_warnings.extend(validation_warnings)
    warning_str = " | ".join(all_warnings) if all_warnings else None

    # Write session_questions to Supabase only when a session_id is provided.
    # In the new flow, session creation is deferred to Start Interview time;
    # questions are written to session_questions via POST /api/sessions instead.
    if request.session_id:
        try:
            rows = [
                {
                    "session_id": request.session_id,
                    "question_id": q["id"],
                    "question_text": q["question"],
                    "competency": q["competency"],
                    "arc_position": q["arc_position"],
                    "source": source
                }
                for q in questions
            ]
            get_supabase().table("session_questions").insert(rows).execute()
        except Exception as e:
            # Log but do not block — storage failure should not break the session
            print(f"[WARNING] Failed to write session_questions to Supabase: {e}")

    return GenerateQuestionsResponse(
        session_id=request.session_id,
        source=source,
        questions=questions,
        warning=warning_str
    )
