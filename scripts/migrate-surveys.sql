-- ============================================================
-- Surveys / Umfragen — Migration
-- ============================================================

CREATE TABLE IF NOT EXISTS surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  start_at timestamptz,
  end_at timestamptz,
  allow_anonymous boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question text NOT NULL,
  type text NOT NULL DEFAULT 'single' CHECK (type IN ('single', 'multiple', 'text', 'rating')),
  options jsonb,
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  answer_text text,
  answer_options jsonb,
  answer_rating integer CHECK (answer_rating >= 1 AND answer_rating <= 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(survey_id, user_id)
);

CREATE INDEX IF NOT EXISTS surveys_status_idx ON surveys(status);
CREATE INDEX IF NOT EXISTS survey_questions_survey_id_idx ON survey_questions(survey_id);
CREATE INDEX IF NOT EXISTS survey_answers_survey_id_idx ON survey_answers(survey_id);
CREATE INDEX IF NOT EXISTS survey_answers_question_id_idx ON survey_answers(question_id);
CREATE INDEX IF NOT EXISTS survey_responses_survey_id_idx ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS survey_responses_user_id_idx ON survey_responses(user_id);

ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "surveys_read_active" ON surveys;
CREATE POLICY "surveys_read_active" ON surveys FOR SELECT USING (status = 'active');

DROP POLICY IF EXISTS "survey_questions_read" ON survey_questions;
CREATE POLICY "survey_questions_read" ON survey_questions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM surveys WHERE surveys.id = survey_questions.survey_id AND surveys.status = 'active')
  );

ALTER TABLE patch_notes ADD COLUMN IF NOT EXISTS show_popup boolean NOT NULL DEFAULT false;
