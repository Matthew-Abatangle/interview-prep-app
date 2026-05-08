-- sessions table
CREATE TABLE public.sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_title         TEXT NOT NULL,
  company_name      TEXT,
  job_description   TEXT,
  source            TEXT NOT NULL CHECK (source IN ('jd', 'preset')),
  preset_role       TEXT,
  feedback_timing   TEXT NOT NULL DEFAULT 'live' CHECK (feedback_timing IN ('live', 'end_only')),
  status            TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_status ON public.sessions(status);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sessions"
  ON public.sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
  ON public.sessions FOR UPDATE
  USING (auth.uid() = user_id);


-- session_questions table
CREATE TABLE public.session_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  question_id   INTEGER NOT NULL CHECK (question_id BETWEEN 1 AND 5),
  question_text TEXT NOT NULL,
  competency    TEXT NOT NULL,
  arc_position  TEXT NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('jd', 'preset')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_questions_session_id ON public.session_questions(session_id);

ALTER TABLE public.session_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own session questions"
  ON public.session_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_questions.session_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own session questions"
  ON public.session_questions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_questions.session_id
      AND s.user_id = auth.uid()
    )
  );
