-- Global Chat
CREATE TABLE IF NOT EXISTS global_chat_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  username    text        NOT NULL,
  role        text        NOT NULL DEFAULT 'user',
  content     text        NOT NULL,
  is_system   boolean     NOT NULL DEFAULT false,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS global_chat_messages_created_at_idx ON global_chat_messages(created_at DESC);

ALTER TABLE global_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gchat_read" ON global_chat_messages;
CREATE POLICY "gchat_read" ON global_chat_messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "gchat_insert_own" ON global_chat_messages;
CREATE POLICY "gchat_insert_own" ON global_chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
